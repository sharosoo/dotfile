// slack: read and answer Slack from Herdr's side panel. A list of conversations grouped like
// Slack's sidebar (Unreads/Threads/Saved, your sections, Channels, Direct messages, Apps); a
// click opens one full height with the reply box at the bottom, scrolling back through its
// history, threads and emoji reactions.
//
// Two copies of this one mod, one Slack connection:
//   props { bg: true }     a 0 px block in the layout. It holds the only connection: Slack's
//                          Socket Mode (one websocket, pushed events, no polling), the Web
//                          API calls, the unread counts and the toasts. It draws nothing.
//   props { panel: true }  the side panel. It only draws what the first one publishes in
//                          shared state ("slack.state") and asks it to act through
//                          "slack.cmd". Opening or closing the panel never reconnects.
//
// Tokens, both in data/slack/, readable by you only. The panel's setup steps (setup.js) make
// the Slack app, check both tokens and save them; they open by themselves while a token is
// missing or Slack rejects one, and from the gear menu (Change tokens, Sign out).
//   app-token   xapp-…  Socket Mode connection (scope connections:write)
//   user-token  xoxp-…  reading and replying as you (reacting also needs reactions:write)
//
// "Read" is marked in Slack too (conversations.mark) when the token has the four *:write
// scopes; without them it is kept here only and the list says so.
//
// Pictures (image files, link previews, app cards) are drawn in the messages from copies kept
// in data/slack/media/ (bounded, oldest shown first to go). Links open in Herdr's browser panel
// (the herdr-browser service on 127.0.0.1:47825), or the system browser when it isn't running.
// Your own sidebar sections, rules included, are in data/slack/sections.json (README.md).
import { View, div, svg, image } from "gpui-kit";
import * as fs from "fs/promises";
import { randomUUID } from "crypto";
import { v_flex, h_flex, InputState, Input, TextareaState, Textarea } from "gpui-base";
import { WebSocket } from "websocket";
import EMOJI_NAMES from "./emoji-map.js";
import { call, AUTH_ERRORS, missingScopes, newWizard, renderSetup, runCheck, saveTokens, removeTokens, button, lock } from "./setup.js";
import { theme, settings, props as given, appHome, readTextFile, writeTextFile, notify, shared, setShared, nextCommand, exec, home, window as appWindow, playSound, run, openOverlay, closeOverlay } from "herdr";

const NAME = "slack";
const ICON = (name) => `mods/${NAME}/${name}.svg`;
const STATE = "slack.state", CMD = "slack.cmd", UNREAD = "slack.unread", PEOPLE = "slack.people";
const CMD_KEEP = 20; // commands kept in "slack.cmd" for the background to catch up on
// What conversations.mark needs, one per kind of conversation.
const MARK_SCOPES = new Set(["channels:write", "groups:write", "im:write", "mpim:write"]);
// What the panel shows or is about to: { n, items: [{ pic } | { face }] }, most wanted first.
const WANT = "slack.want";
const HYDRATE_DAYS = 60; // a conversation last heard from longer ago than this is not looked at again
const HYDRATE_MS = 1500; // between those calls: Slack allows about 50 a minute
const HISTORY = 40;
const SHOWN = 100; // rows in a group
const KIND_ICON = { im: "user", mpim: "users", group: "lock", channel: "hash" };

// Slack's reaction names as characters. A name not here (a custom emoji) shows as :name:.
const EMOJI = {
  "+1": "👍", "-1": "👎", thumbsup: "👍", thumbsdown: "👎", heart: "❤️", joy: "😂", smile: "😄", smiley: "😃", grin: "😁", laughing: "😆",
  sweat_smile: "😅", wink: "😉", blush: "😊", slightly_smiling_face: "🙂", upside_down_face: "🙃", thinking_face: "🤔", cry: "😢", sob: "😭",
  tada: "🎉", eyes: "👀", white_check_mark: "✅", heavy_check_mark: "✔️", x: "❌", pray: "🙏", fire: "🔥", rocket: "🚀", clap: "👏", raised_hands: "🙌",
  "100": "💯", ok_hand: "👌", muscle: "💪", wave: "👋", sparkles: "✨", star: "⭐", warning: "⚠️", bug: "🐛", hourglass: "⌛", coffee: "☕",
  zap: "⚡", bulb: "💡", memo: "📝", pushpin: "📌", point_up: "☝️", handshake: "🤝", party_popper: "🎉", rofl: "🤣", sunglasses: "😎", sleeping: "😴",
};
const QUICK = ["+1", "heart", "joy", "tada", "eyes", "white_check_mark", "pray", "fire"];
const emoji = (name) => { const n = String(name).split("::")[0]; return EMOJI_NAMES[n] ?? EMOJI[n] ?? `:${n}:`; };
// Names and section titles: only :white_check_mark: → ✅ (a workspace's own emoji stay :name:).
const emojiText = (x) => x.replace(/:([a-z0-9_+'-]+)(?:::skin-tone-\d)?:/g, (all, n) => EMOJI_NAMES[n] ?? EMOJI[n] ?? all);
// Text as Slack writes it, made readable: emoji as characters, and *bold* / _italic_ / ~strike~
// markers dropped, since a line here is one style.
const pretty = (x) => emojiText(x)
  .replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s).,:;!?-])/g, "$1$2")
  .replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,:;!?-])/g, "$1$2")
  .replace(/(^|[\s(])~([^~\n]+)~(?=$|[\s).,:;!?-])/g, "$1$2");

const dir = () => `${appHome().replace(/\\/g, "/")}/data/${NAME}`;
const SECTIONS = () => `${dir()}/sections.json`;
const secId = (name) => `s${hashOf(name).toString(36)}`;
// A conversation as sections.json may name it: "C0123", "general" or "#general", any case.
const refKey = (x) => String(x).trim().replace(/^#/, "").toLowerCase();
const RULE_TYPES = new Set(["public", "private", "dm", "group", "app"]);
// "gpai_dev_*|*deploy*": * any run, ? one character, | or; the whole name, any case. Only these
// three are special and every other character is literal, so no pattern can make a slow
// regular expression.
function globOf(g) {
  const alts = String(g).split("|").map((s) => s.trim()).filter(Boolean).slice(0, 20);
  if (!alts.length) return null;
  return new RegExp(`^(?:${alts.map((a) => a.replace(/\*+/g, "*").replace(/[.+^${}()[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")).join("|")})$`, "i");
}
const RULE_KEYS = new Set(["name", "type", "muted"]);
// What's wrong with a rule as written, or null. A rule is a name pattern, or { name, type,
// muted } with every given part having to hold.
function ruleProblem(r) {
  const pattern = (v) => typeof v === "string" && v.length <= 200 && v.split("|").some((s) => s.trim());
  if (typeof r === "string") return pattern(r) ? null : "a name pattern must be 1–200 characters";
  if (!r || typeof r !== "object" || Array.isArray(r)) return "must be a name pattern or { name, type, muted }";
  for (const k of Object.keys(r)) if (!RULE_KEYS.has(k)) return k === "regex" ? `"regex" isn't supported: use "name" with * ? |` : `has an unknown key "${k}"`;
  if (r.name !== undefined && !pattern(r.name)) return `"name" must be a pattern of 1–200 characters`;
  if (r.type !== undefined && (typeof r.type !== "string" || !r.type.split("|").every((s) => RULE_TYPES.has(s.trim())))) return `"type" must be public, private, dm, group or app (several joined by |)`;
  if (r.muted !== undefined && typeof r.muted !== "boolean") return `"muted" must be true or false`;
  if (r.name === undefined && r.type === undefined && r.muted === undefined) return "is empty and would take every conversation";
  return null;
}
// A rule that passed ruleProblem, ready to test names with.
function ruleOf(r) {
  if (typeof r === "string") r = { name: r };
  return { name: r.name !== undefined ? globOf(r.name) : null, type: r.type !== undefined ? new Set(r.type.split("|").map((s) => s.trim())) : null, muted: r.muted ?? null };
}
// What's wrong with sections.json as { where, problem, name } (name: the section's, to find its
// line by), or null. The file is taken whole or not at all.
function sectionsProblem(doc) {
  const isObj = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
  const refs = (v) => Array.isArray(v) && v.every((x) => typeof x === "string");
  if (!isObj(doc)) return { where: "the file", problem: "must be a JSON object" };
  const entry = (e, at) => {
    if (!isObj(e)) return { where: at || "the file", problem: "must be an object" };
    if (e.sections !== undefined && !Array.isArray(e.sections)) return { where: `${at}sections`, problem: "must be a list" };
    if (e.unsectioned !== undefined && !refs(e.unsectioned)) return { where: `${at}unsectioned`, problem: "must be a list of channel names or ids" };
    const seen = new Set();
    for (const [i, s] of (e.sections ?? []).entries()) {
      const where = `${at}sections[${i}]`;
      if (!isObj(s)) return { where, problem: "must be an object" };
      const name = typeof s.name === "string" ? s.name.trim() : "";
      const bad = (field, problem) => ({ where: `${where}.${field}`, problem, name });
      if (!name) return bad("name", "is required");
      if (name.length > 80) return bad("name", "is longer than 80 characters");
      if (seen.has(name)) return bad("name", "is used by another section");
      seen.add(name);
      if (s.emoji != null && typeof s.emoji !== "string") return bad("emoji", "must be text");
      if (s.collapsed !== undefined && typeof s.collapsed !== "boolean") return bad("collapsed", "must be true or false");
      if (s.channels !== undefined && !refs(s.channels)) return bad("channels", "must be a list of channel names or ids");
      if (s.rules !== undefined && !Array.isArray(s.rules)) return bad("rules", "must be a list");
      for (const [j, r] of (s.rules ?? []).entries()) { const p = ruleProblem(r); if (p) return bad(`rules[${j}]`, p); }
    }
    return null;
  };
  if (doc.teams !== undefined) {
    if (!isObj(doc.teams)) return { where: "teams", problem: "must be an object keyed by team id" };
    for (const [id, e] of Object.entries(doc.teams)) { const p = entry(e, `teams.${id}.`); if (p) return p; }
  }
  return entry(doc, "");
}
// sections.json as text → the document, or an Error saying where it's wrong (with the line when
// it can be found).
function parseSections(text) {
  const lineAt = (i) => (i >= 0 ? text.slice(0, i).split("\n").length : null);
  const say = (line, what) => new Error(`sections.json${line ? ` line ${line}` : ""}: ${what}`);
  let doc;
  try { doc = JSON.parse(text); } catch (e) {
    const msg = String(e?.message ?? e), line = /line (\d+)/.exec(msg)?.[1] ?? lineAt(Number(/position (\d+)/.exec(msg)?.[1] ?? -1));
    throw say(line, `not valid JSON (${msg.replace(/^JSON\.parse: |^JSON Parse error: /, "").replace(/ in JSON at position \d+.*$| at line \d+.*$/, "")})`);
  }
  const p = sectionsProblem(doc);
  if (!p) return doc;
  const near = p.name ? text.indexOf(JSON.stringify(p.name)) : -1;
  throw say(lineAt(near), `${p.where} ${p.problem}`);
}
const sleep = (cx, ms) => new Promise((done) => cx.timer.after(ms, () => done()));
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function clock(ms) {
  const d = new Date(ms), h = d.getHours();
  return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
function dayLabel(ms) {
  const d = new Date(ms), now = new Date();
  const start = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(now) - start(d)) / 86400000);
  return diff === 0 ? "Today" : diff === 1 ? "Yesterday" : `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : ""}`;
}
// Each person keeps one colour, as in Slack. Six hues far apart from each other and from
// green (yours), in a bright set for dark themes and a deep set for light ones. A person's
// colour comes from a hash of their Slack id; in one chat, two people never share one: the
// second takes the next free colour.
const NAME_COLORS = {
  dark: ["#5eb1ff", "#c792ea", "#ff6b81", "#ffb454", "#2ed3c6", "#f2d74e"],
  light: ["#1f6fd1", "#8a3fc7", "#c9334a", "#b85f00", "#0f8f86", "#8a7500"],
};
const LINK = "#5eb1ff";
const MENTION = {
  dark: { fg: "#1d9bd1", bg: "#1d9bd126", meFg: "#f2f2f2", meBg: "#f2c74466" },
  light: { fg: "#1264a3", bg: "#1d9bd11a", meFg: "#1d1c1d", meBg: "#f2c74466" },
};
const hashOf = (uid) => { let h = 0; for (const ch of String(uid)) h = (h * 31 + ch.codePointAt(0)) >>> 0; return h; };
// SHA-256 as hex, for cache file names and folders: a 32-bit hash lets two addresses share a
// file. Kept synchronous (pic() names files as messages are read) and in plain JS (the mod
// runtime has no crypto API).
const SHA_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];
function sha256(text) {
  const bytes = [];
  for (const ch of String(text)) {
    const c = ch.codePointAt(0);
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else bytes.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  const bits = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 7; i >= 0; i--) bytes.push(i >= 4 ? 0 : (bits >>> (i * 8)) & 255);
  const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19], W = new Array(64);
  const rot = (x, n) => (x >>> n) | (x << (32 - n));
  for (let o = 0; o < bytes.length; o += 64) {
    for (let i = 0; i < 16; i++) W[i] = (bytes[o + 4 * i] << 24) | (bytes[o + 4 * i + 1] << 16) | (bytes[o + 4 * i + 2] << 8) | bytes[o + 4 * i + 3];
    for (let i = 16; i < 64; i++) {
      const s0 = rot(W[i - 15], 7) ^ rot(W[i - 15], 18) ^ (W[i - 15] >>> 3), s1 = rot(W[i - 2], 17) ^ rot(W[i - 2], 19) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (rot(e, 6) ^ rot(e, 11) ^ rot(e, 25)) + ((e & f) ^ (~e & g)) + SHA_K[i] + W[i]) | 0;
      const t2 = ((rot(a, 2) ^ rot(a, 13) ^ rot(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    [a, b, c, d, e, f, g, h].forEach((v, i) => { H[i] = (H[i] + v) | 0; });
  }
  return H.map((v) => (v >>> 0).toString(16).padStart(8, "0")).join("");
}
// Cache names: the first 128 bits of SHA-256.
const digest = (text) => sha256(text).slice(0, 32);
function chatColors(messages, dark) {
  const set = dark ? NAME_COLORS.dark : NAME_COLORS.light, used = new Set(), out = new Map();
  for (const m of messages) {
    const uid = m.uid || m.who;
    if (m.mine || out.has(uid)) continue;
    let i = hashOf(uid) % set.length;
    for (let k = 0; k < set.length && used.has(i); k++) i = (i + 1) % set.length;
    used.add(i);
    out.set(uid, set[i]);
  }
  return out;
}
function faceFile(uid, url) {
  const ext = (String(url).match(/\.(png|jpe?g|gif)(?=\?|$)/i)?.[0] ?? ".jpg").toLowerCase();
  return `${uid}-${digest(url)}${ext}`;
}
function sizeOf(n) {
  if (!n) return "";
  return n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(n < 10485760 ? 1 : 0)} MB`;
}
const fileUrl = (path) => (path.startsWith("/") ? `file://${encodeURI(path)}` : `file:///${encodeURI(path.replace(/\\/g, "/"))}`);
function ago(ms) {
  if (!ms) return "";
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  return s < 60 ? "now" : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`;
}

// Pictures in messages (image files' thumbnails, unfurl and block images) are kept in
// data/slack/media/, at most MEDIA_COUNT files and MEDIA_BYTES together, least recently shown
// going first. Only files.slack.com gets the user token; other hosts are fetched without it.
const MEDIA_COUNT = 400, MEDIA_BYTES = 96 * 1048576, MEDIA_FILE_MAX = "10M";
// Downloads at once: enough that a screen of pictures arrives together, few enough that the
// one at the bottom isn't queued behind a whole channel's history.
const FETCHERS = 3;
// The one host that gets the user token: exactly files.slack.com over https (no user part, no
// port, not a longer name ending in it).
const SLACK_FILES = /^https:\/\/files\.slack\.com(?=[/?#]|$)/;
const WEB = /^https?:\/\/[^\s/?#@\\]+(?:[/?#][^\s]*)?$/i;
const MAILTO = /^mailto:[^\s<>"'/\\]+@[^\s<>"'/\\]+$/i;
const MEDIA_NAME = /^[0-9a-f]{32}\.(?:png|jpe?g|gif|webp)$/;
// Avatars (faceFile names) are kept the same way, in data/slack/avatars/.
const FACE_NAME = /^[UWB][A-Z0-9]{2,20}-[0-9a-f]{32}\.(?:png|jpe?g|gif)$/;
// Names from before the SHA-256 ones (a 32-bit hash): removed with the old owner's folder.
const OLD_MEDIA_NAME = /^[a-z0-9]+\.(?:png|jpe?g|gif|webp)$/, OLD_FACE_NAME = /^[UWB][A-Z0-9]{2,20}-[a-z0-9]+\.(?:png|jpe?g|gif)$/;
// Pictures asked for outright waiting at once; past this the oldest request is dropped.
const URGENT_MAX = 50;
const FACE_COUNT = 2000, FACE_BYTES = 50 * 1048576;
const LEVELS = new Set(["all", "mentions", "nothing"]);
const TILE_W = 360; // widest a picture shows in a message
function mediaKey(url) {
  const ext = (String(url).match(/\.(png|jpe?g|gif|webp)(?=[?#]|$)/i)?.[0] ?? ".jpg").toLowerCase();
  return `${digest(url)}${ext}`;
}
const pic = (url, w, h) => (typeof url === "string" && url.length < 2048 && url.startsWith("https://") && WEB.test(url) ? { url, key: mediaKey(url), w: Number(w) || 0, h: Number(h) || 0 } : null);
// A picture's box in a message: its own aspect, at most `max` wide and 360 high.
function fit(p, max) {
  if (!p?.w || !p?.h) return { w: Math.min(max, 160), h: Math.min(max, 160) * 0.6 };
  const k = Math.min(1, max / p.w, 360 / p.h);
  return { w: Math.max(24, Math.round(p.w * k)), h: Math.max(24, Math.round(p.h * k)) };
}
const CARD_COLORS = { good: "#2eb67d", warning: "#ecb22e", danger: "#e01e5a" };
const cardColor = (c) => (!c ? null : CARD_COLORS[c] ?? (/^#?[0-9a-f]{6}$/i.test(c) ? `#${c.replace("#", "")}` : null));

// Links open in Herdr's own browser panel (the herdr-browser service); without the service,
// in the system browser. A permalink into a conversation of this workspace opens it here.
const BROWSER_API = "http://127.0.0.1:47825";
const PERMALINK = /^https:\/\/[a-z0-9-]+\.slack\.com\/archives\/([A-Z0-9]+)(?:\/p(\d{10})(\d{6}))?/;
// Only web pages and plain mail addresses ever leave the mod; javascript:, file:, slack: and
// anything malformed are dropped.
function systemOpen(url) {
  if (!WEB.test(url) && !MAILTO.test(url)) return;
  const os = appWindow().platform;
  // rundll32 hands the address over as is; `cmd /c start` would read & and | in it as commands.
  const r = os === "macos" ? exec("open", [url]) : os === "windows" ? exec("rundll32", ["url.dll,FileProtocolHandler", url]) : exec("xdg-open", [url]);
  r.catch(() => {});
}
// The browser panel is optional: without the Browser mod installed, or without its
// herdr-browser service answering, links go to the system browser instead of a tab nobody sees.
let browserMod = false;
async function hasBrowserMod() {
  if (!browserMod) browserMod = await fs.exists(`${appHome().replace(/\\/g, "/")}/mods/browser/main.js`).catch(() => false);
  return browserMod;
}
async function browse(url) {
  if (!WEB.test(url)) return;
  try {
    if (!(await hasBrowserMod())) throw new Error("no browser mod");
    const r = await fetch(`${BROWSER_API}/open`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, newTab: true }) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    run("layout.select", { stack: "panel-body", child: "browser" });
    run("layout.show", { id: "panel" });
  } catch (_) {
    systemOpen(url);
  }
}
const openInBrowser = (url, cx) => cx.spawn(() => browse(url));

// Laid-out text (see Slack.layout) back to a plain string.
const plainOf = (L) => (!L ? "" : L.s ?? L.lines.map((l) => (!l ? "" : l.s ?? l.w.map((w) => w.s ?? w.label ?? `:${w.name}:`).join(" "))).join("\n"));

// Slack's mrkdwn as plain text: <@U1> → @name, <#C1|general> → #general, <url|label> → label.
// `chans` names a <#C1> sent without its name.
function plainText(text, names, chans) {
  return String(text ?? "")
    .replace(/<@([UW][A-Z0-9]+)(?:\|[^>]*)?>/g, (_m, id) => `@${names.get(id) ?? "someone"}`)
    .replace(/<#([A-Z0-9]+)(?:\|([^>]*))?>/g, (_m, id, label) => `#${label || chans?.get(id)?.title || id}`)
    .replace(/<!(here|channel|everyone)[^>]*>/g, "@$1")
    .replace(/<(?:mailto:|tel:)?([^>|]+)\|([^>]+)>/g, "$2")
    .replace(/<([^>|]+)>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .replace(/[\s\S]*/, (all) => pretty(all));
}

// The same text as parts, so links keep their address: { t: "text", s } | { t: "link", url, label }.
// `chans` names a <#C123> that comes without its name (as one typed here is sent).
function segmentsOf(text, names, chans) {
  const decode = (x) => pretty(x.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"));
  const out = [], src = String(text ?? "");
  let at = 0;
  for (const m of src.matchAll(/<([^>]+)>/g)) {
    if (m.index > at) out.push({ t: "text", s: decode(src.slice(at, m.index)) });
    at = m.index + m[0].length;
    const [target, label] = m[1].split("|");
    if (/^@[UW]/.test(target)) out.push({ t: "mention", id: target.slice(1), label: `@${names.get(target.slice(1)) ?? label ?? "someone"}` });
    else if (target.startsWith("#")) out.push({ t: "mention", id: target.slice(1), channel: true, label: `#${label || chans?.get(target.slice(1))?.title || target.slice(1)}` });
    else if (/^!(here|channel|everyone)/.test(target)) out.push({ t: "mention", id: "!", label: `@${target.slice(1).split("^")[0].split("|")[0]}` });
    else if (target.startsWith("!")) out.push({ t: "text", s: label ?? `@${target.slice(1).split("^")[0]}` });
    else if (/^(https?:|mailto:)/.test(target)) out.push({ t: "link", url: decode(target), label: decode(label ?? target.replace(/^mailto:/, "")) });
    else out.push({ t: "text", s: decode(label ?? target) });
  }
  if (at < src.length) out.push({ t: "text", s: decode(src.slice(at)) });
  return out;
}

// Slack's own mute and notification settings are not readable with the scopes a Slack app can
// get (users.prefs.get needs the legacy `read` scope), so a channel stays quiet until you say
// otherwise: only direct and group messages and @mentions notify by default. The bell sets each one.
const defaultLevel = (kind) => (kind === "im" || kind === "mpim" ? "all" : "mentions");

export default class Slack extends View {
  init(initial, cx) {
    const p = given() ?? initial ?? {};
    this.isBg = Boolean(p.bg);
    if (this.isBg) return this.initBg(cx);
    // A third kind of copy: a picture shown larger, as a dialog over the window (openViewer).
    if (p.viewer) { this.viewer = p.viewer; this.overlayId = p.overlay ?? null; return; }
    // Or someone's card, as a popup (openProfile).
    if (p.profile) { this.profileUid = p.profile; this.overlayId = p.overlay ?? null; return; }
    // The panel: its own inputs, and the last command it waits on.
    this.filter = InputState.new();
    cx.timer.every(100, () => { this.flushSoon(); this.flushWant(); });
    this.filterEmpty = true;
    this.filter.on("change", (_e, cx) => { this.filterEmpty = !this.filter.value(); cx.notify(); });
    this.reply = TextareaState.new({ rows: 1 });
    this.reply.set_auto_grow(1, 8);
    this.replyEmpty = true;
    this.replySeen = "";
    this.reply.on("change", (_e, cx) => { this.replyChanged(); cx.notify(); });
    // Enter sends (or picks while the @/# list is open) and Shift+Enter is a new line, as in
    // Slack. Bound on the box itself so it runs before the textarea's own Enter, which would
    // add the line first; the list's arrows, Tab and Escape only while the list is open, so
    // they still move the caret otherwise.
    cx.bind_keys([
      { keystroke: "enter", action: "slack_enter", context: "SlackComposer > Input" },
      { keystroke: "enter", action: "slack_enter", context: "SlackPicking > Input" },
      ...["up", "down", "tab", "escape"].map((k) => ({ keystroke: k, action: `slack_pick_${k}`, context: "SlackPicking > Input" })),
    ]);
    // If Enter still reaches the textarea (it adds the line, then says so), the line is taken
    // back out before acting on it: once, and only while the box holds exactly what that line
    // left, so nothing typed or set since is undone.
    this.reply.on("submit", (e, cx) => {
      const undo = this.newline;
      this.newline = null;
      if (e?.shift || e?.secondary || !undo || this.reply.value() !== undo.after) return;
      this.setReply(undo.value, undo.at);
      this.enter(cx);
    });
    // @mentions: the word being typed after @, the highlighted row, and the names picked
    // (as written in the box → their Slack id, turned into <@id> when sent).
    this.mention = null;
    this.mentionSel = 0;
    this.picked = new Map();
    this.pending = null; // the id of the send waiting for an answer
    // The last send answer this panel dealt with, kept across its remakes: one that failed
    // while no copy was waiting for it still brings its text back (conversation()).
    try { this.seenResult = localStorage.getItem("seenResult"); } catch (_) {}
    this.seenResult ??= shared(STATE)?.result?.n ?? null;
    // Setup: the two token fields (drawn as passwords), where the steps are, and the
    // background copy's generation the person closed setup for (it doesn't reopen for it).
    this.dir = dir();
    this.appIn = InputState.new();
    this.appIn.set_masked(true);
    this.appEmpty = true;
    this.appIn.on("change", (_e, cx) => { this.appEmpty = !this.appIn.value(); if (this.wiz) this.wiz.check.app = null; cx.notify(); });
    this.appIn.on("submit", (_e, cx) => { if (this.wiz) runCheck(this, "app", cx); });
    this.userIn = InputState.new();
    this.userIn.set_masked(true);
    this.userEmpty = true;
    this.userIn.on("change", (_e, cx) => { this.userEmpty = !this.userIn.value(); if (this.wiz) this.wiz.check.user = null; cx.notify(); });
    this.userIn.on("submit", (_e, cx) => { if (this.wiz) runCheck(this, "user", cx); });
    this.wiz = null;
    this.closedGen = null;
    this.menu = false;
    this.signoutArmed = false;
    // The list: collapsed built-in groups, A–Z (Slack's order) or newest first, kept between
    // starts; the view above it (null, "unreads", "threads", "saved"); the row or section whose
    // menu is open; a section being named or given an emoji.
    this.folded = new Set();
    this.sortAlpha = true;
    this.view = null;
    try { this.folded = new Set(JSON.parse(localStorage.getItem("folded") ?? "[]")); } catch (_) {}
    try { this.sortAlpha = localStorage.getItem("order") !== "recent"; } catch (_) {}
    this.rowMenu = null;
    this.rowHover = null;
    this.secHover = null;
    this.secMenu = null;
    this.secEdit = null; // { mode: "new" | "rename" | "emoji", sid?, move? }
    this.secIn = InputState.new();
    this.secIn.on("submit", (_e, cx) => this.submitSection(cx));
    this.groupCache = null;
    this.chat = { id: null, off: 0, viewH: 0, contentH: 0, hover: null, pick: null, askedOlder: null, heights: {} };
    // herdr-app do slack.open-<name, _ for spaces> opens a conversation; slack.close goes back;
    // slack.thread / slack.unthread open and leave the newest thread there.
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        try {
          if (c === "close") this.command({ type: "close" });
          else if (c === "setup" || c === "setup-fix") this.wiz = newWizard(shared(STATE), c === "setup-fix");
          else if (/^setup-[1-4]$/.test(c)) { this.wiz = this.wiz ?? newWizard(shared(STATE)); this.wiz.step = Number(c.slice(6)); }
          else if (c === "setup-close") this.closeSetup(null);
          else if (c === "reconnect") this.command({ type: "reload" });
          else if (c === "toast-test") this.command({ type: "toasttest" });
          else if (c === "notif") { const o = shared(STATE)?.open; this.notifOpen = this.notifOpen ? null : o?.id ?? null; }
          else if (c === "download-latest") {
            const f = [...(shared(STATE)?.open?.messages ?? [])].reverse().flatMap((m) => m.files ?? []).find((x) => x.url && !x.external);
            if (f) this.command({ type: "download", file: f });
          }
          // slack.link-latest opens the newest web link in the open conversation, as a click
          // on it would; slack.view-latest shows its newest picture larger.
          else if (c === "link-latest") {
            const msgs = [...(shared(STATE)?.open?.messages ?? [])].reverse();
            const words = (L) => (L?.lines ?? []).flatMap((l) => l?.w ?? []);
            const url = msgs.flatMap((m) => [...words(m.parts).filter((p) => p.t === "link").map((p) => p.url), ...(m.cards ?? []).map((a) => a.link)])
              .find((u) => /^https?:/.test(u ?? "") && !PERMALINK.test(u));
            if (url) await browse(url);
          } else if (c === "view-latest") {
            this.S = shared(STATE);
            const f = [...(this.S?.open?.messages ?? [])].reverse().flatMap((m) => m.files ?? []).find((x) => x.thumb);
            if (f) this.openViewer(f, cx);
          }
          else if (c.startsWith("type-")) this.setReply(c.slice(5).replaceAll("_", " "));
          else if (c === "pick") { const list = this.mention ? this.mentionList() : []; if (list.length) this.pickMention(list[0], { notify() {} }); }
          // slack.thread opens the newest thread in the open conversation; slack.unthread goes back.
          else if (c === "thread") {
            const o = shared(STATE)?.open, m = [...(o?.messages ?? [])].reverse().find((x) => x.replies > 0);
            if (m) this.command({ type: "thread", id: o.id, ts: m.ts });
          } else if (c === "unthread") this.command({ type: "unthread" });
          else if (c.startsWith("open-")) {
            const want = c.slice(5).replaceAll("_", " ").toLowerCase();
            const hit = (shared(STATE)?.convs ?? []).filter((x) => x.title.toLowerCase().includes(want)).sort((a, b) => (b.title.toLowerCase() === want) - (a.title.toLowerCase() === want) || b.ts - a.ts)[0];
            if (hit) this.command({ type: "open", id: hit.id });
          }
        } catch (_) {}
        cx.notify();
      }
    });
  }

  // ── panel: ask ─────────────────────────────────────────────────────────────────────────
  // Commands go in a short list, not one slot: the background looks every 250 ms, and two
  // asked within that time (open, then read) would otherwise leave only the second. Each has
  // a random id: a copy of the panel made again in the same millisecond can't reuse one.
  command(cmd) {
    const n = randomUUID();
    const box = shared(CMD), list = Array.isArray(box?.list) ? box.list : [];
    setShared(CMD, { n, list: [...list, { n, ...cmd }].slice(-CMD_KEEP) });
    return n;
  }

  // What render decides to ask is sent from the timer just after it: shared state isn't set
  // while drawing.
  commandSoon(cmd) {
    (this.soon ??= []).push(cmd);
  }

  flushSoon() {
    const list = this.soon;
    this.soon = null;
    for (const cmd of list ?? []) this.command(cmd);
  }

  // "@ra" or "#gp" at the end of the box: the list opens with the people or channels that match.
  findMention() {
    const v = this.reply.value(), m = v.match(/(^|\s)([@#])([^\s@#]{0,40})$/);
    const next = m ? { start: v.length - m[3].length - 1, q: m[3].toLowerCase(), kind: m[2] } : null;
    if (next?.q !== this.mention?.q || next?.kind !== this.mention?.kind) this.mentionSel = 0;
    this.mention = next;
  }

  // Every edit of the reply box: what it changed since the text last seen is what the list
  // and quote shortcuts react to. setReply's own text is already "seen", so it isn't shaped.
  replyChanged() {
    const v = this.reply.value(), prev = this.replySeen;
    this.replySeen = v;
    this.replyEmpty = !v;
    if (v !== prev) {
      // Any change ends what the last new line recorded; a new line records itself afresh.
      this.newline = null;
      this.shapeEdit(prev, v);
      if (this.newline) this.newline.after = this.reply.value();
    }
    this.findMention();
  }

  keepResult(n) {
    this.seenResult = n;
    try { localStorage.setItem("seenResult", n); } catch (_) {}
  }

  setReply(text, caret = text.length) {
    this.newline = null;
    this.replySeen = text;
    this.reply.set_value(text);
    this.reply.set_selected_range({ start: caret, end: caret });
    this.replyEmpty = !text;
    this.findMention();
  }

  // Slack's composer shortcuts. "- " or "* " typed at a line's start becomes "• ", "> " a
  // quote shown as "┃ " (sent as "> "); "1. " stays as typed. A new line (Shift+Enter) after
  // one of them starts the next item, or ends the list when the item is empty; Backspace right
  // after a marker made here gives back what was typed.
  shapeEdit(prev, v) {
    let a = 0, b = 0;
    while (a < prev.length && a < v.length && prev[a] === v[a]) a += 1;
    while (b < prev.length - a && b < v.length - a && prev[prev.length - 1 - b] === v[v.length - 1 - b]) b += 1;
    const added = v.slice(a, v.length - b), gone = prev.slice(a, prev.length - b);
    // A line or space typed into a run of the same characters could be at any of them; the
    // caret was at the first (the end of the line above, for a new line).
    if (!gone && added.length === 1) while (a > 0 && v[a - 1] === added) a -= 1;
    const auto = this.autoMark, lineStart = v.lastIndexOf("\n", a - 1) + 1;
    this.autoMark = null;
    if (auto && prev === auto.after && !added && a >= auto.start && a + gone.length === auto.start + auto.mark.length) {
      this.setReply(`${prev.slice(0, auto.start)}${auto.literal}${prev.slice(auto.start + auto.mark.length)}`, auto.start + auto.literal.length);
      return;
    }
    if (!gone && added === " ") {
      const typed = v.slice(lineStart, a + 1), mark = { "- ": "• ", "* ": "• ", "> ": "┃ " }[typed];
      if (!mark) return;
      const text = `${v.slice(0, lineStart)}${mark}${v.slice(a + 1)}`;
      this.setReply(text, lineStart + mark.length);
      this.autoMark = { start: lineStart, mark, literal: typed, after: text };
      return;
    }
    if (gone || !/^\n[ \t]*$/.test(added)) return;
    // Recorded after any setReply below (which clears it); replyChanged notes the text it left.
    const nl = { value: prev, at: a };
    const line = v.slice(lineStart, a), m = line.match(/^(• |┃ |(\d+)\. )/);
    if (m) {
      const after = a + added.length, restEnd = v.indexOf("\n", after), rest = v.slice(after, restEnd < 0 ? v.length : restEnd);
      if (line === m[1] && !rest.trim()) this.setReply(`${v.slice(0, lineStart)}${v.slice(after)}`, lineStart);
      else {
        const next = m[2] ? `${Number(m[2]) + 1}. ` : m[1];
        this.setReply(`${v.slice(0, after)}${next}${v.slice(after)}`, after + next.length);
      }
    }
    this.newline = nl;
  }

  // Enter: picks from the open @/# list, or sends.
  enter(cx) {
    // Handled here: a textarea submit that follows must not take a line out as well.
    this.newline = null;
    const list = this.mention ? this.mentionList() : [];
    if (list.length) this.pickMention(list[Math.min(this.mentionSel, list.length - 1)], cx);
    else this.send(cx);
  }

  // What the box holds, as Slack's mrkdwn: quote lines get their "> " back, and a list item
  // left empty is dropped, as Slack does.
  static toMrkdwn(text) {
    return text.replace(/^(?:• |\d+\. )[ \t]*$/gm, "").replace(/^┃ ?/gm, "> ").trim();
  }

  // How well a name matches what was typed: its start, a word's start, anywhere, or its
  // letters in order ("gdev" → "gpai_dev"); 9 is no match.
  static matchScore(fields, q) {
    if (!q) return 5;
    if (fields.some((x) => x.startsWith(q))) return 1;
    if (fields.some((x) => x.split(/[\s._-]+/).some((w) => w.startsWith(q)))) return 2;
    if (fields.some((x) => x.includes(q))) return 3;
    const inOrder = (x) => { let i = 0; for (const ch of x) if (ch === q[i]) i += 1; return i === q.length; };
    return fields.some(inOrder) ? 4 : 9;
  }

  // For the @ list, people: who wrote in this conversation first, then by how well the name
  // matches. For the # list, your channels by how well the name matches, then the most recent.
  mentionList() {
    const q = this.mention?.q ?? "";
    if (this.mention?.kind === "#") {
      const convs = ((this.S ?? shared(STATE))?.convs ?? []).filter((c) => (c.kind === "channel" || c.kind === "group") && c.title);
      return convs.map((c) => [Slack.matchScore([c.title.toLowerCase()], q), c]).filter(([sc]) => sc < 9)
        .sort((a, b) => a[0] - b[0] || (b[1].ts ?? 0) - (a[1].ts ?? 0)).slice(0, 6)
        .map(([, c]) => ({ id: c.id, name: c.title, channel: true, private: c.kind === "group" }));
    }
    const people = shared(PEOPLE) ?? [];
    const o = shared(STATE)?.open, recent = new Map();
    [...(o?.messages ?? [])].reverse().forEach((m, i) => { if (!m.mine && m.uid && !recent.has(m.uid)) recent.set(m.uid, i); });
    const score = (p) => {
      const sc = Slack.matchScore([p.name, p.real, p.handle].map((x) => String(x ?? "").toLowerCase()), q);
      return (sc <= 1 || !q) && recent.has(p.id) ? 0 : sc;
    };
    return people.map((p) => [score(p), p]).filter(([sc]) => sc < 9)
      .sort((a, b) => a[0] - b[0] || (recent.get(a[1].id) ?? 999) - (recent.get(b[1].id) ?? 999) || a[1].name.localeCompare(b[1].name))
      .slice(0, 6).map(([, p]) => p);
  }

  pickMention(p, cx) {
    if (!this.mention || !p) return;
    const v = this.reply.value(), label = `${p.channel ? "#" : "@"}${p.name}`, next = `${v.slice(0, this.mention.start)}${label} `;
    this.picked.set(label, p.channel ? `#${p.id}` : `@${p.id}`);
    this.mention = null;
    this.setReply(next);
    this.reply.focus();
    cx.notify();
  }

  // What Slack gets: picked names (and any @handle typed out in full) as <@id>, picked
  // channels as <#id>, which Slack shows as a link to the channel.
  withMentions(text) {
    for (const [label, ref] of [...this.picked].sort((a, b) => b[0].length - a[0].length)) text = text.split(label).join(`<${ref}>`);
    const byHandle = new Map((shared(PEOPLE) ?? []).filter((p) => p.handle).map((p) => [p.handle.toLowerCase(), p.id]));
    return text.replace(/(^|\s)@([a-z0-9._-]+)/gi, (all, sp, h) => (byHandle.has(h.toLowerCase()) ? `${sp}<@${byHandle.get(h.toLowerCase())}>` : all));
  }

  send(cx) {
    const S = shared(STATE), text = this.withMentions(Slack.toMrkdwn(this.reply.value()));
    // Before Slack has said who you are (starting, reconnecting) the text stays in the box.
    if (!S?.open || !S.owner || !text || this.pending) return;
    this.mention = null;
    const thread = S.open.thread?.ts ?? null;
    // The workspace it was written in, and the box as typed: if it can't go there, it comes back.
    this.pending = this.command({ type: "send", id: S.open.id, ws: S.owner ?? null, draft: this.reply.value(), text, thread_ts: thread, broadcast: Boolean(thread && this.alsoSend) });
    this.alsoSend = false;
    cx.notify();
  }

  // ── panel: setup ───────────────────────────────────────────────────────────────────────
  finishSetup(cx) {
    const W = this.wiz;
    if (!W || W.saving) return;
    const app = this.appIn.value().replace(/\s+/g, ""), user = this.userIn.value().replace(/\s+/g, "");
    W.saving = true;
    W.error = null;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        await saveTokens(this.dir, { "app-token": app, "user-token": user });
        this.closedGen = shared(STATE)?.gen ?? null;
        this.command({ type: "reload" });
        this.wiz = null;
        this.appIn.set_value("");
        this.userIn.set_value("");
      } catch (e) {
        W.saving = false;
        W.error = `Couldn't save the tokens: ${e?.message ?? e}`;
      }
      cx.notify();
    });
  }

  closeSetup(cx) {
    this.wiz = null;
    this.closedGen = shared(STATE)?.gen ?? null;
    this.appIn.set_value("");
    this.userIn.set_value("");
    cx?.notify();
  }

  signOut(cx) {
    this.menu = false;
    this.signoutArmed = false;
    cx.spawn(async (cx) => {
      await removeTokens(this.dir);
      this.command({ type: "reload" });
      cx.notify();
    });
  }

  // ── background copy ────────────────────────────────────────────────────────────────────
  initBg(cx) {
    this.convs = new Map(); // id → { id, kind, name, title, user, unread, mention, preview, ts, updated }
    this.users = new Map(); // id → name
    this.me = null;
    this.team = "";
    this.teamUrl = null; // https://<workspace>.slack.com/, for links to people and channels
    this.profiles = new Map(); // user id → { p, at }: profiles shown lately
    this.profile = null; // the one the profile card asked for last
    this.status = "starting";
    this.error = null;
    this.open = null;
    this.result = null; // { n, ok, error } of the last send
    // Each start (and each reload after setup) is one generation; the loops of an older one stop.
    this.gen = 0;
    this.needs = null; // "app" | "user": the token setup asks for again
    this.has = { app: false, user: false };
    this.missing = null; // the user token's missing permissions, [{ scope, what }]; null until checked
    // Profile pictures: Slack's address for each person (and app), and the ones downloaded
    // into data/slack/avatars/ (kept between starts), as paths image() takes.
    this.faces = new Map();
    this.avatars = {};
    this.faceFailed = new Set();
    // The workspace's own emoji (emoji.list, needs emoji:read): name → picture address, or the
    // character of a standard emoji it is an alias of.
    this.customEmoji = new Map();
    // Everyone who can be @mentioned: { id, name, real, handle }.
    this.people = new Map();
    // Files downloaded or downloading: file id → { state: "busy" | "done" | "error", path, error }.
    this.downloads = {};
    this.clips = {}; // file id → { state: "busy" | "done" | "error", error }: Copy image
    // Pictures shown in the open conversation: key → path for image(). mediaIndex is every
    // file kept in data/slack/media/ (key → { size, at }), saved between starts.
    this.media = {};
    this.mediaIndex = {};
    // What to fetch: `want` is what the panel shows or is about to (WANT, newest first),
    // `urgent` what was asked for outright (a larger view, a copy, a notification's face).
    this.want = [];
    this.urgent = new Map(); // job key → job, oldest request first
    this.fetching = new Set();
    this.mediaReady = false;
    this.mediaFailed = new Set();
    this.mediaIndexDirty = false;
    this.faceIndex = {};
    this.faceIndexDirty = false;
    try {
      const kept = JSON.parse(localStorage.getItem("faceIndex") ?? "{}");
      for (const [k, v] of Object.entries(kept && typeof kept === "object" ? kept : {})) {
        if (FACE_NAME.test(k) && Number.isFinite(v?.size) && v.size >= 0 && Number.isFinite(v?.at)) this.faceIndex[k] = { size: v.size, at: v.at };
      }
    } catch (_) {}
    // Only names this mod makes (MEDIA_NAME) are trusted from storage: a bad entry is dropped, and
    // no path is ever built from it.
    try {
      const kept = JSON.parse(localStorage.getItem("media") ?? "{}");
      for (const [k, v] of Object.entries(kept && typeof kept === "object" ? kept : {})) {
        if (MEDIA_NAME.test(k) && Number.isFinite(v?.size) && v.size >= 0 && Number.isFinite(v?.at)) this.mediaIndex[k] = { size: v.size, at: v.at };
      }
    } catch (_) {}
    this.secQueue = Promise.resolve();
    this.resetWorkspace();
    this.soundOn = true;
    try { this.soundOn = localStorage.getItem("sound") !== "off"; } catch (_) {}
    this.seen = {};
    this.cache = {}; // id → { ts, preview }: the last message of each conversation, kept so the list is in order at once
    try { this.seen = JSON.parse(localStorage.getItem("seen") ?? "{}"); } catch (_) {}
    try { this.cache = JSON.parse(localStorage.getItem("cache") ?? "{}"); } catch (_) {}
    // Channels whose messages make no toast (an @mention still does). Set from the bell in a
    // conversation's header.
    // How each conversation notifies, as in Slack: id → { level: "all" | "mentions" | "nothing",
    // muted }. Muted: no toast, no count, greyed in the list; an @mention still comes through.
    // pauseUntil: no toasts or sounds at all until then (Slack's "Pause notifications").
    this.prefs = {};
    this.pauseUntil = 0;
    try {
      const kept = JSON.parse(localStorage.getItem("prefs") ?? "{}");
      for (const [id, p] of Object.entries(kept && typeof kept === "object" ? kept : {})) {
        if (!/^[CDG][A-Z0-9]+$/.test(id) || !p || typeof p !== "object") continue;
        const ok = {};
        if (LEVELS.has(p.level)) ok.level = p.level;
        if (p.muted === true) ok.muted = true;
        if (ok.level || ok.muted) this.prefs[id] = ok;
      }
    } catch (_) {}
    try { for (const id of JSON.parse(localStorage.getItem("muted") ?? "[]")) this.prefs[id] = { ...this.prefs[id], muted: true }; localStorage.removeItem("muted"); } catch (_) {}
    try { this.pauseUntil = Number(localStorage.getItem("pauseUntil")) || 0; } catch (_) {}
    this.dirty = true;
    this.cacheDirty = false;
    // Commands already there are old: none is redone (a send above all). The ids handled are
    // kept across starts too, so one listed twice, or again later, never runs twice.
    this.lastCmd = shared(CMD)?.n ?? null;
    this.pendingMark = new Map(); // conversation id → "retry" | "scope": its mark failed
    this.cmdQueue = [];
    let kept = [];
    try { kept = JSON.parse(localStorage.getItem("doneCmds") ?? "[]"); } catch (_) {}
    this.doneCmds = new Set([...(Array.isArray(kept) ? kept : []), ...(Array.isArray(shared(CMD)?.list) ? shared(CMD).list : []).map((c) => c.n)]);
    cx.timer.every(500, () => this.publish());
    cx.timer.every(250, (cx) => this.poll(cx));
    cx.spawn(async () => {
      for (;;) {
        const c = await nextCommand();
        const m = /^goto-([A-Z0-9]+)(?:-(\d+)_(\d+))?$/.exec(c);
        if (m) await this.goto(m[1], m[2] ? `${m[2]}.${m[3]}` : null).catch(() => {});
        // slack.pause-<minutes> and slack.resume, for the command line
        else if (/^pause-\d+$/.test(c) || c === "resume") {
          this.pauseUntil = c === "resume" ? 0 : Date.now() + Number(c.slice(6)) * 60000;
          try { localStorage.setItem("pauseUntil", String(this.pauseUntil)); } catch (_) {}
          this.dirty = true;
        }
      }
    });
    cx.spawn(async (cx) => {
      try { await this.boot(cx, 0); } catch (e) { if (this.gen === 0) this.fail(e); }
    });
  }

  // New tokens saved, or signed out: drop the connection and everything loaded, start again.
  reload(cx) {
    this.gen += 1;
    const gen = this.gen, ws = this.ws;
    this.ws = null;
    if (ws) ws.close().catch(() => {});
    this.convs = new Map();
    this.users = new Map();
    this.open = null;
    this.me = null;
    this.team = "";
    this.teamUrl = null;
    this.profiles = new Map();
    this.profile = null;
    this.status = "starting";
    this.error = null;
    this.needs = null;
    this.missing = null;
    // A new token or a reconnect asks Slack afresh: an old refusal says nothing about it.
    this.markDenied = null;
    this.pendingMark = new Map();
    this.resetWorkspace();
    // Another token may be another person or workspace: nothing of the last one's stays shown.
    this.faces = new Map();
    this.avatars = {};
    this.faceFailed = new Set();
    this.people = new Map();
    this.customEmoji = new Map();
    this.downloads = {};
    this.clips = {};
    this.media = {};
    this.urgent = new Map();
    this.fetching = new Set();
    this.mediaReady = false;
    this.mediaFailed = new Set();
    this.dirty = true;
    cx.spawn(async (cx) => {
      try { await this.boot(cx, gen); } catch (e) { if (gen === this.gen) this.fail(e); }
    });
  }

  // Everything tied to one workspace and person, emptied when the token changes. The sections
  // file is read again (secText reset) once the new token says which team it is for.
  resetWorkspace() {
    this.secGen = (this.secGen ?? 0) + 1;
    this.teamId = null;
    this.secText = undefined;
    this.sections = [];
    this.unsectioned = [];
    this.placed = {};
    this.rank = {};
    this.bots = new Set();
    this.handles = new Map();
    this.short = null;
    this.counted = new Map(); // "<channel>:<thread ts>" → reply ts counted on that thread's first message
    if (this.note?.sections) this.note = null;
  }

  needSetup(which, error) {
    this.status = "setup";
    this.needs = which;
    this.error = error;
    this.dirty = true;
  }

  fail(e) {
    this.status = "error";
    this.error = String(e?.message ?? e);
    this.dirty = true;
  }

  readToken(file) {
    return readTextFile(`${dir()}/${file}`).then((t) => t?.replace(/\s+/g, "") || null).catch(() => null);
  }

  async boot(cx, gen) {
    // A header file left by a request a crash, restart or sign-out cut short still holds a
    // token: gone first, whatever the tokens turn out to be.
    for (const name of await fs.readdir(dir()).catch(() => [])) if (/^\.(?:auth-[a-z0-9]+|media-auth|download-auth)$/.test(name)) await fs.unlink(`${dir()}/${name}`).catch(() => {});
    this.appToken = await this.readToken("app-token");
    this.userToken = await this.readToken("user-token");
    if (gen !== this.gen) return;
    this.has = { app: Boolean(this.appToken), user: Boolean(this.userToken) };
    if (!this.appToken || !this.userToken) {
      this.needSetup(!this.appToken && !this.userToken ? null : !this.appToken ? "app" : "user", null);
      return;
    }
    const who = await this.api("auth.test");
    if (gen !== this.gen) return;
    if (!who.ok && AUTH_ERRORS.has(who.error)) return this.needSetup("user", `Slack rejected the user token (${who.error}). Paste a new one.`);
    if (!who.ok) throw new Error(`Slack says ${who.error}`);
    this.me = { id: who.user_id, name: who.user };
    this.team = who.team ?? "";
    this.teamUrl = /^https:\/\/[a-z0-9-]+\.(?:enterprise\.)?slack\.com\/$/.test(who.url ?? "") ? who.url : null;
    this.users.set(who.user_id, who.user);
    this.owner = digest(`${who.team_id}:${who.user_id}`);
    this.teamId = who.team_id;
    cx.spawn((cx) => this.sectionsLoop(cx, gen));
    this.status = "loading";
    this.dirty = true;
    await this.loadConversations();
    if (gen !== this.gen) return;
    await this.loadUsers();
    if (gen !== this.gen) return;
    for (const c of this.convs.values()) this.nameConv(c);
    setShared(PEOPLE, [...this.people.values()]);
    this.dirty = true;
    cx.spawn((cx) => this.mediaLoop(cx, gen));
    cx.spawn((cx) => this.connectLoop(cx, gen));
    cx.spawn((cx) => this.scopeLoop(cx, gen));
    cx.spawn(() => this.loadEmoji(gen));
    cx.spawn((cx) => this.unreadLoop(cx, gen));
    await this.hydrate(cx, gen);
  }

  // Slack doesn't tell apps about reading done elsewhere (channel_marked and the like reach
  // only its own clients), so what shows unread here is asked about again every minute, the
  // newest ten: read up to its newest message in Slack clears it here as well.
  async unreadLoop(cx, gen) {
    while (gen === this.gen) {
      await sleep(cx, 60000);
      // Marks that failed for a passing reason first, five at most; the rest of the ten are
      // the newest unread. One refused for permissions can't succeed until they change
      // (rescope or reload empty pendingMark), so it is only asked about as an unread one.
      const retry = (c) => this.pendingMark.get(c.id) === "retry";
      const pending = [...this.convs.values()].filter((c) => c.lastTs && retry(c)).sort((a, b) => b.ts - a.ts).slice(0, 5);
      const unread = [...this.convs.values()].filter((c) => c.lastTs && !pending.includes(c) && (c.unread > 0 || c.mention) && this.open?.id !== c.id)
        .sort((a, b) => b.ts - a.ts).slice(0, 10 - pending.length);
      const todo = [...pending, ...unread];
      for (const c of todo) {
        if (gen !== this.gen) return;
        const j = await this.api("conversations.info", { channel: c.id }).catch(() => null);
        const lastRead = j?.ok ? j.channel.last_read : null, left = j?.ok ? j.channel.unread_count_display : null;
        if (lastRead && Number(lastRead) >= Number(c.lastTs)) {
          this.pendingMark.delete(c.id);
          c.unread = 0;
          c.mention = false;
          this.seen[c.id] = c.lastTs;
          this.saveSeen();
          this.dirty = true;
        } else if (typeof left === "number" && left > 0 && left !== c.unread) {
          c.unread = left;
          this.dirty = true;
        }
        await sleep(cx, HYDRATE_MS);
      }
    }
  }

  // The token's permissions, asked until Slack answers every probe (30 s, doubling to 10 min).
  // Until then `missing` is null: Threads and Saved stay hidden and no warning shows.
  async scopeLoop(cx, gen) {
    if (this.scoping === gen) return;
    this.scoping = gen;
    try {
      for (let wait = 30000; gen === this.gen; wait = Math.min(wait * 2, 600000)) {
        const missing = await missingScopes(this.userToken).catch(() => null);
        if (gen !== this.gen) return;
        if (missing) { this.missing = missing; this.scopedAt = Date.now(); this.dirty = true; return; }
        await sleep(cx, wait);
      }
    } finally {
      if (this.scoping === gen) this.scoping = null;
    }
  }

  api(method, params, post) {
    return call(this.userToken, method, params, post);
  }

  // A person's card: users.info and users.getPresence, kept a few minutes. Their picture is
  // fetched at once (it is what the card is for).
  async loadProfile(uid) {
    if (!/^[UW][A-Z0-9]{2,20}$/.test(uid ?? "")) return;
    const kept = this.profiles.get(uid);
    if (kept && Date.now() - kept.at < 5 * 60000) { this.profile = kept.p; this.needMedia(kept.p.pic, true); this.dirty = true; return; }
    this.profile = { uid, loading: true };
    this.dirty = true;
    const fail = (e) => ({ ok: false, error: String(e?.message ?? e) });
    const [u, pr] = await Promise.all([this.api("users.info", { user: uid }).catch(fail), this.api("users.getPresence", { user: uid }).catch(fail)]);
    if (!u.ok) { if (this.profile?.uid === uid) { this.profile = { uid, error: `Couldn't load the profile (Slack says ${u.error}).` }; this.dirty = true; } return; }
    const x = u.user ?? {}, f = x.profile ?? {};
    if (f.image_48 && !this.faces.has(uid)) this.faces.set(uid, f.image_48);
    const until = Number(f.status_expiration) * 1000 || 0;
    const p = {
      uid,
      name: emojiText(f.display_name || f.real_name || x.name || "someone"),
      real: f.real_name || "",
      title: f.title || "",
      status: until && until < Date.now() ? "" : `${emojiText(f.status_emoji ?? "")} ${f.status_text ?? ""}`.trim(),
      tzLabel: x.tz_label ?? "",
      tzOffset: Number.isFinite(x.tz_offset) ? x.tz_offset : null,
      // Only there when the token has users:read.email.
      email: f.email ?? "",
      presence: pr.ok ? pr.presence : null,
      bot: Boolean(x.is_bot), deleted: Boolean(x.deleted),
      link: this.teamUrl ? `${this.teamUrl}team/${uid}` : null,
      pic: this.needMedia(pic(f.image_192 ?? f.image_72, 192, 192), true),
    };
    this.profiles.set(uid, { p, at: Date.now() });
    if (this.profiles.size > 300) this.profiles.delete(this.profiles.keys().next().value);
    if (this.profile?.uid === uid) { this.profile = p; this.dirty = true; }
  }

  // The direct message with someone: the one you have, or a new one (conversations.open, which
  // needs im:write), opened in the panel.
  async openDm(uid) {
    if (!/^[UW][A-Z0-9]{2,20}$/.test(uid ?? "")) return;
    let c = [...this.convs.values()].find((x) => x.kind === "im" && x.user === uid);
    if (!c) {
      const j = await this.api("conversations.open", { users: uid, return_im: "true" }, true);
      if (!j.ok) {
        this.note = { text: j.error === "missing_scope" ? "Starting a direct message needs the im:write permission. Gear menu → Fix permissions." : `Couldn't open the direct message (Slack says ${j.error}).`, error: true, until: Date.now() + 8000 };
        this.dirty = true;
        return;
      }
      c = this.convs.get(j.channel.id) ?? this.addConv({ ...j.channel, is_im: true, user: j.channel.user ?? uid });
      this.nameConv(c);
    }
    await this.openConv(c.id);
  }

  // The workspace's own emoji. Without emoji:read they stay :name: (the permission check in
  // the setup names it). An alias points at another name, its own or a standard one.
  async loadEmoji(gen) {
    const j = await this.api("emoji.list").catch(() => null);
    if (gen !== this.gen || !j?.ok) return;
    const all = j.emoji ?? {}, out = new Map();
    for (const name of Object.keys(all).slice(0, 20000)) {
      let v = all[name];
      for (let hop = 0; hop < 3 && typeof v === "string" && v.startsWith("alias:"); hop++) {
        const to = v.slice(6);
        v = all[to] ?? EMOJI_NAMES[to] ?? EMOJI[to];
      }
      if (typeof v !== "string" || v.startsWith("alias:")) continue;
      if (v.startsWith("https://")) { if (pic(v)) out.set(name, v); } else out.set(name, v);
    }
    this.customEmoji = out;
    // Names were worked out before the workspace's emoji were known.
    for (const c of this.convs.values()) this.nameConv(c);
    this.dirty = true;
  }

  // A reaction's or a :name:'s workspace emoji: its picture (queued like any other), the
  // standard character it aliases, or null.
  customOf(name) {
    const v = this.customEmoji.get(String(name).split("::")[0]);
    if (!v) return null;
    return v.startsWith("https://") ? { pic: this.needMedia(pic(v, 64, 64)) } : { ch: v };
  }

  // Parts (segmentsOf) laid out once, here, so the panel only draws them: { s } when it is
  // plain text, or { lines } where a line is null (blank), { s } (plain) or { w } (word by
  // word beside a link, mention or workspace emoji, so it flows on after them as in Slack).
  // A line Slack sent as a quote ("> " at its start) has the marker taken off and q: true.
  layout(parts) {
    if (!parts?.length) return null;
    const runs = (s) => {
      if (!this.customEmoji.size || !s.includes(":")) return [{ t: "text", s }];
      const out = [];
      let at = 0;
      for (const m of s.matchAll(/:([^\s:]{1,100}):/g)) {
        const e = this.customOf(m[1]);
        if (!e) continue;
        if (m.index > at) out.push({ t: "text", s: s.slice(at, m.index) });
        out.push(e.pic ? { t: "emoji", name: m[1], pic: e.pic } : { t: "text", s: e.ch });
        at = m.index + m[0].length;
      }
      if (at < s.length) out.push({ t: "text", s: s.slice(at) });
      return out;
    };
    const lines = [[]], quoted = new Set();
    let fresh = true;
    for (const p of parts) {
      if (p.t !== "text") { lines[lines.length - 1].push(p); fresh = false; continue; }
      p.s.split("\n").forEach((piece, i) => {
        if (i) { lines.push([]); fresh = true; }
        if (fresh && /^>(?:\s|$)/.test(piece)) { quoted.add(lines.length - 1); piece = piece.replace(/^>\s?/, ""); }
        if (piece.trim()) { lines[lines.length - 1].push(...runs(piece.trim())); fresh = false; }
      });
    }
    if (!quoted.size && !lines.some((l) => l.some((p) => p.t !== "text"))) return { s: parts.map((p) => runs(p.s).map((r) => r.s).join("")).join("") };
    return {
      lines: lines.map((line, i) => {
        const q = quoted.has(i) || undefined;
        if (!line.length) return q ? { s: "", q } : null;
        if (!line.some((p) => p.t !== "text")) return { s: line.map((p) => p.s).join(" "), q };
        return { w: line.flatMap((p) => (p.t === "text" ? p.s.split(/\s+/).filter(Boolean).map((s) => ({ t: "text", s })) : [p])), q };
      }),
    };
  }

  async loadUsers() {
    let cursor = "";
    for (let page = 0; page < 8; page++) {
      const j = await this.api("users.list", { limit: "200", cursor });
      if (!j.ok) break;
      for (const u of j.members ?? []) {
        const raw = u.profile?.display_name || u.profile?.real_name || u.real_name || u.name;
        const name = emojiText(String(raw ?? ""));
        this.users.set(u.id, name);
        if (u.name) this.handles.set(u.name, name);
        if (u.is_bot || u.id === "USLACKBOT") this.bots.add(u.id);
        const url = u.profile?.image_48 || u.profile?.image_72;
        if (url) this.faces.set(u.id, url);
        if (!u.deleted && !u.is_bot && u.id !== "USLACKBOT") this.people.set(u.id, { id: u.id, name, real: u.profile?.real_name || u.real_name || "", handle: u.name ?? "" });
      }
      cursor = j.response_metadata?.next_cursor;
      if (!cursor) break;
    }
  }

  async loadConversations() {
    let cursor = "";
    for (let page = 0; page < 10; page++) {
      const j = await this.api("users.conversations", { types: "im,mpim,public_channel,private_channel", exclude_archived: "true", limit: "200", cursor });
      if (!j.ok) throw new Error(`Slack says ${j.error}`);
      for (const c of j.channels ?? []) this.addConv(c);
      cursor = j.response_metadata?.next_cursor;
      if (!cursor) break;
    }
  }

  addConv(c) {
    const kind = c.is_im ? "im" : c.is_mpim ? "mpim" : c.is_private || c.is_group ? "group" : "channel";
    const kept = this.cache[c.id];
    const conv = { id: c.id, kind, name: c.name ?? "", user: c.user ?? null, unread: 0, mention: false, preview: kept?.preview ?? "", ts: kept?.ts ?? 0, updated: c.updated ?? 0, dormant: Boolean(c.properties?.is_dormant) };
    this.convs.set(c.id, conv);
    return conv;
  }

  nameConv(c) {
    if (c.kind === "im") c.title = this.users.get(c.user) ?? c.user ?? "Direct message";
    // A group message without a name of its own is called after the people in it, A–Z as in
    // Slack, with how many they are.
    else if (c.kind === "mpim" && c.name.startsWith("mpdm-")) {
      const handles = c.name.replace(/^mpdm-/, "").replace(/-\d+$/, "").split("--").filter((h) => h && h !== this.me?.name);
      c.title = handles.map((h) => this.handles.get(h) ?? h).sort((a, b) => a.localeCompare(b)).join(", ") || "Group";
      c.members = handles.length;
    } else c.title = emojiText(c.name);
    // A workspace emoji in a name is drawn as its picture, laid out here once.
    const L = this.customEmoji.size && /:[^\s:]+:/.test(c.title) ? this.layout([{ t: "text", s: c.title }]) : null;
    c.titleParts = L?.lines ? L : null;
  }

  // The conversations active lately get their last message and unread count, one every
  // 1.25 s (Slack allows about 50 a minute), most active first. The others wait until they
  // are opened or someone writes in them. What was found is kept for the next start.
  async hydrate(cx, gen) {
    this.status = "live";
    this.dirty = true;
    // Slack's "updated" time says nothing about the last message (a group quiet since 2023
    // shows as updated today), so every conversation is asked once: direct messages, then
    // channels, then group chats; those already known quiet for 60 days are left alone.
    // The first start goes through all of them (about 10 minutes, and the list reorders as
    // they arrive); later starts begin from the kept last messages.
    const since = Date.now() - HYDRATE_DAYS * 86400000;
    const rank = (c) => (c.kind === "im" ? 0 : c.kind === "mpim" ? 2 : 1);
    const todo = [...this.convs.values()]
      .filter((c) => !c.dormant && (c.ts ? c.ts > since : true))
      .sort((x, y) => rank(x) - rank(y) || y.ts - x.ts);
    for (const c of todo) {
      if (gen !== this.gen) return;
      // Slack answers 429 when too many calls come close together: wait, then try this one again.
      for (let attempt = 0; attempt < 3; attempt++) {
        try { await Promise.race([this.hydrateOne(c), sleep(cx, 15000)]); break; } catch (e) {
          if (!/rate limiting/.test(String(e?.message))) break;
          await sleep(cx, 20000);
        }
      }
      await sleep(cx, HYDRATE_MS);
    }
  }

  // The last message of a conversation comes from conversations.history (conversations.info
  // leaves it out for many). conversations.info is asked only when that message is someone
  // else's and recent, for the point you had read up to and Slack's own count.
  async hydrateOne(c) {
    const h = await this.api("conversations.history", { channel: c.id, limit: "1" });
    if (!h.ok) return;
    const latest = h.messages?.[0];
    if (!latest) return;
    c.ts = Number(latest.ts) * 1000;
    c.lastTs = latest.ts;
    if (latest.user && !this.users.has(latest.user)) await this.resolveUsers([latest.user]);
    c.preview = this.previewOf(c, latest);
    this.cacheDirty = true;
    const mine = latest.user === this.me.id;
    // Older than two weeks is history, not news (an old app DM stays "unread" in Slack for ever).
    // Slack's last_read decides; what was marked here only counts while marks can't reach Slack.
    const marksReach = !this.markDenied && !(this.missing ?? []).some((m) => MARK_SCOPES.has(m.scope));
    const fresh = (marksReach || Number(latest.ts) > Number(this.seen[c.id] ?? 0)) && Date.now() - c.ts < 14 * 86400000;
    c.unread = 0;
    if (!mine && fresh) {
      const j = await this.api("conversations.info", { channel: c.id });
      const lastRead = j.ok ? j.channel.last_read : null;
      const count = j.ok ? j.channel.unread_count_display ?? null : null;
      const unreadNow = lastRead ? Number(latest.ts) > Number(lastRead) : true;
      c.unread = unreadNow ? count || 1 : 0;
    }
    this.dirty = true;
  }

  previewOf(c, m) {
    // An app's message often has no text of its own, only an attachment: its summary stands in.
    const a = m.attachments?.[0], card = a ? a.fallback || a.pretext || a.title || a.text : "";
    const body = plainText(m.text || card, this.users, this.convs).replace(/\s+/g, " ").trim() || (m.files?.length ? "[file]" : "[message]");
    const who = m.user === this.me.id ? "You" : this.users.get(m.user);
    return c.kind === "im" ? (m.user === this.me.id ? `You: ${body}` : body) : who ? `${who}: ${body}` : body;
  }

  // ── background: Socket Mode ─────────────────────────────────────────────────────────────
  async connectLoop(cx, gen) {
    let wait = 2000;
    while (gen === this.gen) {
      try {
        const o = await call(this.appToken, "apps.connections.open", {}, true);
        if (gen !== this.gen) return;
        if (!o.ok && (AUTH_ERRORS.has(o.error) || o.error === "missing_scope")) return this.needSetup("app", `Slack rejected the app token (${o.error}). Paste a new one.`);
        if (!o.ok) throw new Error(`Slack says ${o.error}`);
        const ws = await WebSocket.connect(o.url);
        if (gen !== this.gen) { await ws.close().catch(() => {}); return; }
        this.ws = ws;
        wait = 2000;
        for (;;) {
          const raw = await ws.read();
          if (gen !== this.gen) return;
          const msg = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw));
          if (msg.envelope_id) await ws.write(JSON.stringify({ envelope_id: msg.envelope_id }));
          if (msg.type === "hello") { this.status = "live"; this.error = null; this.dirty = true; }
          else if (msg.type === "disconnect") break;
          else if (msg.type === "events_api") await this.onEvent(msg.payload?.event, cx);
        }
        await ws.close().catch(() => {});
      } catch (e) {
        if (gen !== this.gen) return;
        this.status = "reconnecting";
        this.error = String(e?.message ?? e);
        this.dirty = true;
      }
      this.ws = null;
      await sleep(cx, wait);
      wait = Math.min(30000, wait * 2);
    }
  }

  // A reply counted on its thread's first message once, whichever comes first: Slack's event or
  // chat.postMessage's answer for one sent from here. One no newer than the last reply counted
  // came with the history already.
  countReply(channel, parent, ts, uid) {
    const k = `${channel}:${parent.ts}`;
    let got = this.counted.get(k);
    if (!got) {
      got = new Set();
      this.counted.set(k, got);
      if (this.counted.size > 200) this.counted.delete(this.counted.keys().next().value);
    }
    if (got.has(ts) || Number(ts) * 1000 <= (parent.lastReply ?? 0)) return;
    got.add(ts);
    parent.replies += 1;
    parent.lastReply = Number(ts) * 1000;
    if (uid && !parent.repliers.some((r) => r.id === uid)) parent.repliers = [...parent.repliers, { id: uid, name: uid === this.me.id ? "You" : this.users.get(uid) ?? "someone" }].slice(0, 4);
  }

  async onEvent(ev, cx) {
    if (!ev || ev.type !== "message" || !ev.channel) return;
    // An app's message brings its icon: the toast shows it once downloaded.
    if (!ev.user && ev.bot_id && !this.faces.has(ev.bot_id)) {
      const url = ev.bot_profile?.icons?.image_48 ?? ev.icons?.image_48;
      if (url) this.faces.set(ev.bot_id, url);
    }
    if (ev.subtype && !["thread_broadcast", "file_share", "me_message", "bot_message"].includes(ev.subtype)) return;
    let c = this.convs.get(ev.channel);
    // A reply in a thread: into the thread when it is open, a count on its first message, and
    // a toast when it is for you. Only one also sent to the conversation (thread_broadcast)
    // goes on into it below.
    if (ev.thread_ts && ev.thread_ts !== ev.ts) {
      if (ev.user && !this.users.has(ev.user)) await this.resolveUsers([ev.user]);
      const o = this.open?.id === ev.channel ? this.open : null;
      const parent = o?.messages.find((m) => m.ts === ev.thread_ts);
      if (o?.thread?.ts === ev.thread_ts && !o.thread.messages.some((m) => m.ts === ev.ts)) o.thread.messages.push(this.normalize(ev));
      if (parent) this.countReply(ev.channel, parent, ev.ts, ev.user);
      this.dirty = true;
      if (ev.subtype !== "thread_broadcast") {
        const mentioned = (ev.text ?? "").includes(`<@${this.me.id}>`) || /<!(here|channel|everyone)/.test(ev.text ?? "");
        if (ev.user !== this.me.id && c && (mentioned || c.kind === "im" || c.kind === "mpim") && o?.thread?.ts !== ev.thread_ts && this.shouldNotify(c, mentioned)) {
          const from = this.users.get(ev.user) ?? ev.username ?? ev.bot_profile?.name ?? "Slack";
          this.toast(c, { thread: ev.thread_ts, title: from, where: c.kind === "im" ? "Reply in your thread" : `Thread in ${c.kind === "channel" ? "#" : ""}${c.title}`, body: plainText(ev.text, this.users, this.convs).slice(0, 160) || "[file]", uid: ev.user, mention: mentioned });
        }
        return;
      }
    }
    if (!c) {
      const j = await this.api("conversations.info", { channel: ev.channel });
      if (!j.ok) return;
      c = this.addConv(j.channel);
      this.nameConv(c);
    }
    if (ev.user && !this.users.has(ev.user)) await this.resolveUsers([ev.user]);
    const mine = ev.user === this.me.id;
    const shown = this.open?.id === c.id;
    c.ts = Number(ev.ts) * 1000;
    c.lastTs = ev.ts;
    c.preview = this.previewOf(c, ev);
    this.cacheDirty = true;
    if (shown) {
      if (!this.open.messages.some((m) => m.ts === ev.ts)) this.open.messages.push(this.normalize(ev));
      // Someone else's message is read (here and in Slack) once the panel has shown it at the
      // bottom (readbottom); until then it counts, as with the panel hidden or scrolled up.
      if (mine) { this.seen[c.id] = ev.ts; this.saveSeen(); }
      else { c.unread += 1; this.open.bottomSeen = false; }
    } else if (!mine) {
      c.unread += 1;
      const mentioned = (ev.text ?? "").includes(`<@${this.me.id}>`) || /<!(here|channel|everyone)/.test(ev.text ?? "");
      if (mentioned) c.mention = true;
      if (this.shouldNotify(c, mentioned)) {
        const from = this.users.get(ev.user) ?? ev.username ?? ev.bot_profile?.name ?? "Slack";
        this.toast(c, { title: from, where: c.kind === "im" ? "Direct message" : c.kind === "mpim" ? c.title : `${c.kind === "channel" ? "#" : ""}${c.title}`, body: plainText(ev.text, this.users, this.convs).slice(0, 160) || "[file]", uid: ev.user ?? ev.bot_id, mention: mentioned });
      }
    }
    this.dirty = true;
  }

  async resolveUsers(ids) {
    for (const id of [...new Set(ids)].filter((i) => i && !this.users.has(i)).slice(0, 8)) {
      const j = await this.api("users.info", { user: id }).catch(() => null);
      const u = j?.ok ? j.user : null;
      this.users.set(id, u ? emojiText(String(u.profile?.display_name || u.real_name || u.name)) : "someone");
      if (u && (u.is_bot || id === "USLACKBOT")) this.bots.add(id);
      if (u?.profile?.image_48) this.faces.set(id, u.profile.image_48);
    }
  }

  // A person's picture file, from Slack's address for it; null when either part isn't what
  // Slack gives (the file name is built from both).
  faceName(uid) {
    const url = this.faces.get(uid);
    return /^[UWB][A-Z0-9]{2,20}$/.test(uid ?? "") && pic(url) ? faceFile(uid, url) : null;
  }

  // A person's picture when it is already on disk: shown now, with no request. Anything else
  // waits until the panel shows that person, unless `now` (a notification's icon).
  needFace(uid, now = false) {
    if (!uid || this.avatars[uid] || !this.faces.has(uid)) return;
    const name = this.mediaReady ? this.faceName(uid) : null;
    if (name && this.faceIndex[name]) this.keepFace(uid, name);
    else if (now) this.pushUrgent(`@${uid}`, { face: uid });
  }

  keepFace(uid, name) {
    this.faceIndex[name].at = Date.now();
    this.avatars[uid] = `data/${NAME}/avatars/${this.owner}/${name}`;
    // Everyone ever shown is published with each state; past this many the oldest go.
    const ids = Object.keys(this.avatars);
    if (ids.length > 1500) for (const id of ids.slice(0, ids.length - 1500)) delete this.avatars[id];
    this.faceIndexDirty = this.dirty = true;
  }

  dropFace(name) {
    for (const [uid, path] of Object.entries(this.avatars)) if (path.endsWith(`/${name}`)) delete this.avatars[uid];
  }

  // A picture a message shows. One already on disk is shown now, with no request; anything
  // else waits until the panel scrolls near it, unless `now` (a larger view, a copy). Returns
  // the picture so normalize can keep it as it goes.
  needMedia(p, now = false) {
    if (!p) return null;
    const kept = this.mediaReady ? this.mediaIndex[p.key] : null;
    if (kept) {
      kept.at = Date.now();
      if (!this.media[p.key]) { this.media[p.key] = `data/${NAME}/media/${this.owner}/${p.key}`; this.dirty = true; }
      this.mediaIndexDirty = true;
    } else if (now) {
      this.mediaFailed.delete(p.key);
      this.pushUrgent(p.key, { pic: p });
    }
    return p;
  }

  // Asked for again, a job moves to the back; past URGENT_MAX the oldest request is dropped.
  pushUrgent(key, job) {
    this.urgent.delete(key);
    this.urgent.set(key, job);
    if (this.urgent.size > URGENT_MAX) this.urgent.delete(this.urgent.keys().next().value);
  }

  // The panel's WANT, checked again here: each picture's key is worked out from its address
  // (the panel's is not trusted to name a file) and each face must be a known person.
  takeWant(w) {
    const out = [];
    for (const it of Array.isArray(w?.items) ? w.items.slice(0, 300) : []) {
      if (typeof it?.face === "string") { if (this.faces.has(it.face)) out.push({ face: it.face }); continue; }
      const p = pic(it?.pic?.url, it?.pic?.w, it?.pic?.h);
      if (p) out.push({ pic: p });
    }
    this.want = out;
  }

  // The first job that still needs doing: what was asked for outright, then the panel's list in
  // its order. A conversation left behind is no longer in that list, so its pictures stop.
  nextFetch() {
    const todo = (j) => (j.pic ? !this.media[j.pic.key] && !this.mediaFailed.has(j.pic.key) && !this.fetching.has(j.pic.key)
      : !this.avatars[j.face] && !this.faceFailed.has(j.face) && !this.fetching.has(`@${j.face}`));
    for (const [k, j] of this.urgent) { this.urgent.delete(k); if (todo(j)) return j; }
    return this.want.find(todo) ?? null;
  }

  // Pictures and avatars are kept per workspace and person, in data/slack/<kind>/<owner>/.
  // When the token is someone else's, the last one's files (and those from before the folders)
  // are removed rather than shown, and the index starts empty. Only names this mod makes
  // (nameRe, or oldRe: its names before SHA-256) are ever deleted.
  async claimFolder(root, key, nameRe, oldRe, index) {
    const ours = (n) => nameRe.test(n) || oldRe.test(n);
    let was = null;
    try { was = localStorage.getItem(key); } catch (_) {}
    if (was !== this.owner) {
      for (const k of Object.keys(index)) delete index[k];
      for (const n of await fs.readdir(root).catch(() => [])) {
        if (ours(n)) await fs.unlink(`${root}/${n}`).catch(() => {});
        else if (/^[a-z0-9]+$/.test(n) && n !== this.owner) {
          for (const m of await fs.readdir(`${root}/${n}`).catch(() => [])) if (ours(m)) await fs.unlink(`${root}/${n}/${m}`).catch(() => {});
          await fs.rmdir(`${root}/${n}`).catch(() => {});
        }
      }
      try { localStorage.setItem(key, this.owner); } catch (_) {}
    }
    await fs.mkdir(`${root}/${this.owner}`, { recursive: true }).catch(() => {});
  }

  // The folder holds only what the index knows. Anything else goes: a name this mod doesn't
  // make now (an older hash, a stray file), or one an interrupted download left. Folders are
  // left alone, and unlink removes a link itself, never what it points at. An index entry
  // without its file was removed by hand.
  async reconcile(folder, nameRe, index) {
    const onDisk = new Set();
    for (const e of await fs.readdir(folder, { withFileTypes: true }).catch(() => [])) {
      // The runtime refuses to unlink a link pointing out of its folders: `rm` removes the link
      // itself (never what it points at, and no folder without -r). One entry failing doesn't
      // stop the rest.
      const path = `${folder}/${e.name}`;
      try {
        if (e.isDirectory()) continue;
        if (nameRe.test(e.name) && index[e.name]) { onDisk.add(e.name); continue; }
        await fs.unlink(path);
      } catch (_) {
        if (appWindow().platform !== "windows") await exec("rm", ["-f", "--", path]).catch(() => null);
      }
    }
    for (const key of Object.keys(index)) if (!onDisk.has(key)) delete index[key];
  }

  // Least recently shown first, until the folder is within both bounds; `keep` (just fetched)
  // stays. drop(key) forgets what pointed at a removed file.
  async prune(folder, index, keep, maxCount, maxBytes, drop) {
    const keys = Object.keys(index);
    let total = keys.reduce((n, k) => n + index[k].size, 0), count = keys.length;
    if (total <= maxBytes && count <= maxCount) return;
    for (const k of keys.sort((a, b) => index[a].at - index[b].at)) {
      if (total <= maxBytes && count <= maxCount) break;
      if (k === keep) continue;
      total -= index[k].size;
      count -= 1;
      delete index[k];
      drop(k);
      await fs.unlink(`${folder}/${k}`).catch(() => {});
    }
  }

  // Both folders are checked first (owner, stray files, bounds); after that a picture already
  // kept is shown the moment it is named, and FETCHERS workers download the rest in the order
  // nextFetch gives, one request each at a time.
  async mediaLoop(cx, gen) {
    const owner = this.owner, mediaFolder = `${dir()}/media/${owner}`, faceFolder = `${dir()}/avatars/${owner}`;
    await this.claimFolder(`${dir()}/media`, "mediaOwner", MEDIA_NAME, OLD_MEDIA_NAME, this.mediaIndex);
    await this.claimFolder(`${dir()}/avatars`, "faceOwner", FACE_NAME, OLD_FACE_NAME, this.faceIndex);
    if (gen !== this.gen) return;
    await this.reconcile(mediaFolder, MEDIA_NAME, this.mediaIndex);
    await this.reconcile(faceFolder, FACE_NAME, this.faceIndex);
    await this.prune(mediaFolder, this.mediaIndex, null, MEDIA_COUNT, MEDIA_BYTES, (k) => { delete this.media[k]; });
    await this.prune(faceFolder, this.faceIndex, null, FACE_COUNT, FACE_BYTES, (k) => this.dropFace(k));
    if (gen !== this.gen) return;
    this.mediaIndexDirty = this.faceIndexDirty = true;
    this.mediaReady = true;
    this.needFace(this.me.id);
    for (const c of this.convs.values()) if (c.kind === "im") this.needFace(c.user);
    for (let i = 0; i < FETCHERS; i++) cx.spawn((cx) => this.fetchLoop(cx, gen));
  }

  async fetchLoop(cx, gen) {
    while (gen === this.gen) {
      const job = this.nextFetch();
      if (!job) { await sleep(cx, 150); continue; }
      const id = job.pic ? job.pic.key : `@${job.face}`;
      this.fetching.add(id);
      try { await (job.pic ? this.fetchPic(gen, job.pic) : this.fetchFace(gen, job.face)); } finally { this.fetching.delete(id); }
    }
  }

  // Prunes run one after another: two at once would each count files the other is removing.
  pruneOnce(...args) {
    this.pruning = (this.pruning ?? Promise.resolve()).then(() => this.prune(...args)).catch(() => {});
    return this.pruning;
  }

  async fetchPic(gen, p) {
    const owner = this.owner, index = this.mediaIndex, folder = `${dir()}/media/${owner}`, file = `${folder}/${p.key}`;
    if (index[p.key]) { this.needMedia(p); return; }
    const r = await this.slackCurl(gen, p.url, ["-sf", "--proto", "=https", "--max-time", "20", "--max-filesize", MEDIA_FILE_MAX, "-o", file], "%{size_download}\n%{content_type}");
    if (gen !== this.gen) return;
    const [bytes = "0", type = ""] = r?.rest ?? [];
    // Slack answers a file this token may not see with its sign-in page, not an error.
    if (!r || r.code !== 0 || !/^image\//.test(type)) {
      await fs.unlink(file).catch(() => {});
      this.mediaFailed.add(p.key);
      if (this.mediaFailed.size > 1000) this.mediaFailed.clear();
      return;
    }
    index[p.key] = { size: Number(bytes) || 0, at: Date.now() };
    this.needMedia(p);
    await this.pruneOnce(folder, index, p.key, MEDIA_COUNT, MEDIA_BYTES, (k) => { delete this.media[k]; });
  }

  async fetchFace(gen, uid) {
    const name = this.faceName(uid), folder = `${dir()}/avatars/${this.owner}`;
    if (!name) { this.faceFailed.add(uid); return; }
    if (!this.faceIndex[name]) {
      const r = await exec("curl", ["-sf", "--proto", "=https", "--max-time", "20", "--max-filesize", "2M", "-o", `${folder}/${name}`, "-w", "%{size_download}", this.faces.get(uid)]).catch(() => null);
      if (gen !== this.gen) return;
      if (!r || r.code !== 0) { await fs.unlink(`${folder}/${name}`).catch(() => {}); this.faceFailed.add(uid); return; }
      this.faceIndex[name] = { size: Number(r.stdout) || 0, at: Date.now() };
      await this.pruneOnce(folder, this.faceIndex, name, FACE_COUNT, FACE_BYTES, (k) => this.dropFace(k));
      if (gen !== this.gen || !this.faceIndex[name]) return;
    }
    this.keepFace(uid, name);
  }

  // The token reaches curl in a header file only you can read, made for this one request (two
  // requests never share or remove each other's) and removed right after, so it never shows
  // in the process list. Nothing is written once the token's generation is over.
  async withAuth(gen, fn) {
    if (gen !== this.gen || !this.userToken) return null;
    const header = `${dir()}/.auth-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
    try {
      await fs.writeFile(header, "");
      await lock(header, false);
      if (gen !== this.gen) return null;
      await fs.writeFile(header, `Authorization: Bearer ${this.userToken}\n`);
      return await fn(header);
    } finally {
      await fs.unlink(header).catch(() => {});
    }
  }

  // curl for a picture or file. Only files.slack.com gets the token (withAuth). Redirects are
  // followed here, one hop at a time and only to https, because curl -L would send the token
  // on to wherever Slack points. Returns { code, status, rest }: rest is `fmt`'s lines.
  // onHop gets the lines of a hop that redirected (download removes what it wrote).
  async slackCurl(gen, url, args, fmt, onHop) {
    for (let hop = 0; hop < 4; hop++) {
      const call = (header) => exec("curl", [...args, ...(header ? ["-H", `@${header}`] : []), "-w", `%{http_code}\n%{redirect_url}\n${fmt}`, url]).catch(() => null);
      const r = SLACK_FILES.test(url) ? await this.withAuth(gen, call) : await call(null);
      if (!r || gen !== this.gen) return null;
      const [status = "", next = "", ...rest] = r.stdout.split("\n");
      if (/^3\d\d$/.test(status) && next) {
        await onHop?.(rest);
        if (!next.startsWith("https://") || !WEB.test(next)) return { code: 1, status, rest };
        url = next;
        continue;
      }
      return { code: r.code, status, rest };
    }
    return null;
  }

  // A file into Downloads, under its own name. A mod may only touch files in its own data
  // folder, so curl does all of it: makes the folder, keeps a file already there (adding .1,
  // .2 to the new one's name) and says where it put it. Slack answers a file it won't give
  // with its sign-in page: the token lacks files:read.
  async download(f) {
    // The panel sends the file: nothing in it is trusted.
    if (!f || !/^F[A-Z0-9]{2,20}$/.test(f.id) || typeof f.url !== "string" || !SLACK_FILES.test(f.url) || this.downloads[f.id]?.state === "busy") return;
    this.downloads[f.id] = { state: "busy" };
    const ids = Object.keys(this.downloads);
    if (ids.length > 50) for (const id of ids.slice(0, ids.length - 50)) if (this.downloads[id].state !== "busy") delete this.downloads[id];
    this.dirty = true;
    const windows = appWindow().platform === "windows", downloads = `${home().replace(/\\/g, "/")}/Downloads/`;
    // Outside the data folder only a program can delete, given the path as one argument; on
    // Windows that is cmd, which reads & | ^ % in a path as its own, so such a path is left.
    const remove = async (path) => {
      const p = String(path ?? "").replace(/\\/g, "/");
      if (!p.startsWith(downloads) || p.slice(downloads.length).includes("/")) return;
      if (windows) { if (!/[&|<>^%!"()]/.test(p)) await exec("cmd", ["/c", "del", "/q", p.replace(/\//g, "\\")]).catch(() => {}); }
      else await exec("rm", ["-f", "--", p]).catch(() => {});
    };
    try {
      let safe = String(f.name || "file").replace(/[\\/:*?"<>|&%^!\u0000-\u001f]/g, "_").replace(/^[.\s]+/, "").slice(0, 180);
      if (!safe.trim()) safe = "file";
      const target = `${downloads}${safe}`;
      const r = await this.slackCurl(this.gen, f.url, ["-sf", "--proto", "=https", "--max-time", "25", "--create-dirs", "--no-clobber", "-o", target], "%{content_type}\n%{filename_effective}", (rest) => remove(rest[1]));
      if (!r) throw new Error("Download failed.");
      const [type = "", said = ""] = r.rest, status = r.status;
      // What curl says it wrote is shown and opened later, so it must be the file asked for.
      const saved = said.replace(/\\/g, "/").startsWith(`${downloads}${safe}`) && !said.slice(downloads.length).includes("/") ? said : target;
      if (status === "401" || status === "403") {
        await remove(saved);
        throw new Error("Needs the files:read permission: gear menu → Fix permissions.");
      }
      if (r.code !== 0) {
        if (r.code !== 23) await remove(saved);
        throw new Error(r.code === 28 ? "Took longer than 25 s: open it in Slack instead." : `Download failed (curl ${r.code}).`);
      }
      if (/text\/html/.test(type) && !/html/.test(f.mime ?? "")) {
        await remove(saved);
        throw new Error("Needs the files:read permission: gear menu → Fix permissions.");
      }
      this.downloads[f.id] = { state: "done", path: saved };
      notify({ title: "Downloaded", body: saved.split(/[\\/]/).pop(), level: "info", timeout: 6000 });
    } catch (e) {
      this.downloads[f.id] = { state: "error", error: String(e?.message ?? e) };
    } finally {
      this.dirty = true;
    }
  }

  // A picture onto the system clipboard as PNG: the full-size copy, fetched first through the
  // same signed-in download the message pictures use, else the thumbnail. The app's clipboard
  // takes text only, so the platform's own tool does it, each path handed over as an argument
  // (the shell lines below are fixed text, never built from a path).
  async copyImage(cx, f) {
    const id = f?.id;
    if (typeof id !== "string" || !id) return;
    const set = (state, error = null) => { this.clips = { ...this.clips, [id]: { state, error } }; this.dirty = true; };
    set("busy");
    try {
      const os = appWindow().platform;
      if (os === "windows") throw new Error("Copying pictures isn't supported on Windows: use Download.");
      let src = null;
      for (const want of [f.full, f.big, f.thumb]) {
        // Its key is worked out again here: the panel's is not trusted to name a file.
        const p = want && pic(want.url, want.w, want.h);
        if (!p) continue;
        if (!this.media[p.key]) this.needMedia(p, true);
        for (let i = 0; i < 120 && !this.media[p.key] && !this.mediaFailed.has(p.key); i++) await sleep(cx, 250);
        if (this.media[p.key]) { src = `${appHome().replace(/\\/g, "/")}/${this.media[p.key]}`; break; }
      }
      if (!src) throw new Error("The picture couldn't be downloaded.");
      const head = await fs.readFile(src).then((b) => b.subarray(0, 4)).catch(() => null);
      const isPng = Boolean(head) && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
      let file = src;
      if (!isPng) {
        file = `${dir()}/.clipboard.png`;
        // [0]: a GIF's first frame.
        let made = os === "macos" ? await exec("sips", ["-s", "format", "png", src, "--out", file]).catch(() => null)
          : await exec("magick", [`${src}[0]`, `png:${file}`]).catch(() => null);
        if (os !== "macos" && made?.code !== 0) made = await exec("convert", [`${src}[0]`, `png:${file}`]).catch(() => null);
        if (made?.code !== 0) throw new Error(os === "macos" ? "Couldn't make a PNG of it." : "Couldn't make a PNG of it: ImageMagick (magick) is needed.");
      }
      // wl-copy and xclip stay running to serve the clipboard: their output goes to /dev/null so
      // exec isn't left waiting on them.
      const r = os === "macos"
        ? await exec("osascript", ["-e", "on run argv", "-e", "set the clipboard to (read (POSIX file (item 1 of argv)) as «class PNGf»)", "-e", "end run", file])
        : await exec("sh", ["-c", 'if [ -n "$WAYLAND_DISPLAY" ] && command -v wl-copy >/dev/null; then wl-copy --type image/png <"$1"; elif command -v xclip >/dev/null; then xclip -selection clipboard -t image/png -i "$1"; else exit 3; fi >/dev/null 2>&1', "sh", file]);
      if (r.code === 3) throw new Error("Needs wl-copy (Wayland) or xclip (X11).");
      if (r.code !== 0) throw new Error(`The clipboard tool failed (${r.code}).`);
      set("done");
      await sleep(cx, 2500);
      if (this.clips[id]?.state === "done") { const { [id]: _, ...rest } = this.clips; this.clips = rest; this.dirty = true; }
    } catch (e) {
      set("error", String(e?.message ?? e));
    }
  }

  // Whether a message makes a toast and a sound. A direct message counts as a mention.
  shouldNotify(c, mentioned) {
    if (Date.now() < this.pauseUntil) return false;
    const p = this.prefs[c.id] ?? {}, forYou = mentioned || c.kind === "im";
    if (p.muted) return mentioned;
    const level = p.level ?? defaultLevel(c.kind);
    return level === "all" || (level === "mentions" && forYou);
  }

  savePrefs() {
    try { localStorage.setItem("prefs", JSON.stringify(this.prefs)); } catch (_) {}
  }

  // ── sections: data/slack/sections.json ─────────────────────────────────────────────────
  // Read every 2 s and taken in only when its text changed, so a hand edit (or a file copied
  // from another machine) shows at once; an edit made in the panel writes the same file.
  async sectionsLoop(cx, gen) {
    while (gen === this.gen) {
      let text;
      // readTextFile gives null for a missing file (no sections) and throws for anything else:
      // then the last good sections stay, with a note, and the next good read is taken again.
      try { text = await readTextFile(SECTIONS()); } catch (e) {
        this.secText = undefined;
        if (!this.note?.sections) { this.note = { text: `sections.json can't be read (${e?.message ?? e}). Keeping the sections as they were.`, error: true, until: Infinity, sections: true }; this.dirty = true; }
        await sleep(cx, 2000);
        continue;
      }
      if (gen !== this.gen) return;
      if (text !== this.secText) {
        this.secText = text;
        if (text == null) { this.takeSections(null); await this.migrateSections(); }
        else {
          // A broken file (often one half typed in an editor) leaves the last good sections in
          // place, with a note that stays until the file reads again.
          try { this.takeSections(parseSections(text)); } catch (e) {
            this.note = { text: `${e.message}. Keeping the sections as they were.`, error: true, until: Infinity, sections: true };
            this.dirty = true;
          }
        }
      }
      await sleep(cx, 2000);
    }
  }

  // Sections made before the file existed lived in this mod's storage: written to the file once,
  // and forgotten here only once that write went through.
  async migrateSections() {
    let old = null;
    try { old = JSON.parse(localStorage.getItem("sections") ?? "null"); } catch (_) {}
    if (!Array.isArray(old?.list) || !old.list.length || !this.teamId) return;
    const placed = old.placed && typeof old.placed === "object" ? Object.entries(old.placed) : [];
    const byName = new Map(old.list.filter((s) => typeof s?.name === "string" && s.name.trim()).slice(0, 50).map((s) => [s.name.trim().slice(0, 80), s]));
    const sections = [...byName].map(([name, s]) => ({ name, emoji: "", collapsed: false, rules: [], channels: placed.filter(([, sid]) => sid === s.id).map(([cid]) => this.refOf(cid)) }));
    const wrote = await this.editFile((doc) => {
      if (Object.keys(doc).length) return false;
      doc.teams = { [this.teamId]: { sections } };
    }).catch(() => false);
    if (wrote) try { localStorage.removeItem("sections"); } catch (_) {}
  }

  // This workspace's entry (teams.<team id>) when there is one, else the file's own top level,
  // which suits a file shared between machines or workspaces.
  entryOf(doc) {
    const own = doc?.teams?.[this.teamId];
    return own && typeof own === "object" && !Array.isArray(own) ? own : doc;
  }

  // A document that passed parseSections (or null: no file) becomes the sections in use.
  takeSections(doc) {
    const entry = this.entryOf(doc);
    const refs = (v) => (v ?? []).slice(0, 1000).map(refKey).filter(Boolean);
    this.sections = (entry?.sections ?? []).slice(0, 50).map((s) => {
      const name = s.name.trim();
      return { id: secId(name), name, emoji: typeof s.emoji === "string" ? this.emojiIn(s.emoji) : "", collapsed: s.collapsed === true, rules: (s.rules ?? []).slice(0, 50).map(ruleOf), channels: refs(s.channels) };
    });
    this.unsectioned = refs(entry?.unsectioned);
    if (this.note?.sections) this.note = null;
    this.dirty = true;
  }

  // How the file names a conversation: a channel by its name (readable, the same on every
  // machine), a direct message by its id (names of people change and repeat).
  refOf(cid) {
    const c = this.convs.get(cid);
    return c && (c.kind === "channel" || c.kind === "group") && c.name ? c.name : cid;
  }

  kindOf(c) {
    return c.kind === "channel" ? "public" : c.kind === "group" ? "private" : c.kind === "mpim" ? "group" : this.bots.has(c.user) ? "app" : "dm";
  }

  ruleSection(c) {
    const name = c.kind === "channel" || c.kind === "group" ? c.name : c.title ?? "", kind = this.kindOf(c), muted = Boolean(this.prefs[c.id]?.muted);
    return this.sections.find((s) => s.rules.some((r) => (!r.name || r.name.test(name)) && (!r.type || r.type.has(kind)) && (r.muted == null || r.muted === muted))) ?? null;
  }

  // Where each conversation goes: a section that lists it (in that order), else none when it
  // is kept out on purpose, else the first section whose rule it matches.
  placeAll() {
    const listed = new Map(), out = new Set(this.unsectioned), placed = {}, rank = {};
    for (const s of this.sections) s.channels.forEach((ref, i) => { if (!listed.has(ref)) listed.set(ref, [s.id, i]); });
    for (const c of this.convs.values()) {
      const keys = [c.id.toLowerCase(), refKey(c.kind === "channel" || c.kind === "group" ? c.name ?? "" : c.title ?? "")];
      const hit = listed.get(keys[0]) ?? listed.get(keys[1]);
      if (hit) { placed[c.id] = hit[0]; rank[c.id] = hit[1]; continue; }
      if (out.has(keys[0]) || out.has(keys[1])) continue;
      const s = this.ruleSection(c);
      if (s) placed[c.id] = s.id;
    }
    this.placed = placed;
    this.rank = rank;
  }

  // A change made from the panel, applied to the file as it is on disk right now, one at a time.
  // writeTextFile replaces the file atomically and only while it still holds the text read, so
  // an edit saved in an editor meanwhile is read again and the change applied on top of it,
  // never overwritten. change(doc) edits the document in place, or returns false to leave it.
  // Resolves true when written, false when nothing changed; a file that doesn't read (or a
  // change that would break it) is never written. A job queued before the token changed
  // (resetWorkspace) is dropped unwritten: its change was meant for the last workspace.
  editFile(change) {
    const secGen = this.secGen, team = this.teamId;
    const stale = () => secGen !== this.secGen || team !== this.teamId;
    const job = this.secQueue.then(async () => {
      for (let tries = 0; ; tries++) {
        if (stale()) return false;
        const text = await readTextFile(SECTIONS());
        const doc = text == null ? {} : parseSections(text);
        if (stale() || change(doc) === false) return false;
        if (sectionsProblem(doc)) throw new Error("the change would make the file invalid");
        const out = `${JSON.stringify(doc, null, 2)}\n`;
        try { await writeTextFile(SECTIONS(), out, text); } catch (e) {
          if (tries < 3) continue;
          throw e;
        }
        // The folder is private already; the file is kept so too, like the tokens beside it.
        await exec("chmod", ["600", SECTIONS()]).catch(() => {});
        if (stale()) return true;
        this.secText = out;
        this.takeSections(doc);
        return true;
      }
    });
    this.secQueue = job.catch(() => {});
    return job;
  }

  // A section's emoji as typed: :name: becomes the character (a workspace's own stays :name:).
  emojiIn(v) {
    return emojiText(String(v ?? "").trim()).slice(0, 40);
  }

  async editSections(edit) {
    await this.editFile((doc) => this.applyEdit(doc, edit)).catch((e) => {
      this.note = { text: `Couldn't save sections.json: ${e?.message ?? e}.`, error: true, until: Date.now() + 10000 };
    });
    this.dirty = true;
  }

  // An edit from the panel: new (optionally moving a conversation in), rename, emoji, collapse,
  // delete, order (dir -1 / 1), and move a conversation (sid null: back to its usual group,
  // kept out explicitly when a rule would still pull it in). false: nothing to change.
  applyEdit(doc, { op, sid, name, emoji, id, dir: step, collapsed }) {
    let entry = doc.teams?.[this.teamId];
    if (!entry) {
      if (Array.isArray(doc.sections) || !this.teamId) entry = doc;
      else {
        doc.teams ??= {};
        entry = doc.teams[this.teamId] = { sections: [] };
      }
    }
    entry.sections ??= [];
    const list = entry.sections, clean = String(name ?? "").trim().slice(0, 80);
    const at = list.findIndex((s) => secId(s.name.trim()) === sid);
    const taken = clean && list.some((s) => s.name.trim() === clean);
    const conv = id != null ? this.convs.get(id) ?? null : null;
    const drop = () => {
      const keys = new Set([conv.id.toLowerCase(), refKey(this.refOf(conv.id))]);
      const keep = (x) => !keys.has(refKey(x));
      for (const s of list) if (s.channels) s.channels = s.channels.filter(keep);
      if (entry.unsectioned) entry.unsectioned = entry.unsectioned.filter(keep);
    };
    if (op === "new") {
      if (!clean || taken || list.length >= 50) return false;
      const s = { name: clean, emoji: this.emojiIn(emoji), collapsed: false, rules: [], channels: [] };
      if (conv) { drop(); s.channels.push(this.refOf(conv.id)); }
      list.push(s);
    } else if (op === "move") {
      if (!conv) return false;
      drop();
      if (at >= 0) (list[at].channels ??= []).push(this.refOf(conv.id));
      else if (this.ruleSection(conv)) (entry.unsectioned ??= []).push(this.refOf(conv.id));
    } else if (at < 0) return false;
    else if (op === "rename") { if (!clean || taken) return false; list[at].name = clean; }
    else if (op === "emoji") list[at].emoji = this.emojiIn(emoji);
    else if (op === "collapse") list[at].collapsed = Boolean(collapsed);
    else if (op === "delete") list.splice(at, 1);
    else if (op === "order") {
      const j = at + (step < 0 ? -1 : 1);
      if (j < 0 || j >= list.length) return false;
      [list[at], list[j]] = [list[j], list[at]];
    } else return false;
  }

  // The Threads and Saved views, asked for when the panel opens one: threads you wrote in or
  // were mentioned in (search.messages, newest reply first) and your saved messages (stars.list).
  async shortcut(kind) {
    if (kind !== "threads" && kind !== "saved") return;
    this.short = { kind, loading: true, items: [], error: null };
    this.dirty = true;
    const items = [];
    let error = null;
    const item = (cid, ts, thread, user, text) => {
      const c = this.convs.get(cid);
      return { id: cid, ts, thread, at: Number(ts) * 1000, where: c.kind === "channel" || c.kind === "group" ? `#${c.title}` : c.title ?? "", who: this.users.get(user) ?? "", text: plainText(text, this.users).replace(/\s+/g, " ").trim().slice(0, 160) };
    };
    if (kind === "threads") {
      const me = this.me?.id, threads = new Map();
      for (const query of [`is:thread from:<@${me}>`, `is:thread <@${me}>`]) {
        const j = await this.api("search.messages", { query, sort: "timestamp", sort_dir: "desc", count: "40" }).catch(() => null);
        if (!j?.ok) { error = j?.error ?? "no answer"; break; }
        for (const m of j.messages?.matches ?? []) {
          const cid = m.channel?.id;
          if (!cid || !this.convs.has(cid) || !m.ts) continue;
          const thread = /[?&]thread_ts=(\d+\.\d+)/.exec(m.permalink ?? "")?.[1] ?? m.ts, key = `${cid}:${thread}`;
          if (!threads.has(key) || Number(m.ts) > Number(threads.get(key).ts)) threads.set(key, item(cid, m.ts, thread, m.user, m.text));
        }
      }
      items.push(...[...threads.values()].sort((a, b) => b.at - a.at).slice(0, 40));
    } else {
      const j = await this.api("stars.list", { limit: "50" }).catch(() => null);
      if (!j?.ok) error = j?.error ?? "no answer";
      else {
        for (const s of j.items ?? []) {
          const m = s.message;
          if (s.type !== "message" || !m?.ts || !this.convs.has(s.channel)) continue;
          items.push(item(s.channel, m.ts, m.thread_ts && m.thread_ts !== m.ts ? m.thread_ts : null, m.user, m.text));
        }
      }
    }
    const scope = kind === "threads" ? "search:read" : "stars:read";
    this.short = { kind, loading: false, items, error: error === "missing_scope" ? `This needs Slack's ${scope} permission: gear menu → Fix permissions.` : error ? `Slack says ${error}.` : null };
    this.dirty = true;
  }

  // A Slack toast is Herdr's own toast with the writer's picture (Slack's purple mark while
  // it hasn't downloaded), Slack's own sound, and a click that opens the conversation, or the
  // thread, in the side panel (slack.goto-<conversation>[-<thread ts, . as _>]).
  toast(c, n) {
    this.needFace(n.uid, true);
    const go = `goto-${c.id}${n.thread ? `-${String(n.thread).replace(".", "_")}` : ""}`;
    notify({
      title: c.kind === "im" ? n.title : `${n.title} · ${n.where}`,
      body: n.body,
      level: "info",
      timeout: 12000,
      icon: this.avatars[n.uid] ?? ICON("toast-icon"),
      action: { name: `${NAME}.${go}` },
    });
    this.ding();
  }

  // Slack's sound (mods/slack/knock.mp3), once at most every 1.5 s, unless sounds are off in
  // Herdr's settings or in the Slack panel's gear menu.
  ding() {
    if (!this.soundOn || settings()?.sounds?.enabled === false || Date.now() - (this.dinged ?? 0) < 1500) return;
    this.dinged = Date.now();
    try { playSound(`mods/${NAME}/knock.mp3`); } catch (_) {}
  }

  // A toast was clicked: show the Slack panel, open the conversation (and the thread).
  async goto(id, ts) {
    run("layout.select", { stack: "panel-body", child: NAME });
    run("layout.show", { id: "panel" });
    await this.openConv(id);
    if (ts) await this.openThread({ id, ts });
  }

  // Marks conversations read at their newest message, in Slack as well as here; or one
  // conversation up to `upTo`, the newest message drawn on screen, so what came after it stays
  // unread. The counts go at once; a conversation Slack refuses comes back as it was, with a note.
  async markRead(ids, quiet = false, upTo = null) {
    const marked = [];
    for (const id of [...new Set(Array.isArray(ids) ? ids : [])].slice(0, 200)) {
      const c = this.convs.get(id);
      if (!c) continue;
      marked.push({ c, unread: c.unread, mention: c.mention, seen: this.seen[id] });
      // Messages after upTo (only the open conversation has them at hand) are still unread.
      const after = upTo && this.open?.id === id ? this.open.messages.filter((x) => Number(x.ts) > Number(upTo) && !x.mine).length : 0;
      c.unread = after;
      c.mention = after > 0 && c.mention;
    }
    if (!marked.length) return;
    this.dirty = true;
    this.publish();
    let local = 0, failed = 0, why = "";
    for (const m of marked) {
      const c = m.c;
      let ts = upTo ?? c.lastTs;
      if (!ts) {
        const h = await this.api("conversations.history", { channel: c.id, limit: "1" }).catch(() => null);
        ts = h?.ok ? h.messages?.[0]?.ts : null;
        if (ts) c.lastTs = ts;
      }
      if (!ts) continue;
      if (!this.seen[c.id] || Number(ts) > Number(this.seen[c.id])) this.seen[c.id] = ts;
      const j = await this.api("conversations.mark", { channel: c.id, ts }, true).catch((e) => ({ ok: false, error: String(e?.message ?? e) }));
      this.logMark(c.id, ts, j);
      if (j?.ok) { this.pendingMark.delete(c.id); continue; }
      // Refused or unanswered: it stays as it was. Unanswered, the minute check keeps asking
      // Slack about it (pendingMark "retry") until Slack says it is read, whoever read it;
      // refused for permissions ("scope"), the yellow bar asks for them instead.
      const scope = j?.error === "missing_scope";
      if (scope) { local += 1; this.markDenied = j.needed || "write"; }
      else { failed += 1; why = j?.error ?? "no answer"; }
      c.unread = m.unread;
      c.mention = m.mention;
      if (m.seen == null) delete this.seen[c.id]; else this.seen[c.id] = m.seen;
      this.pendingMark.set(c.id, scope ? "scope" : "retry");
    }
    this.saveSeen();
    if (failed) this.note = { text: `Couldn't mark ${failed === 1 ? "it" : `${failed} conversations`} read in Slack (${why}).`, error: true, until: Date.now() + 8000 };
    else if (local && !quiet) this.note = { text: "Couldn't mark it read: Slack needs write permissions. Fix permissions in the yellow bar.", error: true, until: Date.now() + 8000 };
    this.dirty = true;
  }

  // Every conversations.mark of this start and Slack's answer, in data/slack/mark.log (the
  // newest 200), for when read and unread don't agree with Slack's own apps.
  logMark(id, ts, j) {
    const line = `${new Date().toISOString()} ${id} ${ts} ${j?.ok ? "ok" : `error ${j?.error ?? "no answer"}${j?.needed ? ` needed=${j.needed}` : ""}`}`;
    this.markLog = [...(this.markLog ?? []), line].slice(-200);
    // One write after another: two at once could leave the older list as the file.
    const text = `${this.markLog.join("\n")}\n`;
    this.markLogWrite = (this.markLogWrite ?? Promise.resolve()).then(() => fs.writeFile(`${dir()}/mark.log`, text)).catch(() => {});
  }

  saveSeen() {
    try { localStorage.setItem("seen", JSON.stringify(this.seen)); } catch (_) {}
  }

  // ── background: commands from the panel ───────────────────────────────────────────────
  poll(cx) {
    const want = shared(WANT);
    if (want?.n && want.n !== this.wantN) { this.wantN = want.n; this.takeWant(want); }
    const box = shared(CMD);
    if (!Array.isArray(box?.list) || box.n === this.lastCmd) return;
    this.lastCmd = box.n;
    let fresh = false;
    for (const cmd of box.list) {
      if (!cmd?.n || this.doneCmds.has(cmd.n)) continue;
      this.doneCmds.add(cmd.n);
      fresh = true;
      this.cmdQueue.push(cmd);
    }
    if (!fresh) return;
    // Enough to cover the list (CMD_KEEP) many times over.
    this.doneCmds = new Set([...this.doneCmds].slice(-200));
    try { localStorage.setItem("doneCmds", JSON.stringify([...this.doneCmds])); } catch (_) {}
    if (this.cmdBusy) return;
    // One at a time, in the order asked: a send never overtakes the open before it, and a
    // reload in between doesn't run beside the commands around it.
    this.cmdBusy = true;
    cx.spawn(async (cx) => {
      try { while (this.cmdQueue.length) await this.runCommand(this.cmdQueue.shift(), cx); } finally { this.cmdBusy = false; }
    });
  }

  async runCommand(cmd, cx) {
    try {
      if (cmd.type === "reload") this.reload(cx);
      else if (cmd.type === "open") await this.openConv(cmd.id);
      else if (cmd.type === "close") { this.open = null; this.dirty = true; }
      else if (cmd.type === "send") await this.sendQueued(cmd, cx);
      else if (cmd.type === "older") await this.loadOlder(cmd);
      else if (cmd.type === "react") await this.react(cmd);
      else if (cmd.type === "thread") await this.openThread(cmd);
      else if (cmd.type === "unthread") { if (this.open) this.open.thread = null; this.dirty = true; }
      // Started in order, then left to run: a large file doesn't hold up what comes next.
      else if (cmd.type === "download") cx.spawn(() => this.download(cmd.file).catch(() => {}));
      else if (cmd.type === "copyimage") cx.spawn((scx) => this.copyImage(scx, cmd.file).catch(() => {}));
      else if (cmd.type === "media") {
        // Its key is worked out again here: the panel's is not trusted to name a file.
        const p = pic(cmd.pic?.url, cmd.pic?.w, cmd.pic?.h);
        if (p) this.needMedia(p, true);
      }
      else if (cmd.type === "goto") await this.goto(cmd.id, cmd.ts ?? null);
      else if (cmd.type === "markread") await this.markRead(cmd.ids ?? [cmd.id]);
      else if (cmd.type === "readbottom") {
        // This very opening, loaded, was drawn down to message cmd.ts: read up to exactly
        // that one, here and in Slack. One that came after it stays unread until it is drawn
        // too (bottomSeen stays off, so that drawing asks again). One from an earlier opening
        // is stale.
        const o = this.open, ts = typeof cmd.ts === "string" && /^\d+\.\d+$/.test(cmd.ts) ? cmd.ts : null;
        if (o && ts && o.id === cmd.id && o.n === cmd.openN && !o.loading && !o.bottomSeen && o.messages.some((x) => x.ts === ts)) {
          o.bottomSeen = !o.messages.some((x) => Number(x.ts) > Number(ts));
          await this.markRead([cmd.id], true, ts);
        }
      }
      else if (cmd.type === "profile") await this.loadProfile(cmd.uid);
      else if (cmd.type === "dm") await this.openDm(cmd.uid);
      else if (cmd.type === "section") await this.editSections(cmd);
      else if (cmd.type === "shortcut") await this.shortcut(cmd.kind);
      else if (cmd.type === "sectionmute") {
        for (const [id, sid] of Object.entries(this.placed)) {
          if (sid !== cmd.sid) continue;
          const p = { ...this.prefs[id], muted: Boolean(cmd.muted) };
          if (!p.muted) delete p.muted;
          if (Object.keys(p).length) this.prefs[id] = p; else delete this.prefs[id];
        }
        this.savePrefs();
        this.dirty = true;
      }
      else if (cmd.type === "sound") {
        this.soundOn = Boolean(cmd.on);
        try { localStorage.setItem("sound", cmd.on ? "on" : "off"); } catch (_) {}
        if (cmd.on) { this.dinged = 0; this.ding(); }
        this.dirty = true;
      } else if (cmd.type === "rescope") {
        this.missing = await missingScopes(this.userToken).catch(() => null);
        this.markDenied = null;
        for (const [id, why] of this.pendingMark) if (why === "scope") this.pendingMark.delete(id);
        if (this.missing === null) cx.spawn((cx) => this.scopeLoop(cx, this.gen));
        this.scopedAt = Date.now();
        this.dirty = true;
      } else if (cmd.type === "toasttest") {
        const c = [...this.convs.values()].filter((x) => x.kind === "im" && x.ts).sort((a, b) => b.ts - a.ts)[0];
        if (c) this.toast(c, { title: c.title, where: "Direct message", body: (c.preview || "Test").slice(0, 160), uid: c.user });
      }
      else if (cmd.type === "notif" && this.convs.has(cmd.id)) {
        const p = { ...this.prefs[cmd.id] };
        if (LEVELS.has(cmd.level)) p.level = cmd.level;
        if (typeof cmd.muted === "boolean") p.muted = cmd.muted;
        if ((p.level ?? defaultLevel(this.convs.get(cmd.id)?.kind)) === defaultLevel(this.convs.get(cmd.id)?.kind) && !p.muted) delete this.prefs[cmd.id]; else this.prefs[cmd.id] = p;
        this.savePrefs();
        this.dirty = true;
      } else if (cmd.type === "pause") {
        this.pauseUntil = Number(cmd.until) || 0;
        try { localStorage.setItem("pauseUntil", String(this.pauseUntil)); } catch (_) {}
        this.dirty = true;
      }
    } catch (e) {
      const msg = String(e?.message ?? e);
      if (cmd.type === "send") this.result = { n: cmd.n, ok: false, error: msg, draft: cmd.draft ?? null, conv: cmd.id };
      else if (this.open) this.open.notice = msg;
      this.dirty = true;
    }
  }

  // A send waits for the workspace to be known (a reload in between), and goes only to the
  // workspace it was written in; otherwise it comes back to the box, not sent.
  async sendQueued(cmd, cx) {
    for (let i = 0; i < 120 && !this.me && this.status !== "setup" && this.status !== "error"; i++) await sleep(cx, 500);
    if (!this.me) throw new Error("Slack isn't connected");
    if (!cmd.ws || cmd.ws !== this.owner) throw new Error("the Slack workspace changed");
    await this.sendMessage(cmd);
  }

  normalize(m) {
    const bot = !m.user;
    if (bot && m.bot_id && !this.faces.has(m.bot_id)) {
      const url = m.bot_profile?.icons?.image_48 ?? m.icons?.image_48;
      if (url) this.faces.set(m.bot_id, url);
    }
    this.needFace(m.user ?? m.bot_id);
    for (const id of m.reply_users ?? []) this.needFace(id);
    const files = (m.files ?? []).filter((f) => f.id && f.mode !== "tombstone" && f.mode !== "hidden_by_limit").slice(0, 10).map((f) => {
      const image = /^image\//.test(f.mimetype ?? "") && !f.is_external;
      const big = [1024, 960, 800, 720, 480, 360].find((n) => f[`thumb_${n}`]);
      return {
        id: f.id, name: f.name || f.title || "file", type: f.pretty_type || (f.filetype ?? "").toUpperCase(), mime: f.mimetype ?? "", size: f.size ?? 0,
        url: f.url_private_download || f.url_private || null, external: Boolean(f.is_external), link: f.permalink ?? f.url_private ?? null,
        // Slack's thumb_N of a GIF is a still PNG; thumb_N_gif keeps the animation, and the
        // original is used for the large view when it fits the cache's per-file limit.
        thumb: !image ? null : f.mimetype === "image/gif" && (f.thumb_480_gif || f.thumb_360_gif)
          ? this.needMedia(pic(f.thumb_480_gif ?? f.thumb_360_gif, f.thumb_480_w ?? f.thumb_360_w ?? f.original_w, f.thumb_480_h ?? f.thumb_360_h ?? f.original_h))
          : this.needMedia(pic(f.thumb_480 ?? f.thumb_360, f.thumb_480_w ?? f.thumb_360_w ?? f.original_w, f.thumb_480_h ?? f.thumb_360_h ?? f.original_h)),
        big: !image ? null : f.mimetype === "image/gif" && f.url_private && (f.size ?? 0) <= 10 * 1024 * 1024
          ? pic(f.url_private, f.original_w, f.original_h)
          : big ? pic(f[`thumb_${big}`], f[`thumb_${big}_w`] ?? f.original_w, f[`thumb_${big}_h`] ?? f.original_h) : null,
        // The original, fetched only when the picture is copied (within the cache's file limit).
        full: image && f.url_private && (f.size ?? 0) <= 10 * 1024 * 1024 ? pic(f.url_private, f.original_w, f.original_h) : null,
      };
    });
    const blocks = this.blocksOf(m.blocks);
    const cards = (m.attachments ?? []).slice(0, 4).map((a) => this.cardOf(a)).filter(Boolean);
    // A message drawn from blocks carries its text only as the notification fallback.
    const fromBlocks = Boolean(blocks?.some((b) => b.t !== "divider"));
    const text = fromBlocks ? "" : plainText(m.text, this.users, this.convs).trim().slice(0, 4000);
    return {
      ts: m.ts,
      t: Number(m.ts) * 1000,
      who: m.user === this.me.id ? "You" : bot ? m.username ?? m.bot_profile?.name ?? "App" : this.users.get(m.user) ?? "someone",
      mine: m.user === this.me.id,
      uid: m.user ?? m.bot_id ?? m.username ?? "",
      files,
      text: text || (files.length || blocks || cards.length ? "" : "[message]"),
      reactions: (m.reactions ?? []).slice(0, 30).map((r) => ({ name: r.name, count: r.count, mine: Boolean(r.users?.includes(this.me.id)), ...this.customOf(r.name) })),
      parts: fromBlocks ? null : this.partsOf(m.text, 4000),
      blocks,
      cards: cards.length ? cards : null,
      replies: m.reply_count ?? 0,
      repliers: (m.reply_users ?? []).slice(0, 4).map((id) => ({ id, name: id === this.me.id ? "You" : this.users.get(id) ?? "someone" })),
      lastReply: m.latest_reply ? Number(m.latest_reply) * 1000 : null,
      // A thread reply also sent to the conversation: Slack labels it "replied to a thread".
      broadcast: m.subtype === "thread_broadcast" && m.thread_ts ? { thread: m.thread_ts, root: plainText(m.root?.text ?? "", this.users, this.convs).replace(/\s+/g, " ").trim().slice(0, 90) } : null,
    };
  }

  // Slack's mrkdwn laid out (layout), cut to `n` characters so one bot message can't make the
  // view heavy.
  partsOf(x, n = 600) {
    if (!x) return null;
    let s = String(x);
    if (s.length > n) {
      s = s.slice(0, n);
      if (s.lastIndexOf("<") > s.lastIndexOf(">")) s = s.slice(0, s.lastIndexOf("<"));
      s += "…";
    }
    return this.layout(segmentsOf(s, this.users, this.convs));
  }

  // Block Kit as Slack draws it in a message: header, section (text, fields, a picture beside
  // it), image, context (small pictures and text) and divider. Buttons and inputs are left out:
  // they act for the app that posted them, which this panel can't answer for.
  blocksOf(list) {
    const out = [];
    for (const b of list ?? []) {
      if (out.length >= 12) break;
      if (b.type === "header" && b.text?.text) out.push({ t: "header", s: plainText(b.text.text, this.users) });
      else if (b.type === "section") {
        const fields = (b.fields ?? []).slice(0, 10).map((f) => this.partsOf(f.text, 200)).filter(Boolean);
        const image = b.accessory?.type === "image" ? this.needMedia(pic(b.accessory.image_url ?? b.accessory.slack_file?.url)) : null;
        if (b.text?.text || fields.length) out.push({ t: "section", parts: this.partsOf(b.text?.text), fields, image });
      } else if (b.type === "image") {
        const p = this.needMedia(pic(b.image_url ?? b.slack_file?.url, b.image_width, b.image_height));
        if (p) out.push({ t: "image", pic: p, title: b.title?.text ? plainText(b.title.text, this.users) : "" });
      } else if (b.type === "context") {
        const items = (b.elements ?? []).slice(0, 6).map((e) => (e.type === "image" ? { pic: this.needMedia(pic(e.image_url ?? e.slack_file?.url)) } : { parts: this.partsOf(e.text, 300) }))
          .filter((x) => x.pic || x.parts);
        if (items.length) out.push({ t: "context", items });
      } else if (b.type === "divider") out.push({ t: "divider" });
    }
    return out.length ? out : null;
  }

  // An attachment: a link's unfurl (site, title, text, picture), a shared message, or an app's
  // card (colour bar, pretext, fields, footer).
  cardOf(a) {
    const image = this.needMedia(pic(a.image_url, a.image_width, a.image_height));
    const card = {
      color: cardColor(a.color),
      service: a.service_name ?? null,
      serviceIcon: this.needMedia(pic(a.service_icon)),
      author: a.author_name ? plainText(a.author_name, this.users) : a.author_subname ?? null,
      authorIcon: this.needMedia(pic(a.author_icon)),
      authorLink: a.author_link ?? null,
      pretext: this.partsOf(a.pretext, 300),
      title: this.partsOf(a.title, 300),
      titleLink: a.title_link ?? null,
      text: this.partsOf(a.text),
      fields: (a.fields ?? []).slice(0, 8).map((f) => ({ title: plainText(f.title ?? "", this.users), value: this.partsOf(f.value, 200), short: Boolean(f.short) })),
      image,
      thumb: image ? null : this.needMedia(pic(a.thumb_url, a.thumb_width, a.thumb_height)),
      footer: this.partsOf(a.footer, 200),
      footerIcon: this.needMedia(pic(a.footer_icon)),
      blocks: this.blocksOf(a.blocks),
      link: a.title_link ?? a.from_url ?? a.original_url ?? null,
    };
    const empty = !card.title && !card.text && !card.image && !card.thumb && !card.fields.length && !card.blocks && !card.author;
    if (empty && !card.pretext) card.text = this.partsOf(a.fallback, 300);
    return card.text || card.pretext || !empty ? card : null;
  }

  async fetchMessages(id, before) {
    const params = { channel: id, limit: String(HISTORY) };
    if (before) params.latest = before;
    const j = await this.api("conversations.history", params);
    if (!j.ok) throw new Error(`Slack says ${j.error}`);
    const msgs = (j.messages ?? []).slice().reverse();
    await this.resolveUsers([...msgs.map((m) => m.user), ...msgs.flatMap((m) => m.reply_users ?? [])]);
    for (const m of msgs) for (const mention of String(m.text ?? "").matchAll(/<@([UW][A-Z0-9]+)/g)) await this.resolveUsers([mention[1]]);
    return { msgs, more: (j.messages ?? []).length >= HISTORY };
  }

  async openConv(id) {
    const c = this.convs.get(id);
    if (!c) return;
    const unread = c.unread, waiting = unread > 0 || c.mention;
    // It is marked read once its newest messages have been on screen (readbottom), not here.
    this.open = { id, n: Date.now(), title: c.title, kind: c.kind, messages: [], loading: true, error: null, notice: null, more: true, newFrom: null, newCount: 0, bottomSeen: false };
    // Only the open conversation's pictures are published; the files stay kept on disk.
    this.media = {};
    this.dirty = true;
    let got, lastRead = null;
    try {
      // Where you had read up to in Slack, asked before anything marks it read: a conversation
      // read here but not in Slack (marked while offline, say) is still marked there.
      const j = await this.api("conversations.info", { channel: id }).catch(() => null);
      lastRead = (j?.ok ? j.channel.last_read : null) || (waiting ? this.seen[id] : null) || null;
      got = await this.fetchMessages(id);
    } catch (e) {
      if (this.open?.id === id) { this.open.loading = false; this.open.error = String(e?.message ?? e); this.dirty = true; }
      return;
    }
    if (this.open?.id !== id) return;
    this.open.messages = got.msgs.map((m) => this.normalize(m));
    this.open.more = got.more;
    this.open.loading = false;
    Object.assign(this.open, this.newPart(got.msgs, lastRead, unread));
    const last = got.msgs[got.msgs.length - 1];
    if (last) { c.ts = c.ts || Number(last.ts) * 1000; if (Number(last.ts) * 1000 >= c.ts) c.lastTs = last.ts; }
    const behind = Boolean(last && lastRead && Number(last.ts) > Number(lastRead));
    if (!waiting && !behind) { this.open.bottomSeen = true; if (last) { this.seen[id] = last.ts; this.saveSeen(); } }
    this.dirty = true;
  }

  // The first message after `lastRead` that someone else wrote, and how many came after it
  // (Slack's count when the unread part starts before the loaded messages do).
  newPart(msgs, lastRead, unread = 0) {
    if (!lastRead) return { newFrom: null, newCount: 0 };
    const after = msgs.filter((m) => Number(m.ts) > Number(lastRead));
    const first = after.find((m) => m.user !== this.me.id);
    if (!first) return { newFrom: null, newCount: 0 };
    const n = after.filter((m) => Number(m.ts) >= Number(first.ts)).length;
    return { newFrom: first.ts, newCount: after.length === msgs.length ? Math.max(n, unread) : n };
  }

  // Scrolled to the top of what is loaded: the 40 messages before the oldest one.
  async loadOlder({ id }) {
    const o = this.open;
    if (!o || o.id !== id || !o.more || o.loadingOlder || !o.messages.length) return;
    o.loadingOlder = true;
    this.dirty = true;
    try {
      const got = await this.fetchMessages(id, o.messages[0].ts);
      if (this.open?.id !== id) return;
      o.messages = [...got.msgs.map((m) => this.normalize(m)), ...o.messages];
      o.more = got.more;
    } finally {
      o.loadingOlder = false;
      this.dirty = true;
    }
  }

  // A thread: its first message and every reply, from conversations.replies.
  async openThread({ id, ts }) {
    const o = this.open;
    if (!o || o.id !== id) return;
    o.thread = { ts, messages: [], loading: true, error: null };
    this.dirty = true;
    const j = await this.api("conversations.replies", { channel: id, ts, limit: "200" });
    if (this.open?.thread?.ts !== ts) return;
    if (!j.ok) { o.thread.loading = false; o.thread.error = `Slack says ${j.error}`; this.dirty = true; return; }
    const msgs = j.messages ?? [];
    await this.resolveUsers(msgs.map((m) => m.user));
    o.thread.messages = msgs.map((m) => this.normalize(m));
    // Slack gives last_read on a thread you follow; the replies after it get the red line.
    Object.assign(o.thread, this.newPart(msgs.slice(1), msgs[0]?.last_read ?? null));
    o.thread.loading = false;
    this.dirty = true;
  }

  // What chat.postMessage is sent: a thread reply may also go to the conversation itself.
  postParams({ id, text, thread_ts, broadcast }) {
    if (!thread_ts) return { channel: id, text };
    return broadcast ? { channel: id, text, thread_ts, reply_broadcast: true } : { channel: id, text, thread_ts };
  }

  async sendMessage(cmd) {
    const { n, id, text, thread_ts } = cmd, broadcast = Boolean(thread_ts && cmd.broadcast);
    const params = this.postParams({ id, text, thread_ts, broadcast });
    const j = await this.api("chat.postMessage", params, true);
    if (!j.ok) throw new Error(`Slack says ${j.error}`);
    this.result = { n, ok: true };
    // Writing in it ends the "new messages" part, as in Slack.
    if (this.open?.id === id) { if (thread_ts && this.open.thread) this.open.thread.newFrom = null; else this.open.newFrom = null; }
    // Slack's event for this message may come before this answer or after it: both sides add
    // it only where it isn't yet (by ts), and countReply counts a reply once.
    const o = this.open?.id === id ? this.open : null;
    if (thread_ts) {
      if (o?.thread?.ts === thread_ts && !o.thread.messages.some((m) => m.ts === j.ts)) o.thread.messages.push(this.normalize({ ...j.message, ts: j.ts, user: this.me.id, text }));
      const parent = o?.messages.find((m) => m.ts === thread_ts);
      if (parent) this.countReply(id, parent, j.ts, this.me.id);
      if (!broadcast) { this.dirty = true; return; }
      if (o && !o.messages.some((m) => m.ts === j.ts)) o.messages.push(this.normalize({ ...j.message, ts: j.ts, user: this.me.id, text, subtype: "thread_broadcast", thread_ts, root: j.message?.root ?? { text: parent?.text ?? "" } }));
    } else if (o && !o.messages.some((m) => m.ts === j.ts)) {
      o.messages.push(this.normalize({ ...j.message, ts: j.ts, user: this.me.id, text }));
    }
    const c = this.convs.get(id);
    if (c) { c.ts = Number(j.ts) * 1000; c.lastTs = j.ts; c.preview = `You: ${text}`; this.cacheDirty = true; }
    this.seen[id] = j.ts;
    this.saveSeen();
    this.dirty = true;
  }

  // Add or take away your reaction. Reacting needs the reactions:write scope; a token
  // saved after adding it is picked up here without a restart.
  async react({ id, ts, name, add }) {
    const o = this.open;
    if (o) o.notice = null;
    const params = { channel: id, timestamp: ts, name };
    let j = await this.api(add ? "reactions.add" : "reactions.remove", params, true);
    if (!j.ok && j.error === "missing_scope") {
      const fresh = await this.readToken("user-token");
      if (fresh && fresh !== this.userToken) {
        this.userToken = fresh;
        j = await this.api(add ? "reactions.add" : "reactions.remove", params, true);
      }
    }
    if (!j.ok && j.error === "missing_scope") throw new Error("Reacting needs the reactions:write permission: gear menu → Fix permissions.");
    if (!j.ok && j.error !== "already_reacted" && j.error !== "no_reaction") throw new Error(`Slack says ${j.error}`);
    const m = this.open?.id === id ? this.open.messages.find((x) => x.ts === ts) : null;
    if (m) {
      const r = m.reactions.find((x) => x.name === name);
      if (add && !r) m.reactions.push({ name, count: 1, mine: true, ...this.customOf(name) });
      else if (add && r && !r.mine) { r.count += 1; r.mine = true; }
      else if (!add && r && r.mine) { r.count -= 1; r.mine = false; if (r.count <= 0) m.reactions = m.reactions.filter((x) => x !== r); }
    }
    this.dirty = true;
  }

  // What the panel draws, and the number for the tab button. A conversation's unread count is
  // "loud" (red, and counted on the tab) exactly when its messages would notify (shouldNotify,
  // pause aside): muted → @mentions only; Nothing → never; @mentions → mentions and direct
  // messages; All → everything.
  publish() {
    if (this.cacheDirty) {
      this.cacheDirty = false;
      const kept = {};
      for (const c of this.convs.values()) if (c.ts) kept[c.id] = { ts: c.ts, preview: c.preview };
      try { localStorage.setItem("cache", JSON.stringify(kept)); } catch (_) {}
    }
    if (this.pauseUntil && Date.now() >= this.pauseUntil) {
      this.pauseUntil = 0;
      try { localStorage.setItem("pauseUntil", "0"); } catch (_) {}
      this.dirty = true;
    }
    if (this.mediaIndexDirty) {
      this.mediaIndexDirty = false;
      try { localStorage.setItem("media", JSON.stringify(this.mediaIndex)); } catch (_) {}
    }
    if (this.faceIndexDirty) {
      this.faceIndexDirty = false;
      try { localStorage.setItem("faceIndex", JSON.stringify(this.faceIndex)); } catch (_) {}
    }
    if (this.note && Date.now() > this.note.until) { this.note = null; this.dirty = true; }
    if (!this.dirty) return;
    this.dirty = false;
    this.placeAll();
    const convs = [...this.convs.values()].map((c) => {
      const p = this.prefs[c.id] ?? {}, level = p.level ?? defaultLevel(c.kind), muted = Boolean(p.muted);
      const loud = muted ? c.mention : level === "all" || (level === "mentions" && (c.mention || c.kind === "im"));
      return { id: c.id, kind: c.kind, title: c.title ?? c.name, titleParts: c.titleParts ?? null, members: c.members ?? 0, app: c.kind === "im" && this.bots.has(c.user), unread: c.unread, loud: loud && c.unread > 0 ? c.unread : 0, mention: c.mention, preview: c.preview, ts: c.ts, user: c.user, muted, level, rank: this.rank[c.id] ?? null };
    });
    const loud = convs.reduce((n, c) => n + c.loud, 0);
    const sections = this.sections.map((s) => {
      const custom = /^:([^\s:]+):$/.exec(s.emoji);
      return { id: s.id, name: s.name, emoji: s.emoji, emojiPic: custom ? this.customOf(custom[1])?.pic ?? null : null, collapsed: s.collapsed, ruled: s.rules.length > 0 };
    });
    // The list is grouped again only when this changes, not on every picture or download.
    const listKey = hashOf(JSON.stringify([convs, sections, this.placed])).toString(36);
    setShared(STATE, { listKey, note: this.note ? { text: this.note.text, error: Boolean(this.note.error) } : null, me: this.me?.id ?? null, owner: this.me ? this.owner : null, status: this.status, error: this.error, team: this.team, teamUrl: this.teamUrl, convs, open: this.open, result: this.result, soundOn: this.soundOn, pauseUntil: this.pauseUntil, scopedAt: this.scopedAt ?? 0, avatars: this.avatars, media: this.media, sections, placed: this.placed, short: this.short, downloads: this.downloads, clips: this.clips, gen: this.gen, needs: this.needs, has: this.has, missing: this.missing, markDenied: this.markDenied ?? null, profile: this.profile });
    setShared(UNREAD, loud);
  }

  // ── panel: draw ────────────────────────────────────────────────────────────────────────
  render(cx) {
    if (this.isBg) return div().size(0);
    // shared(STATE) copies the whole published state into JS on every call: read it once per
    // render and hand it down, or a long conversation trips the render watchdog.
    const t = theme(), S = shared(STATE);
    this.S = S;
    this.dark = settings()?.dark !== false;
    this.av = S?.avatars ?? {};
    if (this.viewer) return this.viewerView(t, S);
    if (this.profileUid) return this.profileView(t, S);
    const root = v_flex().id("slack").size_full().min_h(0).overflow_hidden().bg(t.background).text_size(13).text_color(t.muted);
    if (!S) return root.child(this.header(t, null)).child(this.message(t, "Connecting to Slack…"));
    // Setup opens by itself while a token is missing or rejected, unless closed for this start.
    if (S.status === "setup" && !this.wiz && this.closedGen !== S.gen) this.wiz = newWizard(S);
    if (this.wiz) return root.child(this.header(t, S)).child(renderSetup(this, t, S, cx));
    const setupButton = (label) => h_flex().px(16).child(button(t, "sl-setup-open", label, (_e, cx) => { this.wiz = newWizard(shared(STATE)); cx.notify(); }, { primary: true, icon: "key" }));
    if (S.status === "setup") return root.child(this.header(t, S)).child(v_flex().child(this.message(t, "Slack isn't set up.", S.error ?? "Two tokens connect this panel to your workspace.")).child(setupButton("Set up Slack")));
    if (S.status === "error") return root.child(this.header(t, S)).child(v_flex().child(this.message(t, "Couldn't connect to Slack.", S.error)).child(setupButton("Check the tokens")));
    // The body says what it shows (this.wants) as it is built; the background fetches that.
    this.wants = [];
    const body = S.open ? this.conversation(t, S) : this.list(t, S);
    this.wantNow(S);
    return root.child(this.header(t, S))
      .when(Boolean(S.open) && this.notifOpen === S.open?.id, (el) => el.child(this.notifMenu(t, S)))
      .when((S.pauseUntil ?? 0) > Date.now(), (el) => el.child(this.pausedBar(t, S)))
      .when(this.menu && !S.open, (el) => el.child(this.menuBar(t, S)))
      .when(!S.open && ((S.missing?.length ?? 0) > 0 || Boolean(S.markDenied)), (el) => el.child(this.missingBar(t, S)))
      .child(body);
  }

  // A conversation's notifications, as Slack offers them: every new message, just @mentions,
  // or nothing; and mute.
  notifMenu(t, S) {
    const o = S.open, c = S.convs.find((x) => x.id === o.id) ?? {}, level = c.level ?? defaultLevel(c.kind);
    const dm = o.kind === "im";
    const option = (id, label, hint, chosen, onClick) => h_flex().id(id).h(hint ? 38 : 30).px(8).gap(8).items_center().rounded(4).cursor_pointer()
      .hover((s) => s.bg(t.hover)).on_click((_e, cx) => { onClick(); cx.notify(); })
      .child(div().size(14).flex_none().rounded_full().border(1).border_color(chosen ? t.accent : t.input).flex().items_center().justify_center()
        .when(chosen, (e) => e.child(div().size(6).rounded_full().bg(t.accent))))
      .child(v_flex().flex_1().min_w(0)
        .child(div().text_size(12.5).text_color(t.foreground).child(label))
        .when(Boolean(hint), (e) => e.child(div().truncate().text_size(11).text_color(t.dim).child(hint))));
    const set = (patch) => this.command({ type: "notif", id: o.id, ...patch });
    return v_flex().flex_none().px(6).py(6).gap(1).bg(t.chrome).border_b(1).border_color(t.border)
      .child(div().px(8).pb(2).text_size(10.5).font_semibold().text_color(t.dim).child("NOTIFY ME ABOUT"))
      .child(option("sl-n-all", dm ? "Every new message" : "Every new message", null, level === "all" && !c.muted, () => set({ level: "all", muted: false })))
      .when(!dm, (el) => el.child(option("sl-n-men", "Just @mentions", "And @here, @channel", level === "mentions" && !c.muted, () => set({ level: "mentions", muted: false }))))
      .child(option("sl-n-none", "Nothing", null, level === "nothing" && !c.muted, () => set({ level: "nothing", muted: false })))
      .child(div().h(1).mx(8).my(4).bg(t.border))
      .child(h_flex().id("sl-n-mute").h(38).px(8).gap(8).items_center().rounded(4).cursor_pointer().hover((s) => s.bg(t.hover))
        .on_click((_e, cx) => { set({ muted: !c.muted }); cx.notify(); })
        .child(svg(ICON(c.muted ? "bell" : "bell-off")).size(14).flex_none().text_color(t.dim))
        .child(v_flex().flex_1().min_w(0)
          .child(div().text_size(12.5).text_color(t.foreground).child(c.muted ? `Unmute ${dm ? "conversation" : "channel"}` : `Mute ${dm ? "conversation" : "channel"}`))
          .child(div().truncate().text_size(11).text_color(t.dim).child(c.muted ? "Toasts and counts come back" : "No toasts or counts; @mentions still come through"))));
  }

  // Every toast paused: until when, and Resume.
  pausedBar(t, S) {
    const until = S.pauseUntil, day = dayLabel(until);
    return h_flex().flex_none().px(10).py(6).gap(8).items_center().bg(t.chrome).border_b(1).border_color(t.border).text_size(12).text_color(t.muted)
      .child(svg(ICON("moon")).size(13).flex_none().text_color(t.dim))
      .child(div().flex_1().min_w(0).truncate().child(`Notifications paused until ${clock(until)}${day === "Today" ? "" : ` ${day.toLowerCase()}`}`))
      .child(div().id("sl-resume").flex_none().font_medium().cursor_pointer().text_color(LINK).hover((s) => s.underline())
        .on_click((_e, cx) => { this.command({ type: "pause", until: 0 }); cx.notify(); }).child("Resume"));
  }

  // The gear menu, as a row under the header.
  menuBar(t, S) {
    return h_flex().flex_none().px(8).py(6).gap(6).flex_wrap().bg(t.chrome).border_b(1).border_color(t.border)
      .child(button(t, "sl-m-reload", "Reconnect", (_e, cx) => { this.command({ type: "reload" }); this.menu = false; cx.notify(); }, { icon: "refresh" }))
      .child(button(t, "sl-m-tokens", "Change tokens…", (_e, cx) => { this.wiz = newWizard(S); this.menu = false; cx.notify(); }, { icon: "key" }))
      .child(button(t, "sl-m-pause", "Pause notifications", (_e, cx) => { this.pauseOpen = !this.pauseOpen; cx.notify(); }, { icon: "moon" }))
      .when(Boolean(this.pauseOpen), (el) => {
        const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(9, 0, 0, 0);
        const pick = (id, label, until) => button(t, id, label, (_e, cx) => { this.command({ type: "pause", until }); this.pauseOpen = false; this.menu = false; cx.notify(); }, { primary: true });
        return el.child(h_flex().w_full().gap(6).flex_wrap().pl(4)
          .child(pick("sl-p-30", "30 minutes", Date.now() + 30 * 60000))
          .child(pick("sl-p-60", "1 hour", Date.now() + 60 * 60000))
          .child(pick("sl-p-120", "2 hours", Date.now() + 120 * 60000))
          .child(pick("sl-p-tom", "Until tomorrow 9 AM", tomorrow.getTime())));
      })
      .child(button(t, "sl-m-sound", S.soundOn === false ? "Sound off" : "Sound on", (_e, cx) => { this.command({ type: "sound", on: S.soundOn === false }); cx.notify(); }, { icon: S.soundOn === false ? "volume-x" : "volume-2" }))
      .child(button(t, "sl-m-fix", "Fix permissions…", (_e, cx) => { this.wiz = newWizard(S, true); this.menu = false; cx.notify(); }))
      .child(button(t, "sl-m-secs", "Edit sections.json", (_e, cx) => { this.editSectionsFile(cx); this.menu = false; cx.notify(); }, { icon: "file" }))
      .child(div().w_full().pl(4).text_size(11).text_color(t.dim).child("Sections are set up here: drag a conversation onto one, use the ⋯ menus, or edit sections.json."))
      .child(button(t, "sl-m-out", this.signoutArmed ? "Sure? Sign out" : "Sign out", (_e, cx) => {
        if (!this.signoutArmed) {
          this.signoutArmed = true;
          cx.timer.after(4000, (cx) => { this.signoutArmed = false; cx.notify(); });
          cx.notify();
          return;
        }
        this.signOut(cx);
      }));
  }

  // The picture dialog: the larger copy once it's down (the thumbnail stretched until then),
  // fitted to the dialog, with Download, Open in browser (its Slack page) and Close.
  viewerView(t, S) {
    const v = this.viewer, big = v.big && S?.media?.[v.big.key], small = v.thumb && S?.media?.[v.thumb.key];
    const shape = v.big ?? v.thumb, area = this.viewSize ?? { width: 0, height: 0 };
    const k = shape?.w && shape?.h && area.width ? Math.min((area.width - 24) / shape.w, (area.height - 60) / shape.h, 2) : 0;
    const w = Math.max(1, Math.round((shape?.w ?? 0) * k)), h = Math.max(1, Math.round((shape?.h ?? 0) * k));
    const d = S?.downloads?.[v.file?.id], clip = S?.clips?.[v.file?.id];
    const tool = (id, icon, tip, onClick) => div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(4).cursor_pointer()
      .text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground)).tooltip(tip)
      .on_click((_e, cx) => { cx.stop_propagation(); onClick(cx); cx.notify(); })
      .child(svg(ICON(icon)).size(14));
    const path = big || small;
    return v_flex().id("sl-viewer").size_full().bg(t.background).text_size(13).text_color(t.muted)
      .on_size_change((s, cx) => { if (Math.abs(s.width - (this.viewSize?.width ?? 0)) > 0.5 || Math.abs(s.height - (this.viewSize?.height ?? 0)) > 0.5) { this.viewSize = s; cx.notify(); } })
      .child(h_flex().h(40).flex_none().px(12).gap(6).items_center().border_b(1).border_color(t.border).bg(t.chrome)
        .child(svg(ICON("image")).size(14).flex_none().text_color(t.dim))
        .child(div().flex_1().min_w(0).truncate().font_semibold().text_color(t.foreground).child(v.name ?? "Picture"))
        .when(Boolean(v.big) && !big, (el) => el.child(div().flex_none().text_size(11.5).text_color(t.dim).child("Loading full size…")))
        .when(Boolean(d?.state), (el) => el.child(div().flex_none().text_size(11.5).text_color(d.state === "error" ? t.blocked : t.dim)
          .child(d.state === "busy" ? "Downloading…" : d.state === "done" ? "Saved to Downloads" : d.error)))
        .when(Boolean(clip?.state), (el) => el.child(div().flex_none().max_w(320).truncate().text_size(11.5).text_color(clip.state === "error" ? t.blocked : t.dim)
          .child(clip.state === "busy" ? "Copying…" : clip.state === "done" ? "Copied" : clip.error)))
        .when(Boolean(v.file?.url) && d?.state !== "busy", (el) => el.child(tool("sl-v-dl", "download", "Download to Downloads", () => this.command({ type: "download", file: v.file }))))
        .when(Boolean(v.file?.id) && appWindow().platform !== "windows" && clip?.state !== "busy", (el) => el.child(tool("sl-v-copy", clip?.state === "done" ? "check" : "copy", "Copy image", () => this.command({ type: "copyimage", file: v.file }))))
        .when(Boolean(v.link), (el) => el.child(tool("sl-v-link", this.linkCopied === v.file?.id ? "check" : "link", "Copy link", (cx) => this.copyLink(v.file?.id, v.link, cx))))
        .when(Boolean(v.link), (el) => el.child(tool("sl-v-open", "external-link", "Open in browser", (cx) => this.openLink(v.link, cx))))
        .child(tool("sl-v-close", "x", "Close (Esc)", () => { if (this.overlayId) closeOverlay(this.overlayId); })))
      .child(div().flex_1().min_h(0).flex().items_center().justify_center().overflow_hidden()
        .child(path && k ? image(path).w(w).h(h).flex_none() : div().text_size(12).text_color(t.dim).child(path ? "" : "Loading…")));
  }

  // Someone's card, in a popup by the pointer: picture, names, title, status, their local time,
  // presence and email when Slack gives them; Message and Open in Slack.
  profileView(t, S) {
    const uid = this.profileUid, P = S?.profile?.uid === uid ? S.profile : null;
    const close = () => { if (this.overlayId) closeOverlay(this.overlayId); };
    const root = v_flex().id("sl-profile").size_full().p(14).gap(8).bg(t.background).text_size(12.5).text_color(t.muted);
    if (!P || P.loading) return root.child(div().text_color(t.dim).child("Loading…"));
    if (P.error) return root.child(div().text_color(t.blocked).child(P.error));
    const path = P.pic && S.media?.[P.pic.key];
    const picture = path ? image(path).size(72).flex_none().rounded(10) : this.face(t, uid, P.name, 72);
    let local = null;
    if (P.tzOffset != null) {
      const d = new Date(Date.now() + P.tzOffset * 1000), h = d.getUTCHours(), mi = String(d.getUTCMinutes()).padStart(2, "0");
      local = `${h % 12 || 12}:${mi} ${h < 12 ? "AM" : "PM"}${P.tzLabel ? ` · ${P.tzLabel}` : ""}`;
    }
    const line = (icon, text) => h_flex().gap(6).items_center().child(svg(ICON(icon)).size(12).flex_none().text_color(t.dim)).child(div().flex_1().min_w(0).truncate().child(text));
    const act = (id, label, icon, onClick, primary) => div().id(id).h(28).px(10).flex().gap(6).items_center().rounded(5).cursor_pointer().text_size(12)
      .when(primary, (e) => e.bg(t.solid ?? t.accent).text_color(t.solid_foreground ?? t.accent_foreground))
      .when(!primary, (e) => e.bg(t.raised).border(1).border_color(t.input).text_color(t.foreground).hover((s) => s.bg(t.hover)))
      .on_click((_e, cx) => { cx.stop_propagation(); onClick(cx); })
      .child(svg(ICON(icon)).size(13)).child(label);
    return root
      .child(h_flex().gap(12).items_center()
        .child(picture)
        .child(v_flex().flex_1().min_w(0).gap(2)
          .child(h_flex().gap(6).items_center()
            .child(div().min_w(0).truncate().text_size(15).font_semibold().text_color(t.foreground).child(P.name))
            .when(P.presence === "active", (el) => el.child(div().size(8).flex_none().rounded_full().bg(t.done).tooltip("Active")))
            .when(P.presence === "away", (el) => el.child(div().size(8).flex_none().rounded_full().border(1).border_color(t.dim).tooltip("Away"))))
          .when(Boolean(P.real) && P.real !== P.name, (el) => el.child(div().truncate().text_color(t.dim).child(P.real)))
          .when(Boolean(P.title), (el) => el.child(div().truncate().child(P.title)))))
      .when(Boolean(P.status), (el) => el.child(div().px(8).py(5).rounded(5).bg(t.raised).child(P.status)))
      .when(Boolean(local), (el) => el.child(line("clock", `Local time ${local}`)))
      .when(Boolean(P.email), (el) => el.child(line("at-sign", P.email)))
      .when(P.deleted, (el) => el.child(div().text_color(t.dim).child("This account is deactivated.")))
      .child(div().flex_1())
      .child(h_flex().gap(6).flex_wrap()
        .when(!P.deleted, (el) => el.child(act("sl-pr-dm", "메시지 보내기", "message-square", () => { this.command({ type: "dm", uid }); close(); }, true)))
        .when(Boolean(P.link), (el) => el.child(act("sl-pr-open", "Slack에서 열기", "external-link", (cx) => { this.openLink(P.link, cx); close(); }, false))));
  }

  // A person's card opens by the pointer; the background loads it (loadProfile).
  openProfile(uid, cx) {
    if (!/^[UW][A-Z0-9]{2,20}$/.test(uid ?? "")) return;
    this.command({ type: "profile", uid });
    openOverlay({ mod: NAME, props: { profile: uid }, kind: "popup", width: 320, height: 300 });
    cx.notify();
  }

  // A #channel in a message: opened here when it is one of yours, else its Slack page.
  openChannel(id, cx) {
    const S = this.S;
    if (S?.convs?.some((c) => c.id === id)) { this.command({ type: "goto", id }); return; }
    if (S?.teamUrl && /^[CG][A-Z0-9]{2,20}$/.test(id)) this.openLink(`${S.teamUrl}archives/${id}`, cx);
  }

  // The user token lacks a permission: say what is off, and offer the fix. Read marks first:
  // without them the counts here and in Slack quietly part ways.
  missingBar(t, S) {
    // Yellow background with dark text, in light and dark themes alike.
    const ink = "#1c1a16", missing = S.missing ?? [];
    const markOff = Boolean(S.markDenied) || missing.some((m) => MARK_SCOPES.has(m.scope));
    const tip = [...missing.map((m) => m.scope), ...(S.markDenied && S.markDenied !== "write" ? [S.markDenied] : [])].join(", ");
    return h_flex().flex_none().px(10).py(6).gap(8).items_center().bg(t.working).text_size(12).text_color(ink)
      .child(svg(ICON("triangle-alert")).size(13).flex_none())
      .child(div().flex_1().min_w(0).truncate().font_medium().tooltip(tip || "conversations.mark")
        .child(markOff ? "Slack에 읽음을 반영하려면 권한을 다시 받아야 해요" : `No ${missing.map((m) => m.what).join(", ")}: permission missing`))
      .child(div().id("sl-fix").flex_none().px(8).h(20).flex().items_center().rounded(4).font_semibold().cursor_pointer().bg("#1c1a1622").hover((s) => s.bg("#1c1a1640"))
        .on_click((_e, cx) => { this.wiz = newWizard(S, true); cx.notify(); }).child("Fix permissions"));
  }

  face(t, uid, name, size, color) {
    const path = this.av?.[uid];
    if (path) return image(path).size(size).flex_none().rounded(Math.round(size / 6));
    return div().size(size).flex_none().rounded(Math.round(size / 6)).flex().items_center().justify_center()
      .text_size(Math.max(9, Math.round(size * 0.48))).font_semibold().bg(color ?? t.raised).text_color(t.background)
      .child(String(name || "?").replace(/^@/, "").slice(0, 1).toUpperCase());
  }

  // A file: what it is and how big, a download button, and once it's down Open and Show
  // in folder. A file kept outside Slack (Google Drive and the like) opens in the browser.
  fileCard(t, f) {
    const d = this.S?.downloads?.[f.id], img = /^image\//.test(f.mime);
    const tool = (id, icon, tip, onClick) => div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(4).cursor_pointer()
      .text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground)).tooltip(tip)
      .on_click((_e, cx) => { cx.stop_propagation(); onClick(cx); cx.notify(); })
      .child(svg(ICON(icon)).size(14));
    const detail = d?.state === "busy" ? "Downloading…" : d?.state === "done" ? "Saved to Downloads" : d?.state === "error" ? d.error
      : [f.type, sizeOf(f.size)].filter(Boolean).join(" · ") || "File";
    const showInFolder = (path) => {
      const os = appWindow().platform;
      if (os === "macos") exec("open", ["-R", path]).catch(() => {});
      else if (os === "windows") exec("explorer", [`/select,${path.replace(/\//g, "\\")}`]).catch(() => {});
      else this.cxOpen?.(fileUrl(path.slice(0, path.lastIndexOf("/"))));
    };
    return h_flex().id(`sl-f-${f.id}`).mt(4).max_w(340).p(6).pr(4).gap(8).items_center().rounded(6).border(1).border_color(t.input).bg(t.raised)
      .child(div().size(32).flex_none().rounded(5).bg(t.background).flex().items_center().justify_center().text_color(t.dim)
        .child(svg(ICON(img ? "image" : "file")).size(16)))
      .child(v_flex().flex_1().min_w(0)
        .child(div().truncate().text_size(12.5).font_medium().text_color(t.foreground).child(f.name))
        .child(div().truncate().text_size(11).text_color(d?.state === "error" ? t.blocked : d?.state === "done" ? t.done : t.dim).tooltip(detail).child(detail)))
      .when(f.external && Boolean(f.link), (el) => el.child(tool(`sl-fo-${f.id}`, "external-link", "Open in the browser", (cx) => this.openLink(f.link, cx))))
      .when(!f.external && d?.state === "done", (el) => el
        .child(tool(`sl-fo-${f.id}`, "external-link", "Open", (cx) => cx.open_url(fileUrl(d.path))))
        .child(tool(`sl-fs-${f.id}`, "folder-open", "Show in folder", (cx) => { this.cxOpen = (u) => cx.open_url(u); showInFolder(d.path); })))
      .when(!f.external && Boolean(f.url) && d?.state !== "done", (el) => el.child(d?.state === "busy"
        ? div().size(26).flex_none().flex().items_center().justify_center().text_color(t.dim).child(svg(ICON("download")).size(14).opacity(0.5))
        : tool(`sl-fd-${f.id}`, "download", d?.state === "error" ? "Try again" : `Download to Downloads`, () => this.command({ type: "download", file: f }))));
  }

  message(t, title, hint) {
    return v_flex().flex_1().p(16).gap(6)
      .child(div().text_color(t.foreground).font_medium().child(title))
      .when(Boolean(hint), (el) => el.child(div().text_size(12).text_color(t.dim).child(hint)));
  }

  header(t, S) {
    const open = S?.open;
    const live = S?.status === "live";
    const dot = div().size(7).flex_none().rounded_full().bg(live ? t.done : S?.status === "reconnecting" ? t.working : t.dim);
    return h_flex().h(36).flex_none().px(12).gap(8).items_center().bg(t.chrome).border_b(1).border_color(t.border)
      .when(Boolean(open), (el) => el
        .child(div().id("sl-back").size(22).flex_none().flex().items_center().justify_center().rounded(4).cursor_pointer().bg(t.raised).text_color(t.dim)
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).tooltip("Back to conversations")
          .on_click((_e, cx) => { this.command({ type: "close" }); cx.notify(); })
          .child(svg(ICON("chevron-left")).size(14)))
        .child(svg(ICON(KIND_ICON[open.kind] ?? "hash")).size(14).flex_none().text_color(t.dim))
        .child(this.title(t, S.convs.find((x) => x.id === open.id) ?? open, { size: 13, bold: true }))
        .child((() => {
          const c = S.convs.find((x) => x.id === open.id) ?? {}, quiet = c.muted || c.level === "nothing", on = this.notifOpen === open.id;
          return div().id("sl-notif").size(22).flex_none().flex().items_center().justify_center().rounded(4).cursor_pointer()
            .text_color(on ? t.foreground : quiet ? t.dim : t.muted).when(on, (e) => e.bg(t.raised)).hover((s) => s.bg(t.hover).text_color(t.foreground))
            .tooltip(c.muted ? "Muted" : c.level === "nothing" ? "Notifications off" : c.level === "mentions" ? "Just @mentions" : "Notifications")
            .on_click((_e, cx) => { this.notifOpen = on ? null : open.id; cx.notify(); })
            .child(svg(ICON(quiet ? "bell-off" : c.level === "mentions" ? "at-sign" : "bell")).size(13));
        })()))
      .when(!open, (el) => el
        .child(div().font_semibold().text_color(t.foreground).child("Slack"))
        .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.dim).child(S?.team ?? "")))
      .when(!open && !this.wiz && Boolean(S?.has?.app || S?.has?.user), (el) => el.child(div().id("sl-gear").size(22).flex_none().flex().items_center().justify_center().rounded(4).cursor_pointer()
        .text_color(this.menu ? t.foreground : t.dim).when(this.menu, (e) => e.bg(t.raised)).hover((s) => s.bg(t.hover).text_color(t.foreground)).tooltip("Slack settings")
        .on_click((_e, cx) => { this.menu = !this.menu; this.signoutArmed = false; cx.notify(); })
        .child(svg(ICON("settings")).size(13))))
      .child(h_flex().flex_none().gap(5).items_center().text_size(11).text_color(t.dim)
        .tooltip(S?.error ? S.error : live ? "Connected" : "Connecting")
        .child(dot).child(live ? "live" : S?.status === "reconnecting" ? "reconnecting" : "…"));
  }

  keepList() {
    try {
      localStorage.setItem("folded", JSON.stringify([...this.folded]));
      localStorage.setItem("order", this.sortAlpha ? "alpha" : "recent");
    } catch (_) {}
  }

  // The groups, as in Slack's sidebar: your sections (sections.json), then Channels, Direct
  // messages (group ones too) and Apps for the rest. A section keeps the order it lists its
  // conversations in; the ones a rule brought in follow, A–Z or newest first, muted ones last.
  // Worked out again only when the published state, the filter, the sort or the view changes.
  groupsOf(S, q) {
    const onlyLit = this.view === "unreads" && !q;
    const key = `${S.listKey}|${q}|${this.sortAlpha}|${onlyLit}`;
    if (this.groupCache?.key === key) return this.groupCache;
    const quiet = (c) => c.muted || c.level === "nothing";
    // Bold when there is something new you'd want to see; the red count is only for what
    // would notify you (c.loud, worked out with the bell's own rule in publish).
    const lit = (c) => c.unread > 0 && (!quiet(c) || c.loud > 0);
    const groups = [
      ...(S.sections ?? []).map((s) => ({ id: s.id, label: s.name, emoji: s.emoji, emojiPic: s.emojiPic, collapsed: s.collapsed, custom: true })),
      { id: "ch", label: "Channels" }, { id: "dm", label: "Direct messages" }, { id: "app", label: "Apps" },
    ].map((g) => ({ ...g, rows: [], unread: 0, muted: 0 }));
    const byId = new Map(groups.map((g) => [g.id, g])), placed = S.placed ?? {};
    let litCount = 0;
    for (const c of S.convs) {
      const on = lit(c);
      if (on) litCount += 1;
      // Conversations Slack has gone quiet in (no message found) stay out until you search for
      // them, unless a section lists them by name.
      if (q ? !c.title.toLowerCase().includes(q) : !(c.ts > 0) && c.rank == null) continue;
      if (onlyLit && !on) continue;
      const g = byId.get(placed[c.id]) ?? byId.get(c.kind === "channel" || c.kind === "group" ? "ch" : c.app ? "app" : "dm");
      g.rows.push({ ...c, quiet: quiet(c), lit: on });
      g.unread += c.loud ?? 0;
      if (c.muted) g.muted += 1;
    }
    const order = this.sortAlpha ? (a, b) => a.title.localeCompare(b.title) : (a, b) => b.ts - a.ts;
    for (const g of groups) g.rows.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.quiet - b.quiet || order(a, b));
    this.groupCache = { key, groups: groups.filter((g) => g.rows.length || (g.custom && !q && !onlyLit)), lit: litCount };
    return this.groupCache;
  }

  submitSection(cx) {
    const E = this.secEdit, name = this.secIn.value().trim();
    if (!E || (!name && E.mode !== "emoji")) return;
    this.command(E.mode === "new" ? { type: "section", op: "new", name, id: E.move ?? null }
      : E.mode === "emoji" ? { type: "section", op: "emoji", sid: E.sid, emoji: name }
      : { type: "section", op: "rename", sid: E.sid, name });
    this.secEdit = null;
    this.secIn.set_value("");
    cx.notify();
  }

  startSection(edit, value, cx) {
    this.secEdit = edit;
    this.rowMenu = null;
    this.secMenu = null;
    this.secIn.set_value(value);
    this.secIn.focus();
    cx.notify();
  }

  // A conversation's name; one with a workspace emoji in it was laid out in publish.
  title(t, c, { size = 13, color = t.foreground, bold = false } = {}) {
    const words = c.titleParts?.lines?.[0]?.w;
    const base = (el) => el.flex_1().min_w(0).text_size(size).text_color(color).when(bold, (e) => e.font_semibold());
    if (!words) return base(div()).truncate().child(c.title ?? "");
    return base(h_flex()).overflow_hidden().gap(3).items_center().children(words.map((w) => {
      if (w.t !== "emoji") return div().flex_none().child(w.s ?? "");
      const path = this.S?.media?.[w.pic?.key];
      return path ? image(path).size(Math.round(size * 1.3)).flex_none() : div().flex_none().child(`:${w.name}:`);
    }));
  }

  // The panel's own file editor hand-off: the file is made first when there is none yet, the
  // same way edits save it (create-only, then only you can read it). A stale snapshot means
  // someone else just made it, which is as good.
  editSectionsFile(cx) {
    cx.spawn(async (cx) => {
      const path = SECTIONS();
      if ((await readTextFile(path).catch(() => null)) == null) {
        const made = await writeTextFile(path, `${JSON.stringify({ sections: [] }, null, 2)}\n`, null).then(() => true, () => false);
        if (made && appWindow().platform !== "windows") await exec("chmod", ["600", path]).catch(() => null);
      }
      cx.open_url(fileUrl(path));
    });
  }

  list(t, S) {
    const q = this.filter.value().trim().toLowerCase();
    const { groups, lit } = this.groupsOf(S, q), children = [];
    const tool = (id, icon, tip, on, onClick) => div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(4).cursor_pointer()
      .text_color(on ? t.foreground : t.dim).when(on, (e) => e.bg(t.raised)).hover((s) => s.bg(t.hover).text_color(t.foreground)).tooltip(tip)
      .on_click((_e, cx) => { cx.stop_propagation(); onClick(cx); cx.notify(); })
      .child(svg(ICON(icon)).size(13));
    const line = (text, color = t.dim) => div().flex_none().px(10).py(8).text_size(12).text_color(color).child(text);
    // Threads and Saved need a permission the token may not have; they show only once the check
    // has said it's there.
    const granted = (scope) => Array.isArray(S.missing) && !S.missing.some((m) => m.scope === scope);
    const views = [["unreads", "message-square-dot", "Unreads", lit], ...(granted("search:read") ? [["threads", "message-square-reply", "Threads", 0]] : []), ...(granted("stars:read") ? [["saved", "bookmark", "Saved", 0]] : [])];
    if (this.view && !views.some(([id]) => id === this.view)) this.view = null;
    if (!q) {
      for (const [id, icon, label, count] of views) {
        const on = this.view === id;
        children.push(h_flex().id(`sl-v-${id}`).flex_none().h(28).px(8).gap(8).items_center().rounded(4).cursor_pointer()
          .text_size(13).text_color(on || count ? t.foreground : t.muted).when(on, (el) => el.bg(t.selected)).hover((s) => s.bg(t.hover))
          .on_click((_e, cx) => {
            this.view = on ? null : id;
            this.rowMenu = null;
            this.secMenu = null;
            if (!on && id !== "unreads") this.command({ type: "shortcut", kind: id });
            cx.notify();
          })
          .child(div().w(18).flex_none().flex().items_center().justify_center().child(svg(ICON(icon)).size(15)))
          .child(div().flex_1().min_w(0).truncate().when(count > 0, (el) => el.font_semibold()).child(label))
          .when(count > 0, (el) => el.child(div().flex_none().text_size(11).text_color(t.dim).child(String(count)))));
      }
      children.push(div().flex_none().h(1).mx(8).my(6).bg(t.border));
    }
    if (this.secEdit) children.push(this.sectionInput(t));
    if (!q && (this.view === "threads" || this.view === "saved")) {
      const R = S.short?.kind === this.view ? S.short : null;
      if (!R || R.loading) children.push(line("Loading…"));
      else if (R.error) children.push(line(R.error, t.blocked));
      else if (!R.items.length) children.push(line(this.view === "threads" ? "No threads with you in them yet." : "Nothing saved yet."));
      else R.items.forEach((it, i) => children.push(this.shortRow(t, it, i)));
    } else {
      if (this.view === "unreads" && !q && !groups.length) children.push(line("Nothing unread."));
      for (const g of groups) this.groupRows(t, S, g, q, children);
    }
    return v_flex().flex_1().min_h(0)
      .child(h_flex().flex_none().mx(8).mt(8).mb(4).gap(4).items_center()
        .child(div().relative().flex_1().min_w(0)
          .child(Input.new(this.filter).h(26).px(9).rounded(4).border(1).border_color(t.input).bg(t.canvas ?? t.background).text_size(12).text_color(t.foreground))
          .when(this.filterEmpty, (el) => el.child(div().absolute().left(10).top(0).h(26).flex().items_center().text_size(12).text_color(t.dim).child("Filter conversations"))))
        .child(tool("sl-sort", this.sortAlpha ? "arrow-down-a-z" : "clock", this.sortAlpha ? "Sorted A–Z (click for newest first)" : "Newest first (click for A–Z)", false, () => { this.sortAlpha = !this.sortAlpha; this.keepList(); }))
        .child(tool("sl-newsec", "plus", "New section", false, (cx) => this.startSection({ mode: "new" }, "", cx))))
      .when(Boolean(S.note), (el) => el.child(div().flex_none().mx(8).mb(4).text_size(11.5).text_color(S.note.error ? t.blocked : t.dim).child(S.note.text)))
      // gpui-kit has no drag and drop between elements, so a drag is followed by hand: a press on
      // a row, a move of a few pixels, then a release over a section (its header or any of its
      // rows) moves the conversation there.
      .child(v_flex().id("sl-rows").flex_1().min_h(0).overflow_y_scroll().px(4).pb(6)
        .on_mouse_move((e, cx) => {
          const d = this.drag;
          if (d && !d.live && Math.hypot(e.position.x - d.x, e.position.y - d.y) > 6) { d.live = true; this.rowMenu = null; this.secMenu = null; cx.notify(); }
        })
        .on_mouse_up("left", (_e, cx) => this.endDrag(S, cx))
        .on_hover((on, cx) => { if (!on && this.drag) { this.drag = null; this.dropOn = null; cx.notify(); } })
        .children(children)
        .when(!groups.length && !this.secEdit && !this.view, (el) => el.child(line(q ? "No conversation matches." : S.status === "starting" || S.status === "loading" ? "Loading conversations…" : "No conversations yet."))));
  }

  // Where a dragged conversation may go: one of your sections, or back to its usual group.
  dropSid(S, cid, gid) {
    const c = S.convs.find((x) => x.id === cid);
    if (!c || !gid) return undefined;
    if ((S.sections ?? []).some((s) => s.id === gid)) return gid;
    const home = c.kind === "channel" || c.kind === "group" ? "ch" : c.app ? "app" : "dm";
    return gid === home ? null : undefined;
  }

  endDrag(S, cx) {
    const d = this.drag, gid = this.dropOn;
    this.drag = null;
    this.dropOn = null;
    if (!d?.live) return;
    // The release also ends as a click on the row under it; that click must not open it.
    this.dragEnded = Date.now();
    const sid = this.dropSid(S, d.id, gid);
    if (sid !== undefined && (S.placed?.[d.id] ?? null) !== sid) this.command({ type: "section", op: "move", id: d.id, sid });
    cx.notify();
  }

  // While a drag is on, the pointer over a group (its header or one of its rows) marks it.
  dragOver(gid, on, cx) {
    if (!this.drag?.live) return;
    if (on) this.dropOn = gid;
    else if (this.dropOn === gid) this.dropOn = null;
    cx.notify();
  }

  // A group's header and rows. Clicking the header folds it (one of your sections remembers
  // that in sections.json); folded, it still shows its unread conversations, as Slack does.
  groupRows(t, S, g, q, children) {
    const folded = g.custom ? g.collapsed : this.folded.has(g.id);
    const open = Boolean(q) || this.view === "unreads" || !folded, menu = this.secMenu === g.id, over = this.secHover === g.id || menu;
    const allMuted = Boolean(g.custom) && g.rows.length > 0 && g.muted === g.rows.length;
    const toggleMenu = (cx) => { this.secMenu = menu ? null : g.id; this.rowMenu = null; cx.notify(); };
    const pic = g.emojiPic && S.media?.[g.emojiPic.key];
    if (g.emojiPic && !pic) this.wants.push({ pic: g.emojiPic });
    const icon = pic ? image(pic).size(15).flex_none()
      : g.emoji ? div().text_size(13).child(g.emoji)
      : svg(ICON("list")).size(14).text_color(t.dim);
    const target = Boolean(this.drag?.live) && this.dropOn === g.id && this.dropSid(S, this.drag.id, g.id) !== undefined;
    children.push(h_flex().id(`sl-g-${g.id}`).flex_none().h(28).mt(4).px(8).gap(8).items_center().rounded(4).cursor_pointer().text_size(13).text_color(t.muted)
      .hover((s) => s.bg(t.hover).text_color(t.foreground)).when(target, (el) => el.bg(t.selected).text_color(t.foreground))
      .on_hover((on, cx) => { if (on) this.secHover = g.id; else if (this.secHover === g.id) this.secHover = null; this.dragOver(g.id, on, cx); cx.notify(); })
      .on_click((_e, cx) => {
        // The release that ends a drag onto this header is not a click on it.
        if (Date.now() - (this.dragEnded ?? 0) < 400) return;
        if (g.custom) this.command({ type: "section", op: "collapse", sid: g.id, collapsed: !folded });
        else { if (folded) this.folded.delete(g.id); else this.folded.add(g.id); this.keepList(); }
        cx.notify();
      })
      // Right-click marks everything in the group read; Shift+right-click (or ⋯) opens the
      // menu of one of your sections.
      .on_mouse_down("right", (e, cx) => {
        cx.stop_propagation();
        if (g.custom && e.modifiers?.shift) return toggleMenu(cx);
        const ids = g.rows.filter((c) => c.unread > 0 || c.mention).map((c) => c.id);
        if (ids.length) this.command({ type: "markread", ids });
      })
      .when(g.rows.some((c) => c.unread > 0 || c.mention), (el) => el.tooltip("Right-click to mark all read"))
      .child(div().w(18).flex_none().flex().items_center().justify_center().child(icon))
      .child(div().min_w(0).truncate().font_medium().child(g.label))
      .when(folded && !q, (el) => el.child(svg(ICON("chevron-right")).size(11).flex_none().text_color(t.dim)))
      .when(allMuted, (el) => el.child(svg(ICON("bell-off")).size(10).flex_none().text_color(t.dim)))
      .child(div().flex_1())
      .when(!open && g.unread > 0, (el) => el.child(div().flex_none().px(5).rounded(8).bg(t.blocked).text_size(10.5).font_semibold().text_color("#ffffff").child(String(g.unread))))
      .when(Boolean(g.custom) && over, (el) => el.child(div().id(`sl-gm-${g.id}`).size(18).flex_none().flex().items_center().justify_center().rounded(4).text_color(t.dim)
        .hover((s) => s.bg(t.selected).text_color(t.foreground)).tooltip("Section options")
        .on_click((_e, cx) => { cx.stop_propagation(); toggleMenu(cx); })
        .child(svg(ICON("ellipsis")).size(13)))));
    if (menu) children.push(this.sectionMenu(t, g, folded, allMuted));
    const rows = open ? g.rows : g.rows.filter((c) => c.lit);
    if (open && g.custom && !g.rows.length) children.push(div().flex_none().px(34).pb(4).text_size(11.5).text_color(t.dim).child("Empty. Drag a conversation here, or use its ⋯ menu."));
    for (const c of rows.slice(0, SHOWN)) {
      children.push(this.row(t, c, g));
      this.wants.push(...this.rowWants(c));
      if (this.rowMenu === c.id) children.push(this.rowMenuView(t, S, c));
    }
  }

  // One thread or saved message: where, who and what; a click opens it (the thread, if any).
  shortRow(t, it, i) {
    return v_flex().id(`sl-si-${i}`).flex_none().px(8).py(6).gap(1).rounded(4).cursor_pointer().hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => { this.command({ type: "goto", id: it.id, ts: it.thread }); cx.notify(); })
      .child(h_flex().gap(8).items_center()
        .child(div().flex_1().min_w(0).truncate().text_size(12.5).font_medium().text_color(t.foreground).child(it.where))
        .child(div().flex_none().text_size(11).text_color(t.dim).child(ago(it.at))))
      .child(div().truncate().text_size(12).text_color(t.dim).child(it.who ? `${it.who}: ${it.text}` : it.text));
  }

  // Naming a section, renaming one or giving it an emoji: Enter saves, Esc cancels.
  sectionInput(t) {
    const E = this.secEdit;
    const title = E.mode === "new" ? (E.move ? "New section for this conversation" : "New section") : E.mode === "emoji" ? "Section emoji (🚨 or :rotating_light:; empty for none)" : "Rename section";
    return v_flex().flex_none().mx(4).my(4).p(8).gap(6).rounded(6).bg(t.chrome).border(1).border_color(t.border)
      .on_key_down((e, cx) => { if (e.keystroke === "escape") { cx.stop_propagation(); this.secEdit = null; cx.notify(); } })
      .child(div().text_size(11.5).font_semibold().text_color(t.dim).child(title))
      .child(Input.new(this.secIn).h(26).px(8).rounded(4).border(1).border_color(t.input).bg(t.canvas ?? t.background).text_size(12).text_color(t.foreground))
      .child(h_flex().gap(6)
        .child(this.chip(t, "sl-se-save", E.mode === "new" ? "Create" : "Save", true, (cx) => this.submitSection(cx)))
        .child(this.chip(t, "sl-se-cancel", "Cancel", false, () => { this.secEdit = null; })));
  }

  chip(t, id, label, on, onClick, icon) {
    return h_flex().id(id).h(24).px(8).gap(5).flex_none().items_center().rounded(4).cursor_pointer().text_size(11.5).font_medium()
      .when(on, (el) => el.bg(t.solid ?? t.accent).text_color(t.solid_foreground ?? t.accent_foreground))
      .when(!on, (el) => el.bg(t.raised).border(1).border_color(t.input).text_color(t.foreground).hover((s) => s.bg(t.hover)))
      .on_click((_e, cx) => { cx.stop_propagation(); onClick(cx); cx.notify(); })
      .when(Boolean(icon), (el) => el.child(svg(ICON(icon)).size(12)))
      .child(label);
  }

  // A conversation's menu, under its row: how it notifies (the same setting as the bell in
  // its header), mute, mark read, and which section it sits in.
  rowMenuView(t, S, c) {
    const close = () => { this.rowMenu = null; };
    const set = (patch) => { this.command({ type: "notif", id: c.id, ...patch }); };
    const home = c.kind === "channel" || c.kind === "group" ? "Channels" : c.app ? "Apps" : "Direct messages";
    const at = S.placed?.[c.id] ?? null;
    const label = (s) => div().w(52).flex_none().text_size(11).text_color(t.dim).child(s);
    return v_flex().flex_none().mx(4).mb(4).p(8).gap(6).rounded(6).bg(t.chrome).border(1).border_color(t.border)
      .child(h_flex().gap(6).flex_wrap().items_center()
        .child(label("Notify"))
        .child(this.chip(t, "sl-rm-all", "All", !c.muted && c.level === "all", () => set({ level: "all", muted: false })))
        .when(c.kind !== "im", (el) => el.child(this.chip(t, "sl-rm-men", "@mentions", !c.muted && c.level === "mentions", () => set({ level: "mentions", muted: false }))))
        .child(this.chip(t, "sl-rm-none", "Nothing", !c.muted && c.level === "nothing", () => set({ level: "nothing", muted: false }))))
      .child(h_flex().gap(6).flex_wrap().items_center()
        .child(label(""))
        .child(this.chip(t, "sl-rm-mute", c.muted ? "Unmute" : "Mute", false, () => set({ muted: !c.muted }), c.muted ? "bell" : "bell-off"))
        .when(c.unread > 0 || c.mention, (el) => el.child(this.chip(t, "sl-rm-read", "Mark read", false, () => { this.command({ type: "markread", id: c.id }); close(); }, "check"))))
      .child(h_flex().gap(6).flex_wrap().items_center()
        .child(label("Section"))
        .child(this.chip(t, "sl-rm-home", home, !at, () => { this.command({ type: "section", op: "move", id: c.id, sid: null }); close(); }))
        .children((S.sections ?? []).map((s) => this.chip(t, `sl-rm-s-${s.id}`, s.emoji && !s.emojiPic ? `${s.emoji} ${s.name}` : s.name, at === s.id, () => { this.command({ type: "section", op: "move", id: c.id, sid: s.id }); close(); })))
        .child(this.chip(t, "sl-rm-new", "New section…", false, (cx) => this.startSection({ mode: "new", move: c.id }, "", cx), "plus")));
  }

  // One of your sections' menu: rename, emoji, fold, order, mute everything in it, delete.
  // Rules that pull new conversations in are written in sections.json.
  sectionMenu(t, g, folded, allMuted) {
    const list = this.S?.sections ?? [], i = list.findIndex((s) => s.id === g.id);
    const done = () => { this.secMenu = null; };
    const order = (dir) => () => this.command({ type: "section", op: "order", sid: g.id, dir });
    return h_flex().flex_none().mx(4).mb(4).p(8).gap(6).flex_wrap().rounded(6).bg(t.chrome).border(1).border_color(t.border)
      .child(this.chip(t, "sl-sm-ren", "Rename…", false, (cx) => this.startSection({ mode: "rename", sid: g.id }, g.label, cx)))
      .child(this.chip(t, "sl-sm-emo", "Emoji…", false, (cx) => this.startSection({ mode: "emoji", sid: g.id }, g.emoji ?? "", cx)))
      .child(this.chip(t, "sl-sm-fold", folded ? "Expand" : "Collapse", false, () => { this.command({ type: "section", op: "collapse", sid: g.id, collapsed: !folded }); done(); }))
      .when(g.rows.length > 0, (el) => el.child(this.chip(t, "sl-sm-mute", allMuted ? "Unmute all" : "Mute all", false, () => { this.command({ type: "sectionmute", sid: g.id, muted: !allMuted }); done(); }, allMuted ? "bell" : "bell-off")))
      .when(i > 0, (el) => el.child(this.chip(t, "sl-sm-up", "Move up", false, order(-1))))
      .when(i >= 0 && i < list.length - 1, (el) => el.child(this.chip(t, "sl-sm-down", "Move down", false, order(1))))
      .child(this.chip(t, "sl-sm-file", "Rules in sections.json…", false, (cx) => { this.editSectionsFile(cx); done(); }, "file"))
      .child(this.chip(t, "sl-sm-del", "Delete section", false, () => { this.command({ type: "section", op: "delete", sid: g.id }); done(); }, "x"));
  }

  // A conversation in the list, one line as in Slack's sidebar. Right-click marks it read;
  // Shift+right-click, or ⋯ while the pointer is on it, opens its menu.
  row(t, c, g) {
    const quiet = c.quiet, unread = c.lit, menu = this.rowMenu === c.id, over = this.rowHover === c.id || menu, dragged = this.drag?.live && this.drag.id === c.id;
    const toggle = (cx) => { this.rowMenu = menu ? null : c.id; this.secMenu = null; cx.notify(); };
    const lead = c.kind === "im" && this.av?.[c.user] ? div().id(`sl-rf-${c.id}`).flex_none().cursor_pointer().tooltip("Profile")
      .on_click((_e, cx) => { cx.stop_propagation(); this.openProfile(c.user, cx); }).child(this.face(t, c.user, c.title, 18))
      // A group message shows how many others are in it, as Slack does.
      : c.kind === "mpim" && c.members > 0 ? div().size(18).flex_none().rounded(4).border(1).border_color(t.input).bg(t.raised).flex().items_center().justify_center().text_size(10.5).font_semibold().text_color(t.muted).child(String(c.members))
      : svg(ICON(KIND_ICON[c.kind] ?? "hash")).size(14).flex_none().text_color(unread ? t.foreground : t.dim);
    // Indented so its icon sits under the section's name, as in Slack's sidebar.
    return h_flex().id(`sl-${c.id}`).flex_none().h(28).pl(34).pr(8).gap(8).items_center().rounded(4).cursor_pointer()
      .when(menu, (el) => el.bg(t.hover)).hover((s) => s.bg(t.hover)).when(quiet && !unread, (el) => el.opacity(0.75)).when(dragged, (el) => el.opacity(0.45))
      .when(Boolean(c.preview) && !this.drag?.live, (el) => el.tooltip(c.preview))
      .on_hover((on, cx) => { if (on) this.rowHover = c.id; else if (this.rowHover === c.id) this.rowHover = null; this.dragOver(g.id, on, cx); cx.notify(); })
      .on_mouse_down("left", (e) => { this.drag = { id: c.id, x: e.position.x, y: e.position.y, live: false }; })
      .on_click((_e, cx) => {
        if (Date.now() - (this.dragEnded ?? 0) < 400) return;
        this.rowMenu = null;
        this.command({ type: "open", id: c.id });
        cx.notify();
      })
      .on_mouse_down("right", (e, cx) => {
        cx.stop_propagation();
        if (e.modifiers?.shift) return toggle(cx);
        if (c.unread > 0 || c.mention) this.command({ type: "markread", id: c.id });
      })
      .child(div().w(18).flex_none().flex().items_center().justify_center().child(lead))
      .child(this.title(t, c, { color: unread ? t.foreground : quiet ? t.dim : t.muted, bold: unread }))
      .when(c.loud > 0, (el) => el.child(div().flex_none().px(6).rounded(8).bg(t.blocked).text_size(10.5).font_semibold().text_color("#ffffff").child(String(c.loud))))
      .when(quiet && !over, (el) => el.child(svg(ICON("bell-off")).size(11).flex_none().text_color(t.dim)))
      .when(over, (el) => el.child(div().id(`sl-rmb-${c.id}`).size(18).flex_none().flex().items_center().justify_center().rounded(4).text_color(t.dim)
        .hover((s) => s.bg(t.selected).text_color(t.foreground)).tooltip("Mute, notifications, section")
        .on_click((_e, cx) => { cx.stop_propagation(); toggle(cx); })
        .child(svg(ICON("ellipsis")).size(13))));
  }

  // The one gate for links: a conversation of this workspace opens here, a web page in Herdr's
  // browser panel, a mail address with the system; any other scheme is not opened.
  openLink(url, cx) {
    const m = PERMALINK.exec(url);
    if (m && this.S?.convs?.some((c) => c.id === m[1])) {
      const thread = /[?&]thread_ts=(\d+\.\d+)/.exec(url)?.[1] ?? null;
      this.command({ type: "goto", id: m[1], ts: thread });
      return;
    }
    if (WEB.test(url)) openInBrowser(url, cx);
    else if (MAILTO.test(url)) systemOpen(url);
  }

  // A message's text. Plain text stays one block per line (cheap to draw); a line with links
  // is its runs of text and its links side by side, each link opening on a click (openLink)
  // and showing a copy button while the pointer is on it.
  textView(t, m) {
    return this.rich(t, m.ts, m.parts ?? { s: m.text }, {});
  }

  // Laid-out text (Slack.layout, done when the message came) as elements: `key` keeps the ids
  // of links unique in the view; size, color, bold style it.
  rich(t, key, L, { size = 12.5, color = t.muted, bold = false }) {
    const C = this.chat;
    const base = (el) => el.text_size(size).text_color(color).when(bold, (e) => e.font_semibold());
    if (!L?.lines) return base(div()).child(typeof L?.s === "string" ? L.s : "");
    const M = this.dark ? MENTION.dark : MENTION.light, me = this.S?.me;
    const quote = (line, el) => (!line.q ? el : h_flex().items_stretch().gap(8)
      .child(div().w(3).flex_none().rounded(2).bg(t.border))
      .child(el.flex_1().min_w(0).min_h(Math.round(size * 1.3))));
    return base(v_flex().gap(1)).children(L.lines.map((line, li) => {
      if (!line) return div().h(8);
      if (line.s != null) return quote(line, div().child(line.s));
      return quote(line, h_flex().flex_wrap().items_center().gap_x(4).gap_y(1).children(line.w.map((w, wi) => {
        if (w.t === "text") return div().max_w_full().child(w.s);
        if (w.t === "emoji") {
          const path = this.S?.media?.[w.pic?.key];
          return path ? image(path).size(Math.round(size * 1.4)).flex_none() : div().child(`:${w.name}:`);
        }
        if (w.t === "mention") {
          const mine = w.id === me || w.id === "!";
          const chip = (el) => el.flex_none().px(2).rounded(3).font_medium().bg(mine ? M.meBg : M.bg).text_color(mine ? M.meFg : M.fg).child(w.label);
          if (w.id === "!") return chip(div());
          return chip(div().id(`sl-mn-${key}:${li}:${wi}`)).cursor_pointer().hover((s) => s.underline())
            .on_click((_e, cx) => { cx.stop_propagation(); if (w.channel) this.openChannel(w.id, cx); else this.openProfile(w.id, cx); });
        }
        const k = `${key}:${li}:${wi}`, hovered = C.link === k, copied = C.copied === k;
        return h_flex().id(`sl-l-${k}`).max_w_full().min_w(0).gap(3).items_center()
          .on_hover((on, cx) => { if (on) C.link = k; else if (C.link === k) C.link = null; cx.notify(); })
          .child(div().id(`sl-la-${k}`).min_w(0).cursor_pointer().text_color(LINK).underline().tooltip(w.url)
            .on_click((_e, cx) => { cx.stop_propagation(); this.openLink(w.url, cx); })
            .child(w.label))
          .when(hovered || copied, (el) => el.child(div().id(`sl-lc-${k}`).size(18).flex_none().flex().items_center().justify_center().rounded(4).cursor_pointer()
            .bg(t.raised).border(1).border_color(t.input).text_color(copied ? t.done : t.dim).hover((s) => s.text_color(t.foreground))
            .tooltip(copied ? "Copied" : "Copy link")
            .on_click((_e, cx) => {
              cx.stop_propagation();
              cx.write_to_clipboard(w.url);
              C.copied = k;
              cx.timer.after(1500, (cx) => { if (C.copied === k) { C.copied = null; cx.notify(); } });
              cx.notify();
            })
            .child(svg(ICON(copied ? "check" : "copy")).size(11))));
      })));
    }));
  }

  // How wide a picture or card may be: the message column, at most TILE_W.
  tileMax() {
    return Math.max(120, Math.min(TILE_W, (this.chat.viewW || TILE_W + 62) - 62));
  }

  // A kept picture, or a quiet box its size while it downloads.
  picture(t, p, w, h) {
    const path = p && this.S?.media?.[p.key];
    return path ? image(path).w(w).h(h).flex_none().rounded(4) : div().w(w).h(h).flex_none().rounded(4).bg(t.raised);
  }

  tile(t, p, max, id, tip, onClick) {
    const box = fit(p, max);
    return div().id(id).flex_none().w(box.w).h(box.h).rounded(6).overflow_hidden().cursor_pointer().border(1).border_color(t.border)
      .tooltip(tip).on_click((_e, cx) => { cx.stop_propagation(); onClick(cx); })
      .child(this.picture(t, p, box.w, box.h));
  }

  // An image file: its name, then the picture; a click shows it larger. Right-click (or ⋯ beside
  // the name) opens its menu: copy the picture or its link, open it in Slack, download it.
  imageFile(t, f) {
    const max = this.tileMax(), C = this.chat, menu = C.imgMenu === f.id, clip = this.S?.clips?.[f.id], d = this.S?.downloads?.[f.id];
    const toggle = (cx) => { C.imgMenu = menu ? null : f.id; cx.notify(); };
    const done = () => { C.imgMenu = null; };
    return v_flex().mt(4).gap(2)
      .child(h_flex().max_w(max).gap(4).items_center()
        .child(div().min_w(0).truncate().text_size(11).text_color(t.dim).child(f.name))
        .child(div().id(`sl-imm-${f.id}`).size(16).flex_none().flex().items_center().justify_center().rounded(4).cursor_pointer().text_color(t.dim)
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).tooltip("Copy, link, download")
          .on_click((_e, cx) => { cx.stop_propagation(); toggle(cx); })
          .child(svg(ICON("ellipsis")).size(12))))
      .child(div().id(`sl-imr-${f.id}`).on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); toggle(cx); })
        .child(this.tile(t, f.thumb, max, `sl-img-${f.id}`, "View larger · right-click for more", (cx) => this.openViewer(f, cx))))
      .when(menu, (el) => el.child(h_flex().max_w(max).p(6).gap(6).flex_wrap().items_center().rounded(6).bg(t.chrome).border(1).border_color(t.border)
        .when(appWindow().platform !== "windows", (e) => e.child(this.chip(t, `sl-imc-${f.id}`, clip?.state === "busy" ? "Copying…" : clip?.state === "done" ? "Copied" : "Copy image", false,
          () => { if (clip?.state !== "busy") this.command({ type: "copyimage", file: f }); }, clip?.state === "done" ? "check" : "copy")))
        .when(Boolean(f.link), (e) => e.child(this.chip(t, `sl-iml-${f.id}`, this.linkCopied === f.id ? "Copied" : "Copy link", false, (cx) => this.copyLink(f.id, f.link, cx), this.linkCopied === f.id ? "check" : "link")))
        .when(Boolean(f.link), (e) => e.child(this.chip(t, `sl-imo-${f.id}`, "Open in browser", false, (cx) => { this.openLink(f.link, cx); done(); }, "external-link")))
        .when(Boolean(f.url) && d?.state !== "busy", (e) => e.child(this.chip(t, `sl-imd-${f.id}`, "Download", false, () => { this.command({ type: "download", file: f }); done(); }, "download")))
        .when(clip?.state === "error", (e) => e.child(div().w_full().text_size(11).text_color(t.blocked).child(clip.error)))));
  }

  // A link onto the clipboard; its button says Copied for a moment.
  copyLink(id, url, cx) {
    cx.write_to_clipboard(url);
    this.linkCopied = id;
    cx.timer.after(1500, (cx) => { if (this.linkCopied === id) { this.linkCopied = null; cx.notify(); } });
  }

  // What the messages on screen show, then those up to a screen above it, then a screen below:
  // each band newest (bottom) first, as Slack fills a channel in. C.off is how far the view is
  // scrolled up from the bottom; a message not measured yet counts as 80px.
  nearWants(list, C) {
    const vh = C.viewH || 800, off = Math.min(C.off, Math.max(0, C.contentH - C.viewH));
    const seen = [], above = [], below = [];
    let y = 0;
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i], lo = y;
      y += C.heights?.[m.ts] ?? 80;
      if (lo >= off + 2 * vh) break;
      if (y > off && lo < off + vh) seen.push(m);
      else if (lo >= off + vh) above.push(m);
      else if (y > off - vh) below.push(m);
    }
    return [...seen, ...above, ...below.reverse()].flatMap((m) => this.msgWants(m));
  }

  // A message's faces and every picture it draws (files, cards, blocks, workspace emoji,
  // reactions) not shown yet. A file's larger copy and original are asked for only when opened.
  msgWants(m) {
    const out = [], media = this.S?.media ?? {};
    const face = (id) => { if (id && !this.av[id]) out.push({ face: id }); };
    const walk = (v, depth) => {
      if (!v || typeof v !== "object" || depth > 8) return;
      if (Array.isArray(v)) { for (const x of v) walk(x, depth + 1); return; }
      if (typeof v.key === "string" && typeof v.url === "string" && MEDIA_NAME.test(v.key)) { if (!media[v.key]) out.push({ pic: v }); return; }
      for (const [k, x] of Object.entries(v)) if (k !== "big" && k !== "full") walk(x, depth + 1);
    };
    face(m.uid);
    walk(m, 0);
    for (const r of m.repliers ?? []) face(r.id);
    return out;
  }

  // A list row's face and the workspace emoji in its name.
  rowWants(c) {
    const out = [], media = this.S?.media ?? {};
    if (c.kind === "im" && c.user && !this.av[c.user]) out.push({ face: c.user });
    for (const w of c.titleParts?.lines?.[0]?.w ?? []) if (w.pic?.key && !media[w.pic.key]) out.push({ pic: w.pic });
    return out;
  }

  // Notes what this render showed; flushWant hands it to the background when it changed. Not
  // from render itself: setShared re-renders every mod.
  wantNow(S) {
    if (S.me && !this.av[S.me]) this.wants.push({ face: S.me });
    const ids = new Set(), items = [];
    for (const w of this.wants) {
      const id = w.face ? `@${w.face}` : w.pic.key;
      if (ids.has(id) || items.length >= 200) continue;
      ids.add(id);
      items.push(w.face ? { face: w.face } : { pic: { url: w.pic.url, w: w.pic.w, h: w.pic.h } });
    }
    const key = [...ids].join(",");
    if (key !== this.wantKey) { this.wantKey = key; this.wantItems = items; }
  }

  flushWant() {
    if (!this.wantItems) return;
    this.wantSeq = (this.wantSeq ?? 0) + 1;
    setShared(WANT, { n: `${Date.now()}.${this.wantSeq}`, items: this.wantItems });
    this.wantItems = null;
  }

  openViewer(f, cx) {
    if (f.big) this.command({ type: "media", pic: f.big });
    openOverlay({ mod: NAME, props: { viewer: { name: f.name, thumb: f.thumb, big: f.big, link: f.link, file: f } }, kind: "dialog", width: 0.8, height: 0.85 });
    cx.notify();
  }

  // Block Kit in a message (see blocksOf).
  blocksView(t, blocks, key) {
    const max = this.tileMax();
    const fields = (list, k) => h_flex().flex_wrap().gap_x(12).gap_y(4)
      .children(list.map((f, fi) => div().w(Math.floor(max / 2) - 6).min_w(0).child(this.rich(t, `${k}f${fi}`, f, { size: 12 }))));
    return v_flex().gap(4).children(blocks.map((b, bi) => {
      const k = `${key}${bi}`;
      if (b.t === "header") return div().text_size(14).font_semibold().text_color(t.foreground).child(b.s);
      if (b.t === "divider") return div().h(1).my(2).bg(t.border);
      if (b.t === "image") return v_flex().gap(2)
        .when(Boolean(b.title), (el) => el.child(div().truncate().text_size(11).text_color(t.dim).child(b.title)))
        .child(this.tile(t, b.pic, max, `sl-bi-${k}`, b.title || "Open picture", (cx) => this.openLink(b.pic.url, cx)));
      if (b.t === "context") return h_flex().flex_wrap().items_center().gap_x(6).gap_y(2)
        .children(b.items.map((x, xi) => (x.pic ? this.picture(t, x.pic, 14, 14) : this.rich(t, `${k}c${xi}`, x.parts, { size: 11, color: t.dim }))));
      return h_flex().gap(8).items_start()
        .child(v_flex().flex_1().min_w(0).gap(4)
          .when(Boolean(b.parts), (el) => el.child(this.rich(t, `${k}s`, b.parts, {})))
          .when(b.fields.length > 0, (el) => el.child(fields(b.fields, k))))
        .when(Boolean(b.image), (el) => el.child(this.picture(t, b.image, 56, 56)));
    }));
  }

  // An attachment as Slack draws it: pretext above, then a coloured bar beside the site or
  // author, the title (a link), text, fields, blocks, the picture and the footer. A click on
  // the picture opens the page it came from.
  cardView(t, m, a, ci) {
    const key = `${m.ts}-c${ci}`, max = this.tileMax() - 13;
    const link = (url) => (_e, cx) => { cx.stop_propagation(); this.openLink(url, cx); };
    const body = v_flex().flex_1().min_w(0).gap(3)
      .when(Boolean(a.service), (el) => el.child(h_flex().gap(6).items_center()
        .when(Boolean(a.serviceIcon), (e) => e.child(this.picture(t, a.serviceIcon, 14, 14)))
        .child(div().min_w(0).truncate().text_size(11.5).font_semibold().text_color(t.dim).child(a.service))))
      .when(Boolean(a.author), (el) => el.child(h_flex().id(`sl-ca-${key}`).gap(6).items_center()
        .when(Boolean(a.authorLink), (e) => e.cursor_pointer().tooltip(a.authorLink).on_click(link(a.authorLink)))
        .when(Boolean(a.authorIcon), (e) => e.child(this.picture(t, a.authorIcon, 16, 16)))
        .child(div().min_w(0).truncate().text_size(12).font_semibold().text_color(t.foreground).child(a.author))))
      .when(Boolean(a.title), (el) => el.child(a.titleLink
        ? div().id(`sl-ct-${key}`).cursor_pointer().text_size(12.5).font_semibold().text_color(LINK).hover((s) => s.underline()).tooltip(a.titleLink)
          .on_click(link(a.titleLink)).child(plainOf(a.title))
        : this.rich(t, `${key}t`, a.title, { color: t.foreground, bold: true })))
      .when(Boolean(a.text), (el) => el.child(this.rich(t, `${key}x`, a.text, { size: 12 })))
      .when(a.fields.length > 0, (el) => el.child(h_flex().flex_wrap().gap_x(12).gap_y(4).children(a.fields.map((f, fi) => v_flex().min_w(0)
        .w(f.short ? Math.floor(max / 2) - 6 : max)
        .when(Boolean(f.title), (e) => e.child(div().text_size(11.5).font_semibold().text_color(t.foreground).child(f.title)))
        .when(Boolean(f.value), (e) => e.child(this.rich(t, `${key}f${fi}`, f.value, { size: 12 })))))))
      .when(Boolean(a.blocks), (el) => el.child(this.blocksView(t, a.blocks, `${key}b`)))
      .when(Boolean(a.image), (el) => el.child(this.tile(t, a.image, max, `sl-ci-${key}`, a.link ?? "Open picture", (cx) => this.openLink(a.link ?? a.image.url, cx))))
      .when(Boolean(a.footer), (el) => el.child(h_flex().gap(5).items_center()
        .when(Boolean(a.footerIcon), (e) => e.child(this.picture(t, a.footerIcon, 12, 12)))
        .child(this.rich(t, `${key}o`, a.footer, { size: 11, color: t.dim }))));
    return v_flex().mt(4).max_w(max + 13).gap(3)
      .when(Boolean(a.pretext), (el) => el.child(this.rich(t, `${key}p`, a.pretext, {})))
      .child(h_flex().gap(8).items_start().border_l(3).border_color(a.color ?? t.input).pl(10).py(1)
        .child(body)
        .when(Boolean(a.thumb), (el) => el.child(div().id(`sl-cth-${key}`).flex_none().cursor_pointer().on_click(link(a.link ?? a.thumb.url))
          .child(this.picture(t, a.thumb, 64, 64)))));
  }

  // One message: who and when above the first of a run, the text, its reactions, its thread
  // ("3 replies"), and while the pointer is on it a toolbar: reply in thread, add a reaction.
  messageView(t, o, m, head, colors, inThread) {
    const C = this.chat;
    const hovered = C.hover === m.ts, picking = C.pick === m.ts;
    const react = (name, add) => (_e, cx) => {
      cx.stop_propagation();
      this.command({ type: "react", id: o.id, ts: m.ts, name, add });
      C.pick = null;
      cx.notify();
    };
    const openThread = (_e, cx) => { cx.stop_propagation(); this.command({ type: "thread", id: o.id, ts: m.ts }); C.pick = null; cx.notify(); };
    const nameColor = m.mine ? t.done : colors.get(m.uid || m.who) ?? t.foreground;
    const body = v_flex().flex_1().min_w(0).gap(2)
      .when(head, (el) => el.child(h_flex().gap(8).items_baseline()
        .child(/^[UW]/.test(m.uid ?? "") ? div().id(`sl-mw-${inThread ? "t" : ""}${m.ts}`).text_size(12.5).font_semibold().text_color(nameColor).cursor_pointer().hover((s) => s.underline())
          .on_click((_e, cx) => { cx.stop_propagation(); this.openProfile(m.uid, cx); }).child(m.who)
          : div().text_size(12.5).font_semibold().text_color(nameColor).child(m.who))
        .child(div().text_size(11).text_color(t.dim).child(clock(m.t)))))
      .when(Boolean(m.broadcast) && !inThread, (el) => el.child(h_flex().id(`sl-bc-${m.ts}`).min_w(0).gap(4).items_center().cursor_pointer().text_size(11.5).text_color(t.dim)
        .hover((s) => s.text_color(t.foreground))
        .on_click((_e, cx) => { cx.stop_propagation(); this.command({ type: "thread", id: o.id, ts: m.broadcast.thread }); cx.notify(); })
        .child(div().flex_none().child("replied to a thread:"))
        .child(div().min_w(0).truncate().text_color(LINK).child(m.broadcast.root || "view thread"))))
      .when(Boolean(m.broadcast) && inThread, (el) => el.child(div().text_size(11.5).text_color(t.dim).child(o.kind === "im" ? "Also sent as direct message" : `Also sent to ${o.kind === "mpim" ? "the group" : `#${o.title}`}`)))
      .when(Boolean(m.text), (el) => el.child(this.textView(t, m)))
      .when(Boolean(m.blocks), (el) => el.child(this.blocksView(t, m.blocks, `${m.ts}-b`)))
      .children((m.files ?? []).map((f) => (f.thumb ? this.imageFile(t, f) : this.fileCard(t, f))))
      .children((m.cards ?? []).map((a, ci) => this.cardView(t, m, a, ci)))
      .when(m.reactions.length > 0, (el) => el.child(h_flex().gap(4).flex_wrap().pt(2)
        .children(m.reactions.map((r) => div().id(`sl-r-${m.ts}-${r.name}`).h(20).px(6).flex().items_center().gap(4).rounded(10).cursor_pointer().text_size(11.5)
          .border(1).border_color(r.mine ? t.accent : t.input).bg(r.mine ? t.selected : t.raised).text_color(t.foreground)
          .tooltip(r.mine ? "Take your reaction back" : `React ${emoji(r.name)}`)
          .hover((s) => s.border_color(t.accent))
          .on_click(react(r.name, !r.mine))
          .child(r.pic && this.S?.media?.[r.pic.key] ? image(this.S.media[r.pic.key]).size(16).flex_none() : r.ch ?? emoji(r.name)).child(div().text_color(t.dim).child(String(r.count)))))))
      .when(!inThread && m.replies > 0, (el) => {
        const C2 = this.chat, key = `th:${m.ts}`, over = C2.threadHover === key;
        const palette = this.dark ? NAME_COLORS.dark : NAME_COLORS.light;
        const face = (r) => this.face(t, r.id, r.name, 18, r.name === "You" ? t.done : colors.get(r.id) ?? palette[hashOf(r.id) % palette.length]);
        const last = m.lastReply ? (dayLabel(m.lastReply) === "Today" ? `today at ${clock(m.lastReply)}` : dayLabel(m.lastReply) === "Yesterday" ? `yesterday at ${clock(m.lastReply)}` : dayLabel(m.lastReply)) : "";
        return el.child(h_flex().id(`sl-th-${m.ts}`).mt(3).h(28).px(4).gap(6).items_center().rounded(6).cursor_pointer()
          .border(1).border_color(over ? t.input : t.background).when(over, (e) => e.bg(t.raised))
          .on_hover((on, cx) => { if (on) C2.threadHover = key; else if (C2.threadHover === key) C2.threadHover = null; cx.notify(); })
          .on_click(openThread)
          .child(h_flex().gap(2).children(m.repliers.map(face)))
          .child(div().flex_none().text_size(12).font_semibold().text_color(LINK).child(`${m.replies} ${m.replies === 1 ? "reply" : "replies"}`))
          .child(div().flex_1().min_w(0).truncate().text_size(11.5).text_color(t.dim).child(over ? "View thread" : last ? `Last reply ${last}` : ""))
          .when(over, (e) => e.child(svg(ICON("chevron-right")).size(12).flex_none().text_color(t.dim))));
      })
      .when(picking, (el) => el.child(h_flex().gap(2).flex_wrap().pt(4)
        .children(QUICK.map((name) => div().id(`sl-q-${m.ts}-${name}`).size(26).flex().items_center().justify_center().rounded(4).cursor_pointer().text_size(15)
          .bg(t.raised).hover((s) => s.bg(t.selected)).tooltip(`:${name}:`)
          .on_click(react(name, !m.reactions.some((r) => r.name === name && r.mine)))
          .child(emoji(name))))));
    return div().id(`sl-m-${m.ts}`).relative().flex_none().px(12).py(2).when(head, (el) => el.mt(6))
      .on_hover((on, cx) => { if (on) C.hover = m.ts; else if (C.hover === m.ts) C.hover = null; cx.notify(); })
      .when(hovered || picking, (el) => el.bg(t.hover))
      .child(h_flex().gap(8).items_start()
        .child(head ? div().id(`sl-mf-${inThread ? "t" : ""}${m.ts}`).flex_none().pt(2).when(/^[UW]/.test(m.uid ?? ""), (el) => el.cursor_pointer()
          .on_click((_e, cx) => { cx.stop_propagation(); this.openProfile(m.uid, cx); })).child(this.face(t, m.uid || m.who, m.who, 30, nameColor)) : div().w(30).flex_none())
        .child(body))
      .when(hovered || picking, (el) => {
        const tool = (id, icon, tip, on, onClick) => div().id(id).size(22).flex().items_center().justify_center().rounded(4).cursor_pointer()
          .text_color(on ? t.foreground : t.dim).hover((s) => s.bg(t.selected).text_color(t.foreground)).tooltip(tip)
          .on_click(onClick)
          .child(svg(ICON(icon)).size(13));
        return el.child(h_flex().absolute().right(8).top(0).gap(1).p(1).rounded(5).bg(t.raised).border(1).border_color(t.input)
          .when(!inThread, (el) => el.child(tool(`sl-t-${m.ts}`, "message-square-reply", "Reply in thread", false, openThread)))
          .child(tool(`sl-p-${m.ts}`, "smile-plus", "Add reaction", picking, (_e, cx) => { cx.stop_propagation(); C.pick = picking ? null : m.ts; cx.notify(); })));
      });
  }

  conversation(t, S) {
    const o = S.open, C = this.chat, th = o.thread;
    // In a thread the same view shows the thread: its first message, then the replies.
    const list = th ? th.messages : o.messages;
    // Each opening is its own view (o.n): coming back starts again at the bottom or the red line.
    const viewKey = th ? `${o.id}.${o.n}:${th.ts}` : `${o.id}.${o.n}`;
    if (C.id !== viewKey) Object.assign(C, { id: viewKey, off: 0, viewH: 0, contentH: 0, hover: null, pick: null, askedOlder: null, link: null, heights: {}, jumped: null, readFor: null, bottomTs: null });
    // A send answered: the box empties when it went through, and keeps the text when it didn't.
    if (this.pending && S.result?.n === this.pending) {
      if (S.result.ok) { this.setReply(""); this.picked.clear(); this.mention = null; C.off = 0; }
      this.sendError = S.result.ok ? null : S.result.error;
      this.pending = null;
      this.keepResult(S.result.n);
    } else if (S.result?.n && S.result.n !== this.seenResult) {
      // One asked by an earlier copy of this panel (it was made again meanwhile) that didn't
      // go: its text comes back to its conversation's box, after anything typed there since.
      const r = S.result, back = !r.ok && r.draft;
      if (back && r.conv === o.id) {
        const now = this.reply.value();
        this.setReply(now.trim() ? `${now}\n${r.draft}` : r.draft);
        this.sendError = r.error;
      }
      if (!back || r.conv === o.id) this.keepResult(r.n);
    }
    const max = () => Math.max(0, C.contentH - C.viewH);
    const older = () => {
      if (th) return;
      const oldest = o.messages[0]?.ts;
      if (o.more && !o.loadingOlder && oldest && C.askedOlder !== oldest) { C.askedOlder = oldest; this.command({ type: "older", id: o.id }); }
    };
    // The messages sit on the bottom edge. Scrolling back moves them down past it, up to the
    // height they have beyond the view; at the top, the 40 before the oldest load.
    const content = v_flex().flex_none().w_full().pb(6).on_size_change((s, cx) => {
      if (Math.abs(s.height - C.contentH) > 0.5) { C.contentH = s.height; cx.notify(); }
    });
    const loading = th ? th.loading : o.loading, error = th ? th.error : o.error;
    if (loading) content.child(div().px(12).text_size(12).text_color(t.dim).child(th ? "Loading thread…" : "Loading messages…"));
    else if (error) content.child(div().px(12).text_size(12).text_color(t.blocked).child(error));
    else if (!list.length) content.child(div().px(12).text_size(12).text_color(t.dim).child("No messages yet."));
    if (!th && o.loadingOlder) content.child(div().px(12).py(4).text_size(11.5).text_color(t.dim).child("Loading earlier messages…"));
    // Who gets which colour only changes with who wrote what, not on every frame.
    const colorKey = `${viewKey}|${list.length}|${list[0]?.ts}|${list[list.length - 1]?.ts}|${this.dark}`;
    if (this.colorMemo?.key !== colorKey) this.colorMemo = { key: colorKey, colors: chatColors(list, this.dark) };
    const colors = this.colorMemo.colors;
    // Where the unread part starts (Slack's last_read when it was opened): a red line above it.
    const newFrom = th ? th.newFrom : o.newFrom, newCount = th ? th.newCount : o.newCount;
    const newAt = newFrom ? list.findIndex((m) => m.ts === newFrom) : -1;
    list.forEach((m, i) => {
      const prev = list[i - 1];
      const newDay = !prev || dayLabel(prev.t) !== dayLabel(m.t);
      // A message with the lines above it, measured together: the scroll position of any one
      // is the sum of the heights below it.
      const block = v_flex().flex_none().w_full()
        .on_size_change((s, cx) => { if (Math.abs((C.heights[m.ts] ?? -1) - s.height) > 0.5) { C.heights[m.ts] = s.height; cx.notify(); } });
      if (newDay) block.child(h_flex().flex_none().gap(8).items_center().px(12).pt(i ? 10 : 4).pb(2)
        .child(div().flex_1().h(1).bg(t.border)).child(div().text_size(11).text_color(t.dim).child(dayLabel(m.t))).child(div().flex_1().h(1).bg(t.border)));
      if (i === newAt) block.child(h_flex().flex_none().gap(8).items_center().px(12).pt(6).pb(2)
        .child(div().flex_1().h(1).bg(t.blocked)).child(div().flex_none().text_size(11).font_semibold().text_color(t.blocked).child("새 메시지")));
      block.child(this.messageView(t, o, m, newDay || i === newAt || prev.who !== m.who || m.t - prev.t > 300000, colors, Boolean(th)));
      if (th && i === 0 && list.length > 1) block.child(h_flex().flex_none().gap(8).items_center().px(12).pt(8).pb(2)
        .child(div().text_size(11).text_color(t.dim).child(`${list.length - 1} ${list.length === 2 ? "reply" : "replies"}`)).child(div().flex_1().h(1).bg(t.border)));
      content.child(block);
    });
    // How far up from the bottom the red line sits; null until every message below it is measured.
    let newUp = null;
    if (newAt >= 0) {
      newUp = 6;
      for (let i = newAt; i < list.length && newUp != null; i++) newUp = C.heights[list[i].ts] == null ? null : newUp + C.heights[list[i].ts];
    }
    // The red line a little below the top, so pictures still arriving above it don't push it out.
    const toNew = () => Math.min(max(), Math.max(0, newUp - C.viewH + Math.min(120, C.viewH / 4)));
    // Opened with unread messages: the view starts at the red line rather than the bottom.
    const jumpKey = newAt >= 0 ? `${viewKey}:${newFrom}` : null;
    if (jumpKey && C.jumped !== jumpKey && newUp != null && C.viewH > 0 && C.contentH > 0) { C.jumped = jumpKey; C.off = toNew(); }
    const settled = !jumpKey || C.jumped === jumpKey;
    const lastTs = list[list.length - 1]?.ts ?? null;
    // Read once the newest messages have been on screen, not merely because it was opened;
    // again for each one that comes while it is open.
    const readKey = `${viewKey}:${lastTs}`;
    if (!th && lastTs && !o.loading && settled && !o.bottomSeen && C.viewH > 0 && Math.min(C.off, max()) <= 40 && C.readFor !== readKey) {
      C.readFor = readKey;
      this.commandSoon({ type: "readbottom", id: o.id, openN: o.n, ts: lastTs });
    }
    if (C.off <= 40) C.bottomTs = lastTs;
    const newBelow = C.off > 40 && lastTs && C.bottomTs && Number(lastTs) > Number(C.bottomTs);
    const pill = (id, label, onClick) => div().id(id).h(24).px(10).flex().items_center().rounded(12).cursor_pointer()
      .bg(t.raised).border(1).border_color(t.input).text_size(11.5).text_color(t.foreground).hover((s) => s.bg(t.selected))
      .on_click((_e, cx) => { onClick(); cx.notify(); }).child(label);
    const view = v_flex().id("sl-view").flex_1().min_h(0).overflow_hidden().justify_end().relative()
      .on_size_change((s, cx) => {
        if (Math.abs(s.height - C.viewH) > 0.5 || Math.abs(s.width - (C.viewW ?? 0)) > 0.5) { C.viewH = s.height; C.viewW = s.width; cx.notify(); }
      })
      .on_scroll_wheel((e, cx) => {
        C.off = Math.min(max(), Math.max(0, C.off + e.delta.y));
        if (C.off >= max() - 40) older();
        cx.notify();
      })
      .child(v_flex().flex_none().relative().top(Math.min(C.off, max())).child(content))
      .when(settled && newUp != null && newUp > C.off + C.viewH, (el) => el.child(h_flex().absolute().top(8).left(0).right(0).justify_center()
        .child(pill("sl-up-new", `↑ ${newCount || list.length - newAt}개의 새 메시지`, () => { C.off = toNew(); }))))
      .when(C.off > 40, (el) => el.child(div().absolute().right(12).bottom(10)
        .child(pill("sl-down", newBelow ? "↓ 새 메시지" : "Latest ↓", () => { C.off = 0; }))));
    this.wants.push(...this.nearWants(list, C));
    const sending = Boolean(this.pending);
    return v_flex().flex_1().min_h(0)
      .when(Boolean(th), (el) => el.child(h_flex().flex_none().h(30).px(12).gap(8).items_center().bg(t.chrome).border_b(1).border_color(t.border)
        .child(div().id("sl-unthread").h(22).px(7).flex().items_center().gap(4).rounded(4).cursor_pointer().bg(t.raised).text_size(11.5).text_color(t.dim)
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).tooltip(`Back to ${o.title}`)
          .on_click((_e, cx) => { this.command({ type: "unthread" }); cx.notify(); })
          .child(svg(ICON("chevron-left")).size(12)).child("Back"))
        .child(div().font_semibold().text_size(12.5).text_color(t.foreground).child("Thread"))))
      .child(view)
      .when(Boolean(o.notice), (el) => el.child(div().flex_none().px(12).py(4).text_size(11.5).text_color(t.blocked).child(o.notice)))
      .when(Boolean(this.sendError), (el) => el.child(div().flex_none().px(12).py(4).text_size(11.5).text_color(t.blocked).child(`Couldn't send: ${this.sendError}`)))
      .when(Boolean(this.mention), (el) => {
        const list = this.mentionList();
        if (!list.length) return el;
        if (!list[0].channel) this.wants.unshift(...list.filter((p) => !this.av[p.id]).map((p) => ({ face: p.id })));
        const sel = Math.min(this.mentionSel, list.length - 1);
        const palette = settings()?.dark !== false ? NAME_COLORS.dark : NAME_COLORS.light;
        return el.child(v_flex().flex_none().py(4).bg(t.popover ?? t.raised).border_t(1).border_color(t.border)
          .child(div().px(12).pb(2).text_size(10.5).font_semibold().text_color(t.dim).child(`${list[0].channel ? "CHANNELS" : "PEOPLE"}  ·  ↑↓ to move, Enter or Tab to pick`))
          .children(list.map((p, i) => h_flex().id(`sl-at-${p.id}`).h(30).mx(4).px(8).gap(8).items_center().rounded(4).cursor_pointer()
            .when(i === sel, (e) => e.bg(t.selected))
            .on_hover((on, cx) => { if (on && this.mentionSel !== i) { this.mentionSel = i; cx.notify(); } })
            .on_click((_e, cx) => this.pickMention(p, cx))
            .child(p.channel ? div().size(20).flex_none().flex().items_center().justify_center().text_color(t.dim).child(svg(ICON(p.private ? "lock" : "hash")).size(13))
              : this.face(t, p.id, p.name, 20, palette[hashOf(p.id) % palette.length]))
            .child(div().flex_none().text_size(12.5).font_semibold().text_color(t.foreground).child(p.name))
            .child(div().flex_1().min_w(0).truncate().text_size(11.5).text_color(t.dim).child(p.channel ? "" : p.real && p.real !== p.name ? p.real : p.handle ? `@${p.handle}` : "")))));
      })
      .child(h_flex().flex_none().gap(6).items_end().p(8).bg(t.chrome).border_t(1).border_color(t.border)
        .child(div().relative().flex_1().min_w(0)
          .key_context(this.mention && this.mentionList().length ? "SlackPicking" : "SlackComposer")
          .on_action("slack_enter", (_e, cx) => { this.enter(cx); cx.notify(); })
          .on_action("slack_pick_up", (_e, cx) => { const n = this.mentionList().length; if (n) this.mentionSel = (Math.min(this.mentionSel, n - 1) + n - 1) % n; cx.notify(); })
          .on_action("slack_pick_down", (_e, cx) => { const n = this.mentionList().length; if (n) this.mentionSel = (Math.min(this.mentionSel, n - 1) + 1) % n; cx.notify(); })
          .on_action("slack_pick_tab", (_e, cx) => this.enter(cx))
          .on_action("slack_pick_escape", (_e, cx) => { this.mention = null; cx.notify(); })
          .on_key_down((e, cx) => {
            if (!this.mention) return;
            const list = this.mentionList();
            if (!list.length) return;
            if (e.keystroke === "down") this.mentionSel = (Math.min(this.mentionSel, list.length - 1) + 1) % list.length;
            else if (e.keystroke === "up") this.mentionSel = (Math.min(this.mentionSel, list.length - 1) + list.length - 1) % list.length;
            else if (e.keystroke === "tab") { cx.stop_propagation(); this.pickMention(list[Math.min(this.mentionSel, list.length - 1)], cx); return; }
            else if (e.keystroke === "escape") this.mention = null;
            else return;
            cx.stop_propagation();
            cx.notify();
          })
          .child(Textarea.new(this.reply).min_h(30).px(9).py(6).rounded(4).border(1).border_color(t.input).bg(t.canvas ?? t.background).text_size(12.5).text_color(t.foreground))
          .when(this.replyEmpty, (el) => el.child(div().absolute().left(10).top(0).h(30).flex().items_center().text_size(12.5).text_color(t.dim).child(th ? "Reply in thread…" : `Reply to ${o.title}…`))))
        .child(div().id("sl-send").size(30).flex_none().flex().items_center().justify_center().rounded(4).bg(t.solid ?? t.accent).text_color(t.solid_foreground ?? t.accent_foreground)
          .when(sending || this.replyEmpty, (el) => el.opacity(0.45))
          .when(!sending && !this.replyEmpty, (el) => el.cursor_pointer().hover((s) => s.opacity(0.88)).on_click((_e, cx) => this.send(cx)))
          .tooltip("Send (Enter)")
          .child(svg(ICON("send")).size(14))))
      // Slack's "Also send to #channel": the reply goes into the thread and the conversation.
      .when(Boolean(th), (el) => el.child(h_flex().id("sl-bcast").flex_none().px(10).pb(8).gap(6).items_center().bg(t.chrome).cursor_pointer().text_size(12).text_color(t.muted)
        .hover((s) => s.text_color(t.foreground))
        .on_click((_e, cx) => { this.alsoSend = !this.alsoSend; cx.notify(); })
        .child(div().size(14).flex_none().rounded(3).border(1).flex().items_center().justify_center()
          .border_color(this.alsoSend ? t.solid ?? t.accent : t.input).bg(this.alsoSend ? t.solid ?? t.accent : t.canvas ?? t.background).text_color(t.solid_foreground ?? t.accent_foreground)
          .when(Boolean(this.alsoSend), (e) => e.child(svg(ICON("check")).size(11))))
        .child(o.kind === "im" ? "Also send as direct message" : o.kind === "mpim" ? "Also send to the group" : `Also send to #${o.title}`)));
  }
}
