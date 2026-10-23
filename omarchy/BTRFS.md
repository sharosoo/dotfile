# Btrfs storage on turing

This is a manual runbook, not an automatic disk-tuning installer. Do not apply it to global-turing: its devices, mount layout and workloads differ. Run shell examples inside `bash`; turing's interactive shell is fish.

OMP discovers `~/.omp/agent/rules/storage-btrfs.md` as an `alwaysApply` entrypoint. Its short instruction points here and to workflow §9; the full manual is not injected automatically. This is local rule discovery, independent of auth-broker usage. For an already running session, reopen/resume OMP to reload startup rules; do not assume files added on disk are hot-loaded.

**Reserved-path warning:** never create scratch directories under `~/.local/share/omp`. In omp 18.12.3, an exported `XDG_DATA_HOME` plus the existence of its `omp` child activates XDG data routing. Creating that directory for a worktree pool caused new interactive OMP processes to open an empty `~/.local/share/omp/agent.db`, while the broker without XDG variables continued using `~/.omp/agent/agent.db`. The original credentials and conversation history were intact. Recovery stopped the affected clients, preserved their accidental XDG state under the private `~/.omp/recovery/` directory, and moved the pool outside the reserved namespace. Do not merge live SQLite files or introduce DB symlinks while either side has open WAL connections. A future intentional XDG migration must migrate the canonical data and coordinate the broker, clients, and dotfile restore behavior.

## Observed configuration (2026-10-20)

- `/`, `/home`, `/var/log` and `/var/cache/pacman/pkg` share Btrfs UUID `65578c34-b42b-4da3-9012-2461dd52cd56`, through `/dev/mapper/root` on a WD Green SN350 1TB.
- Mount options include `noatime,compress=zstd:3,ssd,discard=async,space_cache=v2`. Quotas were disabled. Check the live state rather than assuming these observations still apply.
- A metadata DUP-to-single balance was interrupted after 3 of about 79 chunks. The last observed exclusive operation was `none`; do not restart a conversion to make the profiles uniform. Mixed profiles are supported.
- Existing pnpm store: `/home/sharosoo/.local/share/pnpm/store/v11` (`pnpm store path`). It is not migrated by this runbook.
- Existing herdr worktrees: `~/.herdr/worktrees/gpai-monorepo`. They are not moved or converted by this runbook.
- New OMP scratch pool: `~/.local/share/omp-worktrees/gpai-monorepo`. Each checkout must also have its own child subvolume; creating only the pool does not make ordinary children independently deletable.

## Read-only diagnosis

```bash
findmnt -t btrfs -o TARGET,SOURCE,UUID,OPTIONS
```

```bash
cat /proc/pressure/io
```

```bash
sudo btrfs balance status /
```

```bash
sudo btrfs filesystem usage /
```

```bash
btrfs quota status /
```

`some` pressure is time with at least one task stalled on I/O, not device utilization. A nonzero old 60-second or 5-minute average does not mean the disk is still blocked now. Metadata commits, discard, reads and writes can all contribute. A full swap is not proof of ongoing swapping; inspect swap-in/out rates before attributing latency to it.

## Prepare new scratch checkouts

Do not move existing worktrees, replace populated directories, or pre-create anonymous checkouts. Create each child subvolume when a session claims a unique job name. Subvolumes share the filesystem's free space; creation does not reserve capacity. A pool is also a snapshot boundary: parent snapshots do not recursively back up its contents.

```bash
mkdir -p "$HOME/.local/share/omp-worktrees"
```

Only if this path does not already exist:

```bash
btrfs subvolume create "$HOME/.local/share/omp-worktrees/gpai-monorepo"
```

For a new session, choose an unused job name. Run these in the same bash shell:

```bash
REPO="$HOME/workspaces/weareteamturing/gpai-monorepo"
POOL="$HOME/.local/share/omp-worktrees/gpai-monorepo"
JOB="$POOL/task-unique-name"
BRANCH="feat/unique-name"
test ! -e "$JOB"
```

Proceed only if the absence check succeeds:

```bash
btrfs subvolume create "$JOB"
chattr +C "$JOB"
```

The pool is a NOCOW subvolume (`@nocow-omp-worktrees`), but a new child subvolume does not inherit `+C` from its parent directory (verified on turing, 2026-10-20). Set it on the empty job subvolume before `git worktree add`; files created afterwards inherit it. Plain directories created in the pool inherit it automatically.

```bash
git -C "$REPO" worktree add -b "$BRANCH" "$JOB/repo" HEAD
```

Do not run `git worktree remove` first if the goal is to avoid per-file deletion; that command unlinks checkout files before removing the registration. Herdr-created worktrees do not automatically use this layout: no herdr hook or path override is installed here.

## Remove one completed checkout

Stop its agents, tests, dev servers and file watchers first. Check tracked and untracked work, ignored files that might contain local credentials or data, branch reachability, and worktree locks. A clean status does not establish that a checkout is unused or has no valuable ignored files. Preserve everything not explicitly disposable. Never delete another session's checkout.

```bash
git -C "$JOB/repo" status --short --untracked-files=all
```

```bash
git -C "$REPO" worktree list --porcelain
```

Only after the preservation checks, remove the exact job subvolume (not the pool):

```bash
btrfs subvolume delete "$JOB"
```

On turing this returned `EPERM` during the initial smoke check. For a checked, owned job, an administrator can instead run:

```bash
sudo btrfs subvolume delete "$JOB"
```

Alternatively, `user_subvol_rm_allowed` enables owner-initiated subvolume deletion. It is a security-policy choice, not a prerequisite for using sudo. An administrator may enable it temporarily on the containing mount:

```bash
sudo mount -o remount,user_subvol_rm_allowed /home
```

For persistence, review `/etc/fstab`, add the option to the applicable Btrfs entries without replacing other options, and run `sudo findmnt --verify` before rebooting. This runbook does not edit fstab. Do not silently replace a failed subvolume deletion with a large foreground `rm -rf`.

After successful removal, review stale registrations before pruning; pruning may affect other missing worktrees too:

```bash
git -C "$REPO" worktree prune --dry-run --verbose --expire now
```

Proceed only if every listed registration is disposable:

```bash
git -C "$REPO" worktree prune --verbose --expire now
```

Subvolume deletion detaches the directory quickly, but Btrfs still reclaims extents and updates metadata in the background. It is not instant space recovery or a guarantee of less I/O. Delete one job at a time, observe pressure, and let cleanup drain rather than queueing hundreds of deletions. Do not force a transaction commit per deletion or run `btrfs subvolume sync` on the interactive path just to make deletion appear complete.

## pnpm store: keep shared, do not pre-migrate

A separate store subvolume is useful as a snapshot boundary or for deliberately resetting an entire disposable store. It does not make `pnpm store prune` or per-package deletion instant. Do not delete the shared store to clean one worktree.

Hardlinks cannot cross subvolume boundaries. Reflinks can share extents across subvolumes on the same Btrfs filesystem when the kernel and file attributes permit it. Separate per-checkout subvolumes therefore change the package-import path even if the store is not moved. Check the installed pnpm version and project settings; `auto` behavior varies by version, so do not promise that it always reflinks instead of copying. If needed, test one new checkout with `pnpm install --frozen-lockfile --package-import-method=clone` before adopting this layout for large installs. Strict `clone` reports unsupported cloning instead of silently accepting a full copy.

Do not rename the active store and replace it with a new subvolume while installs or builds are running. A future migration requires a maintenance window, a backup/rollback path and an actual pnpm install verification. Existing hardlink relationships also need consideration; copying or reflinking files into a new store does not preserve their old inode identity. No `store-dir` or package-import configuration is changed by this runbook.

## Tuning: optional experiments, not prerequisites

Keep compression and CoW enabled by default. Do not use metadata-profile conversion, a broad balance, global NOCOW, or a longer commit interval as routine deletion tuning. DUP provides a second metadata copy; dropping it has a resilience cost and no measured performance benefit here. Stopping or cancelling balance does not undo completed chunks. Never power off to stop a storage operation.

Inspect dm-crypt flags before changing them:

```bash
sudo cryptsetup status root
```

Workqueue bypass changes encryption submission behavior; it is not a proven fix for this machine. If testing it, record existing flags, retain those still needed, and initially omit `--persistent`. A refresh replaces relevant activation flags; do not assume unspecified flags are retained. Do not modify encryption parameters during a balance or other recovery work.

TRIM throttling is optional and temporary (the UUID below is turing-specific):

```bash
echo 100 | sudo tee /sys/fs/btrfs/65578c34-b42b-4da3-9012-2461dd52cd56/discard/iops_limit
```

The observed default was 1000 requests/s. This limits discard requests, not all device I/O or desktop latency. Restore the recorded original value if it does not help; reboot also resets this sysfs setting.

`mq-deadline` is another reversible experiment, not a guarantee that `ionice` controls Btrfs metadata or dm-crypt writes:

```bash
echo mq-deadline | sudo tee /sys/block/nvme0n1/queue/scheduler
```

Restore turing's previously observed scheduler:

```bash
echo none | sudo tee /sys/block/nvme0n1/queue/scheduler
```

No udev rule or boot-time tuning service is installed by this runbook. Measure one change at a time under the same workload before making it persistent.

## omp state directory: NOCOW

`~/.omp/agent` holds SQLite databases in WAL mode (`agent.db`, `history.db`, `models.db`, `skill-descriptions.db`), rewritten in place on every agent turn. On a CoW path each in-place page write allocates new extents and updates metadata, so with many parallel subagents the WAL/checkpoint churn fragments the files and adds metadata I/O well beyond the bytes SQLite writes. This is the same reason database data directories get `+C`, and it is the one deliberate exception to "no global NOCOW" above.

Incident (turing, 2026-10-21): with one omp session driving ~12 subagents and 4 eval runners, the whole machine sat at high I/O pressure (PSI `io some` avg10 15-28). `lsattr` showed the omp DBs without `C`. After moving them to NOCOW files at the same paths, PSI dropped to about 1 with the same workload running. Another session's database container (`mathking-pg-local`) was a co-contributor at the time; it was already `+C`.

Keep `~/.omp/agent` and its DBs `+C`:

```bash
lsattr -d ~/.omp/agent; lsattr ~/.omp/agent/*.db*   # expect C on all
```

`chattr +C` only takes effect on empty files, so existing DBs must be recreated. Use `omarchy/bin/omp-nocow-migrate.sh` (installed copy: `~/.omp/nocow-migrate.sh`): it detaches via `systemd-run`, runs `herdr server stop`, stops every omp process, checks that no DB is still open, checkpoints each WAL, writes a new `+C` copy at the same path, verifies `PRAGMA integrity_check` (restoring the original on failure), and sets `+C` on the directory so later WAL/SHM files inherit it. Reopening `herdr` resumes every omp pane through native session restore (`omp --resume=<session>`). Run it once: a second concurrent run hit `database is locked` during checkpoint.

## Podman as Docker: NOCOW

Docker is gone on turing (all containers removed, 2026-10-23). Podman 6.1.1 is the runtime; the `docker` CLI talks to **rootful** Podman via `DOCKER_HOST=unix:///run/podman/podman.sock`. Rootful is required: Dori's sandbox bridge needs it for FUSE, so the rootless user `podman.socket` stays disabled.

Container storage gets `+C`, like the Docker data dir did: image layers and database volumes are rewritten in place.

| Path | Role | Attr |
|---|---|---|
| `/var/lib/containers` | rootful storage | `+C` |
| `~/.local/share/containers` | rootless storage (own subvolume) | `+C` |

`chattr +C` only takes effect on empty directories; files created afterwards inherit it. A populated store must be emptied (or recreated) before applying it.

Install with `omarchy/bin/podman-docker-setup.sh` (idempotent, uses sudo). It writes `/etc/systemd/system/podman.socket.d/group.conf` (`SocketGroup=docker`, `SocketMode=0660`), adds the user to `docker`, runs `daemon-reload` and `enable --now podman.socket`, disables the rootless user socket, sets `+C` on the storage dirs only when they are empty, and appends `DOCKER_HOST` to `~/.bashrc`. The fish (`.config/fish/conf.d/podman-docker.fish`) and `environment.d` (`.config/environment.d/podman-docker.conf`) files are linked by `omarchy/sync.sh`.

## Smoke verification on turing (2026-10-20)

Created the pool as a user-owned subvolume (inode 256). In an isolated fixture, created a child subvolume and a detached Git worktree; cross-subvolume hardlinking failed with `Invalid cross-device link`, while `cp --reflink=always` succeeded and the copied bytes matched. Non-empty subvolume deletion failed with `EPERM`, so passwordless deletion is not configured. The tiny fixture was removed without leaving a checkout behind. No production pnpm install or large-delete performance comparison was run; the smoke does not establish a speedup.

## References

- [Btrfs subvolumes, snapshot boundaries and background deletion](https://btrfs.readthedocs.io/en/latest/btrfs-subvolume.html)
- [pnpm package import methods](https://pnpm.io/settings/node-modules#packageimportmethod) (check against the installed version)
- [cryptsetup refresh and persistent flags](https://man7.org/linux/man-pages/man8/cryptsetup-refresh.8.html)
- [Deadline scheduler behavior](https://docs.kernel.org/block/deadline-iosched.html)
