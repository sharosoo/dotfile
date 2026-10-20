---
alwaysApply: true
---

# Btrfs scratch storage

On Linux Btrfs hosts, before creating or cleaning large scratch checkouts, read `~/workspaces/sharosoo/dotfile/omarchy/BTRFS.md` if present. For gpai-monorepo also read `~/.omp/agent/rules/projects/gpai-monorepo/workflow.md` §9. Apply the matching host's instructions; do not copy turing-specific device names or UUIDs to another machine.

A pool alone does not make child directories subvolumes: create one per session-owned checkout. Preserve existing work and other sessions' paths. Verify deletion permissions before relying on subvolume cleanup; on `EPERM` report the prerequisite, never silently start a large per-file deletion. Background reclamation can still cause I/O pressure. Do not migrate/reset the shared pnpm store or change mount, encryption, or metadata-profile settings as routine cleanup.

Never create scratch directories under `~/.local/share/omp`: that is OMP's reserved XDG data root, not a worktree namespace. On turing use `~/.local/share/omp-worktrees/gpai-monorepo` instead. Creating the reserved root can redirect interactive clients to a new empty vault while the broker keeps its original vault.
