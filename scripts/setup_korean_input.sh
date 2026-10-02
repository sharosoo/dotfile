#!/usr/bin/env bash
set -e

echo "=== [1/6] Installing Korean input packages ==="
sudo apt update -y
sudo apt install -y fcitx5 fcitx5-hangul fcitx5-config-qt fcitx5-frontend-qt5 fcitx5-frontend-gtk3

echo "=== [2/6] Setting environment variables for fcitx5 ==="
mkdir -p ~/.config/plasma-workspace/env
cat > ~/.config/plasma-workspace/env/fcitx5.sh <<'EOF'
#!/usr/bin/env bash
export GTK_IM_MODULE=fcitx
export QT_IM_MODULE=fcitx
export XMODIFIERS=@im=fcitx
export INPUT_METHOD=fcitx
export SDL_IM_MODULE=fcitx
export GLFW_IM_MODULE=fcitx
EOF
chmod +x ~/.config/plasma-workspace/env/fcitx5.sh

echo "=== [3/6] Configuring fcitx5 with Shift+Space toggle ==="
mkdir -p ~/.config/fcitx5
cat > ~/.config/fcitx5/config <<'EOF'
[Hotkey]
# Toggle between input methods
SwitchInputMethod=Shift+Space
EOF

# Ensure Korean input method exists
cat > ~/.config/fcitx5/profile <<'EOF'
[Groups/0]
Name=Default
Default Layout=us
DefaultIM=keyboard-us
EnabledIMList=keyboard-us,korean-hangul
EOF

echo "=== [4/6] Autostart fcitx5 on login ==="
mkdir -p ~/.config/autostart
cat > ~/.config/autostart/fcitx5.desktop <<'EOF'
[Desktop Entry]
Type=Application
Exec=fcitx5
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
Name=fcitx5
Comment=Korean input method
EOF

echo "=== [5/6] Setting up KDE keyboard layouts (us + kr) ==="
if [[ $XDG_SESSION_TYPE == "wayland" ]]; then
  echo "Detected Wayland session — applying per-user KDE layout config"
  kwriteconfig5 --file kxkbrc --group Layout --key Use --type bool true
  kwriteconfig5 --file kxkbrc --group Layout --key LayoutList "us,kr"
  kwriteconfig5 --file kxkbrc --group Layout --key Options "grp:alt_shift_toggle"
  qdbus org.kde.keyboard /Layouts reconfigure || true
else
  echo "Detected X11 session — applying system layout"
  sudo localectl set-x11-keymap us,kr pc105 "" "grp:alt_shift_toggle"
fi

echo "=== [6/6] Restarting fcitx5 ==="
pkill fcitx5 || true
fcitx5 & disown

echo ""
echo "✅ Korean input setup complete!"
echo "Shift + Space = Hangul/English toggle"
echo "You may need to log out and log back in once for environment variables to load."

