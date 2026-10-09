-- Learn how to configure Hyprland: https://wiki.hypr.land/Configuring/Start/

-- Omarchy's bootstrap keeps path setup out of this user config.
dofile((os.getenv("OMARCHY_PATH") or "/usr/share/omarchy") .. "/default/hypr/bootstrap.lua")

-- Disable all Omarchy default bindings. Add your own in hypr/bindings.lua.
-- omarchy_default_bindings = false
--
-- Or disable only bindings for Omarchy's preinstalled apps/web apps while
-- keeping core window-manager bindings:
-- omarchy_preinstalled_bindings = false

-- Load Omarchy defaults.
require("default.hypr.omarchy")

-- Put your personal overrides in these files. They're loaded after Omarchy's
-- defaults so package updates can improve the defaults without rewriting your
-- ~/.config/hypr files.
require("hypr.monitors")
require("hypr.input")
require("hypr.bindings")
require("hypr.looknfeel")
require("hypr.autostart")

-- Toggle config flags dynamically.
require("default.hypr.toggles")

-- Add any other personal Hyprland configuration below.
-- o.window("qemu", { workspace = "5" })

-- btop (Super+Ctrl+T, bar CPU/memory widget): the default 875x600 float is too
-- small on this 4K display, so open it large and centered.
o.window({ tag = "floating-window", class = "org.omarchy.btop" }, { size = { 1700, 1100 } })

-- Browsers get the same translucency as every other window (Omarchy exempts them with 1.0 0.985).
o.window({ tag = "chromium-based-browser" }, { opacity = "0.985 0.96" })
o.window({ tag = "firefox-based-browser" }, { opacity = "0.985 0.96" })

-- OpenLogi Actions Ring opens as a plain toplevel (Wayland ignores its requested
-- position). Tiled, it shoves the scrolling layout aside. no_focus would also
-- drop its pointer input (slots become unclickable), so only initial and
-- hover focus are suppressed; a click still focuses it.
o.window("^openlogi-action-ring$", {
  float = true,
  pin = true,
  size = { 360, 360 },
  move = { "cursor_x-(window_w*0.5)", "cursor_y-(window_h*0.5)" },
  no_follow_mouse = true,
  no_initial_focus = true,
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

-- Local overrides of Omarchy scripts (e.g. calmer omarchy-screensaver) must win
-- over $OMARCHY_PATH/bin, which default envs.lua puts first in PATH.
do
  local override_dir = os.getenv("HOME") .. "/.local/share/omarchy-overrides/bin"
  local omarchy_bin = (os.getenv("OMARCHY_PATH") or "/usr/share/omarchy") .. "/bin"
  local entries = { override_dir, omarchy_bin }
  for entry in (os.getenv("PATH") or "/usr/local/bin:/usr/bin"):gmatch("[^:]+") do
    if entry ~= override_dir and entry ~= omarchy_bin then table.insert(entries, entry) end
  end
  hl.env("PATH", table.concat(entries, ":"))
end
