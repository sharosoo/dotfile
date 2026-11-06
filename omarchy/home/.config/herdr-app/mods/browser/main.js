// A live view of herdr-browser.service's headless Chromium: the same browser agents drive over CDP
// (http://127.0.0.1:9333), so the person can watch QA and take over with the mouse and keyboard.
// The service streams JPEG frames into mods/browser-frames/; this panel shows the newest and forwards input.

import { View, div, image } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { exec, theme, layout, nextCommand } from "herdr";

const API = "http://127.0.0.1:47825";
const MOD = "browser";
const POLL_MS = 100;
const HIDDEN_POLL_MS = 2000;
const HEARTBEAT_MS = 2000;
const CURSOR_MS = 2500;
const AGENT_LIVE_MS = 4000;

const post = (path, body) => fetch(`${API}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

// Polling only matters while the panel is on screen: its block must be in the shown layout, nothing above it
// hidden, and every stack on the way showing that branch.
function visible() {
  const find = (n, path) => {
    if (!n) return null;
    if (n.content?.mod === MOD) return [...path, n];
    for (const c of n.children ?? []) { const r = find(c, [...path, n]); if (r) return r; }
    return null;
  };
  const path = find(layout(), []);
  if (!path) return true;
  return path.every((n, i) => !n.hidden && !(n.type === "stack" && path[i + 1] && (n.active ?? n.children?.[0]?.id) !== path[i + 1].id));
}

const label = (tab) => tab.title && tab.title !== tab.url ? tab.title : tab.url === "about:blank" ? "New tab" : tab.url.replace(/^https?:\/\//, "");

export default class Browser extends View {
  init(_props, cx) {
    this.state = null; this.raw = ""; this.error = null;
    this.shown = []; // the last two frames, older first: the new one may still be loading over the old
    this.view = null; this.sentView = ""; this.beatAt = 0;
    this.queue = []; this.pumping = false; this.polling = false; this.pollAt = 0;
    this.editing = false; this.cursorOn = false;
    this.focus = cx.focus_handle();
    this.url = InputState.new({ placeholder: "Search or enter address" });
    this.url.on("focus", () => { this.editing = true; });
    this.url.on("blur", (_e, cx) => { this.editing = false; this.syncUrl(); cx.notify(); });
    this.url.on("submit", (_e, cx) => {
      const url = this.url.value().trim();
      if (!url) return;
      this.editing = false;
      this.focus.focus();
      this.call(cx, "/open", { url });
    });
    cx.timer.every(POLL_MS, (cx) => this.tick(cx));
    this.tick(cx);
    // "focus" comes from pane.go (Alt+H/L); `browser.open` (bindable in keys.json) puts the keyboard in the
    // address bar, like Ctrl+L in the view.
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        if (c === "focus") this.focus.focus();
        else if (c === "open") this.url.focus();
        cx.notify();
      }
    });
  }

  tick(cx) {
    const now = Date.now();
    const on = visible();
    if (!on && now - this.pollAt < HIDDEN_POLL_MS) return;
    if (on && this.view && (now - this.beatAt > HEARTBEAT_MS || this.sentView !== this.viewKey())) this.beat(cx);
    if (this.polling) return;
    this.polling = true; this.pollAt = now;
    cx.spawn(async (cx) => {
      try {
        const raw = await (await fetch(`${API}/state`)).text();
        const cursorOn = this.cursorVisible(this.state);
        if (raw !== this.raw || this.error || cursorOn !== this.cursorOn) {
          this.raw = raw; this.error = null; this.cursorOn = cursorOn;
          this.apply(JSON.parse(raw));
          cx.notify();
        }
      } catch (e) {
        if (!this.error) { this.error = String(e?.message ?? e); cx.notify(); }
      }
      this.polling = false;
    });
  }

  apply(s) {
    const f = s.frame;
    const last = this.shown[this.shown.length - 1];
    if (f && f.path !== last?.path) this.shown = [last, f].filter(Boolean);
    if (!f) this.shown = [];
    const before = this.state?.tabs.find((t) => t.active)?.url;
    this.state = s;
    if (s.tabs.find((t) => t.active)?.url !== before) this.syncUrl();
    this.cursorOn = this.cursorVisible(s);
  }

  syncUrl() {
    if (this.editing) return;
    const url = this.state?.tabs.find((t) => t.active)?.url ?? "";
    this.url.set_value(url === "about:blank" ? "" : url);
  }

  cursorVisible(s) {
    return !!s?.cursor && Date.now() - s.cursor.at < CURSOR_MS;
  }

  viewKey() {
    return `${Math.floor(this.view.width)}x${Math.floor(this.view.height)}`;
  }

  // Doubles as the heartbeat that keeps the service's screencast running.
  beat(cx) {
    this.beatAt = Date.now();
    this.sentView = this.viewKey();
    const body = { width: Math.floor(this.view.width), height: Math.floor(this.view.height) };
    cx.spawn(async () => { await post("/viewport", body).catch(() => {}); });
  }

  call(cx, path, body) {
    cx.spawn(async (cx) => {
      try {
        const r = await post(path, body);
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
      } catch (e) {
        this.error = String(e?.message ?? e);
        cx.notify();
      }
    });
  }

  // Input goes out in order, one request at a time; moves and wheel ticks that pile up meanwhile are merged.
  send(cx, body) {
    const last = this.queue[this.queue.length - 1];
    if (last && body.type === "move" && last.type === "move") Object.assign(last, body);
    else if (last && body.type === "wheel" && last.type === "wheel") { last.dx += body.dx; last.dy += body.dy; last.x = body.x; last.y = body.y; }
    else this.queue.push(body);
    if (this.pumping) return;
    this.pumping = true;
    cx.spawn(async () => {
      while (this.queue.length) await post("/input", this.queue.shift()).catch(() => {});
      this.pumping = false;
    });
  }

  // Panel px → page CSS px. The frame is drawn at the top left, scaled to fit.
  scale() {
    const f = this.shown[this.shown.length - 1];
    if (!f || !this.view) return null;
    return { f, k: Math.min(this.view.width / f.width, this.view.height / f.height) };
  }

  point(e) {
    const s = this.scale();
    const p = e.local_position;
    if (!s || !p) return null;
    const x = p.x / s.k, y = p.y / s.k;
    if (x < 0 || y < 0 || x > s.f.width || y > s.f.height) return null;
    return { x, y };
  }

  mouse(cx, type, e, extra = {}) {
    const p = this.point(e);
    if (!p) return;
    this.last = p;
    if (type === "down") this.pressed = extra.button;
    else if (type === "up") this.pressed = null;
    this.send(cx, { type, ...p, ...extra, ...(type === "move" ? { pressed: !!this.pressed } : {}) });
  }

  // A release outside the view never reaches it; let go when the pointer leaves so the page's drag ends too.
  leave(cx) {
    if (!this.pressed || !this.last) return;
    this.send(cx, { type: "up", ...this.last, button: this.pressed, clickCount: 1 });
    this.pressed = null;
  }

  key(e, cx) {
    cx.stop_propagation();
    const m = e.modifiers;
    const k = e.key.toLowerCase();
    if (m.control && !m.alt && k === "l") { this.url.focus(); return; }
    if (m.control && !m.alt && k === "v") {
      cx.spawn(async (cx) => {
        const r = await exec("wl-paste", ["--no-newline"]).catch(() => null);
        if (r?.code === 0 && r.stdout) this.send(cx, { type: "text", text: r.stdout });
      });
      return;
    }
    if (m.control && !m.alt && k === "c") {
      cx.spawn(async () => {
        const { text } = await (await fetch(`${API}/selection`)).json().catch(() => ({}));
        if (text) await exec("wl-copy", ["--", text]).catch(() => {});
      });
      return;
    }
    this.send(cx, { type: "key", key: e.key, text: e.key_char ?? "", modifiers: { shift: m.shift, control: m.control, alt: m.alt, platform: m.platform } });
  }

  render(cx) {
    const t = theme();
    const s = this.state;
    const tabs = s?.tabs ?? [];
    const activeTab = tabs.find((x) => x.active);
    const now = Date.now();
    const stop = (_e, cx) => cx.stop_propagation();
    const button = (id, text, tip, action) => div().id(id).px(7).h(26).flex().flex_none().items_center().rounded(5)
      .text_size(13).text_color(t.muted).cursor_pointer().tooltip(tip).hover((st) => st.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", stop).on_click(action).child(text);

    const agentLive = activeTab?.agent && s?.clients > 0;
    const badge = agentLive && div().id("agent").flex_none().h(22).px(8).gap(5).flex().items_center().rounded(11)
      .bg(t.selected).text_size(11).text_color(t.foreground)
      .tooltip("An agent is driving this tab over CDP (127.0.0.1:9333)")
      .child(div().size(6).rounded(3).bg(t.working).when(now - activeTab.agentAt < AGENT_LIVE_MS, (el) => el.loop("opacity", { from: 0.3, to: 1, period: 900 })))
      .child("Agent");

    const toolbar = h_flex().px(6).h(36).gap(2).flex_none().items_center().bg(t.chrome).border_b(1).border_color(t.border)
      .child(button("back", "←", "Back", (_e, cx) => this.call(cx, "/nav", { action: "back" })))
      .child(button("forward", "→", "Forward", (_e, cx) => this.call(cx, "/nav", { action: "forward" })))
      .child(button("reload", "⟳", "Reload", (_e, cx) => this.call(cx, "/nav", { action: "reload" })))
      .child(div().id("url").flex_1().min_w(0).h(26).mx(4).px(8).flex().items_center().rounded(6).border_1().border_color(t.border).bg(t.background)
        .cursor_text().on_mouse_down("left", stop)
        .child(Input.new(this.url).h_full().text_size(12).text_color(t.foreground)))
      .when(!!badge, (el) => el.child(badge))
      .child(button("new-tab", "+", "New tab", (_e, cx) => { this.call(cx, "/open", { url: "about:blank", newTab: true }); this.url.focus(); }));

    const tab = (x) => h_flex().id(`tab-${x.id}`).h(26).max_w(180).min_w(0).pl(8).pr(2).gap(4).items_center().rounded(5).flex_shrink(1)
      .when(x.active, (el) => el.bg(t.selected)).hover((st) => st.bg(x.active ? t.selected : t.hover)).cursor_pointer()
      .on_click((_e, cx) => this.call(cx, "/tab", { id: x.id }))
      .when(x.agent, (el) => el.child(div().size(6).flex_none().rounded(3).bg(t.working)))
      .child(div().flex_1().min_w(0).truncate().text_size(11.5).text_color(x.active ? t.foreground : t.muted).child(label(x)))
      .child(div().id(`close-${x.id}`).size(18).flex_none().flex().items_center().justify_center().rounded(4)
        .text_size(12).text_color(t.dim).hover((st) => st.bg(t.hover).text_color(t.foreground))
        .on_mouse_down("left", stop).on_click((_e, cx) => { cx.stop_propagation(); this.call(cx, "/close", { id: x.id }); }).child("×"));
    const strip = h_flex().id("tabs").px(6).h(32).gap(3).flex_none().items_center().overflow_x_scroll().border_b(1).border_color(t.border)
      .children(tabs.map(tab));

    const sc = this.scale();
    const frames = sc ? this.shown.map((f) => image(f.path).id(`frame-${f.seq}`).absolute().top(0).left(0)
      .w(f.width * sc.k).h(f.height * sc.k)) : [];
    const cur = this.cursorOn && sc && s.cursor;
    const message = this.error && !s ? `The browser service is not running (${this.error}). Start it with: systemctl --user start herdr-browser`
      : !s ? "Connecting…" : !sc ? (tabs.length ? "Waiting for the first frame…" : "No tabs open.") : null;

    const view = div().id("view").flex_1().min_h(0).relative().overflow_hidden().bg(t.background)
      .track_focus(this.focus)
      .on_size_change((size, cx) => { this.view = size; if (this.sentView !== this.viewKey()) this.beat(cx); cx.notify(); })
      .on_key_down((e, cx) => this.key(e, cx))
      // Without stopping it, the host's own mouse-down handler takes the keyboard back to the terminal.
      .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); this.focus.focus(); this.mouse(cx, "down", e, { button: "left", clickCount: e.click_count }); })
      .on_mouse_up("left", (e, cx) => this.mouse(cx, "up", e, { button: "left", clickCount: e.click_count }))
      .on_mouse_down("right", (e, cx) => { cx.stop_propagation(); this.focus.focus(); this.mouse(cx, "down", e, { button: "right" }); })
      .on_mouse_up("right", (e, cx) => this.mouse(cx, "up", e, { button: "right" }))
      .on_mouse_move((e, cx) => this.mouse(cx, "move", e))
      .on_hover((hovered, cx) => { if (!hovered) this.leave(cx); })
      // GPUI reports wheel distance as content movement; the page wants scroll distance.
      .on_scroll_wheel((e, cx) => this.mouse(cx, "wheel", e, { dx: -e.delta.x, dy: -e.delta.y }))
      .children(frames)
      .when(!!cur, (el) => el.child(div().absolute().left(cur.x * sc.k - 7).top(cur.y * sc.k - 7).size(14).rounded(7)
        .border_2().border_color(t.accent)))
      .when(!!message, (el) => el.child(div().p(12).text_size(12).text_color(this.error && !s ? t.blocked : t.dim).child(message)));

    return v_flex().size_full().bg(t.background).text_color(t.foreground)
      .child(toolbar)
      .when(tabs.length > 0, (el) => el.child(strip))
      .child(view);
  }
}
