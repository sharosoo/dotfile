---
name: failure-ladder
description: "Use after an incident, a repeated failure, or a user correction of process: classify the layer that broke, build a checkable device, record it in the incident ledger."
---
# Failure ladder

A failure is closed when the layer that let it happen holds a device that a check proves, not when someone remembers it. `rules/self-improve.md` sends Main here.

## 1. When

- **Incident**: money spent, data lost or exposed, host overloaded, work lost.
- **Repeat**: the same failure a second time, including a subagent slip that recurs after `skill://agent-orchestration` §8 tightened the prompt.
- **Correction**: the user corrects *how* work was done.
- Not triggers: taste and preferences, a one-off typo, a first subagent prompt slip (§8 handles it).

## 2. The ladder

1. **Capture**: commands, numbers, times, pids. Never repeat the harmful action to confirm a user report.
2. **Contain**: a reversible step that stops the damage now (kill a job, add a deny, renice). No approval needed.
3. **Classify**: exactly one layer (§3), the earliest one that could have stopped it.
4. **Root cause**: phrase it as what that layer lacked.
5. **Device**: the smallest one in that layer (§4).
6. **Falsify**: write the check (§5); run it before the device exists and see it fail; after, see it pass and its `--negative` fail.
7. **Record and propose**: ledger row (§6) and a proposal to the user (§7).

## 3. Layers

| layer | symptom shape | device kinds | example |
|---|---|---|---|
| harness | an agent could reach a tool, credential, provider or setting it should not | settings overlay, `bash.patterns`, credential scope, guard script | `walls.yml`, `~/.local/bin/chromium` |
| loop | wrong work passed because no check could fail | a check added to an existing gate: test, lint, a verify command in a packet, a reviewer card line naming a command | — |
| graph | parallel work collided or ran in the wrong order | cap, gate or ordering enforced by a mechanism | `agents.slice`, `HOST LOAD`, `rotate-budget.json` caps |

Learning is this ladder, not a fourth layer.

## 4. Devices

- Prefer, in order: an existing setting, a tool's own config file, a line in an existing script, a new script in this directory. No new daemon.
- One device per ledger row. English comments that say why.
- This directory and `rules/` are published by `dotfile/omp/sync.sh capture` to a public repo: no secrets, account names, or company identifiers in scripts, comments or check output.
- Files outside this directory (systemd links, `environment.d`, fish `conf.d`) are listed in the row's `paths`.

## 5. Checks

- One script per device in `checks/<id>.sh`, registered by name in `REGISTRY` in `reverify.py`. The ledger names the check; nothing written into the ledger is executed.
- Exit 0 = the device holds; non-zero = broken, with one reason line last on stdout. Only stdout reaches notifications; keep stack traces on stderr.
- `--negative` runs the same assertion against a temporary fixture without the device (a pristine agent dir, a fake cgroup tree, a unit outside the prefix, a stub script) and must exit non-zero. Never weaken live settings, never reproduce the incident.
- Read-only on live state; temporary files and probe units clean up after themselves. No model or paid API call: anything that starts `omp` with credentials in reach runs under `unshare --user --net --map-current-user`.
- At most 30 s per run, or the check's entry in `TIMEOUTS` (`pristine-providers` 60 s; it starts omp four times); `reverify.py` kills it after that and the rotation service gives the whole pass 400 s. They run from `$HOME` under the rotation service's environment (`PATH` starts with `~/.local/bin`, so `omp` there is `~/.local/bin/omp`, which can lag the mise install sessions use; omp checks test both binaries).
- A check that reads `PI_CONFIG_FILES` gets it from `~/.config/environment.d/omp-walls.conf` when the caller's shell predates the wall, so a manual run from an old session does not report a broken device. With neither, the row is reported invalid (environment), not broken.
- Test one row with `reverify.py --id <id>`; it writes nothing, and runs the check and its negative only when that id's current row is `active` and passes the lifecycle rules below.

## 6. Ledger

`~/.omp/agent/incidents.jsonl`, local only (not captured to the dotfile repo). Append-only, one JSON object per line; the last line for an `id` is its current state. Never rewrite lines: several sessions may append.

| field | value |
|---|---|
| `id` | kebab-case device id, stable across status changes |
| `incident` | `YYYY-MM-DD-<slug>`; several devices may share one |
| `ts` | ISO 8601 with offset, when this line was written |
| `status` | `proposed` \| `active` \| `retired`; only `active` rows are re-verified |
| `trigger` | `incident` \| `repeat` \| `correction` |
| `layer` | `harness` \| `loop` \| `graph` |
| `symptom` | what was observed, with numbers |
| `root_cause` | what the layer lacked |
| `device` | what now exists |
| `paths` | files that make up the device |
| `verify` | a check id from `REGISTRY` |
| `falsified` | when and how the check was seen failing without the device; required for `active` |
| `approved_by` | `"user"` or `null`; `"user"` required for `active` and `retired` |

Append one line (`>>` of a single short write; never edit earlier lines):

```bash
jq -nc --arg ts "$(date -Iseconds)" '{id: "my-device", incident: "2026-11-12-slug", ts: $ts, status: "proposed",
  trigger: "incident", layer: "graph", symptom: "…", root_cause: "…", device: "…", paths: ["…"],
  verify: "my-device", falsified: "", approved_by: null}' >>~/.omp/agent/incidents.jsonl
```

Activation appends the same object again with `status: "active"`, a `falsified` note and `approved_by: "user"`.

Every line must have every field with the right type, an `id` and `verify` in kebab-case, and known enum values; otherwise `reverify.py` reports `line N: <field> …`. The current row of each id is then held to its lifecycle: `active` needs a check in `REGISTRY`, `approved_by: "user"` and a `falsified` note; `retired` needs `approved_by: "user"`; `proposed` may name a check that does not exist yet, and a `retired` row may name one already removed. Every check in `REGISTRY` needs a current `active` row, and a missing ledger file is invalid. Messages carry line numbers and field names only, never ledger text.

## 7. Approval

- Propose to the user: symptom, layer, root cause, device, files, check and its negative fixture, and what it costs (latency, false prompts, throughput).
- No approval needed: containment (stopping the damage now, within what the session already may do) and appending a `proposed` row. Draft a new check outside `~/.omp/agent/` (e.g. under `/tmp` or `local://`) until it is approved.
- Everything under `~/.omp/agent/` (rules, `config.yml`, managed skills including this directory, its check scripts and `REGISTRY`), systemd units, shell environment and tool configs waits for the user's yes. Approval covers the change the user saw; a later repair is a new proposal.
- Activation: apply the device, run the check (pass) and its `--negative` (fail), append the `active` row with `approved_by: "user"`.

## 8. Re-verification

- `model-routing/rotate-accounts.py --loop` runs `reverify.py` at service start and every 6 h, outside its usage pass, so an unreachable usage endpoint does not skip it.
- `reverify.py` writes `~/.omp/agent/incidents-status.json` on every run, even when it fails: `{checkedAt, ok: [id], broken: [{id, output, since}], proposed: [id], invalid: [message]}`. A broken device or invalid ledger also raises a desktop notification carrying the check's reason line.
- `headroom.sh` prints `LEDGER BROKEN: …`, `LEDGER: … proposed`, `LEDGER INVALID: …` and `LEDGER STALE` (no run for 7 h, or no status file). These lines are internal: a session never writes them into user replies, Discord or other human-facing output (user, 2026-11-26), and reports a new one to 총무 with `tell_chongmu` (kind `report`). The repair is a new proposal, never an automatic change.

## 9. Retirement

Append a `retired` row with the reason in `device`, delete the device files and its `REGISTRY` entry in the same change.

## 10. Worked examples

**Bedrock through a new profile (2026-11-11), harness.** A subagent ran `omp --profile <name>`; the new profile had no settings, so ambient AWS keys reached `amazon-bedrock`. Devices: `walls.yml` loaded by every omp process through `PI_CONFIG_FILES` (`~/.config/environment.d/omp-walls.conf`, `~/.config/fish/conf.d/omp-walls.fish`; row `profile-provider-wall`, check `pristine-providers`), and `bash.patterns` prompts on profile selectors in `config.yml` (row `profile-launch-prompt`). Create `walls.yml` before exporting the variable: a missing or malformed overlay stops omp from starting (recover with `env -u PI_CONFIG_FILES omp …`, or `set -e PI_CONFIG_FILES` in fish, then restore the file). `bash.patterns` does not see the eval tool, `PI_CODING_AGENT_DIR=` or `--config`; `walls.yml` covers the first two, and a `--config` overlay that sets `disabledProviders` overrides it. Processes started earlier lack the variable, and the only closure for them is a restart; list them with `for p in $(pgrep -x omp); do tr '\0' '\n' </proc/$p/environ | grep -q '^PI_CONFIG_FILES=' || echo "$p $(readlink /proc/$p/cwd)"; done`.

**Build overload (2026-11-11), graph.** About 25 rustc/go builds from three sessions: load 196 on 32 threads, io PSI 82%. `ionice` does nothing here (NVMe scheduler `none`, no io controller delegated). Devices: `agents.slice` (CPUQuota 1600%, CPUWeight 50) joined by every herdr holder through `hc-hold-.service.d/10-agents.conf` (row `agents-cpu-ceiling`); the same drop-in gives holders `CARGO_BUILD_JOBS=16` and `GOFLAGS=-p=16` (row `agent-build-jobs`); `headroom.sh` prints a live `HOST LOAD` gate (row `host-load-gate`). Install: link `systemd/agents.slice` and `systemd/hc-hold-.service.d/10-agents.conf` into `~/.config/systemd/user/`, `systemctl --user daemon-reload`, then run `cap-predating-holders.sh` once if holders were already running: after the reload systemd believes they moved to `agents.slice`, which leaves them uncapped until that script pins them back and splits 800% between them. Until they exit the check allows 2400% in total (the slice's 1600% plus theirs); with none left it enforces 1600%.
