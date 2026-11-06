// Artifact Hub (artifact.sharosoo.com) in the right panel: search my documents, open one to read it.
// Auth reuses the personal token omp's artifact-hub MCP entry already holds, so no second secret is needed
// where omp is set up; elsewhere ARTIFACT_HUB_TOKEN or a token file does.

import { View, div, image } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, TextView, Scrollbar, v_virtual_list, VirtualListScrollHandle } from "gpui-base";
import { exec, theme, settings, home, appHome, readTextFile, window as appWindow } from "herdr";
import * as fs from "fs/promises";

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
// The page is drawn as a virtual list of fixed-height strips cut from the tiles: only visible strips cost a
// frame, and the list's scroll handle can put the same share of the page back on screen after a resize.
const STRIP = 40;
// doc-body's side padding; the page is laid out for what is left of the panel.
const PAD = 24;
const renderUrl = (d, w, extra = "") => `${RENDERER}/render?id=${d.id}&v=${d.version}&w=${w}&scheme=${scheme(theme().background)}${extra}`;

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
  init(_props, cx) {
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
    this.pageScroll = VirtualListScrollHandle.new(); this.renderSeq = 0; this.resizeSeq = 0; this.geomGen = 0;
    // The page's width in layout units, from the panel's measured size: null until the first layout, and not
    // settled while it is still changing. Nothing is rendered at an unsettled width.
    this.width = null; this.widthSettled = false;
  }

  // The panel's real size (on_size_change), not the layout file's number for it, which can differ from what is
  // drawn. A width counts once it has held: the panel reports a passing size while it opens, and a drag reports
  // every step. Meanwhile the shown page is scaled to fit.
  measure(size, cx) {
    const w = Math.round(size.width / (Number(settings()?.zoom) || 1)) - PAD;
    if (w === this.width || w <= 0) return;
    const first = this.width == null, seq = ++this.resizeSeq;
    this.width = w; this.widthSettled = false;
    cx.timer.after(first ? FIRST_SETTLE_MS : RESIZE_SETTLE_MS, (cx) => {
      if (seq !== this.resizeSeq) return;
      this.widthSettled = true;
      if (first) this.prefetch();
      this.settle(cx);
    });
    cx.notify();
  }

  // The service clamps the width it renders at; ask for the clamped one, or a too-narrow panel never matches.
  renderWidth() {
    return this.width == null ? null : Math.max(280, Math.min(1600, this.width));
  }

  // Ask for the page at the panel's width unless it is already shown or asked for. Text mode keeps its page
  // until Page is chosen again.
  settle(cx) {
    const d = this.doc, want = this.renderWidth();
    if (!d || !this.widthSettled || !this.rendererUp || this.requested === want || this.tiles?.width === want) return;
    if (this.tiles && this.textMode) return;
    this.renderPage(cx, d);
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

  // Warm the cache for the newest documents so opening them shows the page at once.
  prefetch() {
    const w = this.renderWidth();
    if (!this.rendererUp || this.query.trim() || !this.widthSettled) return;
    for (const a of this.list.slice(0, PREFETCH)) fetch(renderUrl(a, w, "&prefetch=1")).catch(() => {});
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
    this.doc = { ...item, source: null }; this.docLoading = true; this.tiles = null; this.textMode = false; this.renderError = null;
    this.requested = null; this.renderSeq++; this.lastGeom = null; this.geom = null;
    // The list row already carries the version, so the page render starts alongside the source fetch, as soon
    // as the panel's width is known (settle waits for it).
    cx.spawn(async (cx) => {
      if (await this.rendererReady(cx)) { if (this.doc?.id === item.id) this.settle(cx); } else cx.notify();
    });
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
  renderPage(cx, d) {
    const w = this.renderWidth(), token = ++this.renderSeq;
    this.requested = w;
    const live = () => this.doc?.id === d.id && this.renderSeq === token;
    let failures = 0;
    cx.spawn(async (cx) => {
      for (;;) {
        let r;
        try {
          r = await fetch(renderUrl(d, w));
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
          const j = await r.json();
          if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
          if (!live()) return;
          // A page at another width replaces the shown one only once complete and still the wanted width, so
          // the old page, scaled, stays up meanwhile instead of a partly drawn one.
          if (!this.tiles || this.tiles.width === j.width) this.tiles = j;
          else if (j.done && j.width === this.renderWidth()) this.tiles = j;
          // The panel may have changed width while this page rendered.
          if (j.done) { this.settle(cx); cx.notify(); return; }
        } catch (e) {
          if (live()) { this.renderError = String(e?.message ?? e); cx.notify(); }
          return;
        }
        cx.notify();
        // Nothing of a page at another width shows before it is complete, so there is no hurry to ask.
        await cx.sleep(this.tiles?.width === w ? 400 : 1000);
        if (!live()) return;
      }
    });
  }

  // Tile heights at the shown width, and the strips the virtual list draws; rebuilt only when either changes.
  pageGeometry(shown) {
    if (this.geom?.tiles === this.tiles && this.geom.shown === shown) return this.geom;
    const k = shown / this.tiles.width;
    let top = 0;
    const parts = this.tiles.tiles.map((x) => { const h = Math.round(x.height * k); const p = { path: x.path, top, h }; top += h; return p; });
    this.geom = { gen: ++this.geomGen, tiles: this.tiles, shown, width: this.tiles.width, parts, count: Math.max(1, Math.ceil(top / STRIP)) };
    return this.geom;
  }

  // After the page is scaled or swapped for another width, put the same share of it back on screen.
  // Tiles still arriving at one width only extend the page, so the position stays.
  keepScroll(id, g) {
    const last = this.lastGeom;
    this.lastGeom = { id, width: g.width, shown: g.shown, count: g.count };
    if (!last || last.id !== id) { this.pageScroll.scroll_to_item(0, "top"); this.restored = null; return; }
    if (last.width === g.width && last.shown === g.shown) return;
    // Rounding to strips at every step of a drag would drift; keep the share until the person scrolls.
    const frac = this.restored && this.firstStrip === this.restored.strip ? this.restored.frac : (this.firstStrip ?? 0) / last.count;
    const strip = Math.min(g.count - 1, Math.round(frac * g.count));
    this.restored = { strip, frac };
    this.pageScroll.scroll_to_item(strip, "top");
  }

  strip(g, i) {
    const y = i * STRIP;
    const row = div().relative().w(g.shown).h(STRIP).overflow_hidden();
    for (const p of g.parts) if (p.top < y + STRIP && p.top + p.h > y) row.child(image(p.path).absolute().left(0).top(p.top - y).w(g.shown).h(p.h));
    return row;
  }

  render(cx) {
    const t = theme();
    const now = Date.now();
    const iconButton = (id, label, tip, action) => div().id(id).px(6).h(24).flex().items_center().rounded(5)
      .text_size(12).text_color(t.muted).cursor_pointer().tooltip(tip).hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_click(action).child(label);
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
        .when(pages, (el) => el.child(iconButton("mode", this.textMode ? "Page" : "Text", this.textMode ? "Show the page as the web renders it" : "Show selectable text", (_e, cx) => { this.textMode = !this.textMode; this.settle(cx); cx.notify(); })))
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
          .child(div().relative().flex_1().min_h(0)
            // Keys carry the geometry generation, so no strip cut for an earlier tile set is ever reused.
            .child(v_virtual_list("page", g.count, STRIP, (i) => `${g.gen}-${i}`, (range) => {
              this.firstStrip = range.start;
              const out = [];
              for (let i = range.start; i < range.end; i++) out.push(this.strip(g, i));
              return out;
            }).track_scroll(this.pageScroll).size_full())
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
