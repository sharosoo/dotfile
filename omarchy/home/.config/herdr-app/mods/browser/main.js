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
// How long a click ring stays: it is drawn at once, so a click shows before the page's frame does.
const ECHO_MS = 350;
const RESIZE_SETTLE_MS = 200;
const NATIVE_BEAT_MS = 250;
const PRESETS = [
  { label: "iPhone · 375×812", width: 375, height: 812, mobile: true },
  { label: "iPhone · 390×844", width: 390, height: 844, mobile: true },
  { label: "iPad · 768×1024", width: 768, height: 1024, mobile: true },
  { label: "1280×800", width: 1280, height: 800 },
  { label: "1440×900", width: 1440, height: 900 },
  { label: "1920×1080", width: 1920, height: 1080 },
];
const PRELOAD_MS = 80;
const MAX_LOADING = 3;

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
    this.state = null; this.raw = ""; this.error = null; this.ver = -1; this.echo = null;
    this.shown = []; this.loading = []; // see apply()
    this.view = null; this.sentView = ""; this.beatAt = 0;
    this.queue = []; this.pumping = false; this.polling = false; this.pollAt = 0;
    this.editing = false; this.cursorOn = false; this.sizeMenu = false;
    this.custom = InputState.new({ placeholder: "Custom, e.g. 1024x768" });
    this.custom.on("submit", (_e, cx) => {
      const m = /^\s*(\d{3,4})\s*[x×*,]\s*(\d{3,4})\s*$/.exec(this.custom.value());
      if (!m) return;
      this.sizeMenu = false;
      this.call(cx, "/emulate", { width: Number(m[1]), height: Number(m[2]) });
      cx.notify();
    });
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
    // A resize (panel drag) settles before the page is resized to it: each resize costs a relayout and a new frame size.
    const settled = this.view && now - (this.sizeAt ?? 0) > RESIZE_SETTLE_MS;
    // Native: the service places its window from these beats and hides it once they say hidden or stop, so they
    // come often, and one more goes out as the panel leaves the screen.
    const native = this.state?.mode === "native";
    const every = native ? NATIVE_BEAT_MS : HEARTBEAT_MS;
    if (this.view && (on || (native && this.wasOn)) && (now - this.beatAt > every || (settled && this.sentView !== this.viewKey()))) this.beat(cx, settled);
    this.wasOn = on;
    const cursorOn = this.cursorVisible(this.state);
    if (cursorOn !== this.cursorOn) { this.cursorOn = cursorOn; cx.notify(); }
    if (this.echo && now - this.echo.at > ECHO_MS) { this.echo = null; cx.notify(); }
    if (this.polling || (!on && now - this.pollAt < HIDDEN_POLL_MS)) return;
    this.polling = true;
    // Shown, the panel waits on the service for its next change, so a frame is drawn as soon as it is written
    // rather than at the next poll; hidden, it looks now and then.
    cx.spawn(async (cx) => {
      do {
        this.pollAt = Date.now();
        try {
          const wait = visible() && !this.error;
          const raw = await (await fetch(wait ? `${API}/next?after=${this.ver}&timeout=5000` : `${API}/state`)).text();
          if (raw !== this.raw || this.error) {
            this.raw = raw; this.error = null;
            const s = JSON.parse(raw);
            this.ver = s.ver ?? -1;
            this.apply(s, cx);
            cx.notify();
          }
        } catch (e) {
          if (!this.error) { this.error = String(e?.message ?? e); cx.notify(); }
          break;
        }
      } while (visible());
      this.polling = false;
    });
  }

  apply(s, cx) {
    const f = s.frame;
    const known = this.loading[this.loading.length - 1] ?? this.shown[this.shown.length - 1];
    if (f && f.path !== known?.path) {
      // Drawing an image path for the first time blanks every frame image for a few screen frames. So a new
      // frame is first drawn as a 1 px speck, and takes over the view once it has had PRELOAD_MS to load.
      this.loading = [...this.loading, f].slice(-MAX_LOADING);
      cx.timer.after(PRELOAD_MS, (cx) => this.promote(f, cx));
    }
    if (!f) { this.shown = []; this.loading = []; }
    const before = this.state?.tabs.find((t) => t.active)?.url;
    this.state = s;
    if (s.tabs.find((t) => t.active)?.url !== before) this.syncUrl();
    this.cursorOn = this.cursorVisible(s);
  }

  promote(f, cx) {
    const i = this.loading.findIndex((x) => x.path === f.path);
    if (i < 0) return;
    // The previous frame stays underneath in case this one is still not drawable.
    this.shown = [this.shown[this.shown.length - 1], f].filter(Boolean);
    this.loading = this.loading.slice(i + 1);
    cx.notify();
  }

  syncUrl() {
    if (this.editing) return;
    const url = this.state?.tabs.find((t) => t.active)?.url ?? "";
    this.url.set_value(url === "about:blank" ? "" : url);
  }

  cursorVisible(s) {
    return !!s?.cursor && Date.now() - s.cursor.at < CURSOR_MS;
  }

  viewBody() {
    const body = { width: Math.floor(this.view.width), height: Math.floor(this.view.height) };
    if (this.state?.mode !== "native") return body;
    // Measured from a pointer move over the panel; it stands only while the page area keeps that size.
    const o = this.origin;
    if (o && Math.abs(o.width - this.view.width) < 1 && Math.abs(o.height - this.view.height) < 1) Object.assign(body, { x: o.x, y: o.y });
    // The size menu opens over the page area, where the window would cover it.
    if (this.sizeMenu || !visible()) body.hidden = true;
    return body;
  }

  viewKey() {
    return JSON.stringify(this.viewBody());
  }

  // Doubles as the heartbeat that keeps the service's screencast running; mid-resize it repeats the last size.
  beat(cx, settled = true) {
    this.beatAt = Date.now();
    if (settled || !this.sentBody) {
      this.sentView = this.viewKey();
      this.sentBody = this.viewBody();
    }
    const body = this.sentBody;
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

  // Panel px → page CSS px. A page that fills the panel is drawn at the top left, scaled to fit; an emulated
  // device size is drawn at most at its real size, centered, with the panel's background around it.
  scale() {
    const f = this.shown[this.shown.length - 1];
    if (!f || !this.view || this.state?.mode === "native") return null;
    const fit = Math.min(this.view.width / f.width, this.view.height / f.height);
    const emulated = !!this.state?.tabs.find((t) => t.active)?.emulation;
    const k = emulated ? Math.min(1, fit) : fit;
    return { f, k, ox: emulated ? Math.max(0, (this.view.width - f.width * k) / 2) : 0, oy: 0 };
  }

  point(e) {
    const s = this.scale();
    const p = e.local_position;
    if (!s || !p) return null;
    const x = (p.x - s.ox) / s.k, y = (p.y - s.oy) / s.k;
    if (x < 0 || y < 0 || x > s.f.width || y > s.f.height) return null;
    return { x, y };
  }

  mouse(cx, type, e, extra = {}) {
    const p = this.point(e);
    if (!p) return;
    this.last = p;
    if (type === "down") { this.pressed = extra.button; this.echo = { ...e.local_position, at: Date.now() }; cx.notify(); }
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
    const em = activeTab?.emulation;
    const sizeLabel = em ? `${em.width}×${em.height}` : "Fit";
    const now = Date.now();
    const stop = (_e, cx) => cx.stop_propagation();
    const button = (id, text, tip, action) => div().id(id).px(7).h(26).flex().flex_none().items_center().rounded(5)
      .text_size(13).text_color(t.muted).cursor_pointer().tooltip(tip).hover((st) => st.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", stop).on_click(action).child(text);

    const agentLive = activeTab?.agent && s?.clients > 0;
    const paused = !!s?.userControl?.active && s?.clients > 0;
    const badge = agentLive && div().id("agent").flex_none().h(22).px(8).gap(5).flex().items_center().rounded(11)
      .bg(t.selected).text_size(11).text_color(paused ? t.muted : t.foreground)
      .tooltip(paused ? "You're using the page, so the agent waits; it resumes 5 s after your last input" : "An agent is driving this tab over CDP (127.0.0.1:9333)")
      .child(div().size(6).rounded(3).bg(paused ? t.dim : t.working).when(!paused && now - activeTab.agentAt < AGENT_LIVE_MS, (el) => el.loop("opacity", { from: 0.3, to: 1, period: 900 })))
      .child(paused ? "Agent paused" : "Agent");
    const held = s?.userControl?.held ?? 0;
    const banner = paused && h_flex().px(10).h(30).gap(8).flex_none().items_center().bg(t.selected).border_b(1).border_color(t.border)
      .text_size(12)
      .child(div().flex_1().min_w(0).truncate().child(`You're in control — agent paused${held ? ` (${held} waiting)` : ""}`))
      .child(div().id("hand-back").px(8).h(22).flex().flex_none().items_center().rounded(5).border_1().border_color(t.border)
        .text_size(11.5).cursor_pointer().hover((st) => st.bg(t.hover))
        .on_mouse_down("left", stop).on_click((_e, cx) => this.call(cx, "/handback", {})).child("Hand back"));

    const toolbar = h_flex().px(6).h(36).gap(2).flex_none().items_center().bg(t.chrome).border_b(1).border_color(t.border)
      .child(button("back", "←", "Back", (_e, cx) => this.call(cx, "/nav", { action: "back" })))
      .child(button("forward", "→", "Forward", (_e, cx) => this.call(cx, "/nav", { action: "forward" })))
      .child(button("reload", "⟳", "Reload", (_e, cx) => this.call(cx, "/nav", { action: "reload" })))
      .child(div().id("url").flex_1().min_w(0).h(26).mx(4).px(8).flex().items_center().rounded(6).border_1().border_color(t.border).bg(t.background)
        .cursor_text().on_mouse_down("left", stop)
        .child(Input.new(this.url).h_full().text_size(12).text_color(t.foreground)))
      .when(!!badge, (el) => el.child(badge))
      .child(button("size", sizeLabel, "Viewport size", (_e, cx) => { this.sizeMenu = !this.sizeMenu; cx.notify(); }))
      .child(button("devtools", "DevTools", "Open DevTools for this tab in a new tab", (_e, cx) => this.call(cx, "/devtools", {})))
      .child(button("new-tab", "+", "New tab", (_e, cx) => { this.call(cx, "/open", { url: "about:blank", newTab: true }); this.url.focus(); }));

    const pick = (id, text, body) => div().id(id).px(10).h(26).flex().items_center().rounded(5).text_size(12).cursor_pointer()
      .hover((st) => st.bg(t.hover)).on_mouse_down("left", stop)
      .on_click((_e, cx) => { this.sizeMenu = false; this.call(cx, "/emulate", body); cx.notify(); }).child(text);
    const modeRow = (id, text, mode, tip) => div().id(id).px(10).h(26).flex().items_center().gap(6).rounded(5).text_size(12).cursor_pointer()
      .tooltip(tip).hover((st) => st.bg(t.hover)).on_mouse_down("left", stop)
      .on_click((_e, cx) => { this.sizeMenu = false; if (s?.mode !== mode) this.call(cx, "/mode", { mode }); cx.notify(); })
      .child(div().w(12).child(s?.mode === mode ? "✓" : "")).child(text);
    const menu = this.sizeMenu && v_flex().id("size-menu").absolute().top(36).right(6).w(220).p(4).gap(1).rounded(7)
      .bg(t.chrome).border_1().border_color(t.border).on_mouse_down("left", stop)
      .child(pick("fit", "Fit to panel", { fit: true }))
      .children(PRESETS.map((p, i) => pick(`preset-${i}`, p.label, { width: p.width, height: p.height, mobile: !!p.mobile })))
      .child(div().id("custom").h(26).mt(2).px(8).flex().items_center().rounded(5).border_1().border_color(t.border).bg(t.background)
        .cursor_text().child(Input.new(this.custom).h_full().text_size(12).text_color(t.foreground)))
      .child(div().h(1).my(4).bg(t.border))
      .child(div().px(10).h(20).flex().items_center().text_size(11).text_color(t.dim).child("Display"))
      .child(modeRow("mode-headless", "In the panel", "headless", "Frames drawn by herdr; works anywhere"))
      .child(modeRow("mode-native", "Native window", "native", "Chromium's own window laid over this area; restarts the browser"));

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

    const native = s?.mode === "native";
    const sc = native ? null : this.scale();
    const frames = sc ? this.shown.map((f) => image(f.path).id(`frame-${f.seq}`).absolute().top(sc.oy).left(sc.ox)
      .w(f.width * sc.k).h(f.height * sc.k)) : [];
    const specks = native ? [] : this.loading.map((f) => image(f.path).id(`pre-${f.seq}`).absolute().top(0).left(0).size(1));
    const cur = this.cursorOn && sc && s.cursor;
    // Native: the browser window covers this area, so this only shows while it is not placed yet.
    const message = this.error && !s ? `The browser service is not running (${this.error}). Start it with: systemctl --user start herdr-browser`
      : !s ? "Connecting…" : native ? "Point at the panel to place the browser window here."
      : !sc ? (tabs.length ? "Waiting for the first frame…" : "No tabs open.") : null;

    const view = div().id("view").flex_1().min_h(0).relative().overflow_hidden().bg(t.background)
      .track_focus(this.focus)
      .on_size_change((size, cx) => { this.view = size; this.sizeAt = Date.now(); cx.notify(); })
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
      .children(specks)
      .when(!!this.echo, (el) => el.child(div().absolute().left(this.echo.x - 9).top(this.echo.y - 9).size(18).rounded(9)
        .border_2().border_color(t.accent)))
      .when(!!cur, (el) => el.child(div().absolute().left(sc.ox + cur.x * sc.k - 7).top(sc.oy + cur.y * sc.k - 7).size(14).rounded(7)
        .border_2().border_color(t.accent)))
      .when(!!message, (el) => el.child(div().p(12).text_size(12).text_color(this.error && !s ? t.blocked : t.dim).child(message)));

    return v_flex().size_full().relative().bg(t.background).text_color(t.foreground)
      // Pointer moves anywhere over the panel give its bounds; the page area is its bottom part.
      .on_mouse_move((e) => {
        if (e.bounds && this.view) this.origin = { x: e.bounds.x, y: e.bounds.y + e.bounds.height - this.view.height, width: this.view.width, height: this.view.height };
      })
      .child(toolbar)
      .when(!!banner, (el) => el.child(banner))
      .when(tabs.length > 0, (el) => el.child(strip))
      .child(view)
      .when(!!menu, (el) => el.child(menu));
  }
}
