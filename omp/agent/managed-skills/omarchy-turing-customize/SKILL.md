---
name: omarchy-turing-customize
description: "Use when changing this machine's Omarchy/Hyprland desktop (keybinds, layout, opacity, screensaver/idle, bar widgets, notifications, Ghostty/fish/fcitx5/herdr config) so the change lands in the sharosoo dotfile repo and survives Omarchy updates."
---

# Omarchy customization on `turing` (user sharosoo)

Omarchy 4.x, Hyprland 0.56 with **Lua config**, Omarchy shell = Quickshell (`omarchy-shell`). Default layout: scrolling. Theme Tokyo Night. User talks Korean, casual 반말; answer the same way.

## Where things live — source of truth is the dotfile repo
- Repo: `~/workspaces/sharosoo/dotfile` (GitHub `sharosoo/dotfile`, branch `master`).
- `omarchy/home/` mirrors `$HOME`. `omarchy/sync.sh` symlinks every file into `$HOME` (backs up differing files as `*.bak.<ts>`); idempotent.
- **Copy-managed files** (owner rewrites them, which breaks symlinks): `.config/omarchy/shell.json`, `.config/fcitx5/profile`, `.config/herdr/config.toml`, `.config/fish/fish_plugins`. After changing them live run `omarchy/sync.sh capture`.
- **Everything the user installs or tweaks belongs in the dotfile repo**, including third-party code. Third-party bar plugins (herdr, notification-center, Omarchy-Spotify) are vendored in `omarchy/vendor/plugins/<id>/` with `vendor/plugins.lock` (`id url commit`); live copies stay git checkouts. New one: `omarchy plugin add <url>`, add the id to the lock, `sync.sh capture`. After `omarchy plugin update`: `sync.sh capture`.
- Docs: `omarchy/README.md` (table: 기능 | 파일 | 내용 per customization), `omarchy/NEW-PC.md` (ordered runbook + verification checklist + excluded items). Update both when adding a customization.
- `.gitignore` has `*.local`; `!omarchy/home/.local` re-includes the mirror.

### Adding a customization
1. Edit/create the file at its `omarchy/home/<path>` (or edit the live symlink — same file).
2. New file → `cd omarchy && ./sync.sh`.
3. Reload + verify (below). 4. Add README row (+ NEW-PC step if manual). 5. Commit.

## Never edit `/usr/share/omarchy` directly
Omarchy updates overwrite it. Override instead:
- **Hyprland**: user files `~/.config/hypr/{hyprland,bindings,looknfeel,...}.lua` load after defaults. API: `o.bind(keys, desc, cmd_or_dispatcher)`, `hl.unbind("SUPER + F")` before rebinding, `o.window(match, {opacity=..., tag="-default-opacity"})`, `hl.env`, `hl.dsp.layout("colresize 1.0" | "swapcol l")`. Defaults in `/usr/share/omarchy/default/hypr/`.
- **Scripts**: `~/.local/share/omarchy-overrides/bin/` is prepended to PATH ahead of `$OMARCHY_PATH/bin` by a block at the end of `hyprland.lua` (used by the calmer `omarchy-screensaver`). Copy the upstream script there and modify.
- **Bar widgets**: fork into `~/.config/omarchy/plugins/sharosoo.<name>/` (manifest.json + Widget.qml, `root.setting(key, default)` reads manifest `defaults`), then swap the id in `shell.json` `bar.layout`. Shell hot-reloads plugins.
- **Shell settings**: `shell.json` (`idle.screensaver`/`idle.lock` seconds), `shell.toml` (`[notifications] background-alpha`).
- **Hooks**: `~/.config/omarchy/hooks/post-update.d/*.hook`.
- Only unavoidable system patch: `NotificationCard.qml` (Chromium site icons + × close button) → one combined patch `~/.local/share/omarchy-overrides/notification-card.patch` (diff against pristine upstream; regenerate from a reverse-patched copy when adding hunks), reapplied by `notification-icons-patch` (needs sudo; user must type password in a launched terminal: `hyprctl dispatch 'hl.dsp.exec_cmd("omarchy-launch-floating-terminal-with-presentation <cmd>")'`), a post-update hook notifies when it's gone. Keep any new system patch in this pattern.

## Existing customizations (don't redo)
Super+F full-width column (`scroll-full-width`), Super+Alt+F real fullscreen, Super+Shift+←/→ `swapcol` (`scroll-swap`), browsers get default opacity 0.985/0.96, screensaver effects limited, idle 600/1800 s, workspaces widget shows 2, notification alpha 0.55, `~/.local/bin/notify-send` wrapper adds agent icons (title first word → `~/.local/share/notification-icons/agents/<word>.png`, herdr fallback) via `--app-icon` (not `--icon`: image hint is dropped from history), Chromium favicon export `notification-icons-sync`.

## Verify (always, with evidence)
- `hyprctl reload; hyprctl configerrors` (empty = ok); `hyprctl binds -j | jq ...` for bindings (modmask 64=SUPER, 65=+SHIFT, 72=+ALT, 68=+CTRL).
- Shell: `omarchy-restart-shell` after QML/system changes (plugins hot-reload; patched system QML does not). Logs: `journalctl --user --since -2min | grep omarchy-shell`.
- Idle: `omarchy-shell idle status`. Opacity: `hyprctl getprop active opacity`.
- Notifications: `gdbus call --session --dest org.freedesktop.Notifications ... Notify` or `notify-send`; history JSON in `~/.local/state/omarchy/notifications/history/`.
- Visual: `grim -g "x,y WxH" /tmp/x.png`, crop with `magick`, view with read. Layout tests: spawn `ghostty --class=swtest.a` on workspace 9, test, kill, return focus.
- The `read` tool sometimes fails on absolute `/tmp/...` paths while cwd is /tmp; retry with the relative name.

## Commits / publishing
- Commit messages in English, scoped atomic commits, **no Co-Authored-By footer**.
- Push only when the user asks in the conversation; otherwise report the push command.
- Leave unrelated uncommitted user changes out of commits unless asked.
- Korean prose in docs: compose from an English intent via the `naturalizer` agent.
