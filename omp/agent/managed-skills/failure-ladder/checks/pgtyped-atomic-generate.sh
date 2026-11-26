#!/usr/bin/env bash
# backend/scripts/generate-types.sh must leave src/sql untouched when generation fails midway and remove its temp
# container on every exit (2026-11-23: partial *.queries.ts landed twice; a leaked container held port 5433).
# Runs the repo's script in a scratch backend with stub docker/npx/pnpm/tsx; no Docker, no database.
# The device is read from git: the feature branch while it exists, else origin/master.
# --negative runs the same assertions on the in-place script from before the device and must fail.
set -euo pipefail
# Repo paths and refs live in device-repos.local.env, which is not published.
. "$(dirname "$0")/../device-repos.local.env"
repo=$APP_REPO ref=$APP_REF
git -C "$repo" rev-parse -q --verify "$ref^{commit}" >/dev/null || ref=$APP_FALLBACK
[[ ${1:-} == --negative ]] && ref=$APP_BASE
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
b=$t/backend
mkdir -p "$b/scripts" "$b/src/sql" "$b/db/migrations" "$b/node_modules/.bin" "$t/bin"
git -C "$repo" show "$ref:backend/scripts/generate-types.sh" >"$b/scripts/generate-types.sh"
echo '{"srcDir": "./src/"}' >"$b/pgtyped.config.json"
for q in a b; do echo "select 1;" >"$b/src/sql/$q.sql"; echo ORIGINAL >"$b/src/sql/$q.queries.ts"; done
printf '#!/bin/sh\nexit 0\n' >"$b/node_modules/.bin/tsx"
cp "$b/node_modules/.bin/tsx" "$b/node_modules/.bin/prettier"
cat >"$t/bin/docker" <<EOF
#!/bin/sh
[ "\$1" = rm ] && touch "$t/container-removed"
exit 0
EOF
printf '#!/bin/sh\nexit 0\n' >"$t/bin/npx"
# pgtyped stub (called directly or via `pnpm exec`): writes one file under the configured srcDir, relative to
# its cwd, then either dies (STUB_FAIL) or writes the rest.
cat >"$b/node_modules/.bin/pgtyped" <<'EOF'
#!/bin/sh
src=$(sed -n 's/.*"srcDir": *"\([^"]*\)".*/\1/p' "$2"); src=${src%/}
case $src in */sql) ;; *) src=$src/sql ;; esac
echo PARTIAL >"$src/a.queries.ts"
[ -n "${STUB_FAIL:-}" ] && exit 1
echo NEW >"$src/a.queries.ts"; echo NEW >"$src/b.queries.ts"
EOF
cat >"$t/bin/pnpm" <<EOF
#!/bin/sh
[ "\$1 \$2" = "exec pgtyped" ] || exit 0
shift 2; exec "$b/node_modules/.bin/pgtyped" "\$@"
EOF
chmod +x "$b/node_modules/.bin/"* "$t/bin/"*
run() { rm -f "$t/container-removed"; (cd "$b" && PATH="$t/bin:$PATH" bash scripts/generate-types.sh >/dev/null 2>&1); }
if STUB_FAIL=1 run; then echo "generate-types.sh reported success after pgtyped failed"; exit 1; fi
[[ $(cat "$b/src/sql/a.queries.ts") == ORIGINAL ]] || { echo "a failed generation rewrote src/sql in place"; exit 1; }
[[ -e $t/container-removed ]] || { echo "the temp container was not removed after a failed run"; exit 1; }
run || { echo "generate-types.sh failed on a clean stubbed run"; exit 1; }
[[ $(cat "$b/src/sql/b.queries.ts") == NEW ]] || { echo "a successful generation did not update src/sql"; exit 1; }
[[ -z $(find "$b" -maxdepth 1 -name '.pgtyped-stage.*') ]] || { echo "staging directory left behind"; exit 1; }
echo "generate-types.sh swaps in only verified output and always removes its container"
