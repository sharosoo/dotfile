# Discord Gateway — Condensed Reference

Extracted from `~/.hermes/hermes-agent/website/docs/user-guide/messaging/discord.md` (839 lines). Use this when configuring or troubleshooting a Discord bot. The live doc is authoritative for edge cases; this is the high-signal subset.

## Setup One-Liner (vs the 8-step doc)

```bash
hermes gateway setup     # interactive wizard picks Discord, prompts for token + user ID
```

Manual alternative — minimum `.env`:
```bash
DISCORD_BOT_TOKEN=...                              # required
DISCORD_ALLOWED_USERS=284102345871466496            # required (or *_ALLOW_ALL_USERS=true)
DISCORD_HOME_CHANNEL=123456789012345678             # optional but recommended
```

The setup steps that *can't* be skipped (Developer Portal):
1. Create application → Bot
2. **Privileged Gateway Intents** → enable **Message Content Intent** + **Server Members Intent** (most common "bot online but silent" cause)
3. Reset token, save to password manager
4. Invite via Installation tab (Public Bot = ON) or manual URL with `permissions=274878286912`
5. Find your user ID: Settings → Advanced → Developer Mode ON → right-click self → Copy User ID

## Environment Variable Matrix

All in `~/.hermes/.env`. Config.yaml defaults exist for most of these; env wins.

### Auth & Allowlist
| Var | Required | Default | Notes |
|---|---|---|---|
| `DISCORD_BOT_TOKEN` | yes | — | Developer Portal |
| `DISCORD_ALLOWED_USERS` | yes* | — | Comma-sep user IDs. *Or roles, or allow-all |
| `DISCORD_ALLOWED_ROLES` | no | — | OR-semantics with users. Auto-enables Members intent |
| `DISCORD_ALLOW_ALL_USERS` | no | — | `true` for solo-server |

### Routing
| Var | Default | Purpose |
|---|---|---|
| `DISCORD_HOME_CHANNEL` | — | Cron / notification target |
| `DISCORD_HOME_CHANNEL_NAME` | `"Home"` | Display label |
| `DISCORD_FREE_RESPONSE_CHANNELS` | — | Comma-sep channel IDs that skip @mention requirement |
| `DISCORD_IGNORED_CHANNELS` | — | Highest-priority block list |
| `DISCORD_ALLOWED_CHANNELS` | — | Whitelist (overrides config.yaml `discord.allowed_channels`) |
| `DISCORD_NO_THREAD_CHANNELS` | — | Skip auto-threading, reply inline |
| `DISCORD_CHANNEL_PROMPTS` | — | Per-channel ephemeral system prompts (config.yaml only) |

### Mention Behavior
| Var | Default | Purpose |
|---|---|---|
| `DISCORD_REQUIRE_MENTION` | `true` | Server channels: respond only on @mention |
| `DISCORD_THREAD_REQUIRE_MENTION` | `false` | Multi-bot threads: gate threads the same way |
| `DISCORD_IGNORE_NO_MENTION` | `true` | Stay silent if message @mentions others but not the bot |
| `DISCORD_AUTO_THREAD` | `true` | Auto-spawn thread on @mention in text channels |

### UX
| Var | Default | Purpose |
|---|---|---|
| `DISCORD_REACTIONS` | `true` | 👀 → ✅/❌ feedback |
| `DISCORD_HISTORY_BACKFILL` | `true` | Prepend channel scrollback to @mention context |
| `DISCORD_HISTORY_BACKFILL_LIMIT` | `50` | Scan cap |
| `DISCORD_REPLY_TO_MODE` | `"first"` | `off` / `first` / `all` |
| `DISCORD_ALLOW_BOTS` | `"none"` | `none` / `mentions` / `all` — never set to anything but `none` for bot↔bot |

### Security (mention pings)
| Var | Default | Purpose |
|---|---|---|
| `DISCORD_ALLOW_MENTION_EVERYONE` | `false` | Block @everyone / @here (leave off) |
| `DISCORD_ALLOW_MENTION_ROLES` | `false` | Block @role pings |
| `DISCORD_ALLOW_MENTION_USERS` | `true` | Allow @user pings |
| `DISCORD_ALLOW_MENTION_REPLIED_USER` | `true` | Ping author on reply |

### Attachments / Media
| Var | Default | Purpose |
|---|---|---|
| `DISCORD_MAX_ATTACHMENT_BYTES` | `33554432` | 32 MiB cap. `0` = unlimited (memory cost) |
| `DISCORD_ALLOW_ANY_ATTACHMENT` | deprecated | All types always accepted now |

### Internals
| Var | Default | Purpose |
|---|---|---|
| `DISCORD_COMMAND_SYNC_POLICY` | `"safe"` | `safe` / `bulk` / `off` — global slash-command startup sync |
| `DISCORD_PROXY` | — | `http://`/`https://`/`socks5://` |
| `HERMES_DISCORD_TEXT_BATCH_DELAY_SECONDS` | `0.6` | Streaming text flush grace |
| `HERMES_DISCORD_TEXT_BATCH_SPLIT_DELAY_SECONDS` | `2.0` | Inter-chunk delay for >2000 char messages |

## config.yaml `discord:` Block

```yaml
discord:
  require_mention: true
  thread_require_mention: false
  free_response_channels: "123,456"     # string or list
  auto_thread: true
  reactions: true
  ignored_channels: []
  no_thread_channels: []
  history_backfill: true
  history_backfill_limit: 50
  channel_prompts:                       # per-channel ephemeral system prompts
    "1234567890": |
      This channel is for research. Prefer citations and synthesis.
  allow_mentions:
    everyone: false
    roles: false
    users: true
    replied_user: true

# Global (not Discord-specific) — affects all gateway platforms
group_sessions_per_user: true   # default: isolate per user in shared channels
```

## Slash Command Gating (Admin / User split)

Under `gateway.platforms.discord.extra` in `config.yaml`:

```yaml
gateway:
  platforms:
    discord:
      extra:
        allow_from:                  # required user allowlist
          - "123456789012345678"     # admin
          - "999888777666555444"     # regular
        allow_admin_from:            # full slash command access
          - "123456789012345678"
        user_allowed_commands:       # non-admin can only run these
          - status
          - model
          - history
        # Same split for server channels
        group_allow_admin_from:
          - "123456789012345678"
        group_user_allowed_commands:
          - status
        slash_commands: true         # set false on follower gateway in multi-gw setups
```

- DM and server-channel scopes have separate admin lists.
- `/help` and `/whoami` are always allowed so users can introspect their tier.
- Setting `slash_commands: false` on a follower gateway prevents global registration flapping when multiple gateways share one Discord app.

## Voice Mode

Three layered capabilities:

1. **Voice messages (inbound)** — auto-STT using configured provider:
   - `faster-whisper` local (no key)
   - Groq Whisper (`GROQ_API_KEY`)
   - OpenAI Whisper (`VOICE_TOOLS_OPENAI_KEY`)
   - Mistral Voxtral (`MISTRAL_API_KEY`)

2. **TTS replies** — `/voice tts` sends audio alongside text.

3. **Voice channel (vc)** — bot joins, listens, talks. Optional mixer for ambient + verbal acks (off by default):

   ```yaml
   discord:
     voice_fx:
       enabled: true
       ambient_enabled: true
       ambient_path: ""               # empty = built-in synthesised pad
       ambient_gain: 0.18
       duck_gain: 0.06                # ambient loudness while bot speaks
       speech_gain: 1.0
       ack_enabled: true              # short "let me look into that" before first tool
       ack_phrases:
         - "Let me look into that."
         - "One moment."
   ```

   discord.py plays one stream per connection, so the adapter installs a software mixer that sums ambient + acks + TTS into that single stream.

## Sending Media (outbound)

`MEDIA:/absolute/path` inline tag in agent response → adapter auto-uploads:

| Type | Delivered as |
|---|---|
| PNG/JPG/WebP | Native image with inline preview |
| Animated GIF | `send_animation` (plays inline) |
| MP4/MOV | `send_video` (native player) |
| Audio/voice | `send_voice` (voice message if possible, else file) |
| PDF/ZIP/docx | `send_document` (download button) |

Per-server upload cap: 25 MB free, up to 500 MB with boosts. Adapter falls back to a link on 413.

## Receiving Files (inbound)

All file types accepted. Authorization gates the *user*, not the extension. Files are cached under `~/.hermes/cache/documents/`. Text files auto-injected up to 100 KiB; binaries surface as path-only context (auto-translated for sandboxed terminals).

## Forum Channels (type 15)

Direct messages not allowed in forum channels — every post is a thread. Adapter auto-detects and creates a thread post for each send. Thread name = first line of message (markdown heading stripped, 100-char cap).

## Home Channel — Two Ways to Set

1. **Slash:** `/sethome` in any channel the bot can see
2. **Env:** `DISCORD_HOME_CHANNEL=...` + optional `DISCORD_HOME_CHANNEL_NAME=...`

## Session Model

- DM → own session
- Server thread → own session namespace
- User in shared channel → own session inside that channel (default `group_sessions_per_user: true`)

Setting `group_sessions_per_user: false` shares one room-wide transcript and one running-agent slot — useful for collab rooms, but one user's long task can bloat everyone else's context and follow-ups interrupt each other.

## `display.tool_progress` (global, not Discord-specific)

```yaml
display:
  tool_progress: "all"          # off | new | all | verbose
  tool_progress_command: true   # expose /verbose slash command
```

## 100-Slash-Command Cap

Discord rejects the entire sync at 100 global application commands (error 30032). Installed skills auto-register as native `/skill-name` commands — if the total exceeds 100, the overflow is skipped with a log warning.

## Interactive Prompts (`clarify`)

`clarify` tool calls with options render as numbered buttons. Click "Other" to type freeform (next message in channel becomes the answer). Timeout: `agent.clarify_timeout` in config.yaml (default 600s).

## Top 5 Troubleshooting Recipes

1. **Bot online but silent** → Message Content Intent disabled in Developer Portal.
2. **"Disallowed Intents" on startup** → All three Privileged Intents must be on (Presence/Members/Message Content).
3. **"User not allowed"** → Add Discord user ID to `DISCORD_ALLOWED_USERS`; restart.
4. **403 in specific channel** → Bot role missing `View Channel` / `Read Message History` in that channel.
5. **Bot offline** → `hermes gateway status` (or `systemctl --user status hermes-gateway`); verify `DISCORD_BOT_TOKEN`.

## When to Load the Full Doc

The 839-line upstream doc has installation screenshots, OAuth flow details, voice-mode deep-dive, security guide references, and troubleshooting flows. Load `~/.hermes/hermes-agent/website/docs/user-guide/messaging/discord.md` if the condensed table above doesn't cover the question.
