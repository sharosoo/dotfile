---
name: hermes-messaging-gateway
description: "Configure and operate the Hermes Agent messaging gateway on Discord, Telegram, Slack, Signal, WhatsApp, Teams, and other supported platforms. Use when editing platform env vars, troubleshooting bot connection/authorization issues, restarting the gateway service, or wiring channels/permissions for a new or existing bot."
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [linux, macos]
metadata:
  hermes:
    tags: [hermes, gateway, discord, telegram, slack, signal, whatsapp, teams, messaging, platform, configuration, systemd]
    related_skills: [hermes-agent]
---

# Hermes Messaging Gateway

Hermes runs the same agent core across a CLI, TUI, desktop app, and **messaging platforms** (Discord, Telegram, Slack, Signal, WhatsApp, Teams, Matrix, Email, etc.). The gateway is a long-lived process that bridges platform events (Discord messages, Telegram updates, …) to the agent loop.

This skill covers the *operational* surface: configuring platforms via env vars and `config.yaml`, troubleshooting connection / authorization / permission failures, and managing the gateway as a systemd service. Platform docs: https://hermes-agent.nousresearch.com/docs/user-guide/messaging/

## The One Rule You Must Know First

**The gateway cannot restart itself.** When the gateway is running and a tool call inside it tries to `systemctl --user restart hermes-gateway`, `hermes gateway restart`, or even fork a subshell to do so, it gets blocked with:

> `Blocked: cannot restart or stop the gateway from inside the gateway process. The gateway would kill this command before it could complete (SIGTERM propagates to child processes).`

This is enforced at the shell / safety-hook layer. The block applies to:

- `terminal()` foreground commands
- `terminal(background=true)` background processes
- `nohup` / `disown` / `setsid` shell wrappers (rejected by Hermes policy)
- `delegate_task` — subagents share the same process tree, so they hit the same block

**The only working path is the user opening a new shell (a fresh SSH session, a new terminal tab) and running the restart command themselves.** Don't waste a turn trying to be clever about it — just tell the user the exact one-liner and stop.

## Canonical Workflow: Edit Env → User Restarts

This is the default flow for almost every platform config change. Don't try to automate the restart.

1. **Identify the change** — which env var(s) in `~/.hermes/.env` or which keys in `~/.hermes/config.yaml`.
2. **Edit the file.** `.env` is a credential store, so use `sed` (or `hermes config set` for config.yaml). Direct `read_file`/`write_file` access is denied by Hermes — terminal is the right tool.
   ```bash
   # Example: enable allow-all-users on Discord
   sed -i 's|^DISCORD_ALLOWED_USERS=.*|DISCORD_ALLOW_ALL_USERS=true\n&|' /home/global/.hermes/.env
   grep -E "^DISCORD" /home/global/.hermes/.env   # verify
   ```
3. **Tell the user to restart from a separate shell:**
   ```bash
   systemctl --user restart hermes-gateway
   ```
4. **Don't try to verify from inside the session.** If the user asks, they can run `systemctl --user is-active hermes-gateway` and `tail -20 ~/.hermes/logs/gateway.log` themselves.

## Quick Service Management

Once a separate shell is open, these are the commands the user (or you, from a non-gateway shell) will use:

```bash
systemctl --user status hermes-gateway       # is it running?
systemctl --user restart hermes-gateway      # cycle it
systemctl --user stop hermes-gateway
systemctl --user start hermes-gateway
systemctl --user reset-failed hermes-gateway # clear crash-loop state
systemctl --user enable hermes-gateway       # auto-start at boot
sudo loginctl enable-linger $USER            # survive SSH logout

# Logs
tail -f ~/.hermes/logs/gateway.log
grep -i "failed to send\|error" ~/.hermes/logs/gateway.log | tail -20
```

## Platform Configuration Patterns

Each platform is configured via:
- **`~/.hermes/.env`** — credentials, tokens, user/role allowlists, env-level toggles
- **`~/.hermes/config.yaml`** — `platform_name:` block with structured defaults (env vars win when both are set)
- **`gateway.platforms.<name>.extra`** — gateway-level overrides (e.g. admin vs user slash-command gating)

To enable a platform, both the `enabled_platforms:` list in `config.yaml` must include it AND the `requires_env` from the plugin's `plugin.yaml` must be set in `.env`.

### Solo-Server Pattern (single trusted user)

When the user is the only person on the server / channel:

```bash
# In .env — bypass per-user allowlist
DISCORD_ALLOW_ALL_USERS=true
DISCORD_REQUIRE_MENTION=false   # optional: respond without @mention
```

Always pair with a note that any future user joining the server inherits bot access, and to lock back down with `DISCORD_ALLOWED_USERS=…` when that happens.

### Home Channel Routing

For cron output, background-task notifications, and proactive messages, set a single home channel per platform. Discord example:

```bash
DISCORD_HOME_CHANNEL=1523289661680910469          # channel ID
DISCORD_HOME_CHANNEL_NAME="#bot-updates"          # human-readable label
```

Or set it in-session with the `/sethome` slash command.

### Free-Response vs Mention-Required

Default: server channels require `@mention`. To make a channel respond to every message (no @mention required), add it to the platform's free-response list. Same idea exists on Slack, Telegram, etc. with platform-specific env var names — always cross-check the platform's own doc page.

## Configuration Locations

```
~/.hermes/config.yaml      # structured settings (per-platform blocks, agent config)
~/.hermes/.env             # credentials + env-level toggles (read by gateway process)
~/.hermes/auth.json        # OAuth tokens (Discord doesn't use this; OAuth providers do)
~/.hermes/logs/gateway.log # runtime log
~/.hermes/state.db         # sessions, pairing requests
~/.hermes/sessions/        # transcript JSONL files, routing index
~/.hermes/cache/documents/ # inbound attachment cache
```

## Common Pitfalls

- **Restarting from inside the gateway** — see "The One Rule" above. Don't try; tell the user.
- **Editing `.env` while the gateway is running** — works, but env vars only take effect after restart. Don't claim the change is live before restart.
- **Forgetting privileged intents (Discord)** — the most common "bot is online but silent" cause. Developer Portal → Bot → Privileged Gateway Intents → enable **Message Content Intent** + **Server Members Intent**.
- **Public bot = OFF** — Discord's Installation tab won't generate an invite URL. Use the manual OAuth URL with `permissions=274878286912`.
- **Reusing one bot across multiple gateways** — global slash-command registration flaps. Set `gateway.platforms.discord.extra.slash_commands: false` on the follower.
- **`max_attachment_bytes: 0`** — disables the file-size cap. Memory cost: a multi-GB upload is buffered in memory while being cached to disk. Keep the default (32 MiB) on shared bots.
- **Bot-to-bot loops** — `DISCORD_ALLOW_BOTS=mentions|all` with two auto-replying bots causes ack loops. The supported config is `none`.
- **`@everyone` / `@role` leaks** — the adapter blocks these pings by default even if the LLM emits them. Don't flip `allow_mentions.everyone: true` unless the user has a concrete reason.
- **Sharing sessions in busy channels** — `group_sessions_per_user: true` (default) isolates per user. Setting it `false` makes the whole room share context and one in-flight run blocks everyone else.
- **WSL2 gateway dies on close** — needs `systemd=true` in `/etc/wsl.conf`, otherwise the service falls back to `nohup` and dies with the session.
- **Cron `deliver: origin` resolves to the agent session's thread, not the parent channel.** Symptom: the scheduled job reports `Last run: ok` but the user sees nothing in their main channel. The agent session lives in a `discord:CHANNEL:THREAD` triplet and `origin` resolves to the thread — archived threads, locked threads, or threads the bot wasn't explicitly added to all silently drop the send. **Fix**: pass `deliver: discord:CHANNEL_ID` explicitly to `cronjob action=create`, where the ID is the parent channel. Look it up in `~/.hermes/channel_directory.json` (the first entry's `id` is usually it). Verify by `hermes cron run <job_id>` and asking the user to check the channel — `Last run: ok` is *not* proof of delivery.
- **Discord messages have a 2000-character hard limit.** Long digests (e.g. an entire "good-first-issue" feed) get truncated or dropped silently. Two routes out: (a) chunk the cron prompt's output (≤5 items per message, multiple `deliver:`-bound posts); (b) for ad-hoc / manual re-sends, bypass the cron and loop `hermes send --quiet --to discord:CHANNEL_ID -f <file>` with `sleep 1` between sends — no LLM cost, much faster, well under the rate limit.
- **`hermes send` is the right tool for "fire a pre-formatted message I already built."** It reuses gateway credentials, has no LLM cost, and is ~10× faster than routing through a cron. Right for: chunked re-emits of an already-formatted digest, alert pings from shell scripts, "I already wrote the markdown, just ship it" cases. Wrong for: LLM-generated content (use a cron for that).

## Verification Checklist

When the user reports a bot issue, run through this in order:

1. `systemctl --user is-active hermes-gateway` — is the service running?
2. `tail -30 ~/.hermes/logs/gateway.log` — recent errors?
3. `grep -E "^(DISCORD|TELEGRAM|SLACK)" ~/.hermes/.env` — required creds present?
4. Developer Portal / BotFather / Slack app config — intents / scopes / event subscriptions correct?
5. Bot role / channel permissions — has the bot been added to the channel with view + send?
6. Allowlist — is the user's ID in the platform's allowlist (or `*_ALLOW_ALL_USERS=true`)?
7. Restart from a separate shell: `systemctl --user restart hermes-gateway`

## Per-Platform Deep Dives

For platform-specific knobs (env var matrix, slash-command gating, voice mode, media types, etc.), see:

- `references/discord.md` — full env-var + config.yaml matrix, voice mode, forum channels, media, pairing
- (more coming as needs arise — add to this directory, not as separate skills)

These are condensed from upstream docs; the authoritative source is `~/.hermes/hermes-agent/website/docs/user-guide/messaging/<platform>.md` and the live site.

## Related

- `hermes-agent` skill — covers the broader Hermes ecosystem (CLI, model, providers, tools). Load it first when the user's question spans gateway + non-gateway topics.
- `hermes send` CLI — one-off message send through a platform without going through the full gateway loop.
- `hermes pairing list/approve/revoke` — DM authorization queue (for platforms that support pair-on-first-DM).
