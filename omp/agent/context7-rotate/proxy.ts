// Local MCP proxy for Context7 that picks the API key with the most remaining quota.
// Context7's MCP endpoint is stateless (no Mcp-Session-Id), so every request may use a different key.
// Its MCP responses carry no rate-limit headers; quota comes from the REST API, where each probe costs one request.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const KEY_FILE = process.env.CONTEXT7_KEY_FILE ?? join(homedir(), ".env.context7");
const STATE_DIR = join(process.env.XDG_STATE_HOME ?? join(homedir(), ".local/state"), "context7-rotate");
const STATE_FILE = join(STATE_DIR, "state.json");
const PORT = Number(process.env.CONTEXT7_PROXY_PORT ?? 18170);
const UPSTREAM = "https://mcp.context7.com/mcp";
const PROBE_URL = "https://context7.com/api/v2/libs/search?libraryName=react&query=react";
const PROBE_INTERVAL_MS = 60 * 60_000;
// A key with fewer remaining requests than this is used only when every key is that low.
const LOW_WATER = 5;
const QUOTA_TEXT = /rate.?limit|quota|too many requests|limit (?:exceeded|reached)/i;

type KeyState = { remaining: number | null; limit: number | null; reset: number | null; exhaustedUntil: number; probedAt: number };
type Persisted = Record<string, KeyState>;

let keys: { name: string; value: string }[] = [];
let keyMtime = 0;
let state: Persisted = existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, "utf8")) : {};

function loadKeys() {
	const mtime = statSync(KEY_FILE).mtimeMs;
	if (mtime === keyMtime) return;
	keyMtime = mtime;
	keys = readFileSync(KEY_FILE, "utf8")
		.split("\n")
		.map(l => l.trim())
		.filter(l => l && !l.startsWith("#") && l.includes("="))
		.map(l => {
			const i = l.indexOf("=");
			return { name: l.slice(0, i).replace(/^export\s+/, "").trim(), value: l.slice(i + 1).trim().replace(/^["']|["']$/g, "") };
		})
		.filter(k => k.value);
	for (const k of keys) state[k.name] ??= { remaining: null, limit: null, reset: null, exhaustedUntil: 0, probedAt: 0 };
	console.log(`loaded ${keys.length} keys: ${keys.map(k => k.name).join(", ")}`);
}

function save() {
	mkdirSync(STATE_DIR, { recursive: true });
	writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function usable(name: string) {
	const s = state[name];
	const now = Date.now();
	if (s.exhaustedUntil > now) return false;
	if (s.reset && s.reset * 1000 <= now) {
		s.remaining = s.limit;
		s.reset = null;
	}
	return true;
}

// Highest remaining first; unknown quota counts as full so a newly added key gets probed by use.
function ranked() {
	loadKeys();
	const score = (n: string) => state[n].remaining ?? Number.MAX_SAFE_INTEGER;
	const live = keys.filter(k => usable(k.name)).sort((a, b) => score(b.name) - score(a.name));
	const healthy = live.filter(k => score(k.name) > LOW_WATER);
	return healthy.length ? [...healthy, ...live.filter(k => !healthy.includes(k))] : live;
}

function markExhausted(name: string) {
	const s = state[name];
	s.remaining = 0;
	s.exhaustedUntil = s.reset ? s.reset * 1000 : Date.now() + 60 * 60_000;
	console.warn(`key ${name} exhausted until ${new Date(s.exhaustedUntil).toISOString()}`);
	save();
}

async function probe(k: { name: string; value: string }) {
	try {
		const res = await fetch(PROBE_URL, { headers: { Authorization: `Bearer ${k.value}` } });
		const s = state[k.name];
		const num = (h: string) => (res.headers.get(h) === null ? null : Number(res.headers.get(h)));
		s.limit = num("ratelimit-limit") ?? s.limit;
		s.remaining = num("ratelimit-remaining") ?? s.remaining;
		s.reset = num("ratelimit-reset") ?? s.reset;
		s.probedAt = Date.now();
		if (res.status === 429 || s.remaining === 0) markExhausted(k.name);
		else if (s.exhaustedUntil > Date.now()) s.exhaustedUntil = 0;
	} catch (err) {
		console.warn(`probe ${k.name} failed: ${err}`);
	}
}

async function probeAll() {
	loadKeys();
	await Promise.all(keys.map(probe));
	save();
}

function isQuotaError(status: number, body: string) {
	if (status === 429) return true;
	if (!body.includes('"isError":true') && !body.includes('"error"')) return false;
	return QUOTA_TEXT.test(body);
}

async function forward(req: Request) {
	const body = req.method === "POST" ? await req.text() : undefined;
	const countsAgainstQuota = body?.includes('"tools/call"') ?? false;
	const headers = new Headers(req.headers);
	headers.delete("host");
	headers.delete("content-length");
	const candidates = ranked();
	if (!candidates.length) return new Response("all Context7 keys exhausted", { status: 429 });
	let last: Response | undefined;
	for (const k of candidates) {
		headers.set("Authorization", `Bearer ${k.value}`);
		const res = await fetch(UPSTREAM, { method: req.method, headers, body });
		const text = await res.text();
		if (isQuotaError(res.status, text)) {
			markExhausted(k.name);
			last = new Response(text, { status: res.status, headers: res.headers });
			continue;
		}
		if (countsAgainstQuota && res.ok && state[k.name].remaining !== null) {
			state[k.name].remaining = Math.max(0, state[k.name].remaining! - 1);
			save();
		}
		const out = new Headers(res.headers);
		out.delete("content-encoding");
		out.delete("content-length");
		out.set("x-context7-key", k.name);
		return new Response(text, { status: res.status, headers: out });
	}
	return last!;
}

function status() {
	ranked();
	return keys.map(k => ({
		key: k.name,
		...state[k.name],
		reset: state[k.name].reset ? new Date(state[k.name].reset! * 1000).toISOString() : null,
		exhaustedUntil: state[k.name].exhaustedUntil > Date.now() ? new Date(state[k.name].exhaustedUntil).toISOString() : null,
	}));
}

loadKeys();
await probeAll();
setInterval(probeAll, PROBE_INTERVAL_MS);

Bun.serve({
	hostname: "127.0.0.1",
	port: PORT,
	idleTimeout: 120,
	async fetch(req) {
		const url = new URL(req.url);
		if (url.pathname === "/status") {
			if (url.searchParams.has("refresh")) await probeAll();
			return Response.json({ active: ranked()[0]?.name ?? null, keys: status() });
		}
		if (url.pathname === "/mcp") return forward(req);
		return new Response("not found", { status: 404 });
	},
});
console.log(`context7-rotate listening on http://127.0.0.1:${PORT}/mcp`);
