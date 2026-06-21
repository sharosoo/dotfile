#!/usr/bin/env bash
# Called from Noctalia session menu (hooks.session) or manually.
loginctl terminate-user "${USER:-global}" 2>/dev/null || pkill -u "${USER:-global}" niri 2>/dev/null
exit 0