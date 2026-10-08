---
name: openlogi-mx4
description: "Use when configuring MX Master 4 or OpenLogi on Linux."
---

# OpenLogi — MX Master 4 on Linux

Official Logi Options+ has no Linux build. OpenLogi (AprilNEA/OpenLogi, Rust) replaces it — installed here as AUR `openlogi-bin` with `openlogi-agent.service` (user service, enabled).

## Always-on rules
- HID++ is single-owner: never run Solaar or logiops alongside openlogi-agent — whichever grabs the receiver first locks the other out.
- Never enable sub-tick smooth scroll on the MX4: the hardware does not respond to the HID++ config the older Masters use; it ships disabled on purpose.
- Read `~/.config/openlogi/config.toml` before editing. Edit only while the GUI is closed (a stale GUI rejects saves); the GUI preserves comments and auto-writes config.toml.backup.N.

## Config schema (v0.8.x)
Device key: `receiver:<serial>:slot:<n>`; a Bluetooth connection gets a different key and needs settings re-saved.

- `[devices."<key>"]` → `dpi`, `smartshift` { mode = "ratchet", auto_disengage, tunable_torque }. auto_disengage range 8..50, default 16; LOWER engages free-spin more easily.
- `bindings` (global): MiddleClick, Back, Forward, DpiToggle (button behind the wheel), GestureButton, HapticPanel (CID 0x1a0), Thumbwheel*, WheelTilt* → action values. `{ short = …, long = … }` splits tap vs 500 ms hold.
- `per_app_bindings."<app_id>"`: ONE action per button. A per-app GestureButton entry REPLACES the whole gesture-direction map with a single click action — per-app gesture maps do not exist. Wayland switches profiles on the FOCUSED window's app_id (wlr-foreign-toplevel), not the window under the pointer.
- `action_ring.default.slots`: Top/TopRight/Right/BottomRight/Bottom/BottomLeft/Left/TopLeft = { action, icon, label }. Slots must not hold None or ShowActionsRing. Per-app rings go under `action_ring.per_app`. Summon with `HapticPanel = "ShowActionsRing"` in bindings.
- Actions: RunShellCommand (native; /bin/sh -c; agent env carries WAYLAND_DISPLAY, HYPRLAND_INSTANCE_SIGNATURE, omarchy PATH), CustomShortcut (e.g. "Ctrl+Shift+V", sent as a tap), HoldShortcut (held while the button is held).

## Linux limitations — these silently no-op, don't assign them
MissionControl/AppExpose/ShowDesktop/LaunchpadShow: nothing. Screenshot/CaptureRegion: both degrade to the Print key (smart mode, not region). PreviousDesktop/NextDesktop send Ctrl+Alt+←/→ (unbound in omarchy). TypeText: unimplemented. MX4 default gestures: only Left/Right work (prev/next tab); Click/Up/Down are no-ops.

## Patterns that work
- Utility/ring actions via `RunShellCommand = "hyprctl dispatch 'hl.dsp.exec_cmd(\"<cmd>\")'"`. Launching directly makes the process a child of openlogi-agent and it dies on every agent restart; routing through Hyprland matches keybind semantics. (omarchy Hyprland is Lua-config: plain `hyprctl dispatch exec` does not exist.)
- Window ops in ring slots: prefix `sleep 0.2;` so the ring popup closes before close/float dispatch lands — verify the delay and tune.
- After any config edit: `systemctl --user restart openlogi-agent.service`, confirm the value reads back and `journalctl --user -u openlogi-agent` shows no parse errors. The config file wins over volatile device state on restart.
- Discover hardware: `openlogi list` (receiver/slot/wpid/battery). Known app_ids: com.mitchellh.ghostty, dev.zed.Zed.
- Updates: `yay -S openlogi-bin`; built pkg cache kept in ~/workspaces/openlogi/openlogi-bin.
