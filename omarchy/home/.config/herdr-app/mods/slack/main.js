// slack: read and answer Slack from Herdr's side panel. A list of conversations in two
// groups (direct messages, channels), newest first; a click opens one full height with the
// reply box at the bottom, scrolling back through its history, and emoji reactions.
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
// The list's own sections, like Slack's sidebar sections, are kept here only.
import { View, div, svg, image } from "gpui-kit";
import * as fs from "fs/promises";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { WebSocket } from "websocket";
import EMOJI_NAMES from "./emoji-map.js";
import { call, AUTH_ERRORS, missingScopes, newWizard, renderSetup, runCheck, saveTokens, removeTokens, button, lock } from "./setup.js";
import { theme, settings, props as given, appHome, readTextFile, notify, shared, setShared, nextCommand, exec, home, window as appWindow, playSound, run, openOverlay, closeOverlay } from "herdr";

const NAME = "slack";
const ICON = (name) => `mods/${NAME}/${name}.svg`;
const STATE = "slack.state", CMD = "slack.cmd", UNREAD = "slack.unread", PEOPLE = "slack.people";
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
// Text as Slack writes it, made readable: :white_check_mark: → ✅ (a workspace's own emoji stay
// as :name:), and *bold* / _italic_ / ~strike~ markers dropped, since a line here is one style.
const pretty = (x) => x
  .replace(/:([a-z0-9_+'-]+)(?:::skin-tone-\d)?:/g, (all, n) => EMOJI_NAMES[n] ?? EMOJI[n] ?? all)
  .replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s).,:;!?-])/g, "$1$2")
  .replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,:;!?-])/g, "$1$2")
  .replace(/(^|[\s(])~([^~\n]+)~(?=$|[\s).,:;!?-])/g, "$1$2");

const dir = () => `${appHome().replace(/\\/g, "/")}/data/${NAME}`;
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
  return `${uid}-${hashOf(url).toString(36)}${ext}`;
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
// The one host that gets the user token: exactly files.slack.com over https (no user part, no
// port, not a longer name ending in it).
const SLACK_FILES = /^https:\/\/files\.slack\.com(?=[/?#]|$)/;
const WEB = /^https?:\/\/[^\s/?#@\\]+(?:[/?#][^\s]*)?$/i;
const MAILTO = /^mailto:[^\s<>"'/\\]+@[^\s<>"'/\\]+$/i;
const MEDIA_NAME = /^[a-z0-9]+\.(?:png|jpe?g|gif|webp)$/;
// Avatars (faceFile names) are kept the same way, in data/slack/avatars/.
const FACE_NAME = /^[UWB][A-Z0-9]{2,20}-[a-z0-9]+\.(?:png|jpe?g|gif)$/;
const FACE_COUNT = 2000, FACE_BYTES = 50 * 1048576;
const LEVELS = new Set(["all", "mentions", "nothing"]);
const TILE_W = 360; // widest a picture shows in a message
function mediaKey(url) {
  const ext = (String(url).match(/\.(png|jpe?g|gif|webp)(?=[?#]|$)/i)?.[0] ?? ".jpg").toLowerCase();
  return `${hashOf(url).toString(36)}${String(url).length.toString(36)}${ext}`;
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
async function browse(url) {
  if (!WEB.test(url)) return;
  try {
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
function plainText(text, names) {
  return String(text ?? "")
    .replace(/<@([UW][A-Z0-9]+)(?:\|[^>]*)?>/g, (_m, id) => `@${names.get(id) ?? "someone"}`)
    .replace(/<#[A-Z0-9]+\|([^>]+)>/g, "#$1")
    .replace(/<!(here|channel|everyone)[^>]*>/g, "@$1")
    .replace(/<(?:mailto:|tel:)?([^>|]+)\|([^>]+)>/g, "$2")
    .replace(/<([^>|]+)>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .replace(/[\s\S]*/, (all) => pretty(all));
}

// The same text as parts, so links keep their address: { t: "text", s } | { t: "link", url, label }.
function segmentsOf(text, names) {
  const decode = (x) => pretty(x.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"));
  const out = [], src = String(text ?? "");
  let at = 0;
  for (const m of src.matchAll(/<([^>]+)>/g)) {
    if (m.index > at) out.push({ t: "text", s: decode(src.slice(at, m.index)) });
    at = m.index + m[0].length;
    const [target, label] = m[1].split("|");
    if (/^@[UW]/.test(target)) out.push({ t: "mention", id: target.slice(1), label: `@${names.get(target.slice(1)) ?? label ?? "someone"}` });
    else if (target.startsWith("#")) out.push({ t: "mention", id: target.slice(1), channel: true, label: `#${label ?? target.slice(1)}` });
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
    // The panel: its own inputs, and the last command it waits on.
    this.filter = InputState.new();
    this.filterEmpty = true;
    this.filter.on("change", (_e, cx) => { this.filterEmpty = !this.filter.value(); cx.notify(); });
    this.reply = InputState.new();
    this.replyEmpty = true;
    this.reply.on("change", (_e, cx) => { this.replyEmpty = !this.reply.value(); this.findMention(); cx.notify(); });
    // Enter picks the highlighted person while the @ list is open, and sends otherwise.
    this.reply.on("submit", (_e, cx) => {
      const list = this.mention ? this.mentionList() : [];
      if (list.length) this.pickMention(list[Math.min(this.mentionSel, list.length - 1)], cx);
      else this.send(cx);
    });
    // @mentions: the word being typed after @, the highlighted row, and the names picked
    // (as written in the box → their Slack id, turned into <@id> when sent).
    this.mention = null;
    this.mentionSel = 0;
    this.picked = new Map();
    this.pending = null; // the number of the send waiting for an answer
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
    // The list: collapsed sections, newest-first or A–Z, and the Unreads section, kept between
    // starts; the row or section whose menu is open; a section being named.
    this.folded = new Set();
    this.sortAlpha = false;
    this.unreadsOn = true;
    try { this.folded = new Set(JSON.parse(localStorage.getItem("folded") ?? "[]")); } catch (_) {}
    try { this.sortAlpha = localStorage.getItem("sort") === "alpha"; this.unreadsOn = localStorage.getItem("unreads") !== "off"; } catch (_) {}
    this.rowMenu = null;
    this.rowHover = null;
    this.secMenu = null;
    this.secEdit = null; // { mode: "new" | "rename", sid?, move? }
    this.secIn = InputState.new();
    this.secIn.on("submit", (_e, cx) => this.submitSection(cx));
    this.groupCache = null;
    this.chat = { id: null, off: 0, viewH: 0, contentH: 0, hover: null, pick: null, askedOlder: null };
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
          else if (c.startsWith("type-")) { this.reply.set_value(c.slice(5).replaceAll("_", " ")); this.replyEmpty = !this.reply.value(); this.findMention(); }
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
  command(cmd) {
    this.cmdN = (this.cmdN ?? 0) + 1;
    const n = `${Date.now()}.${this.cmdN}`;
    setShared(CMD, { n, ...cmd });
    return n;
  }

  // "@ra" at the end of the box: the list opens with the people that match.
  findMention() {
    const v = this.reply.value(), m = v.match(/(^|\s)@([^\s@]{0,30})$/);
    const next = m ? { start: v.length - m[2].length - 1, q: m[2].toLowerCase() } : null;
    if (next?.q !== this.mention?.q) this.mentionSel = 0;
    this.mention = next;
  }

  // People for the @ list: who wrote in this conversation first, then by how well the name
  // matches (start of the name, start of a word in it, anywhere).
  mentionList() {
    const q = this.mention?.q ?? "", people = shared(PEOPLE) ?? [];
    const o = shared(STATE)?.open, recent = new Map();
    [...(o?.messages ?? [])].reverse().forEach((m, i) => { if (!m.mine && m.uid && !recent.has(m.uid)) recent.set(m.uid, i); });
    const score = (p) => {
      const fields = [p.name, p.real, p.handle].map((x) => String(x ?? "").toLowerCase());
      if (!q) return recent.has(p.id) ? 0 : 5;
      if (fields.some((x) => x.startsWith(q))) return recent.has(p.id) ? 0 : 1;
      if (fields.some((x) => x.split(/[\s._-]+/).some((w) => w.startsWith(q)))) return 2;
      if (fields.some((x) => x.includes(q))) return 3;
      return 9;
    };
    return people.map((p) => [score(p), p]).filter(([sc]) => sc < 9)
      .sort((a, b) => a[0] - b[0] || (recent.get(a[1].id) ?? 999) - (recent.get(b[1].id) ?? 999) || a[1].name.localeCompare(b[1].name))
      .slice(0, 6).map(([, p]) => p);
  }

  pickMention(p, cx) {
    if (!this.mention || !p) return;
    const v = this.reply.value(), label = `@${p.name}`, next = `${v.slice(0, this.mention.start)}${label} `;
    this.picked.set(label, p.id);
    this.mention = null;
    this.reply.set_value(next);
    this.reply.set_selected_range({ start: next.length, end: next.length });
    this.reply.focus();
    this.replyEmpty = false;
    cx.notify();
  }

  // What Slack gets: picked names, and any @handle typed out in full, as <@id>.
  withMentions(text) {
    for (const [label, id] of [...this.picked].sort((a, b) => b[0].length - a[0].length)) text = text.split(label).join(`<@${id}>`);
    const byHandle = new Map((shared(PEOPLE) ?? []).filter((p) => p.handle).map((p) => [p.handle.toLowerCase(), p.id]));
    return text.replace(/(^|\s)@([a-z0-9._-]+)/gi, (all, sp, h) => (byHandle.has(h.toLowerCase()) ? `${sp}<@${byHandle.get(h.toLowerCase())}>` : all));
  }

  send(cx) {
    const S = shared(STATE), text = this.withMentions(this.reply.value().trim());
    if (!S?.open || !text || this.pending) return;
    this.mention = null;
    this.pending = this.command({ type: "send", id: S.open.id, text, thread_ts: S.open.thread?.ts ?? null });
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
    this.status = "starting";
    this.error = null;
    this.open = null;
    this.result = null; // { n, ok, error } of the last send
    // Each start (and each reload after setup) is one generation; the loops of an older one stop.
    this.gen = 0;
    this.needs = null; // "app" | "user": the token setup asks for again
    this.has = { app: false, user: false };
    this.missing = []; // the user token's missing permissions: [{ scope, what }]
    // Profile pictures: Slack's address for each person (and app), and the ones downloaded
    // into data/slack/avatars/ (kept between starts), as paths image() takes.
    this.faces = new Map();
    this.avatars = {};
    this.faceQueue = [];
    this.faceAsked = new Set();
    // The workspace's own emoji (emoji.list, needs emoji:read): name → picture address, or the
    // character of a standard emoji it is an alias of.
    this.customEmoji = new Map();
    // Everyone who can be @mentioned: { id, name, real, handle }.
    this.people = new Map();
    // Files downloaded or downloading: file id → { state: "busy" | "done" | "error", path, error }.
    this.downloads = {};
    // Pictures shown in the open conversation: key → path for image(). mediaIndex is every
    // file kept in data/slack/media/ (key → { size, at }), saved between starts.
    this.media = {};
    this.mediaIndex = {};
    this.mediaQueue = [];
    this.mediaAsked = new Set();
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
    // Your own sidebar sections. Slack's sections aren't readable with an app's scopes, so
    // these live here only: [{ id, name }] in order, and conversation id → section id.
    this.sections = [];
    this.placed = {};
    try {
      const { list, placed } = JSON.parse(localStorage.getItem("sections") ?? "{}") ?? {};
      this.sections = (Array.isArray(list) ? list : []).filter((s) => /^s[a-z0-9]{1,24}$/.test(s?.id) && typeof s.name === "string").slice(0, 50).map((s) => ({ id: s.id, name: s.name.slice(0, 80) }));
      const ids = new Set(this.sections.map((s) => s.id));
      for (const [c, sid] of Object.entries(placed && typeof placed === "object" ? placed : {})) if (/^[CDG][A-Z0-9]+$/.test(c) && ids.has(sid)) this.placed[c] = sid;
    } catch (_) {}
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
    this.lastCmd = shared(CMD)?.n ?? null; // an old command is not redone
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
    this.status = "starting";
    this.error = null;
    this.needs = null;
    this.missing = [];
    // Another token may be another person or workspace: nothing of the last one's stays shown.
    this.faces = new Map();
    this.avatars = {};
    this.faceQueue = [];
    this.faceAsked = new Set();
    this.people = new Map();
    this.customEmoji = new Map();
    this.downloads = {};
    this.media = {};
    this.mediaQueue = [];
    this.mediaAsked = new Set();
    this.mediaFailed = new Set();
    this.dirty = true;
    cx.spawn(async (cx) => {
      try { await this.boot(cx, gen); } catch (e) { if (gen === this.gen) this.fail(e); }
    });
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
    this.users.set(who.user_id, who.user);
    this.owner = hashOf(`${who.team_id}:${who.user_id}`).toString(36);
    this.status = "loading";
    this.dirty = true;
    await this.loadConversations();
    if (gen !== this.gen) return;
    await this.loadUsers();
    if (gen !== this.gen) return;
    for (const c of this.convs.values()) this.nameConv(c);
    setShared(PEOPLE, [...this.people.values()]);
    this.needFace(this.me.id);
    for (const c of this.convs.values()) if (c.kind === "im") this.needFace(c.user);
    this.dirty = true;
    cx.spawn((cx) => this.faceLoop(cx, gen));
    cx.spawn((cx) => this.mediaLoop(cx, gen));
    cx.spawn((cx) => this.connectLoop(cx, gen));
    cx.spawn(async () => {
      const missing = await missingScopes(this.userToken).catch(() => []);
      if (gen === this.gen) { this.missing = missing; this.dirty = true; }
    });
    cx.spawn(() => this.loadEmoji(gen));
    await this.hydrate(cx, gen);
  }

  api(method, params, post) {
    return call(this.userToken, method, params, post);
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
    const lines = [[]];
    for (const p of parts) {
      if (p.t !== "text") { lines[lines.length - 1].push(p); continue; }
      p.s.split("\n").forEach((piece, i) => {
        if (i) lines.push([]);
        if (piece.trim()) lines[lines.length - 1].push(...runs(piece.trim()));
      });
    }
    if (!lines.some((l) => l.some((p) => p.t !== "text"))) return { s: parts.map((p) => runs(p.s).map((r) => r.s).join("")).join("") };
    return {
      lines: lines.map((line) => (!line.length ? null : !line.some((p) => p.t !== "text") ? { s: line.map((p) => p.s).join(" ") }
        : { w: line.flatMap((p) => (p.t === "text" ? p.s.split(/\s+/).filter(Boolean).map((s) => ({ t: "text", s })) : [p])) })),
    };
  }

  async loadUsers() {
    let cursor = "";
    for (let page = 0; page < 8; page++) {
      const j = await this.api("users.list", { limit: "200", cursor });
      if (!j.ok) break;
      for (const u of j.members ?? []) {
        const name = u.profile?.display_name || u.profile?.real_name || u.real_name || u.name;
        this.users.set(u.id, name);
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
    if (c.kind === "im") { c.title = this.users.get(c.user) ?? c.user ?? "Direct message"; return; }
    if (c.kind === "mpim") {
      const handles = c.name.replace(/^mpdm-/, "").replace(/-\d+$/, "").split("--").filter((h) => h && h !== this.me?.name);
      c.title = handles.length > 3 ? `${handles.slice(0, 3).join(", ")} +${handles.length - 3}` : handles.join(", ") || "Group";
      return;
    }
    c.title = c.name;
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
  // leaves it out for many). conversations.info is asked only when that message is new, for
  // the point you had read up to and Slack's own count.
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
    const fresh = Number(latest.ts) > Number(this.seen[c.id] ?? 0) && Date.now() - c.ts < 14 * 86400000;
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
    const body = plainText(m.text || card, this.users).replace(/\s+/g, " ").trim() || (m.files?.length ? "[file]" : "[message]");
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
    // a toast when it is for you. It doesn't go into the conversation itself.
    if (ev.thread_ts && ev.thread_ts !== ev.ts && ev.subtype !== "thread_broadcast") {
      if (ev.user && !this.users.has(ev.user)) await this.resolveUsers([ev.user]);
      const o = this.open?.id === ev.channel ? this.open : null;
      const parent = o?.messages.find((m) => m.ts === ev.thread_ts);
      if (o?.thread?.ts === ev.thread_ts && !o.thread.messages.some((m) => m.ts === ev.ts)) {
        o.thread.messages.push(this.normalize(ev));
        if (parent) parent.replies += 1;
      } else if (parent) parent.replies += 1;
      if (parent) {
        parent.lastReply = Number(ev.ts) * 1000;
        if (ev.user && !parent.repliers.some((r) => r.id === ev.user)) parent.repliers = [...parent.repliers, { id: ev.user, name: ev.user === this.me.id ? "You" : this.users.get(ev.user) ?? "someone" }].slice(0, 4);
      }
      const mentioned = (ev.text ?? "").includes(`<@${this.me.id}>`) || /<!(here|channel|everyone)/.test(ev.text ?? "");
      if (ev.user !== this.me.id && c && (mentioned || c.kind === "im" || c.kind === "mpim") && o?.thread?.ts !== ev.thread_ts && this.shouldNotify(c, mentioned)) {
        const from = this.users.get(ev.user) ?? ev.username ?? ev.bot_profile?.name ?? "Slack";
        this.toast(c, { thread: ev.thread_ts, title: from, where: c.kind === "im" ? "Reply in your thread" : `Thread in ${c.kind === "channel" ? "#" : ""}${c.title}`, body: plainText(ev.text, this.users).slice(0, 160) || "[file]", uid: ev.user, mention: mentioned });
      }
      this.dirty = true;
      return;
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
      this.seen[c.id] = ev.ts;
      this.saveSeen();
    } else if (!mine) {
      c.unread += 1;
      const mentioned = (ev.text ?? "").includes(`<@${this.me.id}>`) || /<!(here|channel|everyone)/.test(ev.text ?? "");
      if (mentioned) c.mention = true;
      if (this.shouldNotify(c, mentioned)) {
        const from = this.users.get(ev.user) ?? ev.username ?? ev.bot_profile?.name ?? "Slack";
        this.toast(c, { title: from, where: c.kind === "im" ? "Direct message" : c.kind === "mpim" ? c.title : `${c.kind === "channel" ? "#" : ""}${c.title}`, body: plainText(ev.text, this.users).slice(0, 160) || "[file]", uid: ev.user ?? ev.bot_id, mention: mentioned });
      }
    }
    this.dirty = true;
  }

  async resolveUsers(ids) {
    for (const id of [...new Set(ids)].filter((i) => i && !this.users.has(i)).slice(0, 8)) {
      const j = await this.api("users.info", { user: id }).catch(() => null);
      const u = j?.ok ? j.user : null;
      this.users.set(id, u ? u.profile?.display_name || u.real_name || u.name : "someone");
      if (u?.profile?.image_48) this.faces.set(id, u.profile.image_48);
    }
  }

  // Asks for a person's picture once; faceLoop downloads them one at a time with curl (on
  // macOS, Linux and Windows 10+), skipping the ones already on disk.
  needFace(uid) {
    if (!uid || this.avatars[uid] || this.faceAsked.has(uid) || !this.faces.has(uid)) return;
    this.faceAsked.add(uid);
    this.faceQueue.push(uid);
  }

  async faceLoop(cx, gen) {
    const root = `${dir()}/avatars`, owner = this.owner, folder = `${root}/${owner}`, index = this.faceIndex;
    await this.claimFolder(root, "faceOwner", FACE_NAME, index);
    if (gen !== this.gen) return;
    await this.reconcile(folder, FACE_NAME, index);
    await this.prune(folder, index, null, FACE_COUNT, FACE_BYTES, (k) => this.dropFace(k));
    this.faceIndexDirty = true;
    while (gen === this.gen) {
      const uid = this.faceQueue.shift();
      if (!uid) { await sleep(cx, 400); continue; }
      const url = this.faces.get(uid);
      // The file name is built from these two, so both must be what Slack gives.
      if (!/^[UWB][A-Z0-9]{2,20}$/.test(uid) || !pic(url)) continue;
      const name = faceFile(uid, url);
      if (index[name]) index[name].at = Date.now();
      else {
        const r = await exec("curl", ["-sf", "--proto", "=https", "--max-time", "20", "--max-filesize", "2M", "-o", `${folder}/${name}`, "-w", "%{size_download}", url]).catch(() => null);
        if (gen !== this.gen) return;
        if (!r || r.code !== 0) { await fs.unlink(`${folder}/${name}`).catch(() => {}); continue; }
        index[name] = { size: Number(r.stdout) || 0, at: Date.now() };
        await this.prune(folder, index, name, FACE_COUNT, FACE_BYTES, (k) => this.dropFace(k));
      }
      this.avatars[uid] = `data/${NAME}/avatars/${owner}/${name}`;
      // Everyone ever shown is published with each state; past this many the oldest go.
      const ids = Object.keys(this.avatars);
      if (ids.length > 1500) for (const id of ids.slice(0, ids.length - 1500)) delete this.avatars[id];
      this.faceIndexDirty = this.dirty = true;
    }
  }

  dropFace(name) {
    for (const [uid, path] of Object.entries(this.avatars)) if (path.endsWith(`/${name}`)) { delete this.avatars[uid]; this.faceAsked.delete(uid); }
  }

  // A picture a message shows: queued once; mediaLoop fetches it, or finds it already kept.
  // Returns the picture so normalize can keep it as it goes.
  needMedia(p) {
    if (!p) return null;
    const kept = this.mediaIndex[p.key];
    if (this.media[p.key]) { if (kept) kept.at = Date.now(); return p; }
    if (this.mediaFailed.has(p.key) || this.mediaAsked.has(p.key)) return p;
    this.mediaAsked.add(p.key);
    this.mediaQueue.push(p);
    // Scrolling far back in a busy channel shouldn't pile up work: the oldest asks go first.
    while (this.mediaQueue.length > 200) this.mediaAsked.delete(this.mediaQueue.shift().key);
    if (this.mediaFailed.size > 1000) this.mediaFailed.clear();
    return p;
  }

  // Pictures and avatars are kept per workspace and person, in data/slack/<kind>/<owner>/.
  // When the token is someone else's, the last one's files (and those from before the folders)
  // are removed rather than shown, and the index starts empty. Only names this mod makes
  // (nameRe) are ever deleted.
  async claimFolder(root, key, nameRe, index) {
    let was = null;
    try { was = localStorage.getItem(key); } catch (_) {}
    if (was !== this.owner) {
      for (const k of Object.keys(index)) delete index[k];
      for (const n of await fs.readdir(root).catch(() => [])) {
        if (nameRe.test(n)) await fs.unlink(`${root}/${n}`).catch(() => {});
        else if (/^[a-z0-9]+$/.test(n) && n !== this.owner) {
          for (const m of await fs.readdir(`${root}/${n}`).catch(() => [])) if (nameRe.test(m)) await fs.unlink(`${root}/${n}/${m}`).catch(() => {});
          await fs.rmdir(`${root}/${n}`).catch(() => {});
        }
      }
      try { localStorage.setItem(key, this.owner); } catch (_) {}
    }
    await fs.mkdir(`${root}/${this.owner}`, { recursive: true }).catch(() => {});
  }

  // A file the index doesn't know is what an interrupted download left; an entry without its
  // file was removed by hand.
  async reconcile(folder, nameRe, index) {
    const onDisk = new Set((await fs.readdir(folder).catch(() => [])).filter((n) => nameRe.test(n)));
    for (const name of onDisk) if (!index[name]) await fs.unlink(`${folder}/${name}`).catch(() => {});
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

  async mediaLoop(cx, gen) {
    const root = `${dir()}/media`, owner = this.owner, folder = `${root}/${owner}`, index = this.mediaIndex;
    await this.claimFolder(root, "mediaOwner", MEDIA_NAME, index);
    if (gen !== this.gen) return;
    await this.reconcile(folder, MEDIA_NAME, index);
    const drop = (k) => { delete this.media[k]; };
    await this.prune(folder, index, null, MEDIA_COUNT, MEDIA_BYTES, drop);
    this.mediaIndexDirty = true;
    while (gen === this.gen) {
      const p = this.mediaQueue.shift();
      if (!p) { await sleep(cx, 300); continue; }
      this.mediaAsked.delete(p.key);
      const path = `data/${NAME}/media/${owner}/${p.key}`, file = `${folder}/${p.key}`;
      if (index[p.key]) {
        index[p.key].at = Date.now();
        this.media[p.key] = path;
        this.mediaIndexDirty = this.dirty = true;
        continue;
      }
      const r = await this.slackCurl(gen, p.url, ["-sf", "--proto", "=https", "--max-time", "20", "--max-filesize", MEDIA_FILE_MAX, "-o", file], "%{size_download}\n%{content_type}");
      if (gen !== this.gen) return;
      const [bytes = "0", type = ""] = r?.rest ?? [];
      // Slack answers a file this token may not see with its sign-in page, not an error.
      if (!r || r.code !== 0 || !/^image\//.test(type)) {
        await fs.unlink(file).catch(() => {});
        this.mediaFailed.add(p.key);
        continue;
      }
      index[p.key] = { size: Number(bytes) || 0, at: Date.now() };
      this.media[p.key] = path;
      await this.prune(folder, index, p.key, MEDIA_COUNT, MEDIA_BYTES, drop);
      this.mediaIndexDirty = this.dirty = true;
    }
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

  // Your sections: new (optionally moving a conversation in), rename, delete (its conversations
  // go back to their usual group), move a conversation (sid null: out of any section), and
  // order (dir -1 / 1).
  editSections({ op, sid, name, id, dir }) {
    const clean = String(name ?? "").trim().slice(0, 40);
    if (id != null && !this.convs.has(id)) id = null;
    if (op === "new" && clean && this.sections.length < 50) {
      const s = { id: `s${Date.now().toString(36)}`, name: clean };
      this.sections = [...this.sections, s];
      if (id) this.placed[id] = s.id;
    } else if (op === "rename" && clean) this.sections = this.sections.map((s) => (s.id === sid ? { ...s, name: clean } : s));
    else if (op === "delete") {
      this.sections = this.sections.filter((s) => s.id !== sid);
      for (const [cid, at] of Object.entries(this.placed)) if (at === sid) delete this.placed[cid];
    } else if (op === "move" && id) {
      if (sid && this.sections.some((s) => s.id === sid)) this.placed[id] = sid; else delete this.placed[id];
    } else if (op === "order") {
      const i = this.sections.findIndex((s) => s.id === sid), j = i + (dir < 0 ? -1 : 1);
      if (i < 0 || j < 0 || j >= this.sections.length) return;
      const list = [...this.sections];
      [list[i], list[j]] = [list[j], list[i]];
      this.sections = list;
    } else return;
    try { localStorage.setItem("sections", JSON.stringify({ list: this.sections, placed: this.placed })); } catch (_) {}
    this.dirty = true;
  }

  // A Slack toast is Herdr's own toast with the writer's picture (Slack's purple mark while
  // it hasn't downloaded), Slack's own sound, and a click that opens the conversation, or the
  // thread, in the side panel (slack.goto-<conversation>[-<thread ts, . as _>]).
  toast(c, n) {
    this.needFace(n.uid);
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

  // Marks conversations read at their newest message, in Slack as well as here. The counts go
  // at once; a conversation Slack refuses comes back as it was, with a note. Without the
  // write scopes, read stays a Herdr-only mark (as before) and the note says how to get them.
  async markRead(ids) {
    const marked = [];
    for (const id of [...new Set(Array.isArray(ids) ? ids : [])].slice(0, 200)) {
      const c = this.convs.get(id);
      if (!c) continue;
      marked.push({ c, unread: c.unread, mention: c.mention, seen: this.seen[id] });
      c.unread = 0;
      c.mention = false;
    }
    if (!marked.length) return;
    this.dirty = true;
    this.publish();
    let local = 0, failed = 0, why = "";
    for (const m of marked) {
      const c = m.c;
      let ts = c.lastTs;
      if (!ts) {
        const h = await this.api("conversations.history", { channel: c.id, limit: "1" }).catch(() => null);
        ts = h?.ok ? h.messages?.[0]?.ts : null;
        if (ts) c.lastTs = ts;
      }
      if (!ts) continue;
      this.seen[c.id] = ts;
      const j = await this.api("conversations.mark", { channel: c.id, ts }, true).catch((e) => ({ ok: false, error: String(e?.message ?? e) }));
      if (j?.ok) continue;
      if (j?.error === "missing_scope") { local += 1; continue; }
      failed += 1;
      why = j?.error ?? "no answer";
      c.unread = m.unread;
      c.mention = m.mention;
      if (m.seen == null) delete this.seen[c.id]; else this.seen[c.id] = m.seen;
    }
    this.saveSeen();
    if (failed) this.note = { text: `Couldn't mark ${failed === 1 ? "it" : `${failed} conversations`} read in Slack (${why}).`, error: true, until: Date.now() + 8000 };
    else if (local) this.note = { text: "Marked read in Herdr only: Slack needs write permissions. Gear menu → Fix permissions.", until: Date.now() + 8000 };
    this.dirty = true;
  }

  saveSeen() {
    try { localStorage.setItem("seen", JSON.stringify(this.seen)); } catch (_) {}
  }

  // ── background: commands from the panel ───────────────────────────────────────────────
  poll(cx) {
    const cmd = shared(CMD);
    if (!cmd || cmd.n === this.lastCmd) return;
    this.lastCmd = cmd.n;
    cx.spawn(async () => {
      try {
        if (cmd.type === "reload") this.reload(cx);
        else if (cmd.type === "open") await this.openConv(cmd.id);
        else if (cmd.type === "close") { this.open = null; this.dirty = true; }
        else if (cmd.type === "send") await this.sendMessage(cmd);
        else if (cmd.type === "older") await this.loadOlder(cmd);
        else if (cmd.type === "react") await this.react(cmd);
        else if (cmd.type === "thread") await this.openThread(cmd);
        else if (cmd.type === "unthread") { if (this.open) this.open.thread = null; this.dirty = true; }
        else if (cmd.type === "download") await this.download(cmd.file);
        else if (cmd.type === "media") {
          // Its key is worked out again here: the panel's is not trusted to name a file.
          const p = pic(cmd.pic?.url, cmd.pic?.w, cmd.pic?.h);
          if (p) { this.mediaFailed.delete(p.key); this.needMedia(p); }
        }
        else if (cmd.type === "goto") await this.goto(cmd.id, cmd.ts ?? null);
        else if (cmd.type === "markread") await this.markRead(cmd.ids ?? [cmd.id]);
        else if (cmd.type === "section") this.editSections(cmd);
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
          this.missing = await missingScopes(this.userToken).catch(() => this.missing);
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
        if (cmd.type === "send") this.result = { n: cmd.n, ok: false, error: msg };
        else if (this.open) this.open.notice = msg;
        this.dirty = true;
      }
    });
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
      };
    });
    const blocks = this.blocksOf(m.blocks);
    const cards = (m.attachments ?? []).slice(0, 4).map((a) => this.cardOf(a)).filter(Boolean);
    // A message drawn from blocks carries its text only as the notification fallback.
    const fromBlocks = Boolean(blocks?.some((b) => b.t !== "divider"));
    const text = fromBlocks ? "" : plainText(m.text, this.users).trim().slice(0, 4000);
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
    return this.layout(segmentsOf(s, this.users));
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
    this.open = { id, title: c.title, kind: c.kind, messages: [], loading: true, error: null, notice: null, more: true };
    // Only the open conversation's pictures are published; the files stay kept on disk.
    this.media = {};
    c.unread = 0;
    c.mention = false;
    this.dirty = true;
    let got;
    try { got = await this.fetchMessages(id); } catch (e) {
      if (this.open?.id === id) { this.open.loading = false; this.open.error = String(e?.message ?? e); this.dirty = true; }
      return;
    }
    if (this.open?.id !== id) return;
    this.open.messages = got.msgs.map((m) => this.normalize(m));
    this.open.more = got.more;
    this.open.loading = false;
    const last = got.msgs[got.msgs.length - 1];
    if (last) { this.seen[id] = last.ts; this.saveSeen(); c.ts = c.ts || Number(last.ts) * 1000; if (Number(last.ts) * 1000 >= c.ts) c.lastTs = last.ts; }
    this.dirty = true;
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
    o.thread.loading = false;
    this.dirty = true;
  }

  async sendMessage({ n, id, text, thread_ts }) {
    const j = await this.api("chat.postMessage", thread_ts ? { channel: id, text, thread_ts } : { channel: id, text }, true);
    if (!j.ok) throw new Error(`Slack says ${j.error}`);
    this.result = { n, ok: true };
    if (thread_ts) {
      const o = this.open?.id === id ? this.open : null;
      if (o?.thread?.ts === thread_ts && !o.thread.messages.some((m) => m.ts === j.ts)) o.thread.messages.push(this.normalize({ ...j.message, ts: j.ts, user: this.me.id, text }));
      const parent = o?.messages.find((m) => m.ts === thread_ts);
      if (parent) {
        parent.replies += 1;
        parent.lastReply = Number(j.ts) * 1000;
        if (!parent.repliers.some((r) => r.id === this.me.id)) parent.repliers = [...parent.repliers, { id: this.me.id, name: "You" }].slice(0, 4);
      }
      this.dirty = true;
      return;
    }
    if (this.open?.id === id && !this.open.messages.some((m) => m.ts === j.ts)) {
      this.open.messages.push(this.normalize({ ...j.message, ts: j.ts, user: this.me.id, text }));
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
    const convs = [...this.convs.values()].map((c) => {
      const p = this.prefs[c.id] ?? {}, level = p.level ?? defaultLevel(c.kind), muted = Boolean(p.muted);
      const loud = muted ? c.mention : level === "all" || (level === "mentions" && (c.mention || c.kind === "im"));
      return { id: c.id, kind: c.kind, title: c.title ?? c.name, unread: c.unread, loud: loud && c.unread > 0 ? c.unread : 0, mention: c.mention, preview: c.preview, ts: c.ts, user: c.user, muted, level };
    });
    const loud = convs.reduce((n, c) => n + c.loud, 0);
    // The list is grouped again only when this changes, not on every picture or download.
    const listKey = hashOf(JSON.stringify([convs, this.sections, this.placed])).toString(36);
    setShared(STATE, { listKey, note: this.note ? { text: this.note.text, error: Boolean(this.note.error) } : null, me: this.me?.id ?? null, status: this.status, error: this.error, team: this.team, convs, open: this.open, result: this.result, soundOn: this.soundOn, pauseUntil: this.pauseUntil, scopedAt: this.scopedAt ?? 0, avatars: this.avatars, media: this.media, sections: this.sections, placed: this.placed, downloads: this.downloads, gen: this.gen, needs: this.needs, has: this.has, missing: this.missing });
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
    const root = v_flex().id("slack").size_full().min_h(0).overflow_hidden().bg(t.background).text_size(13).text_color(t.muted);
    if (!S) return root.child(this.header(t, null)).child(this.message(t, "Connecting to Slack…"));
    // Setup opens by itself while a token is missing or rejected, unless closed for this start.
    if (S.status === "setup" && !this.wiz && this.closedGen !== S.gen) this.wiz = newWizard(S);
    if (this.wiz) return root.child(this.header(t, S)).child(renderSetup(this, t, S, cx));
    const setupButton = (label) => h_flex().px(16).child(button(t, "sl-setup-open", label, (_e, cx) => { this.wiz = newWizard(shared(STATE)); cx.notify(); }, { primary: true, icon: "key" }));
    if (S.status === "setup") return root.child(this.header(t, S)).child(v_flex().child(this.message(t, "Slack isn't set up.", S.error ?? "Two tokens connect this panel to your workspace.")).child(setupButton("Set up Slack")));
    if (S.status === "error") return root.child(this.header(t, S)).child(v_flex().child(this.message(t, "Couldn't connect to Slack.", S.error)).child(setupButton("Check the tokens")));
    return root.child(this.header(t, S))
      .when(Boolean(S.open) && this.notifOpen === S.open?.id, (el) => el.child(this.notifMenu(t, S)))
      .when((S.pauseUntil ?? 0) > Date.now(), (el) => el.child(this.pausedBar(t, S)))
      .when(this.menu && !S.open, (el) => el.child(this.menuBar(t, S)))
      .when(!S.open && (S.missing?.length ?? 0) > 0, (el) => el.child(this.missingBar(t, S)))
      .child(S.open ? this.conversation(t, S) : this.list(t, S));
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
    const d = S?.downloads?.[v.file?.id];
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
        .when(Boolean(v.file?.url) && d?.state !== "busy", (el) => el.child(tool("sl-v-dl", "download", "Download to Downloads", () => this.command({ type: "download", file: v.file }))))
        .when(Boolean(v.link), (el) => el.child(tool("sl-v-open", "external-link", "Open in browser", (cx) => this.openLink(v.link, cx))))
        .child(tool("sl-v-close", "x", "Close (Esc)", () => { if (this.overlayId) closeOverlay(this.overlayId); })))
      .child(div().flex_1().min_h(0).flex().items_center().justify_center().overflow_hidden()
        .child(path && k ? image(path).w(w).h(h).flex_none() : div().text_size(12).text_color(t.dim).child(path ? "" : "Loading…")));
  }

  // The user token lacks a permission: say what is off, and offer the fix.
  missingBar(t, S) {
    // Yellow background with dark text, in light and dark themes alike.
    const ink = "#1c1a16";
    return h_flex().flex_none().px(10).py(6).gap(8).items_center().bg(t.working).text_size(12).text_color(ink)
      .child(svg(ICON("triangle-alert")).size(13).flex_none())
      .child(div().flex_1().min_w(0).truncate().font_medium().tooltip(S.missing.map((m) => m.scope).join(", ")).child(`No ${S.missing.map((m) => m.what).join(", ")}: permission missing`))
      .child(div().id("sl-fix").flex_none().px(8).h(20).flex().items_center().rounded(4).font_semibold().cursor_pointer().bg("#1c1a1622").hover((s) => s.bg("#1c1a1640"))
        .on_click((_e, cx) => { this.wiz = newWizard(S, true); cx.notify(); }).child("Fix"));
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
        .child(div().flex_1().min_w(0).truncate().font_semibold().text_color(t.foreground).child(open.title))
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
      localStorage.setItem("sort", this.sortAlpha ? "alpha" : "recent");
      localStorage.setItem("unreads", this.unreadsOn ? "on" : "off");
    } catch (_) {}
  }

  // The sections, as in Slack's sidebar: Unreads (when on), your own sections, Channels,
  // Direct messages, Group DMs. In each, unread ones first, muted ones last, then newest (or
  // A–Z). Worked out again only when the published state, the filter or the sort changes.
  groupsOf(S, q) {
    const key = `${S.listKey}|${q}|${this.sortAlpha}|${this.unreadsOn}`;
    if (this.groupCache?.key === key) return this.groupCache.groups;
    const quiet = (c) => c.muted || c.level === "nothing";
    // Bold when there is something new you'd want to see; the red count is only for what
    // would notify you (c.loud, worked out with the bell's own rule in publish).
    const lit = (c) => c.unread > 0 && (!quiet(c) || c.loud > 0);
    const unreads = this.unreadsOn && !q;
    const groups = [
      ...(unreads ? [{ id: "unreads", label: "Unreads" }] : []),
      ...(S.sections ?? []).map((s) => ({ id: s.id, label: s.name, custom: true })),
      { id: "ch", label: "Channels" }, { id: "dm", label: "Direct messages" }, { id: "gdm", label: "Group DMs" },
    ].map((g) => ({ ...g, rows: [], unread: 0, muted: 0 }));
    const byId = new Map(groups.map((g) => [g.id, g])), placed = S.placed ?? {};
    // Conversations Slack has gone quiet in (no message found) stay out until you search for them.
    for (const c of S.convs) {
      if (q ? !c.title.toLowerCase().includes(q) : !(c.ts > 0)) continue;
      const g = (unreads && lit(c) && byId.get("unreads")) || byId.get(placed[c.id]) || byId.get(c.kind === "im" ? "dm" : c.kind === "mpim" ? "gdm" : "ch");
      g.rows.push({ ...c, quiet: quiet(c), lit: lit(c) });
      g.unread += c.loud ?? 0;
      if (c.muted) g.muted += 1;
    }
    const order = this.sortAlpha ? (a, b) => a.title.localeCompare(b.title) : (a, b) => b.ts - a.ts;
    for (const g of groups) g.rows.sort((a, b) => a.quiet - b.quiet || (b.loud > 0) - (a.loud > 0) || b.lit - a.lit || b.mention - a.mention || order(a, b));
    const out = groups.filter((g) => g.rows.length || (g.custom && !q));
    this.groupCache = { key, groups: out };
    return out;
  }

  submitSection(cx) {
    const E = this.secEdit, name = this.secIn.value().trim();
    if (!E || !name) return;
    this.command(E.mode === "new" ? { type: "section", op: "new", name, id: E.move ?? null } : { type: "section", op: "rename", sid: E.sid, name });
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

  list(t, S) {
    const q = this.filter.value().trim().toLowerCase();
    const groups = this.groupsOf(S, q), children = [];
    const tool = (id, icon, tip, on, onClick) => div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(4).cursor_pointer()
      .text_color(on ? t.foreground : t.dim).when(on, (e) => e.bg(t.raised)).hover((s) => s.bg(t.hover).text_color(t.foreground)).tooltip(tip)
      .on_click((_e, cx) => { cx.stop_propagation(); onClick(cx); cx.notify(); })
      .child(svg(ICON(icon)).size(13));
    if (this.secEdit) children.push(this.sectionInput(t));
    for (const g of groups) {
      const open = Boolean(q) || !this.folded.has(g.id), menu = this.secMenu === g.id;
      children.push(h_flex().id(`sl-g-${g.id}`).flex_none().h(28).px(8).gap(6).items_center().rounded(4).cursor_pointer().text_size(11.5).text_color(t.dim)
        .hover((s) => s.text_color(t.foreground))
        .on_click((_e, cx) => { this.folded.has(g.id) ? this.folded.delete(g.id) : this.folded.add(g.id); this.keepList(); cx.notify(); })
        // Right-click marks everything in the section read; Shift+right-click (or ⋯) opens the
        // menu of one of your sections.
        .on_mouse_down("right", (e, cx) => {
          cx.stop_propagation();
          if (g.custom && e.modifiers?.shift) { this.secMenu = menu ? null : g.id; this.rowMenu = null; cx.notify(); return; }
          const ids = g.rows.filter((c) => c.unread > 0 || c.mention).map((c) => c.id);
          if (ids.length) this.command({ type: "markread", ids });
        })
        .when(g.rows.some((c) => c.unread > 0 || c.mention), (el) => el.tooltip("Right-click to mark all read"))
        .child(svg(ICON(open ? "chevron-down" : "chevron-right")).size(11).flex_none())
        .child(div().min_w(0).truncate().font_semibold().child(g.label))
        .child(div().flex_none().child(String(g.rows.length)))
        .when(Boolean(g.custom) && g.rows.length > 0 && g.muted === g.rows.length, (el) => el.child(svg(ICON("bell-off")).size(10).flex_none()))
        .child(div().flex_1())
        .when(!open && g.unread > 0, (el) => el.child(div().px(5).rounded(8).bg(t.blocked).text_size(10.5).font_semibold().text_color("#ffffff").child(String(g.unread))))
        .when(Boolean(g.custom), (el) => el.child(tool(`sl-gm-${g.id}`, "ellipsis", "Section options", menu, () => { this.secMenu = menu ? null : g.id; this.rowMenu = null; }))));
      if (menu) children.push(this.sectionMenu(t, g));
      if (!open) continue;
      if (g.custom && !g.rows.length) children.push(div().flex_none().px(26).pb(4).text_size(11.5).text_color(t.dim).child("Empty. Use a conversation's ⋯ menu to move it here."));
      for (const c of g.rows.slice(0, SHOWN)) {
        children.push(this.row(t, c));
        if (this.rowMenu === c.id) children.push(this.rowMenuView(t, S, c));
      }
    }
    return v_flex().flex_1().min_h(0)
      .child(h_flex().flex_none().mx(8).mt(8).mb(4).gap(4).items_center()
        .child(div().relative().flex_1().min_w(0)
          .child(Input.new(this.filter).h(26).px(9).rounded(4).border(1).border_color(t.input).bg(t.canvas ?? t.background).text_size(12).text_color(t.foreground))
          .when(this.filterEmpty, (el) => el.child(div().absolute().left(10).top(0).h(26).flex().items_center().text_size(12).text_color(t.dim).child("Filter conversations"))))
        .child(tool("sl-sort", this.sortAlpha ? "arrow-down-a-z" : "clock", this.sortAlpha ? "Sorted A–Z (click for newest first)" : "Newest first (click for A–Z)", false, () => { this.sortAlpha = !this.sortAlpha; this.keepList(); }))
        .child(tool("sl-unreads", "message-square", this.unreadsOn ? "Hide the Unreads section" : "Show an Unreads section", this.unreadsOn, () => { this.unreadsOn = !this.unreadsOn; this.keepList(); }))
        .child(tool("sl-newsec", "plus", "New section", false, (cx) => this.startSection({ mode: "new" }, "", cx))))
      .when(Boolean(S.note), (el) => el.child(div().flex_none().mx(8).mb(4).text_size(11.5).text_color(S.note.error ? t.blocked : t.dim).child(S.note.text)))
      .child(v_flex().id("sl-rows").flex_1().min_h(0).overflow_y_scroll().px(4).pb(6)
        .children(children)
        .when(!groups.length && !this.secEdit, (el) => el.child(div().p(12).text_size(12).text_color(t.dim).child(q ? "No conversation matches." : S.status === "starting" || S.status === "loading" ? "Loading conversations…" : "No conversations yet."))));
  }

  // Naming a new section (or renaming one): Enter saves, Esc cancels.
  sectionInput(t) {
    const E = this.secEdit;
    return v_flex().flex_none().mx(4).my(4).p(8).gap(6).rounded(6).bg(t.chrome).border(1).border_color(t.border)
      .on_key_down((e, cx) => { if (e.keystroke === "escape") { cx.stop_propagation(); this.secEdit = null; cx.notify(); } })
      .child(div().text_size(11.5).font_semibold().text_color(t.dim).child(E.mode === "new" ? (E.move ? "New section for this conversation" : "New section") : "Rename section"))
      .child(Input.new(this.secIn).h(26).px(8).rounded(4).border(1).border_color(t.input).bg(t.canvas ?? t.background).text_size(12).text_color(t.foreground))
      .child(h_flex().gap(6)
        .child(this.chip(t, "sl-se-save", E.mode === "new" ? "Create" : "Rename", true, (cx) => this.submitSection(cx)))
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
    const home = c.kind === "im" ? "Direct messages" : c.kind === "mpim" ? "Group DMs" : "Channels";
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
        .children((S.sections ?? []).map((s) => this.chip(t, `sl-rm-s-${s.id}`, s.name, at === s.id, () => { this.command({ type: "section", op: "move", id: c.id, sid: s.id }); close(); })))
        .child(this.chip(t, "sl-rm-new", "New section…", false, (cx) => this.startSection({ mode: "new", move: c.id }, "", cx), "plus")));
  }

  // One of your sections' menu: rename, order, mute everything in it, delete.
  sectionMenu(t, g) {
    const list = this.S?.sections ?? [], i = list.findIndex((s) => s.id === g.id);
    const allMuted = g.rows.length > 0 && g.muted === g.rows.length;
    const done = () => { this.secMenu = null; };
    return h_flex().flex_none().mx(4).mb(4).p(8).gap(6).flex_wrap().rounded(6).bg(t.chrome).border(1).border_color(t.border)
      .child(this.chip(t, "sl-sm-ren", "Rename…", false, (cx) => this.startSection({ mode: "rename", sid: g.id }, g.label, cx)))
      .when(g.rows.length > 0, (el) => el.child(this.chip(t, "sl-sm-mute", allMuted ? "Unmute all" : "Mute all", false, () => { this.command({ type: "sectionmute", sid: g.id, muted: !allMuted }); done(); }, allMuted ? "bell" : "bell-off")))
      .when(i > 0, (el) => el.child(this.chip(t, "sl-sm-up", "Move up", false, () => this.command({ type: "section", op: "order", sid: g.id, dir: -1 }))))
      .when(i >= 0 && i < list.length - 1, (el) => el.child(this.chip(t, "sl-sm-down", "Move down", false, () => this.command({ type: "section", op: "order", sid: g.id, dir: 1 }))))
      .child(this.chip(t, "sl-sm-del", "Delete section", false, () => { this.command({ type: "section", op: "delete", sid: g.id }); done(); }, "x"));
  }

  // A conversation in the list. Right-click marks it read; Shift+right-click, or ⋯ while the
  // pointer is on it, opens its menu.
  row(t, c) {
    const quiet = c.quiet, unread = c.lit, menu = this.rowMenu === c.id, over = this.rowHover === c.id || menu;
    const toggle = (cx) => { this.rowMenu = menu ? null : c.id; this.secMenu = null; cx.notify(); };
    return div().id(`sl-${c.id}`).flex_none().px(8).py(6).rounded(4).cursor_pointer().flex().flex_col().gap(1)
      .when(menu, (el) => el.bg(t.hover)).hover((s) => s.bg(t.hover))
      .on_hover((on, cx) => { if (on) this.rowHover = c.id; else if (this.rowHover === c.id) this.rowHover = null; cx.notify(); })
      .on_click((_e, cx) => { this.rowMenu = null; this.command({ type: "open", id: c.id }); cx.notify(); })
      .on_mouse_down("right", (e, cx) => {
        cx.stop_propagation();
        if (e.modifiers?.shift) return toggle(cx);
        if (c.unread > 0 || c.mention) this.command({ type: "markread", id: c.id });
      })
      .child(h_flex().gap(8).items_center()
        .child(div().w(18).flex_none().flex().items_center().justify_center()
          .child(c.kind === "im" && this.av?.[c.user]
            ? this.face(t, c.user, c.title, 18)
            : svg(ICON(KIND_ICON[c.kind] ?? "hash")).size(14).flex_none().text_color(t.dim)))
        .child(div().flex_1().min_w(0).truncate().text_color(unread ? t.foreground : quiet ? t.dim : t.muted).when(unread, (el) => el.font_semibold()).child(c.title))
        .when(c.loud > 0, (el) => el.child(div().flex_none().px(5).rounded(8).bg(t.blocked).text_size(10.5).font_semibold().text_color("#ffffff").child(String(c.loud))))
        .when(quiet, (el) => el.child(svg(ICON("bell-off")).size(11).flex_none().text_color(t.dim)))
        .child(over
          ? div().id(`sl-rmb-${c.id}`).size(18).flex_none().flex().items_center().justify_center().rounded(4).text_color(t.dim)
            .hover((s) => s.bg(t.selected).text_color(t.foreground)).tooltip("Mute, notifications, section")
            .on_click((_e, cx) => { cx.stop_propagation(); toggle(cx); })
            .child(svg(ICON("ellipsis")).size(13))
          : div().flex_none().text_size(11).text_color(t.dim).child(ago(c.ts))))
      .when(Boolean(c.preview), (el) => el.child(div().pl(26).truncate().text_size(12).text_color(t.dim).when(quiet, (e) => e.opacity(0.7)).child(c.preview)));
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
    return base(v_flex().gap(1)).children(L.lines.map((line, li) => {
      if (!line) return div().h(8);
      if (line.s != null) return div().child(line.s);
      return h_flex().flex_wrap().items_center().gap_x(4).gap_y(1).children(line.w.map((w, wi) => {
        if (w.t === "text") return div().max_w_full().child(w.s);
        if (w.t === "emoji") {
          const path = this.S?.media?.[w.pic?.key];
          return path ? image(path).size(Math.round(size * 1.4)).flex_none() : div().child(`:${w.name}:`);
        }
        if (w.t === "mention") {
          const mine = w.id === me || w.id === "!";
          return div().flex_none().px(2).rounded(3).font_medium().bg(mine ? M.meBg : M.bg).text_color(mine ? M.meFg : M.fg).child(w.label);
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
      }));
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

  // An image file: its name, then the picture; a click shows it larger.
  imageFile(t, f) {
    const max = this.tileMax();
    return v_flex().mt(4).gap(2)
      .child(div().max_w(max).truncate().text_size(11).text_color(t.dim).child(f.name))
      .child(this.tile(t, f.thumb, max, `sl-img-${f.id}`, "View larger", (cx) => this.openViewer(f, cx)));
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
        .child(div().text_size(12.5).font_semibold().text_color(nameColor).child(m.who))
        .child(div().text_size(11).text_color(t.dim).child(clock(m.t)))))
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
        .child(head ? div().flex_none().pt(2).child(this.face(t, m.uid || m.who, m.who, 30, nameColor)) : div().w(30).flex_none())
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
    const viewKey = th ? `${o.id}:${th.ts}` : o.id;
    if (C.id !== viewKey) Object.assign(C, { id: viewKey, off: 0, viewH: 0, contentH: 0, hover: null, pick: null, askedOlder: null, link: null });
    // A send answered: the box empties when it went through, and keeps the text when it didn't.
    if (this.pending && S.result?.n === this.pending) {
      if (S.result.ok) { this.reply.set_value(""); this.replyEmpty = true; this.picked.clear(); this.mention = null; C.off = 0; }
      this.sendError = S.result.ok ? null : S.result.error;
      this.pending = null;
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
    list.forEach((m, i) => {
      const prev = list[i - 1];
      const newDay = !prev || dayLabel(prev.t) !== dayLabel(m.t);
      if (newDay) content.child(h_flex().flex_none().gap(8).items_center().px(12).pt(i ? 10 : 4).pb(2)
        .child(div().flex_1().h(1).bg(t.border)).child(div().text_size(11).text_color(t.dim).child(dayLabel(m.t))).child(div().flex_1().h(1).bg(t.border)));
      content.child(this.messageView(t, o, m, newDay || prev.who !== m.who || m.t - prev.t > 300000, colors, Boolean(th)));
      if (th && i === 0 && list.length > 1) content.child(h_flex().flex_none().gap(8).items_center().px(12).pt(8).pb(2)
        .child(div().text_size(11).text_color(t.dim).child(`${list.length - 1} ${list.length === 2 ? "reply" : "replies"}`)).child(div().flex_1().h(1).bg(t.border)));
    });
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
      .when(C.off > 40, (el) => el.child(div().id("sl-down").absolute().right(12).bottom(10).h(24).px(9).flex().items_center().rounded(12).cursor_pointer()
        .bg(t.raised).border(1).border_color(t.input).text_size(11.5).text_color(t.foreground).hover((s) => s.bg(t.selected))
        .on_click((_e, cx) => { C.off = 0; cx.notify(); }).child("Latest ↓")));
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
        const sel = Math.min(this.mentionSel, list.length - 1);
        const palette = settings()?.dark !== false ? NAME_COLORS.dark : NAME_COLORS.light;
        return el.child(v_flex().flex_none().py(4).bg(t.popover ?? t.raised).border_t(1).border_color(t.border)
          .child(div().px(12).pb(2).text_size(10.5).font_semibold().text_color(t.dim).child("PEOPLE  ·  ↑↓ to move, Enter or Tab to pick"))
          .children(list.map((p, i) => h_flex().id(`sl-at-${p.id}`).h(30).mx(4).px(8).gap(8).items_center().rounded(4).cursor_pointer()
            .when(i === sel, (e) => e.bg(t.selected))
            .on_hover((on, cx) => { if (on && this.mentionSel !== i) { this.mentionSel = i; cx.notify(); } })
            .on_click((_e, cx) => this.pickMention(p, cx))
            .child(this.face(t, p.id, p.name, 20, palette[hashOf(p.id) % palette.length]))
            .child(div().flex_none().text_size(12.5).font_semibold().text_color(t.foreground).child(p.name))
            .child(div().flex_1().min_w(0).truncate().text_size(11.5).text_color(t.dim).child(p.real && p.real !== p.name ? p.real : p.handle ? `@${p.handle}` : "")))));
      })
      .child(h_flex().flex_none().gap(6).items_center().p(8).bg(t.chrome).border_t(1).border_color(t.border)
        .child(div().relative().flex_1().min_w(0)
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
          .child(Input.new(this.reply).h(30).px(9).rounded(4).border(1).border_color(t.input).bg(t.canvas ?? t.background).text_size(12.5).text_color(t.foreground))
          .when(this.replyEmpty, (el) => el.child(div().absolute().left(10).top(0).h(30).flex().items_center().text_size(12.5).text_color(t.dim).child(th ? "Reply in thread…" : `Reply to ${o.title}…`))))
        .child(div().id("sl-send").size(30).flex_none().flex().items_center().justify_center().rounded(4).bg(t.solid ?? t.accent).text_color(t.solid_foreground ?? t.accent_foreground)
          .when(sending || this.replyEmpty, (el) => el.opacity(0.45))
          .when(!sending && !this.replyEmpty, (el) => el.cursor_pointer().hover((s) => s.opacity(0.88)).on_click((_e, cx) => this.send(cx)))
          .tooltip("Send (Enter)")
          .child(svg(ICON("send")).size(14))));
  }
}
