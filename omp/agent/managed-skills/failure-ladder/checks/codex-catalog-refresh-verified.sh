#!/usr/bin/env bash
# Device: rotate-accounts.py records builds whose Codex catalog refresh exited without
# advancing the catalog (state key codexCatalogStale); this check fails while any is recorded.
# Freshness is the later of model_cache.updated_at and model_cache_freshness.updated_at: OMP 19.x
# bumps only the latter when the fetched catalog is unchanged (2026-11-25 false alarm on 19.1.1).
set -eu
PYTHONDONTWRITEBYTECODE=1 python3 - "$@" <<'PY'
import ast
import json
import sqlite3
import sys
import tempfile
import time
from pathlib import Path

negative = sys.argv[1:] == ['--negative']
home = Path.home()
rotate = home / '.omp/agent/managed-skills/model-routing/rotate-accounts.py'
tree = ast.parse(rotate.read_text(), filename=str(rotate))
# Load definitions without allowing the daemon's command dispatcher to run.
tree.body = [node for node in tree.body if not (
    isinstance(node, ast.If) and {'main'} & {n.id for n in ast.walk(node) if isinstance(n, ast.Name)}
)]
ns = {'__name__': '_offline_guard', '__file__': str(rotate)}
exec(compile(tree, str(rotate), 'exec'), ns)

def require(ok, reason):
    if not ok:
        print(f'FAIL: {reason}')
        sys.exit(1)

if negative:
    # The device as it was before 2026-11-25: freshness read from the payload timestamp only.
    def payload_updated_at(build):
        with sqlite3.connect(ns['MODELS_DB']) as conn:
            row = conn.execute("SELECT MAX(updated_at) FROM model_cache WHERE provider_id LIKE 'openai-codex:%' "
                               "AND materialization_policy LIKE ?", (f'app-{build}:%',)).fetchone()
        return (row and row[0]) or 0
    ns['codex_catalog_updated_at'] = payload_updated_at

with tempfile.TemporaryDirectory() as tmp:
    tmp = Path(tmp)
    db = tmp / 'models.db'
    with sqlite3.connect(db) as conn:
        conn.execute('CREATE TABLE model_cache (provider_id TEXT, materialization_policy TEXT, '
                     'authoritative INTEGER, updated_at INTEGER, models TEXT)')
        conn.execute('CREATE TABLE model_cache_freshness (provider_id TEXT, materialization_policy TEXT, '
                     'payload_updated_at INTEGER, updated_at INTEGER, authoritative INTEGER)')
        for build in ('9.9.8', '9.9.9'):
            conn.execute("INSERT INTO model_cache VALUES ('openai-codex:x', ?, 1, 1000, '[]')", (f'app-{build}:b',))
            conn.execute("INSERT INTO model_cache_freshness VALUES ('openai-codex:x', ?, 1000, 1000, 1)",
                         (f'app-{build}:b',))
    stubs = {
        # Exits 0 and writes nothing: the failure the device exists for.
        '9.9.8': '#!/bin/sh\nexit 0\n',
        # Unchanged catalog: OMP 19.x advances only the freshness row.
        '9.9.9': '#!/bin/sh\nexec python3 -c "import sqlite3, sys; c = sqlite3.connect(sys.argv[1]); '
                 "c.execute('UPDATE model_cache_freshness SET updated_at = updated_at + 1000 "
                 "WHERE materialization_policy = ?', ('app-9.9.9:b',)); c.commit()\" " + f"'{db}'\n",
    }
    for build, body in stubs.items():
        install = tmp / 'installs' / build
        install.mkdir(parents=True)
        (install / 'omp').write_text(body)
        (install / 'omp').chmod(0o755)
    ns.update(MODELS_DB=str(db), OMP_INSTALLS=tmp / 'installs', now=time.time(), log=lambda _msg: None)
    state = {}
    ns['refresh_codex_catalogs']({'9.9.8', '9.9.9'}, state)
    stale_fixture = state.get('codexCatalogStale', {})
    require('9.9.8' in stale_fixture, 'a Codex catalog refresh that writes nothing is not recorded as stale')
    require('9.9.9' not in stale_fixture,
            'a Codex catalog refresh that only advanced model_cache_freshness is recorded as stale')

state_file = home / '.omp/agent/rotate-accounts.state.json'
try:
    stale = json.loads(state_file.read_text()).get('codexCatalogStale', {})
except (OSError, ValueError):
    stale = {}
require(not stale, f"Codex catalog refresh did not update OMP {', '.join(sorted(stale))}; "
                   "Sol/Astra routing may be blocked (run `omp models refresh openai-codex` with that build)")
PY
