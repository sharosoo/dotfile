---
name: browser-availability-monitoring
description: "Use when watching booking availability in a browser."
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [browser, booking, availability, monitoring, cron]
---

# Browser availability monitoring

## When to Use

Use for periodic seat, ticket, reservation, or other time-sensitive inventory checks where the official browser UI is the source of truth. The monitoring run is distinct from an authenticated purchase.

## Workflow

1. Translate the request into exact search predicates before automating: date, departure-time window (not arrival time), origin, acceptable destinations, party size, classes, and whether the user wants alerts or an attempted reservation. Check the official site's browser form once interactively; do not infer availability from search snippets. A blank list or “no trains” is not proof of sold-out seats or of a successful search.
2. Use browser interaction for sites whose schedule and seat state depend on client-side session flow. Inspect the rendered form and results, select dates/hours through the site's controls, and verify the displayed parameters after navigation. Search each acceptable destination or explicitly validate destinations in a combined result. Verify actual available-seat indicators for each permitted class before alerting or selecting a ticket.
3. For recurring monitoring, use a bounded Hermes cron job with a self-contained prompt containing every predicate, the exact official URL, the desired response conditions, and an end condition. List existing jobs first to avoid duplicates. Compute a finite repeat count from current local time to the deadline with a tool, and set `[SILENT]` for unchanged/unavailable results so monitoring does not flood chat. A manually triggered first run is asynchronous; do not call scheduling proof of completed monitoring. Inspect the job's actual outcome when delivered before claiming the monitor works end-to-end.
4. In a Discord thread, address cron delivery as `discord:<parent_channel_id>:<thread_id>`; using only the thread ID as the chat target can route to the wrong surface. Read back the job after creation or update to verify the target, interval, deadline/repeat, and enabled state.
5. Treat booking as a separate state transition from finding inventory. At a login form, call `browser_vault_list`, confirm the saved origin exactly matches the live origin (including `www`), enter the returned identifier directly in the site's ID field, and use vault fill for the password only. Never read or pipe passwords from dotenv/files/environment into browser inputs, even when the user authorizes it. If vault fill cannot identify fields, inspect the visible password input's `autocomplete` and the classifier rule before declaring a blocker. Some sites mark the existing-password field `new-password`, which excludes it from vault classification: on a confirmed login page, set only that DOM attribute to `current-password`, then retry `browser_vault_fill` (never touch the secret). Enter the identifier directly first. Verify `filled_fields`, then submit only the actual login button, observe the site's response, and distinguish vault success from server-side login success. Do not repeat failed logins blindly when the site warns of account lockout. If vault setup requires an interactive UI unavailable in the current session, tell the user how to register it and limit unattended automation to verified alerts. Do not claim an unattended reservation is possible until login, authentication, checkout, and confirmation have actually been exercised. Read back the reservation target after any successful booking action.
6. Keep status concise and state-specific: monitoring scheduled, first run verified or pending, availability observed or unknown, reservation attempted or not, and the exact user action needed. Do not conflate an empty train list with a confirmed sellout. When a user supplies credentials through multiple approved paths and autofill fails, diagnose the page's form hints and the vault classifier before concluding the task cannot proceed; report the specific remaining blocker only after testing a safe fix.
