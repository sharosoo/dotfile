// Artifact Hub (artifact.sharosoo.com) in the right panel: search my documents, open one to read it.
// Auth reuses the personal token omp's artifact-hub MCP entry already holds, so no second secret lives here.

import { View, div, image } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, TextView } from "gpui-base";
import { exec, theme, layout } from "herdr";
import * as fs from "fs/promises";

// Pages are rendered by herdr-artifacts-render.service (headless Chromium kept warm) so openui, mermaid,
// charts and ::: layouts look as on the web.
const RENDERER = "http://127.0.0.1:47824";
const PREFETCH = 6;
const renderUrl = (d, extra = "") => `${RENDERER}/render?id=${d.id}&v=${d.version}&w=${panelWidth() - 24}&scheme=${scheme(theme().background)}${extra}`;

function panelWidth() {
  const find = (n) => n?.id === "panel" ? n : (n?.children ?? []).map(find).find(Boolean);
  return Math.round(find(layout())?.size?.px ?? 368);
}

function scheme(bg) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(String(bg ?? ""));
  if (!m) return "dark";
  const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 140 ? "light" : "dark";
}

const HUB = "https://artifact.sharosoo.com";
const SEARCH_DEBOUNCE_MS = 300;

async function readToken() {
  const home = (await exec("sh", ["-c", "printf %s \"$HOME\""])).stdout;
  const cfg = JSON.parse(await fs.readFile(`${home}/.omp/agent/mcp.json`, "utf8"));
  const find = (o) => o && typeof o === "object" ? (o["artifact-hub"] ?? Object.values(o).map(find).find(Boolean)) : null;
  const auth = find(cfg)?.headers?.Authorization;
  if (!auth) throw new Error("artifact-hub token not found in ~/.omp/agent/mcp.json");
  return auth;
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
    this.input = InputState.new({ placeholder: "Search title, tag, body" });
    this.input.on("change", (_e, cx) => {
      this.query = this.input.value();
      const seq = ++this.seq;
      cx.timer.after(SEARCH_DEBOUNCE_MS, (cx) => { if (seq === this.seq) this.load(cx); });
    });
    this.input.on("submit", (_e, cx) => this.load(cx));
    this.load(cx);
    // Panel resizes don't re-render a block by themselves; notice them so the page follows the width.
    cx.timer.every(250, (cx) => { const w = panelWidth(); if (this.doc && w !== this.seenWidth) { this.seenWidth = w; cx.notify(); } });
  }

  async api(path) {
    this.auth ??= await readToken();
    const r = await fetch(`${HUB}${path}`, { headers: { Authorization: this.auth } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
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
          // Warm the cache for the newest documents so opening them shows the page at once.
          if (!q) for (const a of this.list.slice(0, PREFETCH)) fetch(renderUrl(a, "&prefetch=1")).catch(() => {});
        }
      } catch (e) {
        this.error = String(e?.message ?? e);
      }
      this.loading = false;
      cx.notify();
    });
  }

  open(cx, item) {
    this.doc = { ...item, source: null }; this.docLoading = true; this.tiles = null; this.textMode = false; this.renderError = null;
    // The list row already carries the version, so the page render starts alongside the source fetch.
    this.renderPage(cx, item);
    cx.spawn(async (cx) => {
      try {
        const d = await this.api(`/api/artifacts/${item.id}`);
        if (this.doc?.id === item.id) this.doc = { ...item, ...d };
      } catch (e) {
        if (this.doc?.id === item.id) this.doc = { ...item, error: String(e?.message ?? e) };
      }
      this.docLoading = false;
      cx.notify();
    });
  }

  // The service answers after the first tile; ask again until every tile is in.
  renderPage(cx, d) {
    cx.spawn(async (cx) => {
      try {
        const r = await fetch(renderUrl(d));
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
        if (this.doc?.id !== d.id) return;
        this.tiles = j;
        if (!j.done) cx.timer.after(400, (cx) => { if (this.doc?.id === d.id) this.renderPage(cx, d); });
      } catch (e) {
        if (this.doc?.id === d.id) this.renderError = String(e?.message ?? e);
      }
      cx.notify();
    });
  }

  render(cx) {
    const t = theme();
    const now = Date.now();
    const iconButton = (id, label, tip, action) => div().id(id).px(6).h(24).flex().items_center().rounded(5)
      .text_size(12).text_color(t.muted).cursor_pointer().tooltip(tip).hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_click(action).child(label);

    if (this.doc) {
      const d = this.doc;
      const header = h_flex().gap(4).px(8).h(36).flex_none().items_center().border_b(1).border_color(t.border)
        .child(iconButton("back", "←", "Back to the list", (_e, cx) => { this.doc = null; cx.notify(); }))
        .child(div().flex_1().min_w(0).truncate().text_size(12).font_semibold().text_color(t.foreground).child(d.title))
        .child(iconButton("mode", this.textMode ? "Page" : "Text", this.textMode ? "Show the page as the web renders it" : "Show selectable text", (_e, cx) => { this.textMode = !this.textMode; cx.notify(); }))
        .child(iconButton("open-web", "↗", "Open in the browser", () => { exec("xdg-open", [`${HUB}/a/${d.id}`]); }));
      const meta = h_flex().gap(6).px(12).py(6).flex_none().text_size(11).text_color(t.dim)
        .child(`${d.project} · v${d.version} · ${d.format} · ${d.visibility}`);
      const text = () => (d.format === "html" ? TextView.html(`doc-${d.id}`, d.source) : TextView.markdown(`doc-${d.id}`, d.source))
        .selectable(true).scrollable(true).on_link_click((url) => { exec("xdg-open", [url]); });
      let body;
      const page = this.tiles && !this.textMode;
      const want = panelWidth() - 24;
      // The page is laid out for one width; after a resize, scale the old tiles and re-render at the new width
      // once the drag settles, so the web's responsive layout applies.
      if (this.tiles && this.tiles.width !== want && this.resizeFor !== want) {
        this.resizeFor = want;
        const doc = d;
        cx.timer.after(400, (cx) => { if (this.doc?.id === doc.id && this.resizeFor === panelWidth() - 24) this.renderPage(cx, doc); });
      }
      const k = this.tiles ? want / this.tiles.width : 1;
      if (page) body = div().id("page").size_full().overflow_y_scrollbar()
        .child(v_flex().children(this.tiles.tiles.map((x, i) => image(x.path).id(`tile-${i}`).w(want).h(Math.round(x.height * k)).flex_none()))
          .when(!this.tiles.done, (el) => el.child(div().py(8).text_size(11).text_color(t.dim).child("Rendering the rest…"))));
      else if (d.error) body = div().p(12).text_size(12).text_color(t.blocked).child(d.error);
      else if (this.docLoading || d.source == null) body = div().p(12).text_size(12).text_color(t.dim).child("Loading…");
      // Text shows at once while the page renders, and stays if the render fails.
      else body = v_flex().gap(6).size_full()
        .when(!this.textMode, (el) => el.child(div().flex_none().text_size(11).text_color(this.renderError ? t.blocked : t.dim)
          .child(this.renderError ? `Page render failed, showing text: ${this.renderError}` : "Rendering the page as on the web…")))
        .child(text());
      return v_flex().size_full().bg(t.background).text_color(t.foreground)
        .child(header).child(meta)
        .child(div().id("doc-body").flex_1().min_h(0).px(12).pb(12).text_size(13).child(body));
    }

    const search = h_flex().px(8).h(40).flex_none().items_center().border_b(1).border_color(t.border)
      .child(div().id("search").flex_1().min_w(0).h(28).px(8).flex().items_center().rounded(6).border_1().border_color(t.border)
        .cursor_text().on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .child(Input.new(this.input).h_full().text_size(12).text_color(t.foreground)))
      .child(iconButton("reload", this.loading ? "…" : "⟳", "Reload", (_e, cx) => this.load(cx)));

    const row = (a) => v_flex().id(`a-${a.id}`).px(12).py(7).gap(2).cursor_pointer().border_b(1).border_color(t.border)
      .hover((s) => s.bg(t.hover)).on_click((_e, cx) => { this.open(cx, a); cx.notify(); })
      .child(h_flex().gap(6).items_center()
        .child(div().flex_1().min_w(0).truncate().text_size(12.5).text_color(t.foreground).child(a.title))
        .child(div().flex_none().text_size(11).text_color(t.dim).child(ago(a.updated_at, now))))
      .child(div().truncate().text_size(11).text_color(t.dim)
        .child([a.project, a.format, ...(a.tags ?? []).slice(0, 4).map((x) => `#${x}`)].join(" · ")));

    let content;
    if (this.error && !this.list.length) content = div().p(12).text_size(12).text_color(t.blocked).child(`Artifact Hub is not reachable: ${this.error}`);
    else if (!this.list.length) content = div().p(12).text_size(12).text_color(t.dim).child(this.loading ? "Loading…" : "No documents match.");
    else content = v_flex().children(this.list.map(row));

    return v_flex().size_full().bg(t.background).text_color(t.foreground)
      .child(h_flex().px(12).h(32).flex_none().items_center().border_b(1).border_color(t.border)
        .child(div().flex_1().text_size(12).font_semibold().child("Artifact Hub"))
        .child(div().text_size(11).text_color(t.dim).child(`${this.list.length}`)))
      .child(search)
      .child(div().id("list").flex_1().min_h(0).overflow_y_scrollbar().child(content));
  }
}
