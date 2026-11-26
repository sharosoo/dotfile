#!/usr/bin/env bash
# `make db ACTION=migrate-post` must refuse unless EXPECT names exactly the pending post-deploy versions
# (2026-11-25: one intended migration ran together with two pending ones owned by other work).
# Runs the repo's backend/Makefile against a stub pnpm that reports a fixed pending set; no database.
# The device is read from git: the feature branch while it exists, else origin/master.
# --negative runs the same assertions on the Makefile from before the gate and must fail.
set -euo pipefail
# Repo paths and refs live in device-repos.local.env, which is not published.
. "$(dirname "$0")/../device-repos.local.env"
repo=$APP_REPO ref=$APP_REF
git -C "$repo" rev-parse -q --verify "$ref^{commit}" >/dev/null || ref=$APP_FALLBACK
[[ ${1:-} == --negative ]] && ref=$APP_BASE
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
mkdir -p "$t/backend" "$t/bin"
git -C "$repo" show "$ref:backend/Makefile" >"$t/backend/Makefile"
cat >"$t/bin/pnpm" <<EOF
#!/bin/sh
case " \$* " in
  *" status "*) printf '%s\n' '[X] 20261101000000_done.sql' '[ ] 20261116120150_other.sql' '[ ] 20261125140000_mine.sql' ;;
  *" up "*) touch "$t/up-ran" ;;
esac
EOF
chmod +x "$t/bin/pnpm"
run() { rm -f "$t/up-ran"; PATH="$t/bin:$PATH" DEV_DATABASE_URL=postgres://stub make -s -C "$t/backend" db ACTION=migrate-post ENV=dev "$@" >/dev/null 2>&1; }
if run EXPECT=20261125140000 || [[ -e $t/up-ran ]]; then echo "migrate-post applied with EXPECT narrower than the pending set"; exit 1; fi
if run || [[ -e $t/up-ran ]]; then echo "migrate-post applied without EXPECT"; exit 1; fi
if ! run EXPECT=20261125140000,20261116120150 || [[ ! -e $t/up-ran ]]; then echo "migrate-post refused an EXPECT equal to the pending set"; exit 1; fi
echo "migrate-post applies only when EXPECT equals the pending post-deploy set"
