-- herdr-app's Browser panel in native mode: herdr-browser.service runs its Chromium headed (app id
-- "herdr-browser") and places its main window over the panel's page area itself; other windows it opens
-- (window.open popups, sign-in windows) keep their own size and come and go with the panel. They must never
-- take focus on their own (agents drive them while the person types elsewhere; only a click focuses one) and
-- look like part of herdr. Their own fullscreen/maximize requests are ignored: the service tells the main window
-- it is fullscreen (so Chromium hides its tab strip and toolbar) while Hyprland keeps it a floating window.
o.window("^herdr-browser$", {
  float = true,
  -- Out of sight until the service puts it where the panel is (a popup opened while the person looks at
  -- another workspace would otherwise land there).
  workspace = "special:herdr-browser silent",
  no_initial_focus = true,
  focus_on_activate = false,
  suppress_event = "fullscreen maximize activate activatefocus",
  no_follow_mouse = true,
  decorate = false,
  border_size = 0,
  rounding = 0,
  no_shadow = true,
  no_blur = true,
  no_anim = true,
  no_dim = true,
  tag = "-default-opacity",
  opacity = "1 1",
  -- While an agent drives, the window waits on a hidden special workspace and the panel shows its screencast,
  -- which only flows while Hyprland keeps rendering the window.
  render_unfocused = true,
})

-- Hidden windows render at most this often; the panel's frames go out at up to 30 fps.
hl.config({
  misc = {
    render_unfocused_fps = 30,
  },
})
