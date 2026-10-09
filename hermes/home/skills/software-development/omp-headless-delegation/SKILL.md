---
name: omp-headless-delegation
description: "Use to delegate code work to omp -p headless."
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [omp, delegation, headless, worktree, implementation, read-only-report]
    related_skills: [herdr-agent-delegation, isolated-runtime-verification, coding-agent-orchestration]
---

# omp headless delegation

Use this class to hand an implementation or read-only investigation to an omp coding agent running non-interactively (`omp -p`). For an omp agent living in a herdr pane, use `herdr-agent-delegation`. For ecosystem research, use `coding-agent-orchestration`.

## Procedure

1. **Record the omp version.** Run `omp --version` before launching and copy the value into the report. The `~/.local/bin/omp` wrapper runs `mise use -g` on each invocation, so the installed version can change between runs.

2. **Isolate the write target.** For implementation, create a worktree: `git worktree add -b <branch> <path> HEAD`. Check `git status` in the original repository before and after, and confirm it is unchanged. Scope the brief to the worktree.

3. **Write the brief to a file**, for example `~/.hermes/cache/scratch/<topic>/task.md`. Include the goal, the allowed paths, the forbidden actions (commit, push, PR, edits outside the worktree, server starts unless asked), the checks the agent must run, and the output format. A file survives a stalled run and can be re-sent unchanged.

4. **Decide the session mode before launch.** `--no-session` makes the run non-resumable. If a follow-up question is likely, omit it. A later `--no-session` run starts from zero, and the earlier run's context is gone.

5. **Launch in the background with notify.** Use the terminal tool with `background=true, notify=true`:
   ```
   cd <worktree> && omp -p --auto-approve --no-title --cwd "$PWD" "$(cat ~/.hermes/cache/scratch/<topic>/task.md)" > run.log 2>&1; echo "EXIT=$?"
   ```
   A foreground call is capped at 600 s, and implementation runs exceed that. `--auto-approve` grants every tool approval, so the brief and the worktree are the only limits. Do not wrap the command in `setsid nohup` or `disown`: the terminal tool rejected those wrappers with exit -1.

6. **Check the log size after about a minute.** A log that stops growing at a few hundred bytes means a stalled run. Kill it and relaunch with the same brief. The first run here stalled at 291 bytes and the relaunch completed with EXIT=0.

7. **Verify the result yourself.** Run `git status` and `git diff --stat` in the worktree, then rerun the checks the brief named (build, the touched test files from the repository root, and any probes). The agent's "tests pass" or verdict lines are self-reports until you rerun them.

8. **For a read-only report**, open the prompt with "READ-ONLY. Do NOT edit files, commit, or start servers." Redirect output to a file (`> status-report.md 2>&1`). Afterward, confirm `git status` is unchanged, then read the file.

## Pitfalls

- **Pass the brief through a file with `$(cat ...)`, not as inline text.** Long inline prompts are fragile, and the file is what you re-check against later.
- **Do not trust a summary from the agent's log without the diff.** A log can describe features and verdicts that the worktree does not contain.
- **Keep follow-up questions in the same session.** Start the first run without `--no-session` when you expect to ask about it again.
- **Do not let delegated runs push or open PRs.** State "no commit, no push, no PR" in the brief when the user has not authorized them. External writes stay with the orchestrator, which reads the result and decides.
