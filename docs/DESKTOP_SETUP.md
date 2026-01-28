# Desktop Setup (Hyprland)

This setup follows the latest ML4W Hyprland Dotfiles documentation for component choices and dependency guidance.

Sources:
- https://mylinuxforwork.github.io/dotfiles/
- https://mylinuxforwork.github.io/dotfiles/getting-started/overview
- https://mylinuxforwork.github.io/dotfiles/getting-started/install
- https://mylinuxforwork.github.io/dotfiles/getting-started/dependencies

## Install Hyprland (Ubuntu)

```bash
sudo add-apt-repository universe
sudo apt-get update
sudo apt-get install -y hyprland
```

### NVIDIA

```ini
# /etc/modprobe.d/nvidia.conf
options nvidia_drm modeset=1
```

## Run Hyprland

- From display manager: select Hyprland session
- From TTY:

```bash
start-hyprland
```

## Keybinds (this dotfile)

| Key | Action |
|-----|--------|
| `Super+Enter` | Ghostty new window |
| `Super+Q` | Close window |
| `Super+V` | Toggle floating |
| `Super+S` | Toggle split |
| `Super+H/J/K/L` | Focus move |
| `Super+Shift+H/J/K/L` | Move window |
| `Super+1..5` | Switch workspace |
| `Super+Shift+1..5` | Move window to workspace |

## ML4W Reference Components

The ML4W dotfiles list these core components:

- Terminal: kitty
- Editor: nvim
- Prompt: oh-my-posh
- Wallpaper: hyprpaper + waypaper (swww optional)
- Launch menu: rofi (Wayland)
- Bar: waybar
- Notifications: swaync
- Clipboard: cliphist
- Screenshots: grim + slurp + grimblast
- Idle/lock: hypridle + hyprlock
- Logout: wlogout
- Dock: nwg-dock-hyprland
- Themes: pywal, Papirus icons, Bibata cursor, nwg-look, qt6ct

This dotfile uses Ghostty instead of kitty by default.

## ML4W Installer (Reference)

The ML4W docs use the Dotfiles Installer app (Flathub) with these URLs:

- Stable: https://raw.githubusercontent.com/mylinuxforwork/dotfiles/main/hyprland-dotfiles-stable.dotinst
- Rolling: https://raw.githubusercontent.com/mylinuxforwork/dotfiles/main/hyprland-dotfiles.dotinst

## Dependencies (Reference)

The ML4W docs list these dependencies (names vary by distro):

```

## Notes

Hyprland is bleeding-edge. Rolling-release distros are recommended. Ubuntu may require newer driver/toolchain versions.
