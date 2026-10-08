---
name: herdr-agent-delegation
description: "Use when delegating setup/ops or a research brief to an omp agent in herdr; targets a standing idle agent by pane ID when one exists."
---

# Delegating work to a herdr agent (omp)

The user prefers heavy local setup/ops executed by an omp agent (default model) in its own herdr workspace, driven with a structured brief — not done inline. Works from outside herdr (no HERDR_ENV needed): the `herdr` CLI talks to the running server over its socket.

## Procedure
0. Check for a reusable standing agent first: `herdr agent list`. If an idle omp agent already sits in the right workspace/cwd, target it by its explicit pane ID (e.g. `"w21:p2"`) instead of creating a new workspace. This works from outside herdr (HERDR_ENV unset — the CLI talks to the server socket), but never target the focused agent; pick the pane explicitly from the listing.
1. Otherwise `herdr workspace create --cwd <dir> --label "<topic>"` → take `.result.root_pane.pane_id` from the JSON.
2. `herdr agent start <name> --kind omp --pane <pane-id> --timeout 60000` — name must match `[a-z][a-z0-9_-]{0,31}`. Returns once the agent is idle and ready.
3. `herdr agent prompt <name> "<brief>" --wait --timeout 240000..300000`. **Keep the prompt TEXT single-line: multiline TEXT trips the CLI arg parser with `unknown option: <text>`, and `--` is rejected as an end-of-options marker.** For a long structured brief, write it to a file and send a one-line pointer ("<path> 읽고 지시 전체 수행"), then verify uptake with `herdr agent read`. Brief structure: 목표 / 배경 (paths, versions, constraints) / 순서 1..N / 제약 (workdir, do-not-touch list, sudo rule) / 보고 형식. Always include: "sudo가 필요하면 정확한 명령어를 알려주고 대기" — the agent cannot type the password; it must print the exact command, wait for the user to run it in their own terminal, and resume on the user's "완료".
4. `--wait` timeout is NOT failure: check `herdr agent get <name>`; if still working, rejoin with `herdr agent wait <name> --timeout <ms>`. Multi-step installs routinely exceed 5 minutes.
5. Read the report: `herdr agent read <name> --source recent-unwrapped --lines 150` (pipe to tail — transcripts are long).
6. Verify independently before reporting done: re-run the key state commands yourself (is-active, pacman -Q, cat config, device list). An agent's self-report is not verification.

## Pitfalls
- A foreground tool call cannot wait beyond 600 s: long `prompt --wait` auto-promotes to a tracked background process whose completion arrives as a notification. Do not re-run the prompt — read the agent after the notification.
- Minimize user round-trips: have the agent build without sudo where possible (`yay -G <pkg> && makepkg`, then one combined `sudo pacman -U <pkg> && <apply>` line for the user).
- Scope the agent to its own workspace/dir in the brief and forbid touching other workspaces/panes.
- For research briefs (OSS contribution surveys, repo investigations), explicitly forbid external writes — no issue comments, no PRs, no pushes. The agent investigates and writes local files only; the caller reads the result and decides any external action.
