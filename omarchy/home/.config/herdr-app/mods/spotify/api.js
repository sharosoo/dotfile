// Spotify Web API: sign-in (Authorization Code + PKCE, no client secret), token refresh and
// calls. Only the refresh token is kept on disk (data/spotify/refresh-token, 0600); the access
// token lives in memory and is refreshed an hour at a time.
import { exec, appHome } from "herdr";
import * as fs from "fs/promises";
import { createHash, randomBytes } from "crypto";

export const PORT = 47830;
export const REDIRECT_URI = `http://127.0.0.1:${PORT}/callback`;
export const SCOPES = [
  "user-read-playback-state", "user-modify-playback-state", "user-read-currently-playing",
  "playlist-read-private", "playlist-read-collaborative", "user-library-read", "user-read-recently-played",
];
const ACCOUNTS = "https://accounts.spotify.com";
const API = "https://api.spotify.com/v1";
export const DASHBOARD_URL = "https://developer.spotify.com/dashboard";

export const dataDir = () => `${appHome().replace(/\\/g, "/")}/data/spotify`;
const modDir = () => `${appHome().replace(/\\/g, "/")}/mods/spotify`;

// ── files ─────────────────────────────────────────────────────────────────────────────
async function chmod(path, mode) {
  const r = await exec("chmod", [mode, path]);
  if (r.code !== 0) throw new Error(`chmod failed: ${r.stderr.trim()}`);
}

// What is at `path` without following links ("regular file", "symbolic link", …), or null.
async function kind(path) {
  const r = await exec("stat", ["-c", "%F", path]);
  return r.code === 0 ? r.stdout.trim() : null;
}
const isRegular = (k) => k === "regular file" || k === "regular empty file";

// The file is made empty and locked before the secret goes in, so it is never readable by
// anyone else, not even for a moment. A link planted in its place is refused, not followed.
async function saveSecret(path, value) {
  const k = await kind(path);
  if (k && !isRegular(k)) throw new Error(`${path} is not a plain file; remove it and try again.`);
  if (!k) await fs.writeFile(path, "");
  await chmod(path, "600");
  await fs.writeFile(path, `${value}\n`);
}

// A secret file is read only if it is a plain file, and is locked to this user first in
// case an older copy or a sync left it readable.
async function readSecret(path) {
  const k = await kind(path);
  if (!k || !isRegular(k)) return null;
  if (!(await chmod(path, "600").then(() => true, () => false))) return null;
  const text = await fs.readFile(path, "utf8").catch(() => null);
  return text ? text.trim() : null;
}

async function ensureDir() {
  const dir = dataDir();
  await fs.mkdir(dir, { recursive: true }).catch(() => {});
  if ((await kind(dir)) !== "directory") throw new Error(`${dir} is not a plain folder; remove it and try again.`);
  await chmod(dir, "700");
  return dir;
}

// ── PKCE ──────────────────────────────────────────────────────────────────────────────
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
function base64url(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    if (i + 1 < bytes.length) out += B64[(n >> 6) & 63];
    if (i + 2 < bytes.length) out += B64[n & 63];
  }
  return out;
}
const hex = (n) => Array.from(randomBytes(n), (b) => b.toString(16).padStart(2, "0")).join("");

export const isClientId = (s) => /^[0-9a-f]{32}$/i.test(s);

// A token answer for a session that was signed out or replaced meanwhile; callers drop it quietly.
const stale = () => Object.assign(new Error("stale session"), { stale: true });
let headerSeq = 0;

// ── the account ───────────────────────────────────────────────────────────────────────
export class Account {
  constructor() {
    this.clientId = null;
    this.refresh = null;
    this.access = null;
    this.expiresAt = 0;
    this.refreshing = null;
    this.login = null; // { state, promise } while the browser sign-in is waiting
    // Bumped by sign-out and Client ID changes, and by each new sign-in: a token answer that
    // started under an older one belongs to a session that is gone and is dropped unsaved.
    this.gen = 0;
  }

  get signedIn() { return Boolean(this.clientId && this.refresh); }

  async load() {
    const dir = dataDir();
    this.clientId = await readSecret(`${dir}/client-id`);
    this.refresh = await readSecret(`${dir}/refresh-token`);
    this.access = null;
    this.expiresAt = 0;
  }

  async saveClientId(id) {
    this.gen++;
    const dir = await ensureDir();
    await saveSecret(`${dir}/client-id`, id);
    this.clientId = id;
  }

  async signOut() {
    this.gen++;
    this.refreshing = null;
    this.refresh = null;
    this.access = null;
    this.expiresAt = 0;
    await fs.unlink(`${dataDir()}/refresh-token`).catch(() => {});
  }

  async forget() {
    await this.signOut();
    await fs.unlink(`${dataDir()}/client-id`).catch(() => {});
    this.clientId = null;
  }

  // The whole browser sign-in: the callback listener first, then the browser, then the code
  // traded for tokens. `open(url)` shows the consent page. Resolves with null on success or
  // an error message a person can act on.
  async signIn(open) {
    if (!this.clientId) return "먼저 Client ID를 붙여넣으세요.";
    this.cancelSignIn();
    const gen = this.gen;
    const verifier = hex(48), state = hex(16);
    const challenge = base64url(createHash("sha256").update(verifier).digest());
    const waiting = exec("bun", [`${modDir()}/oauth-callback.mjs`, String(PORT), state, "300"]).catch((e) => ({ code: -1, stdout: "", stderr: String(e?.message ?? e) }));
    this.login = { state };
    const params = new URLSearchParams({
      client_id: this.clientId, response_type: "code", redirect_uri: REDIRECT_URI,
      code_challenge_method: "S256", code_challenge: challenge, state, scope: SCOPES.join(" "),
    });
    open(`${ACCOUNTS}/authorize?${params}`);
    const r = await waiting;
    if (this.login?.state === state) this.login = null;
    if (r.code === -1) return `bun: ${r.stderr}`;
    let out = null;
    try { out = JSON.parse(r.stdout.trim().split("\n").pop()); } catch (_) {}
    if (!out) return "응답이 오기 전에 로그인 대기가 멈췄어요.";
    if (out.error === "cancelled") return "cancelled";
    if (out.error === "port_in_use") return `${PORT}번 포트가 사용 중이라 Spotify 응답을 받을 수 없어요. 포트를 쓰는 프로그램을 닫고 다시 시도하세요.`;
    if (out.error === "timeout") return "5분 동안 Spotify에서 응답이 없었어요. 다시 시도하세요.";
    if (out.error === "access_denied") return "Spotify 페이지에서 취소를 선택했어요.";
    if (out.error) return `Spotify: ${out.error}`;
    const res = await fetch(`${ACCOUNTS}/api/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code: out.code, redirect_uri: REDIRECT_URI, client_id: this.clientId, code_verifier: verifier }).toString(),
    }).catch(() => null);
    if (!res) return "Spotify에 연결할 수 없어요.";
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.refresh_token) return explainTokenError(j);
    // Signed out or the Client ID changed while the browser was open.
    if (gen !== this.gen) return "cancelled";
    this.gen++;
    this.refreshing = null;
    await this.keep(j, this.gen);
    return null;
  }

  cancelSignIn() {
    const login = this.login;
    this.login = null;
    if (login) fetch(`http://127.0.0.1:${PORT}/cancel?state=${login.state}`).catch(() => {});
  }

  // Takes a token answer from session `gen`; one from an older session is dropped.
  async keep(j, gen) {
    if (gen !== this.gen) return false;
    // PKCE refresh tokens rotate: the new one replaces the old, which stops working.
    if (j.refresh_token && j.refresh_token !== this.refresh) {
      const dir = await ensureDir();
      if (gen !== this.gen) return false;
      await saveSecret(`${dir}/refresh-token`, j.refresh_token);
      if (gen !== this.gen) {
        // Signed out while the file was being written: take it back out.
        await fs.unlink(`${dir}/refresh-token`).catch(() => {});
        return false;
      }
      this.refresh = j.refresh_token;
    }
    this.access = j.access_token;
    this.expiresAt = Date.now() + (Number(j.expires_in) || 3600) * 1000 - 60_000;
    return true;
  }

  // One refresh at a time; every caller waiting meanwhile gets its result.
  async token(force = false) {
    if (!force && this.access && Date.now() < this.expiresAt) return this.access;
    if (!this.refreshing) this.refreshing = this.doRefresh().finally(() => { this.refreshing = null; });
    return this.refreshing;
  }

  async doRefresh() {
    if (!this.signedIn) throw new AuthError("로그인되어 있지 않아요.");
    const gen = this.gen;
    const res = await fetch(`${ACCOUNTS}/api/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: this.refresh, client_id: this.clientId }).toString(),
    });
    const j = await res.json().catch(() => ({}));
    if (gen !== this.gen) throw stale();
    if (res.status === 400 || res.status === 401) {
      await this.signOut();
      throw new AuthError(explainTokenError(j));
    }
    if (!res.ok || !j.access_token) throw new Error(`Spotify 로그인 서비스에서 ${res.status} 응답을 보냈어요.`);
    if (!(await this.keep(j, gen))) throw stale();
    return this.access;
  }

  // A Web API call. Never throws for an HTTP answer: { status, json, reason, retryAfter }.
  // `retryAfter` (seconds) is set on 429; it throws AuthError when the sign-in is gone.
  async call(method, path, { query, body } = {}) {
    const url = `${API}${path}${query ? `?${new URLSearchParams(query)}` : ""}`;
    for (let attempt = 0; ; attempt++) {
      const token = await this.token(attempt > 0);
      const headers = { Authorization: `Bearer ${token}` };
      if (body !== undefined) headers["Content-Type"] = "application/json";
      const res = await fetch(url, { method, headers, body: body === undefined ? (method === "GET" ? undefined : "") : JSON.stringify(body) });
      if (res.status === 401 && attempt === 0) continue;
      const text = await res.text().catch(() => "");
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch (_) {}
      const out = { status: res.status, json, reason: json?.error?.reason ?? null, message: json?.error?.message ?? null };
      if (res.status === 401) throw new AuthError("Spotify에서 이 패널의 로그인을 더 이상 허용하지 않아요. 다시 연결하세요.");
      if (res.status === 429) out.retryAfter = await this.retryAfter(token);
      return out;
    }
  }

  // The fetch response carries no headers, so a 429's Retry-After is read by asking once
  // more with curl. The token goes through a header file only this user can read, gone
  // straight after, never on a command line. Each call gets its own file, created only if
  // nothing is there yet (noclobber), so two calls or a planted file never share one.
  async retryAfter(token) {
    const file = `${await ensureDir()}/.auth-header.${hex(8)}.${++headerSeq}`;
    let made = false;
    try {
      made = (await exec("sh", ["-c", 'umask 077 && set -C && : > "$1"', "sh", file])).code === 0;
      if (!made) return 30;
      await fs.writeFile(file, `Authorization: Bearer ${token}\n`);
      const r = await exec("curl", ["-s", "-o", "/dev/null", "-D", "-", "--max-time", "10", "-H", `@${file}`, `${API}/me/player`]);
      const m = /^retry-after:\s*(\d+)/im.exec(r.stdout ?? "");
      return m ? Math.max(1, Number(m[1])) : 30;
    } catch (_) {
      return 30;
    } finally {
      if (made) await fs.unlink(file).catch(() => {});
    }
  }
}

export class AuthError extends Error {}

function explainTokenError(j) {
  const e = j?.error, d = j?.error_description ?? "";
  if (e === "invalid_client") return "Spotify에 등록되지 않은 Client ID예요. 앱 설정에서 다시 확인하세요.";
  if (e === "invalid_grant" && /redirect/i.test(d)) return `Spotify 앱의 Redirect URI가 ${REDIRECT_URI}와 정확히 일치해야 해요.`;
  if (e === "invalid_grant") return "Spotify에서 이 로그인을 종료했어요. 다시 연결하세요.";
  return `Spotify: ${e || "error"}${d ? ` (${d})` : ""}`;
}

// ── shapes the panel draws ────────────────────────────────────────────────────────────
// The smallest picture at least `want` px wide, else the biggest there is.
export function pickImage(images, want) {
  const list = (images ?? []).filter((i) => i?.url);
  if (!list.length) return null;
  const sized = list.filter((i) => i.width).sort((a, b) => a.width - b.width);
  return (sized.find((i) => i.width >= want) ?? sized[sized.length - 1] ?? list[0]).url;
}

const names = (artists) => (artists ?? []).map((a) => a?.name).filter(Boolean).join(", ");

export function item(o) {
  if (!o?.uri) return null;
  const base = { id: o.id, uri: o.uri, name: o.name ?? "", url: o.external_urls?.spotify ?? null };
  switch (o.type) {
    case "track": return { ...base, kind: "track", sub: names(o.artists), album: o.album?.name ?? "", artists: names(o.artists), durationMs: o.duration_ms ?? 0, thumb: pickImage(o.album?.images, 64), art: pickImage(o.album?.images, 300) };
    case "episode": return { ...base, kind: "episode", sub: o.show?.name ?? "", album: o.show?.name ?? "", artists: o.show?.publisher ?? o.show?.name ?? "", durationMs: o.duration_ms ?? 0, thumb: pickImage(o.images ?? o.show?.images, 64), art: pickImage(o.images ?? o.show?.images, 300) };
    case "album": return { ...base, kind: "album", sub: [names(o.artists), (o.release_date ?? "").slice(0, 4)].filter(Boolean).join(" · "), thumb: pickImage(o.images, 64) };
    case "artist": return { ...base, kind: "artist", sub: "아티스트", thumb: pickImage(o.images, 64) };
    case "playlist": {
      const total = o.items?.total ?? o.tracks?.total;
      return { ...base, kind: "playlist", sub: [o.owner?.display_name, total != null ? `${total}곡` : null].filter(Boolean).join(" · "), total: total ?? null, thumb: pickImage(o.images, 64) };
    }
    default: return null;
  }
}

// GET /me/player → what the now-playing bar shows.
export function playbackFromApi(j) {
  const it = item(j?.item);
  return {
    source: "api",
    playing: Boolean(j?.is_playing),
    track: it,
    progressMs: j?.progress_ms ?? 0,
    at: Date.now(),
    shuffle: Boolean(j?.shuffle_state),
    repeat: j?.repeat_state ?? "off",
    volume: j?.device?.volume_percent ?? null,
    device: j?.device ? { id: j.device.id, name: j.device.name, type: j.device.type, volumeOk: j.device.supports_volume !== false } : null,
    context: j?.context?.uri ?? null,
  };
}
