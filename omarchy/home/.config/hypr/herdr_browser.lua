-- herdr-app's Browser panel in native mode: herdr-browser.service runs its Chromium headed (app id
-- "herdr-browser") and places the window over the panel's page area itself. It must float there, never
-- take focus on its own (agents drive it while the person types elsewhere; only a click focuses it), and
-- look like part of herdr. Its own fullscreen/maximize requests are ignored: the service tells the client
-- it is fullscreen (so the kiosk hides its tab strip) while Hyprland keeps it a floating window.
o.window("^herdr-browser$", {
  float = true,
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
})
