import { View, div, svg, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { spaces, panes, run, openOverlay, closeOverlay, props, theme, window, shared, setShared, layout, settings, nextCommand } from "herdr";

// Panels that get a tab-bar button only while opened from the + panels menu (or the
// `my-tabs.<id>` command); their × closes them. Open ones are kept in shared `<id>.open`,
// which the panel's mod also reads to stop its work while closed.
const OPTIONAL = [{ id: "spotify", label: "Spotify", icon: "mods/spotify/music.svg" }];
const isOpen = (id) => shared(`${id}.open`) === true;

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

export default class Tabs extends View {
  init(_props, cx) {
    this.pressed = null;
    this.isMenu = Boolean(props()?.panelsMenu);
    try { this.panels = JSON.parse(localStorage.getItem("panels") ?? "{}") ?? {}; } catch (_) { this.panels = {}; }
    if (typeof this.panels !== "object" || Array.isArray(this.panels)) this.panels = {};
    // keys.json binds ctrl-shift-y to `my-tabs.usage`, which toggles the usage panel like its tab-bar button.
    if (!this.isMenu) cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        if (c === "usage") this.toggle("omp-usage");
        else if (OPTIONAL.some((p) => p.id === c)) this.openOptional(c);
        else if (OPTIONAL.some((p) => `close-${p.id}` === c)) this.closeOptional(c.slice(6));
        else if (c === "panels") this.openMenu();
        cx.notify();
      }
    });
  }

  openMenu() {
    openOverlay({ mod: "my-tabs", kind: "popup", width: 200, height: 36 + OPTIONAL.length * 29, props: { panelsMenu: true } });
  }

  openOptional(id) {
    setShared(`${id}.open`, true);
    run("layout.select", { stack: "panel-body", child: id });
    run("layout.show", { id: "panel" });
  }

  closeOptional(id) {
    setShared(`${id}.open`, false);
    const root = layout(), panel = find(root, "panel"), body = find(root, "panel-body");
    if (panel && !panel.hidden && body?.active === id) run("layout.hide", { id: "panel" });
  }

  // The + panels menu, drawn by this mod as a popup.
  renderMenu(t) {
    return v_flex().size_full().p(4).gap(1).bg(t.popover ?? t.surface).text_size(12.5)
      .child(div().px(8).h(24).flex().items_center().text_size(11).text_color(t.dim).child("패널 열기"))
      .children(OPTIONAL.map((p) => h_flex().id(`panel-menu-${p.id}`).h(28).px(8).gap(8).items_center().rounded(5).cursor_pointer()
        .text_color(t.foreground).hover(s => s.bg(t.hover))
        .on_click(() => { this.openOptional(p.id); closeOverlay(props().overlay); })
        .child(svg(p.icon).size(14).text_color(t.muted)).child(div().flex_1().child(p.label))
        .when(isOpen(p.id), el => el.child(svg("mods/spotify/check.svg").size(13).text_color(t.dim)))));
  }

  toggle(id) {
    const root = layout(), panel = find(root, "panel"), body = find(root, "panel-body");
    if (panel && !panel.hidden && body?.active === id) run("layout.hide", { id: "panel" });
    else { run("layout.select", { stack: "panel-body", child: id }); run("layout.show", { id: "panel" }); }
  }

  // The side panel is remembered per space: switching shows that space's choice
  // (closed if it never had one), and opening or closing it records it.
  syncPanel(space, panel, body, enabled) {
    if (!space || !panel) return;
    const now = panel.hidden ? null : body?.active ?? null;
    if (space.id !== this.space) {
      const first = this.space === undefined;
      this.space = space.id; this.pending = null;
      if (!(first && !(space.id in this.panels))) {
        const stored = this.panels[space.id] ?? null, want = enabled.includes(stored) ? stored : null;
        if (want !== now) {
          this.pending = { want, until: Date.now() + 1000 };
          if (want) { run("layout.select", { stack: "panel-body", child: want }); run("layout.show", { id: "panel" }); }
          else run("layout.hide", { id: "panel" });
          return;
        }
      }
    }
    // Until the restore lands (or something else won), the old state isn't a choice.
    if (this.pending) {
      if (this.pending.want !== now && Date.now() < this.pending.until) return;
      this.pending = null;
    }
    if (this.panels[space.id] === now) return;
    this.panels[space.id] = now;
    localStorage.setItem("panels", JSON.stringify(this.panels));
  }

  render() {
    const t = theme();
    if (this.isMenu) return this.renderMenu(t);
    const space = spaces().find(p => p.active);
    const shown = space?.tabs ?? [];
    const stop = (_e, cx) => cx.stop_propagation();
    const button = (id, label, action) => div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim).hover(s => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", stop).on_click(action).child(label);
    const item = (c, i) => {
      const program = panes().find(p => p.tab === c.id && p.program?.agent)?.program ?? panes().find(p => p.tab === c.id)?.program;
      const name = /^tb\d+$/.test(c.name) ? program?.name ?? "Terminal" : c.name;
      return h_flex().id(`tab-${c.id}`).h(29).px(10).gap(7).rounded(7).items_center().flex_none().text_size(12.8)
        .border(1).border_color(c.active ? t.border : t.chrome).bg(c.active ? t.raised : t.chrome).text_color(c.active ? t.foreground : t.muted)
        .hover(s => s.bg(t.hover))
        .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); this.pressed = i; if (e.click_count === 2) run("tab.rename", { id: c.id }); })
        .on_mouse_up("left", () => {
          const from = this.pressed; this.pressed = null;
          if (from !== null && from !== i) run("tab.move", { id: shown[from].id, index: space.tabs.findIndex(x => x.id === c.id) + 1 });
          else run("tab.select", { id: c.id });
        })
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "menu", kind: "popup", width: 200, props: { tab: "tab", target: { id: c.id, space: space.id } } }); })
        .when(Boolean(program?.icon), el => el.child(program.tint ? svg(program.icon).size(14).text_color(t.muted) : image(program.icon).size(14)))
        .child(div().max_w(170).truncate().child(c.zoomed ? `${name} Z` : name))
        .when(c.status === "working", el => el.child(svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900)))
        .when(c.status === "blocked" || c.status === "done", el => el.child(div().size(6).rounded(3).bg(t[c.status])))
        .when(c.active, el => el.child(div().id(`close-${c.id}`).text_color(t.dim).on_mouse_down("left", stop).on_click((_e, cx) => { cx.stop_propagation(); run("tab.close", { id: c.id }); }).child(svg("mods/pane/close.svg").size(12))));
    };
    const root = layout(), sidebar = find(root, "sidebar"), w = window();
    // Old saved rails and a dragged-narrow sidebar can be smaller than the window buttons.
    const lightsPadding = w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen && root?.traffic_lights
      ? Math.max(10, (root.traffic_lights[0] + 64) / settings().zoom - (sidebar?.hidden ? 0 : sidebar?.size?.px ?? 0))
      : 10;
    const panel = find(root, "panel"), body = find(root, "panel-body");
    // Git covers what Changes showed, so Changes stays out of the panel.
    const enabled = [...(shared("workspace.panels") ?? ["files"]).filter((id) => id !== "changes"), "omp-usage", "artifacts", "slack", "browser", "git",
      ...OPTIONAL.filter((p) => isOpen(p.id)).map((p) => p.id)];
    this.syncPanel(space, panel, body, enabled);
    const panelButton = (id, label, icon) => {
      const on = panel && !panel.hidden && body?.active === id;
      return h_flex().id(`panel-${id}`).h(26).px(8).gap(5).flex_none().items_center().rounded(6)
        .text_size(12).bg(on ? t.selected : t.chrome).text_color(on ? t.foreground : t.muted)
        .hover(s => s.bg(t.hover)).on_mouse_down("left", stop)
        .on_click(() => this.toggle(id)).child(svg(icon).size(14)).child(label);
    };
    const closableButton = (p) => panelButton(p.id, p.label, p.icon).pr(4)
      .child(div().id(`panel-close-${p.id}`).size(16).flex().items_center().justify_center().rounded(4).text_color(t.dim)
        .hover(s => s.bg(t.raised).text_color(t.foreground)).tooltip(`${p.label} 닫기`)
        .on_mouse_down("left", stop).on_click((_e, cx) => { cx.stop_propagation(); this.closeOptional(p.id); })
        .child(svg("mods/pane/close.svg").size(10)));
    return h_flex().size_full().min_w(0).px(10).pl(lightsPadding).gap(3).items_center().bg(t.chrome).border_b(1).border_color(t.border)
      .on_mouse_up("left", () => { this.pressed = null; })
      .on_scroll_wheel(e => { if (Math.abs(e.delta.y) >= 1) run(e.delta.y > 0 ? "tab.prev" : "tab.next"); })
      .child(h_flex().id("tab-scroll").flex_1().min_w(0).h_full().items_center().gap(3).overflow_x_scrollbar().children(shown.map(item)))
      .child(button("tab-new", "+", () => openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 })))
      .when(enabled.includes("files"), el => el.child(panelButton("files", "Files", "mods/files/file.svg")))
      .when(enabled.includes("changes"), el => el.child(panelButton("changes", "Changes", "mods/changes/changes.svg")))
      .child(panelButton("omp-usage", "Usage", "mods/omp-usage/refresh.svg"))
      .child(panelButton("artifacts", "Artifacts", "mods/files/file.svg"))
      .child(panelButton("slack", "Slack", "mods/slack/message-square.svg"))
      .child(panelButton("browser", "Browser", "mods/slack/external-link.svg"))
      .child(panelButton("git", "Git", "mods/changes/changes.svg"))
      .children(OPTIONAL.filter((p) => isOpen(p.id)).map(closableButton))
      .child(button("panel-add", svg("mods/workspace-chrome/plus.svg").size(14), (_e, cx) => { cx.stop_propagation(); this.openMenu(); }).tooltip("패널 열기"))
      .when(w?.buttons, el => el.child(button("minimize", w.platform === "windows" ? svg("mods/my-tabs/win-min.svg").size(16) : "−", () => run("window.minimize")))
        .child(button("maximize", w.platform === "windows" ? svg(`mods/my-tabs/${w.maximized ? "win-restore" : "win-max"}.svg`).size(16) : "□", () => run("window.maximize")))
        .child(button("close-window", w.platform === "windows" ? svg("mods/my-tabs/win-close.svg").size(16) : svg("mods/pane/close.svg").size(13), () => run("window.close"))));
  }
}
