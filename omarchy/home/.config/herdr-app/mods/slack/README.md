# Slack panel: sidebar sections

The conversation list is grouped the way Slack's sidebar is: your own sections first, then
**Channels**, **Direct messages** (group messages too) and **Apps** for everything no section
takes. Slack doesn't let other apps read the sections of its own sidebar, so they are set up in
the panel and kept in a file you own:

    ~/.config/herdr-app/data/slack/sections.json

The panel reads it every 2 seconds, so a hand edit shows at once. A file that isn't valid JSON or
doesn't fit the schema below is not taken: the sections stay as they were and a note names the
line until it's fixed. Edits made in the panel write the same file: drag a conversation onto a
section (its header or any of its rows), or use a conversation's ⋯ menu → Section, and a
section's ⋯ menu → Rename, Emoji, Collapse, Move up/down, Delete. Each edit is applied to the
file as it is on disk at that moment, so a change saved from an editor isn't overwritten. The
gear menu has **Edit sections.json**.

This file is personal: keep it out of any repository. Copy it to another machine to get the
same sidebar there.

## Schema

```json
{
  "sections": [ … ],
  "teams": { "T0123ABCD": { "sections": [ … ], "unsectioned": [ … ] } }
}
```

- `teams.<team id>` is used for that workspace; without one, the top-level `sections` are used
  (handy for one file shared between machines or workspaces). An edit made in the panel goes to
  whichever of the two is in use, or to a new `teams.<team id>` entry in an empty file.
- A section is `{ "name", "emoji", "collapsed", "rules", "channels" }`. Only `name` is required.
  - `emoji`: a character (`🚨`) or a `:name:` (standard, or the workspace's own).
  - `collapsed`: folded in the list. A folded section still shows its unread conversations.
  - `channels`: conversations shown in this section, in this order. A channel by name
    (`"general"` or `"#general"`), anything by id (`"C0123ABCD"`, `"D0123ABCD"`). The panel
    writes channel names and direct-message ids.
  - `rules`: what pulls in conversations not listed anywhere. A rule is a name pattern
    (`"proj_*"`) or an object whose parts must all hold:
    - `name`: `*` any run of characters, `?` one, `|` or, matched against the whole name, any
      case. Every other character is literal; regular expressions aren't supported.
    - `type`: `public`, `private`, `dm`, `group` (group message), `app`, or several joined by `|`.
    - `muted`: `true` or `false`.
- `unsectioned`: conversations kept out of every section even though a rule matches them (the
  panel adds one here when you move it back to its usual group).

A conversation goes to the first section that lists it in `channels`; otherwise to the first
section, top to bottom, with a rule it matches; otherwise to Channels, Direct messages or Apps.

## Example

```json
{
  "sections": [
    {
      "name": "Team",
      "channels": ["team-general", "team-standup", "C0123ABCD"]
    },
    {
      "name": "Errors",
      "emoji": "🚨",
      "collapsed": true,
      "rules": [{ "name": "*sentry*|*errors*", "type": "public|private" }]
    },
    {
      "name": "Deploys",
      "emoji": ":rocket:",
      "rules": ["deploy-*", { "name": "ci-*|ci_*", "muted": true }]
    },
    {
      "name": "Bots",
      "rules": [{ "type": "app" }]
    }
  ]
}
```

## In a conversation

- **Pictures and faces** are fetched only for what is on screen and about one screen above and
  below, newest first, three at a time. Each one is looked up in the disk cache
  (`data/slack/media/`, `data/slack/avatars/`) first, so going back to a conversation fetches
  nothing again.
- **New messages**: a conversation opened with unread messages starts at a red "새 메시지" line
  above the first one you haven't read, using where Slack says you read up to (a thread you
  follow uses its own). While that line is above the view, a pill at the top says how many are
  new and jumps back to it. The conversation is marked read, here and in Slack, only once its
  newest messages have been on screen, and again for each message that comes while you watch.
  Read in another Slack app shows here within about a minute (Slack doesn't tell other apps,
  so the unread ones are asked again every minute). Without the four `*:write` permissions a
  yellow bar says so, with Fix permissions. Every mark Slack is asked for, and its answer, is
  in `data/slack/mark.log` (from the latest start that marked anything).
- **People**: click a face or a name in a message, an @mention, or the face of a direct message
  in the list for their card: picture, names, title, status, local time, presence, and email
  when the token has `users:read.email`. "메시지 보내기" opens your direct message with them,
  or starts one (that needs `im:write`; gear menu → Fix permissions adds it). "Slack에서 열기"
  opens their profile in Slack.
- **Channels**: type `#` in the message box to pick one of your channels (arrows, Enter or Tab,
  Esc closes); Slack shows it as a link. A `#channel` in a message opens it here when you are
  in it, and its Slack page otherwise.
- **Writing**: Enter sends, Shift+Enter starts a new line; the box grows to eight lines, then
  scrolls. `- ` or `* ` at the start of a line becomes a `•` list item, `1. ` a numbered one,
  and `> ` a quote (a bar in the box, sent as `> `). Shift+Enter on an item starts the next
  one, on an empty item ends the list; Backspace right after `•` or the bar gives back what
  you typed. Quotes in messages are shown with a bar on the left, as in Slack.
