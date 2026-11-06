// Artifact Hub (artifact.sharosoo.com) in the right panel: search my documents, open one to read it.
// Auth reuses the personal token omp's artifact-hub MCP entry already holds, so no second secret is needed
// where omp is set up; elsewhere ARTIFACT_HUB_TOKEN or a token file does.

import { View, div, image } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, TextView, Scrollbar, v_virtual_list, VirtualListScrollHandle } from "gpui-base";
import { exec, theme, settings, home, appHome, readTextFile, props as given, openOverlay, closeOverlay, window as appWindow } from "herdr";
import * as fs from "fs/promises";

// The overlay that shows a picture larger is another copy of this mod.
const MOD = "artifacts";

// Pages are rendered by herdr-artifacts-render.service (headless Chromium kept warm) so openui, mermaid,
// charts and ::: layouts look as on the web. It only exists where the dotfiles installed it; anywhere else
// documents show as text.
const RENDERER = "http://127.0.0.1:47824";
const RENDERER_PROBE_MS = 1500;
const RENDERER_RECHECK_MS = 30000;
const PREFETCH = 6;
// A resize re-renders the page only after the width has held this long, so a drag asks once, not per step.
const RESIZE_SETTLE_MS = 1000;
// The first width only has to outlast the panel opening; there is no page yet to keep scaled meanwhile.
const FIRST_SETTLE_MS = 300;
// The page is drawn as a virtual list of rows at most this high, cut from the tiles: only visible rows cost a
// frame, and the list's scroll handle can put the same share of the page back on screen after a resize.
const STRIP = 40;
// doc-body's side padding; the page is laid out for what is left of the panel.
const PAD = 24;
// Pages are rendered at the panel width rounded up to this step and drawn scaled to the exact width, so a
// few pixels of resize, or panels a little apart on two layouts, share one rendered page.
const BUCKET = 16;
// Pages draw at this share of their web size by default (text 80%, layouts as on a 1/0.8 wider window).
const ZOOM = 0.8;
const ZOOM_SETTLE_MS = 500;
// Rendered pages kept in memory, so going back to a recent document asks nothing.
const MEMORY_DOCS = 8;
const CACHE_DIR = () => `${appHome().replace(/\\/g, "/")}/data/artifacts-cache`;
// The renderer only takes JSON POSTs, which a web page in a browser can't send it.
const call = (path, body) => fetch(`${RENDERER}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const renderBody = (d, w, z) => ({ id: d.id, v: d.version, w, z, scheme: scheme(theme().background) });
// Ids and versions as the hub issues them; nothing else goes into a cache folder name or pattern.
const plainDoc = (d) => /^[a-z0-9]+$/.test(String(d?.id)) && /^\d+$/.test(String(d?.version));
// A rendered page's folder under the cache, as the renderer names it; the width is the number to match.
const cacheName = (d, z) => new RegExp(`^${d.id}-v${d.version}-(\\d+)-z${Math.round(z * 100)}-${scheme(theme().background)}$`);
const PAGE_KEY = /^[a-z0-9]+-v\d+-\d+-z\d+-(dark|light)$/;
// Pages shown from memory or disk tell the renderer they are in use (at most this often), since its cache trim
// spares pages used in the last 10 minutes and these never pass through it.
const TOUCH_MS = 60 * 1000;
const ident = (s) => s && `${s.width}@${s.zoom}`;

// A page the panel may draw, from the renderer or a manifest on disk: every file it names is a plain tile or
// picture file inside that page's own cache folder. null for anything else.
function pageSet(j, key) {
  if (!PAGE_KEY.test(key ?? "") || !Array.isArray(j?.tiles) || !Array.isArray(j.images ?? [])) return null;
  const dir = `data/artifacts-cache/${key}/`;
  const inDir = (p, re) => typeof p === "string" && p.startsWith(dir) && re.test(p.slice(dir.length));
  const size = (v) => Number.isFinite(v) && v >= 0;
  if (!size(j.width) || !size(j.zoom)) return null;
  if (!j.tiles.every((t) => inDir(t?.path, /^\d{3}\.jpg$/) && size(t.height))) return null;
  const pics = j.images ?? [];
  if (!pics.every((p) => inDir(p?.path, /^img-\d{3}\.(png|jpg|gif|webp|svg)$/) && Number.isFinite(p.x) && Number.isFinite(p.y)
    && ["w", "h", "nw", "nh"].every((k) => size(p[k])))) return null;
  return { key, tiles: j.tiles, images: pics, width: j.width, zoom: j.zoom, done: j.done === true };
}

function scheme(bg) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(String(bg ?? ""));
  if (!m) return "dark";
  const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 140 ? "light" : "dark";
}

const HUB = "https://artifact.sharosoo.com";
const HUB_HOST = "artifact.sharosoo.com";
const SEARCH_DEBOUNCE_MS = 300;
const TOKEN_VAR = "ARTIFACT_HUB_TOKEN";

const homeDir = () => home().replace(/\\/g, "/").replace(/\/$/, "");
const tokenFile = () => `${appHome().replace(/\\/g, "/")}/data/artifacts/token`;
const tilde = (p) => p.startsWith(`${homeDir()}/`) ? `~${p.slice(homeDir().length)}` : p;

// An error the panel explains: a headline and the steps that fix it.
const problem = (message, ...detail) => Object.assign(new Error(message), { detail });
const asProblem = (e) => ({ message: String(e?.message ?? e), detail: e?.detail ?? [] });

// `${VAR}`, `${VAR:-default}` (as omp's mcp.json loader expands them) and `$VAR`. Unset names are collected.
function expand(s, env, missing) {
  return s.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (_m, a, def, b) => {
    const name = a ?? b;
    if (env[name] != null && env[name] !== "") return env[name];
    if (def != null) return def;
    missing?.push(name);
    return "";
  });
}

// The desktop session that launches herdr-app often lacks the shell's variables, so ~/.env.local (which the
// shell sources) is read as well and wins, as in omp-usage. Parsed here rather than sourced through `sh`,
// which macOS and Linux have but Windows doesn't.
async function readEnv() {
  const env = {};
  const windows = appWindow().platform === "windows";
  const r = await (windows ? exec("cmd", ["/d", "/c", "set"]) : exec("env")).catch(() => null);
  for (const line of (r?.stdout ?? "").split(/\r?\n/)) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (m) env[m[1]] = m[2];
  }
  const local = await readTextFile(`${homeDir()}/.env.local`).catch(() => null);
  for (const line of (local ?? "").split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m) continue;
    const q = /^(['"])(.*)\1$/.exec(m[2]);
    env[m[1]] = q?.[1] === "'" ? q[2] : expand(q ? q[2] : m[2].replace(/\s+#.*$/, ""), env);
  }
  return env;
}

// Where omp keeps user MCP config (omp docs: mcp-config.md, Profiles): the active profile's agent dir first,
// then the default one and every other profile, so a token set up under any of them is found.
async function mcpFiles(env) {
  const h = homeDir();
  const root = `${h}/${env.PI_CONFIG_DIR || env.OMP_CONFIG_DIR || ".omp"}`;
  const profile = (env.OMP_PROFILE ?? env.PI_PROFILE ?? "").trim();
  const override = (env.PI_CODING_AGENT_DIR || env.OMP_CODING_AGENT_DIR || "").replace(/^~(?=\/|$)/, h);
  const dirs = [];
  if (profile && profile !== "default") dirs.push(`${root}/profiles/${profile}/agent`);
  else if (override) dirs.push(override);
  dirs.push(`${root}/agent`);
  for (const p of await fs.readdir(`${root}/profiles`).catch(() => [])) dirs.push(`${root}/profiles/${p}/agent`);
  return [...new Set(dirs)].flatMap((d) => [`${d}/mcp.json`, `${d}/.mcp.json`]);
}

// The artifact-hub server entry, by name or by its URL.
function hubServer(cfg) {
  const servers = cfg?.mcpServers ?? cfg;
  if (!servers || typeof servers !== "object") return null;
  return servers["artifact-hub"] ?? Object.values(servers).find((s) => typeof s?.url === "string" && s.url.includes(HUB_HOST)) ?? null;
}

const bearer = (v) => /^\S+\s+\S/.test(v) ? v : `Bearer ${v}`;
const tokenPart = (auth) => auth.replace(/^bearer\b\s*/i, "");

// First hit wins: ARTIFACT_HUB_TOKEN, herdr-app's own token file, then omp's mcp.json files.
async function readToken() {
  const env = await readEnv();
  const notes = [];
  const fromEnv = env[TOKEN_VAR]?.trim();
  if (fromEnv) return { auth: bearer(fromEnv), source: `the ${TOKEN_VAR} variable (environment or ~/.env.local)` };
  const file = tokenFile();
  const fromFile = (await readTextFile(file).catch(() => null))?.trim();
  if (fromFile) return { auth: bearer(fromFile), source: tilde(file) };
  for (const path of await mcpFiles(env)) {
    const text = await readTextFile(path).catch(() => null);
    if (text == null) continue;
    let cfg;
    try { cfg = JSON.parse(text); } catch (e) { notes.push(`${tilde(path)} is not valid JSON (${e.message}).`); continue; }
    const server = hubServer(cfg);
    if (!server) continue;
    const headers = server.headers ?? {};
    const raw = headers[Object.keys(headers).find((k) => k.toLowerCase() === "authorization")];
    if (typeof raw !== "string") { notes.push(`${tilde(path)} has an artifact-hub server without headers.Authorization.`); continue; }
    const missing = [];
    const auth = expand(raw, env, missing).trim();
    if (missing.length) { notes.push(`${tilde(path)} uses ${missing.map((n) => `\${${n}}`).join(", ")}, which is not set in the environment or ~/.env.local.`); continue; }
    if (!tokenPart(auth)) { notes.push(`${tilde(path)} has an empty artifact-hub Authorization header.`); continue; }
    return { auth: bearer(auth), source: tilde(path) };
  }
  throw problem("No Artifact Hub token on this computer",
    "Add your personal Artifact Hub token in one of these places, then Retry:",
    `• ~/.env.local: ${TOKEN_VAR}=<token>`,
    `• the file ${tilde(file)}, holding only the token`,
    "• omp's ~/.omp/agent/mcp.json: an \"artifact-hub\" server with headers.Authorization \"Bearer <token>\"",
    ...notes);
}

const WEB = /^https?:\/\/[^\s/?#@\\]+(?:[/?#][^\s]*)?$/i;
const MAILTO = /^mailto:[^\s<>"'/\\]+@[^\s<>"'/\\]+$/i;
// Only web pages and mail addresses leave the mod; javascript:, file: and anything malformed are dropped.
function systemOpen(url) {
  if (!WEB.test(url) && !MAILTO.test(url)) return;
  const os = appWindow().platform;
  // rundll32 hands the address over as is; `cmd /c start` would read & and | in it as commands.
  const r = os === "macos" ? exec("open", [url]) : os === "windows" ? exec("rundll32", ["url.dll,FileProtocolHandler", url]) : exec("xdg-open", [url]);
  r.catch(() => {});
}

function ago(ms, now) {
  const m = Math.round((now - ms) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / 1440)}d`;
}

export default class Artifacts extends View {
  init(initial, cx) {
    // A second kind of copy: one picture of the page shown larger, as a dialog over the window (openPicture).
    const p = given() ?? initial ?? {};
    if (p.viewer) { this.viewer = p.viewer; this.overlayId = p.overlay ?? null; return; }
    this.list = []; this.query = ""; this.error = null; this.loading = false;
    this.doc = null; this.docLoading = false; this.seq = 0;
    // null while the first probe runs, then whether the page renderer answered.
    this.rendererUp = null; this.rendererProbe = null; this.rendererCheckedAt = 0;
    this.input = InputState.new({ placeholder: "Search title, tag, body" });
    this.input.on("change", (_e, cx) => {
      this.query = this.input.value();
      const seq = ++this.seq;
      cx.timer.after(SEARCH_DEBOUNCE_MS, (cx) => { if (seq === this.seq) this.load(cx); });
    });
    this.input.on("submit", (_e, cx) => this.load(cx));
    this.load(cx);
    cx.spawn(async (cx) => { if (await this.rendererReady(cx)) this.prefetch(); cx.notify(); });
    this.pageScroll = VirtualListScrollHandle.new(); this.renderSeq = 0; this.resizeSeq = 0; this.zoomSeq = 0; this.geomGen = 0;
    // The page's width in layout units, from the panel's measured size: null until the first layout, and not
    // settled while it is still changing. Nothing is rendered at an unsettled width.
    this.width = null; this.widthSettled = false;
    const z = Number(localStorage.getItem("zoom"));
    this.zoom = z >= 0.5 && z <= 1.5 ? z : ZOOM;
    // Finished pages of recent documents: "id-vN-scheme" → Map(ident → tile set), oldest document first.
    this.mem = new Map();
  }

  // The panel's real size (on_size_change), not the layout file's number for it, which can differ from what is
  // drawn. A width counts once it has held: the panel reports a passing size while it opens, and a drag reports
  // every step. Meanwhile the shown page is scaled to fit, or swapped at once for one already rendered.
  measure(size, cx) {
    const w = Math.round(size.width / (Number(settings()?.zoom) || 1)) - PAD;
    if (w === this.width || w <= 0) return;
    const first = this.width == null, seq = ++this.resizeSeq;
    this.width = w; this.widthSettled = false;
    const kept = this.doc && !this.near(this.tiles, this.renderWidth()) && this.remembered(this.doc, this.renderWidth());
    if (kept) this.show(kept, cx);
    cx.timer.after(first ? FIRST_SETTLE_MS : RESIZE_SETTLE_MS, (cx) => {
      if (seq !== this.resizeSeq) return;
      this.widthSettled = true;
      if (first) this.prefetch();
      this.settle(cx);
    });
    cx.notify();
  }

  // The width to render at: the panel's, rounded up to BUCKET, within what the service renders.
  renderWidth() {
    return this.width == null ? null : Math.max(280, Math.min(1600, Math.ceil(this.width / BUCKET) * BUCKET));
  }

  // A page that can stand for the one at width w: same zoom, laid out within one bucket of it.
  near(s, w) {
    return Boolean(s?.done && s.zoom === this.zoom && Math.abs(s.width - w) <= BUCKET);
  }

  memKey(d) { return `${d.id}-v${d.version}-${scheme(theme().background)}`; }

  remember(d, s) {
    const k = this.memKey(d), sets = this.mem.get(k) ?? new Map();
    sets.set(ident(s), s);
    this.mem.delete(k); this.mem.set(k, sets);
    while (this.mem.size > MEMORY_DOCS) this.mem.delete(this.mem.keys().next().value);
  }

  // The remembered page of d closest to width w at this zoom; only one near enough unless `any`.
  remembered(d, w, any = false) {
    let best = null;
    for (const s of this.mem.get(this.memKey(d))?.values() ?? []) {
      if (s.zoom === this.zoom && (!best || Math.abs(s.width - w) < Math.abs(best.width - w))) best = s;
    }
    return best && (any || this.near(best, w)) ? best : null;
  }

  // The rendered page of d on disk closest to width w at this zoom, read straight from the renderer's cache
  // (manifests and tiles live under herdr-app's own folder), so reopening the panel asks the service nothing.
  async fromDisk(d, w) {
    if (!plainDoc(d)) return null;
    const re = cacheName(d, this.zoom);
    let best = null;
    for (const name of await fs.readdir(CACHE_DIR()).catch(() => [])) {
      const m = re.exec(name);
      if (m && (best == null || Math.abs(Number(m[1]) - w) < Math.abs(best.w - w))) best = { name, w: Number(m[1]) };
    }
    if (!best) return null;
    try {
      const s = pageSet({ ...JSON.parse(await fs.readFile(`${CACHE_DIR()}/${best.name}/manifest.json`, "utf8")), done: true }, best.name);
      if (!s || s.width !== best.w || s.zoom !== this.zoom) return null;
      this.remember(d, s);
      return s;
    } catch (_) {
      return null;
    }
  }

  // Put a finished page on screen that didn't just come from the renderer.
  show(s, cx) {
    this.tiles = s;
    this.touch(s);
    if (s) this.lease(cx);
  }

  touch(s) {
    // A second's slack, so the lease timer firing a little early still renews.
    if (!s?.key || Date.now() - (s.touched ?? 0) < TOUCH_MS - 1000) return;
    s.touched = Date.now();
    call("/touch", { key: s.key }).catch(() => {});
  }

  // While a page is on screen, renew its in-use mark every TOUCH_MS: one timer, which stops once no finished
  // page shows (back to the list, Text mode) and starts again with the next one shown.
  lease(cx) {
    if (this.leasing) return;
    this.leasing = true;
    const tick = (cx) => {
      const s = this.doc && !this.textMode ? this.tiles : null;
      if (!s?.done) { this.leasing = false; return; }
      this.touch(s);
      cx.timer.after(TOUCH_MS, tick);
    };
    cx.timer.after(TOUCH_MS, tick);
  }

  // Show the page at the panel's width and zoom: one already in memory or on disk if near enough, else ask the
  // service, showing the nearest page there is (scaled) until it answers. Text mode keeps its page until Page
  // is chosen again.
  settle(cx) {
    const d = this.doc, w = this.renderWidth(), z = this.zoom;
    if (!d || !this.widthSettled || (this.tiles && this.textMode) || this.near(this.tiles, w)) return;
    const kept = this.remembered(d, w);
    if (kept) { this.show(kept, cx); cx.notify(); return; }
    // A page already asked for within one bucket of this width will do; it replaces the shown one when done.
    const asked = this.requested;
    if (asked && asked.z === z && Math.abs(asked.w - w) <= BUCKET) return;
    const want = { w, z };
    this.requested = want;
    const live = () => this.doc?.id === d.id && this.requested === want;
    cx.spawn(async (cx) => {
      const disk = await this.fromDisk(d, w);
      if (!live()) return;
      const s = this.near(disk, w) ? disk : this.remembered(d, w, true) ?? disk;
      if (s && (this.near(s, w) || !this.tiles)) { this.show(s, cx); cx.notify(); }
      if (this.near(s, w)) return;
      if (await this.rendererReady(cx)) { if (live()) this.renderPage(cx, d, w, z); return; }
      // Asked again once the renderer is back.
      if (live()) this.requested = null;
      cx.notify();
    });
  }

  // Whether the page renderer answers. Any HTTP reply counts; a refused or silent port doesn't. A "no" is
  // asked again once RENDERER_RECHECK_MS has passed, so starting the service later brings pages back.
  rendererReady(cx) {
    const stale = this.rendererUp === false && Date.now() - this.rendererCheckedAt > RENDERER_RECHECK_MS;
    if (!this.rendererProbe || stale) {
      this.rendererProbe = Promise.race([
        fetch(`${RENDERER}/`).then(() => true, () => false),
        cx.sleep(RENDERER_PROBE_MS).then(() => false),
      ]).then((up) => { this.rendererUp = up; this.rendererCheckedAt = Date.now(); return up; });
    }
    return this.rendererProbe;
  }

  rendererDown() {
    this.rendererUp = false; this.rendererCheckedAt = Date.now(); this.rendererProbe = Promise.resolve(false);
  }

  // Warm the cache for the newest documents so opening them shows the page at once. The service renders these
  // behind anything opened, and drops the ones not started when a document is opened.
  async prefetch() {
    const w = this.renderWidth(), z = this.zoom;
    if (!this.rendererUp || this.query.trim() || !this.widthSettled) return;
    const have = new Set(await fs.readdir(CACHE_DIR()).catch(() => []));
    for (const a of this.list.slice(0, PREFETCH)) {
      if (!plainDoc(a)) continue;
      const name = `${a.id}-v${a.version}-${w}-z${Math.round(z * 100)}-${scheme(theme().background)}`;
      if (!have.has(name) && !this.remembered(a, w)) call("/render", { ...renderBody(a, w, z), prefetch: true }).catch(() => {});
    }
  }

  setZoom(cx, z) {
    z = Math.round(Math.max(0.5, Math.min(1.5, z)) * 20) / 20;
    if (z === this.zoom) return;
    this.zoom = z;
    localStorage.setItem("zoom", String(z));
    // A page at this zoom already rendered shows at once; otherwise clicks in a row ask once, for the zoom they
    // end on.
    const kept = this.doc && this.width != null && this.remembered(this.doc, this.renderWidth());
    if (kept) this.show(kept, cx);
    const seq = ++this.zoomSeq;
    cx.timer.after(ZOOM_SETTLE_MS, (cx) => { if (seq === this.zoomSeq) this.settle(cx); });
    cx.notify();
  }

  async api(path) {
    if (!this.token) this.token = await readToken();
    const { auth, source } = this.token;
    let r;
    try {
      r = await fetch(`${HUB}${path}`, { headers: { Authorization: auth } });
    } catch (e) {
      throw problem(`Can't reach ${HUB_HOST}`, String(e?.message ?? e), "Check this computer's internet connection (or VPN/proxy), then Retry.");
    }
    if (r.ok) return r.json();
    const body = await r.text().catch(() => "");
    let said = "";
    try { said = JSON.parse(body)?.error ?? ""; } catch (_) { said = body.slice(0, 200); }
    const status = `HTTP ${r.status}${said ? `: ${said}` : ""}`;
    // The hub answers a bad token with 500 "Invalid access token", not only 401.
    if (r.status === 401 || r.status === 403 || /token|auth/i.test(said)) {
      // Read the token again on Retry, so fixing its file needs no restart.
      this.token = null;
      if (r.status === 403) throw problem(`This token may not read documents (${status})`, `It came from ${source}. Use a token with read access there, then Retry.`);
      throw problem(`Artifact Hub rejected the token (${status})`, `It came from ${source}. It may be expired or mistyped: replace it there, then Retry.`);
    }
    if (r.status >= 500) throw problem(`Artifact Hub had a server error (${status})`, "Retry in a moment.");
    throw problem(`Artifact Hub answered ${status}`);
  }

  load(cx) {
    const q = this.query.trim();
    this.loading = true;
    cx.spawn(async (cx) => {
      try {
        const res = await this.api(`/api/artifacts/list?limit=200${q ? `&q=${encodeURIComponent(q)}` : ""}`);
        // A slower earlier search must not overwrite a newer one.
        if (q === this.query.trim()) {
          this.list = res.artifacts ?? []; this.error = null;
          this.prefetch();
        }
      } catch (e) {
        this.error = asProblem(e);
      }
      this.loading = false;
      cx.notify();
    });
  }

  open(cx, item) {
    this.doc = { ...item, source: null }; this.docLoading = true; this.textMode = false; this.renderError = null;
    this.requested = null; this.renderSeq++; this.lastGeom = null; this.geom = null;
    // A page this panel rendered before shows at once, scaled if its width differs; settle replaces it if needed.
    this.tiles = null;
    if (this.width != null) this.show(this.remembered(item, this.renderWidth(), true), cx);
    // Prefetches not started yet would only queue in front of nothing now; the service drops them.
    if (this.rendererUp) call("/cancel-prefetch", {}).catch(() => {});
    // The list row already carries the version, so the page starts alongside the source fetch, as soon as the
    // panel's width is known (settle waits for it).
    this.settle(cx);
    cx.spawn(async (cx) => {
      try {
        const d = await this.api(`/api/artifacts/${item.id}`);
        if (this.doc?.id === item.id) this.doc = { ...item, ...d };
      } catch (e) {
        if (this.doc?.id === item.id) this.doc = { ...item, error: asProblem(e) };
      }
      this.docLoading = false;
      cx.notify();
    });
  }

  // The service answers after the first tile; ask again until every tile is in. A newer request (another
  // document, another width) makes this one stale: its answers are dropped and its polling stops.
  renderPage(cx, d, w, z) {
    const token = ++this.renderSeq;
    const live = () => this.doc?.id === d.id && this.renderSeq === token;
    let failures = 0;
    cx.spawn(async (cx) => {
      for (;;) {
        let r;
        try {
          r = await call("/render", renderBody(d, w, z));
        } catch (_) {
          if (!live()) return;
          // A refused connection means the service is gone: fall back to text quietly. A dropped one while the
          // service still answers is a slow render; the job keeps going there, so ask again.
          this.rendererCheckedAt = 0; this.rendererProbe = null;
          if (++failures > 3 || !(await this.rendererReady(cx))) { if (live()) { this.rendererDown(); cx.notify(); } return; }
          await cx.sleep(1000);
          if (!live()) return;
          continue;
        }
        failures = 0;
        try {
          const res = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
          if (!r.ok) throw new Error(res.error ?? `HTTP ${r.status}`);
          if (!live()) return;
          const j = pageSet(res, res.key);
          if (!j) throw new Error("the renderer answered with an unexpected page");
          // A page at another width or zoom replaces the shown one only once complete and still wanted, so the
          // old page, scaled, stays up meanwhile instead of a partly drawn one.
          if (!this.tiles || ident(this.tiles) === ident(j)) this.tiles = j;
          else if (j.done && this.near(j, this.renderWidth())) this.tiles = j;
          // The panel may have changed width while this page rendered.
          if (j.done) { this.remember(d, j); this.touch(j); this.lease(cx); this.settle(cx); cx.notify(); return; }
        } catch (e) {
          if (live()) { this.renderError = String(e?.message ?? e); cx.notify(); }
          return;
        }
        cx.notify();
        // Nothing of a page at another width shows before it is complete, so there is no hurry to ask.
        await cx.sleep(ident(this.tiles) === `${w}@${z}` ? 400 : 1000);
        if (!live()) return;
      }
    });
  }

  // Tile heights at the shown width, and the rows the virtual list draws; rebuilt only when either changes.
  // Rows are cut at every picture's top and bottom (then to at most STRIP), so a row lies wholly inside or
  // wholly outside each picture's band: a click on a row names its picture by the pointer's x alone.
  pageGeometry(shown) {
    if (this.geom?.tiles === this.tiles && this.geom.shown === shown) return this.geom;
    const k = shown / this.tiles.width;
    let total = 0;
    const parts = this.tiles.tiles.map((x) => { const h = Math.round(x.height * k); const p = { path: x.path, top: total, h }; total += h; return p; });
    // Pictures belong to this tile set, so they scale with it and are replaced with it.
    const pics = (this.tiles.images ?? []).map((p) => ({ ...p, left: Math.round(p.x * k), top: Math.round(p.y * k), sw: Math.round(p.w * k), sh: Math.round(p.h * k) }));
    const cuts = [...new Set([0, total, ...pics.flatMap((p) => [p.top, p.top + p.sh]).filter((y) => y > 0 && y < total)])].sort((a, b) => a - b);
    const rows = [];
    for (let c = 0; c + 1 < cuts.length; c++) for (let y = cuts[c]; y < cuts[c + 1]; y += STRIP) rows.push({ y, h: Math.min(STRIP, cuts[c + 1] - y) });
    if (!rows.length) rows.push({ y: 0, h: STRIP });
    this.geom = { gen: ++this.geomGen, tiles: this.tiles, shown, ident: ident(this.tiles), parts, pics, rows, sizes: rows.map((r) => r.h), total: Math.max(1, total) };
    return this.geom;
  }

  // Rows are rebuilt whenever the tile set or its scale changes. At one scale (more tiles, or the pictures
  // arriving and re-cutting the rows) the page keeps its height and the list keeps its pixel offset, so the
  // reader stays put; a scroll_to_item here would snap to a row top. After the page is scaled or swapped for
  // another width or zoom, put the same share of it back on screen.
  keepScroll(id, g) {
    const last = this.lastGeom;
    this.lastGeom = { id, gen: g.gen, ident: g.ident, shown: g.shown, rows: g.rows, total: g.total };
    if (!last || last.id !== id) { this.pageScroll.scroll_to_item(0, "top"); this.restored = null; return; }
    if (last.gen === g.gen || (last.ident === g.ident && last.shown === g.shown)) return;
    const first = this.firstStrip ?? 0;
    const rowAt = (y) => { const i = g.rows.findIndex((r) => r.y + r.h > y); return i < 0 ? g.rows.length - 1 : i; };
    // Rounding to rows at every step of a drag would drift; keep the share until the person scrolls.
    const frac = this.restored && first === this.restored.strip ? this.restored.frac : (last.rows[first]?.y ?? 0) / last.total;
    const strip = rowAt(frac * g.total);
    this.restored = { strip, frac };
    this.pageScroll.scroll_to_item(strip, "top");
  }

  strip(g, i) {
    const { y, h } = g.rows[i];
    const row = div().relative().w(g.shown).h(h).overflow_hidden();
    for (const p of g.parts) if (p.top < y + h && p.top + p.h > y) row.child(image(p.path).absolute().left(0).top(p.top - y).w(g.shown).h(p.h));
    // Item renderers may not register handlers; the pointer only shows where a click opens a picture.
    for (const p of g.pics) if (p.top <= y && p.top + p.sh >= y + h) row.child(div().absolute().left(p.left).top(0).w(p.sw).h(h).cursor_pointer());
    return row;
  }

  // A click on a page row: the picture whose band holds the row and whose columns hold the press.
  clickRow(g, key) {
    const [gen, i] = key.split("-").map(Number), r = g.rows[i], x = this.pressX;
    if (gen !== g.gen || !r || x == null) return;
    const p = g.pics.find((p) => p.top <= r.y && p.top + p.sh >= r.y + r.h && x >= p.left && x < p.left + p.sw);
    if (p) this.openPicture(p);
  }

  openPicture(p) {
    const d = this.doc;
    if (!d) return;
    openOverlay({ mod: MOD, kind: "dialog", width: 0.8, height: 0.85,
      props: { viewer: { path: p.path, w: p.nw, h: p.nh, title: p.alt || d.title, link: `${HUB}/a/${d.id}` } } });
  }

  // The picture fitted to the dialog (never past 2x its own size), with Open in browser and Close.
  viewerView(t, iconButton) {
    const v = this.viewer, area = this.viewSize;
    const k = area && v.w && v.h ? Math.min((area.width - 24) / v.w, (area.height - 56) / v.h, 2) : 0;
    return v_flex().id("art-viewer").size_full().bg(t.background).text_color(t.foreground)
      .on_size_change((s, cx) => { if (s.width !== this.viewSize?.width || s.height !== this.viewSize?.height) { this.viewSize = s; cx.notify(); } })
      .child(h_flex().h(40).flex_none().px(12).gap(6).items_center().border_b(1).border_color(t.border)
        .child(div().flex_1().min_w(0).truncate().text_size(13).font_semibold().child(v.title ?? "Picture"))
        .child(iconButton("v-open", "↗", "Open the document in the browser", () => systemOpen(v.link)))
        .child(iconButton("v-close", "✕", "Close (Esc)", () => { if (this.overlayId) closeOverlay(this.overlayId); })))
      .child(div().flex_1().min_h(0).flex().items_center().justify_center().overflow_hidden()
        .when(k > 0, (el) => el.child(image(v.path).w(Math.max(1, Math.round(v.w * k))).h(Math.max(1, Math.round(v.h * k))).flex_none())));
  }

  render(cx) {
    const t = theme();
    const now = Date.now();
    const iconButton = (id, label, tip, action) => div().id(id).px(6).h(24).flex().items_center().rounded(5)
      .text_size(12).text_color(t.muted).cursor_pointer().tooltip(tip).hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_click(action).child(label);
    if (this.viewer) return this.viewerView(t, iconButton);
    const problemView = (p, retry) => v_flex().gap(6).p(12)
      .child(div().text_size(12).font_semibold().text_color(t.blocked).child(p.message))
      .children(p.detail.map((line) => div().text_size(11.5).text_color(t.muted).child(line)))
      .child(h_flex().pt(4).child(div().id("retry").px(10).h(24).flex().items_center().rounded(5).border_1().border_color(t.border)
        .text_size(12).text_color(t.foreground).cursor_pointer().hover((s) => s.bg(t.hover)).on_click(retry).child("Retry")));

    if (this.doc) {
      const d = this.doc;
      const pages = this.rendererUp !== false;
      const header = h_flex().gap(4).px(8).h(36).flex_none().items_center().border_b(1).border_color(t.border)
        .child(iconButton("back", "←", "Back to the list", (_e, cx) => { this.doc = null; cx.notify(); }))
        .child(div().flex_1().min_w(0).truncate().text_size(12).font_semibold().text_color(t.foreground).child(d.title))
        .when(pages, (el) => el.child(iconButton("mode", this.textMode ? "Page" : "Text", this.textMode ? "Show the page as the web renders it" : "Show selectable text", (_e, cx) => { this.textMode = !this.textMode; if (!this.textMode && this.tiles) this.lease(cx); this.settle(cx); cx.notify(); })))
        .when(pages && !this.textMode, (el) => el
          .child(iconButton("zoom-out", "−", "Smaller", (_e, cx) => this.setZoom(cx, this.zoom - 0.1)))
          .child(iconButton("zoom-reset", `${Math.round(this.zoom * 100)}%`, `Page size (reset to ${ZOOM * 100}%)`, (_e, cx) => this.setZoom(cx, ZOOM)))
          .child(iconButton("zoom-in", "+", "Larger", (_e, cx) => this.setZoom(cx, this.zoom + 0.1))))
        .child(iconButton("open-web", "↗", "Open in the browser", () => systemOpen(`${HUB}/a/${d.id}`)));
      const meta = h_flex().gap(6).px(12).py(6).flex_none().text_size(11).text_color(t.dim)
        .child(`${d.project} · v${d.version} · ${d.format} · ${d.visibility}`);
      const text = () => (d.format === "html" ? TextView.html(`doc-${d.id}`, d.source) : TextView.markdown(`doc-${d.id}`, d.source))
        .selectable(true).scrollable(true).on_link_click((url) => systemOpen(url));
      let body;
      const page = pages && this.tiles && !this.textMode;
      if (page) {
        // Until the page for a new width arrives, the old one is scaled to fit.
        const g = this.pageGeometry(this.width);
        this.keepScroll(d.id, g);
        body = v_flex().size_full()
          .child(div().id("page-area").relative().flex_1().min_h(0)
            // Rows report clicks by key only; the press's x, taken here, says which picture in the row.
            .on_mouse_down("left", (e) => { this.pressX = e.local_position?.x ?? (e.bounds ? e.position.x - e.bounds.x : null); })
            // Keys carry the geometry generation, so no row cut for an earlier tile set is ever reused.
            .child(v_virtual_list("page", g.rows.length, g.sizes, (i) => `${g.gen}-${i}`, (range) => {
              this.firstStrip = range.start;
              const out = [];
              for (let i = range.start; i < range.end; i++) out.push(this.strip(g, i));
              return out;
            }).track_scroll(this.pageScroll).on_item_click((key) => this.clickRow(g, key)).size_full())
            .child(Scrollbar.vertical("page").absolute().inset_0()))
          .when(!this.tiles.done, (el) => el.child(div().flex_none().py(8).text_size(11).text_color(t.dim).child("Rendering the rest…")));
      } else if (d.error) body = problemView(d.error, (_e, cx) => { this.open(cx, d); cx.notify(); });
      else if (this.docLoading || d.source == null) body = div().p(12).text_size(12).text_color(t.dim).child("Loading…");
      // Text shows at once while the page renders, and stays if the render fails or there is no renderer.
      else {
        const note = !pages ? `Showing text: the page renderer (${RENDERER.replace(/^https?:\/\//, "")}) isn't running here. ↗ opens the full page.`
          : this.textMode ? null
          : this.renderError ? `Page render failed, showing text: ${this.renderError}`
          : "Rendering the page as on the web…";
        body = v_flex().gap(6).size_full()
          .when(Boolean(note), (el) => el.child(div().flex_none().text_size(11).text_color(this.renderError && pages ? t.blocked : t.dim).child(note)))
          .child(text());
      }
      return v_flex().id("artifacts").size_full().bg(t.background).text_color(t.foreground).on_size_change((s, cx) => this.measure(s, cx))
        .child(header).child(meta)
        .child(div().id("doc-body").flex_1().min_h(0).px(12).pb(12).text_size(13).child(body));
    }

    const reload = (_e, cx) => {
      // Reload also asks the renderer again, so a service started meanwhile is picked up.
      if (this.rendererUp === false) this.rendererCheckedAt = 0;
      cx.spawn(async (cx) => { if (await this.rendererReady(cx)) this.prefetch(); cx.notify(); });
      this.load(cx);
      cx.notify();
    };
    const search = h_flex().px(8).h(40).flex_none().items_center().border_b(1).border_color(t.border)
      .child(div().id("search").flex_1().min_w(0).h(28).px(8).flex().items_center().rounded(6).border_1().border_color(t.border)
        .cursor_text().on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .child(Input.new(this.input).h_full().text_size(12).text_color(t.foreground)))
      .child(iconButton("reload", this.loading ? "…" : "⟳", "Reload", reload));

    const row = (a) => v_flex().id(`a-${a.id}`).px(12).py(7).gap(2).cursor_pointer().border_b(1).border_color(t.border)
      .hover((s) => s.bg(t.hover)).on_click((_e, cx) => { this.open(cx, a); cx.notify(); })
      .child(h_flex().gap(6).items_center()
        .child(div().flex_1().min_w(0).truncate().text_size(12.5).text_color(t.foreground).child(a.title))
        .child(div().flex_none().text_size(11).text_color(t.dim).child(ago(a.updated_at, now))))
      .child(div().truncate().text_size(11).text_color(t.dim)
        .child([a.project, a.format, ...(a.tags ?? []).slice(0, 4).map((x) => `#${x}`)].join(" · ")));

    let content;
    if (this.error && !this.list.length) content = problemView(this.error, reload);
    else if (!this.list.length) content = div().p(12).text_size(12).text_color(t.dim).child(this.loading ? "Loading…" : "No documents match.");
    else content = v_flex()
      // A failed search keeps the last results; say they are stale.
      .when(Boolean(this.error), (el) => el.child(div().px(12).py(6).text_size(11).text_color(t.blocked).border_b(1).border_color(t.border)
        .child(`${this.error?.message}. Showing the last results.`)))
      .children(this.list.map(row));

    return v_flex().id("artifacts").size_full().bg(t.background).text_color(t.foreground).on_size_change((s, cx) => this.measure(s, cx))
      .child(h_flex().px(12).h(32).flex_none().items_center().border_b(1).border_color(t.border)
        .child(div().flex_1().text_size(12).font_semibold().child("Artifact Hub"))
        .child(div().text_size(11).text_color(t.dim).child(`${this.list.length}`)))
      .child(search)
      .child(div().id("list").flex_1().min_h(0).overflow_y_scrollbar().child(content));
  }
}
