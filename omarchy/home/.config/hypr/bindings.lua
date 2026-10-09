-- Keep only your personal keybinding overrides here. Add new bindings or
-- unbind defaults before replacing them.

-- See current bindings and descriptions:
--   omarchy menu keybindings --print

-- To disable every Omarchy default binding, set this in
-- ~/.config/hypr/hyprland.lua before require("default.hypr.omarchy"), then add
-- only the bindings you want below:
--   omarchy_default_bindings = false

-- To disable all preinstalled app/webapp bindings, set:
--   omarchy_preinstalled_bindings = false

-- Add a new binding.
-- o.bind("SUPER + SHIFT + R", "SSH", "alacritty -e ssh your-server")

-- Change an existing binding by unbinding it first, then binding the key again.
-- This example changes SUPER+SPACE from the launcher to the Omarchy root menu.
-- hl.unbind("SUPER + SPACE")
-- o.bind("SUPER + SPACE", "Omarchy menu", "omarchy-menu toggle root")

-- Disable a default binding without replacing it.
-- hl.unbind("SUPER + SHIFT + B")

-- Logitech MX Keys examples:
-- o.bind("SUPER + SHIFT + S", nil, "omarchy-capture-screenshot")
-- o.bind("SUPER + H", nil, "voxtype record toggle")
-- o.bind("SUPER + PERIOD", nil, "omarchy-shell shell toggle omarchy.emojis")

-- Screenshot without a Print key (replaces the default Google Maps binding)
hl.unbind("SUPER + SHIFT + S")
o.bind("SUPER + SHIFT + S", "Screenshot", "omarchy-capture-screenshot")

-- Region screenshot uploaded to cdn.sharosoo.com (R2) via sharosoo-cdn; the link goes to the clipboard.
o.bind("SUPER + CTRL + SHIFT + S", "Screenshot upload", "/home/sharosoo/.local/bin/screenshot-upload.sh")

-- Super+F is the full-width column (keeps the scrolling layout, so Super+arrows
-- still slide); real fullscreen moves to Super+Alt+F.
hl.unbind("SUPER + F")
hl.unbind("SUPER + ALT + F")
o.bind("SUPER + F", "Full width (keep sliding)", "/home/sharosoo/.local/bin/scroll-full-width")
o.bind("SUPER + ALT + F", "Full screen", hl.dsp.window.fullscreen({ mode = "fullscreen" }))

-- Super+Shift+Left/Right reorder whole columns so each window keeps its width.
hl.unbind("SUPER + SHIFT + LEFT")
hl.unbind("SUPER + SHIFT + RIGHT")
o.bind("SUPER + SHIFT + LEFT", "Swap window to the left", "/home/sharosoo/.local/bin/scroll-swap l")
o.bind("SUPER + SHIFT + RIGHT", "Swap window to the right", "/home/sharosoo/.local/bin/scroll-swap r")

-- Preinstalled apps/web apps removed on this machine; free their keys.
hl.unbind("SUPER + SHIFT + E") -- HEY email
hl.unbind("SUPER + SHIFT + ALT + E") -- HEY new email
hl.unbind("SUPER + SHIFT + C") -- HEY calendar
hl.unbind("SUPER + SHIFT + ALT + G") -- WhatsApp
hl.unbind("SUPER + SHIFT + CTRL + G") -- Google Messages
hl.unbind("SUPER + SHIFT + P") -- Google Photos
hl.unbind("SUPER + SHIFT + X") -- X
hl.unbind("SUPER + SHIFT + ALT + X") -- X post
hl.unbind("SUPER + SHIFT + Y") -- YouTube
hl.unbind("SUPER + SHIFT + ALT + M") -- cliamp music TUI
