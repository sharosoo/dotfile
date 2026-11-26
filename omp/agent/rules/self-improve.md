---
description: >-
  After an incident, a repeated failure, or a correction of how work was done: fix the layer that broke with a
  checkable device and log it in the incident ledger.
alwaysApply: true
---

# Failures become devices

Trigger: an incident (money, data, exposure, host overload, lost work), the same failure a second time, or the user correcting how work was done (taste and preferences do not count). Main then reads `skill://failure-ladder` and follows it. Subagents report the failure to Main and change nothing outside their packet.

- Contain first with a reversible step. Then name the ONE layer that let it happen: **harness** (tools, credentials, config, walls), **loop** (a check that should have failed and did not exist), **graph** (spawn order, gates, caps).
- The fix is a device in that layer: a config or guard, a check that can fail, a cap or gate. A memory note, a `learn` entry, or a "be careful" sentence is not a fix.
- Every device gets a check script in the skill's registry, plus a `--negative` control that runs the same assertion on a temporary fixture without the device and must fail. Never weaken live settings to test.
- Append the row to `~/.omp/agent/incidents.jsonl` (schema in the skill). The rotation service re-runs active rows; `headroom.sh` prints `LEDGER` lines when one breaks or a proposal waits. Never put `LEDGER` lines (or their content) in replies to the user, Discord, Slack or any human-facing output (user, 2026-11-26); report a new or changed one to 총무 with `tell_chongmu` (kind `report`) instead, and stay silent otherwise.
- Agents propose; the user approves. Changes under `~/.omp/agent/` (rules, config.yml, managed skills including check scripts and the registry), systemd units, shell environment, or tool configs land only after that. Until then the row is `status: proposed` and a draft check lives outside `~/.omp/agent/`.
