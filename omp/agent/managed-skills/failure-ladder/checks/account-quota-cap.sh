#!/usr/bin/env bash
set -eu
root=${OMP_AGENT_ROOT:-$HOME/.omp/agent}
PYTHONDONTWRITEBYTECODE=1 python3 - "$root" "${1:-}" <<'PY'
import json, math, runpy, sqlite3, subprocess, sys
from pathlib import Path
from unittest.mock import patch
root, mode = Path(sys.argv[1]), sys.argv[2]
scripts = root / 'managed-skills/model-routing'
config = (root / 'config.yml').read_text()
if '  usageReservePct: 10\n' not in config or '  usageReservePolicy: fail-closed\n' not in config:
    sys.exit('OMP reserve must be 10% with no override prompt')
def native_config(key):
    result = subprocess.run(
        ['unshare', '--user', '--net', '--map-current-user', 'env', f'PI_CODING_AGENT_DIR={root}',
         'omp', 'config', 'get', key, '--json'],
        capture_output=True, text=True, timeout=15, check=True,
    )
    return json.loads(result.stdout)['value']

for key, expected in {
    'codexResets.autoRedeem5h': 'yes',
    'codexResets.autoRedeemWeekly': 'yes',
    'codexResets.keepCredits': 0,
    'codexResets.minBlockedMinutes': 0,
}.items():
    assert native_config(key) == expected, f'{key} must match authorized automatic reset redemption'
policies = [p for p in native_config('auth.accountPolicies') if p['provider'] == 'openai-codex']
ns = runpy.run_path(str(scripts / 'rotate-accounts.py'), run_name='quota_fixture')
with sqlite3.connect((root / 'agent.db').as_uri() + '?mode=ro', uri=True) as store:
    identities = [
        json.loads(raw) for raw, in store.execute(
            "SELECT json_object('email', json_extract(data, '$.email'), "
            "'accountId', json_extract(data, '$.accountId'), 'orgId', json_extract(data, '$.orgId'), "
            "'projectId', json_extract(data, '$.projectId')) FROM auth_credentials WHERE provider='openai-codex' "
            "AND (disabled_cause IS NULL OR disabled_cause = ?)", (ns['CAUSE'],)
        )
    ]
covered = set()
for policy in policies:
    matches = [row for row in identities if all(row.get(k) == v for k, v in policy['account'].items())]
    assert len(matches) <= 1, 'Codex native policy must not select ambiguous logins'
    if not matches:
        continue
    reserve = policy.get('reservePct')
    assert type(reserve) in (int, float) and math.isfinite(reserve) and 0 <= reserve <= 100, 'Codex native policy must define a valid explicit reserve'
    covered.add(matches[0]['accountId'])
assert {row['accountId'] for row in identities} <= covered, 'each Codex account needs an explicit native reserve policy'
now = ns['now']
plan = ns.get('quota_pool')
if plan is None:
    sys.exit('quota pool does not enforce cap before expiry preference')
if mode == '--negative':
    current_plan = plan
    plan = lambda candidates, cache, **kwargs: current_plan(candidates, cache, provider='anthropic')
def win(used, reset):
    return {'used': used, 'resetsAt': reset}
cache = {
    'capped': {'7d': win(.9, now+1)},
    'capped-alt': {'7d': win(.2, now+2), 'Claude 7 Day (Fable)': win(.98, now+2)},
    'expires-first': {'7d': win(.89, now+1800)},
    'same-cohort': {'7d': win(.85, now+2000)},
    'later': {'7d': win(.45, now+12600)},
    'expired': {'7d': win(.99, now-1)},
    'no-timestamp': {'7d': win(.9, None)},
}
sys.path.insert(0, str(scripts))
assert plan(cache, cache) == {'expires-first', 'same-cohort'}, 'expired windows must be preferred only below the cap'
assert plan(['capped', 'capped-alt', 'later'], cache) == {'later'}, 'capped accounts must not be fallback candidates'
assert plan(['expired', 'no-timestamp'], cache) == {'expired'}, 'only a known past reset reopens a capped account'
assert not plan(['capped', 'capped-alt'], cache), 'must stop when every eligible account hits its cap'
assert plan(['unknown'], cache) == {'unknown'}, 'a newly enabled account may still acquire its first measurement'
select = ns['auth_ready_quota_pool']
codex = 'openai-codex'
later = {
    '26h': {'7d': win(.90, now + 26 * 3600)},
    '26.5h': {'7d': win(.99, now + 26.5 * 3600)},
    '27h': {'7d': win(.98, now + 27 * 3600)},
    '64h': {'7d': win(.20, now + 64 * 3600)},
    '128h': {'7d': win(.10, now + 128 * 3600)},
    'capped': {'7d': win(1.0, now + 25 * 3600)},
    'short-capped': {'7d': win(.10, now + 24 * 3600), '5h': win(1.0, now + 3600)},
    'no-timestamp': {'7d': win(.99, None)},
    'expired': {'7d': win(1.0, now - 1)},
}
assert plan(later, later, provider=codex) == {'26h', '26.5h'}, 'Codex must rank future resets beyond 24h with the existing one-hour cohort'
assert select(set(later), later, {'26h', '26.5h'}, provider=codex) == {'27h'}, 'auth-blocked earlier resets must not strand Codex'
assert not select(set(later), later, set(later), provider=codex), 'an entirely auth-blocked Codex pool must remain empty'
for used in (.90, .95, .99, .9999):
    assert plan(['account'], {'account': {'7d': win(used, now + 128 * 3600)}}, provider=codex) == {'account'}, 'Codex below 100% must remain eligible'
assert not plan(['capped', 'short-capped'], later, provider=codex), 'any current Codex window at 100% must cap its account'
assert plan(['no-timestamp', 'unknown', 'expired', '128h'], later, provider=codex) == {'128h'}, 'missing or expired timestamps must not outrank a known future reset'
assert plan(['no-timestamp', 'unknown', 'expired'], later, provider=codex) == {'no-timestamp', 'unknown', 'expired'}, 'without a future reset, otherwise eligible Codex accounts remain usable'
for exhausted, expected in (
    (('26h', '26.5h'), {'27h'}),
    (('27h',), {'64h'}),
    (('64h',), {'128h'}),
    (('128h',), {'no-timestamp', 'expired'}),
):
    for account in exhausted:
        later[account]['7d']['used'] = 1.0
    assert select(set(later), later, set(), provider=codex) == expected, 'Codex must advance to the next reset after exhaustion'

claude = {
    name: {'7d': win(.20, now + hours * 3600)}
    for name, hours in (('26h', 26), ('27h', 27), ('64h', 64), ('128h', 128))
}
assert plan(claude, claude) == set(claude), 'Anthropic must retain its 24h activation window'
assert plan(claude, claude, provider='anthropic') == set(claude), 'explicit Anthropic selection must match the default'
claude['early'] = {'7d': win(.89, now + 3600)}
claude['capped'] = {'7d': win(.90, now + 1800)}
assert select(set(claude), claude, set(), minimum=3) == {'early', '26h', '27h'}, 'Anthropic must retain its 90% cap and nearest three-account failover'
assert select(set(claude), claude, {'early'}, minimum=3) == {'26h', '27h', '64h', '128h'}, 'Anthropic must keep its eligible pool open without a near reset'

# Exercise the daemon entry point with synthetic state so provider policy cannot be lost at its callsite.
def rotation_fixture(*, usage=.95, block_scope=None, policy_mode=None, reserve=0):
    db = sqlite3.connect(':memory:')
    db.execute('CREATE TABLE auth_credentials (id INTEGER, provider TEXT, identity_key TEXT, disabled_cause TEXT, data TEXT, credential_type TEXT)')
    db.execute('CREATE TABLE auth_credential_blocks (credential_id INTEGER, blocked_until_ms INTEGER, block_scope TEXT)')
    state = {'anthropic': claude, codex: {
        'blocked': {'7d': win(.10, now + 25 * 3600)},
        'manual': {'7d': win(.10, now + 24 * 3600)},
        '26h': {'7d': win(usage, now + 26 * 3600)},
        '27h': {'7d': win(.10, now + 27 * 3600)},
        'unknown': {'7d': win(.10, None)},
    }}
    configured = []
    credential_ids = {}
    rid = 0
    for provider in ('anthropic', codex):
        for account in state[provider]:
            rid += 1
            credential_ids[provider, account] = rid
            cause = 'manual: held' if account == 'manual' else None
            identity = {'email': account, 'accountId': account, 'orgId': 'canonical'}
            db.execute('INSERT INTO auth_credentials VALUES (?, ?, ?, ?, ?, ?)',
                       (rid, provider, f'email:{account}', cause, json.dumps(identity), 'oauth'))
            if provider == codex and cause is None:
                configured.append({'provider': codex, 'account': {'accountId': account, 'orgId': 'canonical'},
                                   'reservePct': reserve if account == '26h' else 0})
            if account == 'blocked':
                db.execute('INSERT INTO auth_credential_blocks VALUES (?, ?, ?)',
                           (rid, (now + 3600) * 1000, 'auth'))
    # The legacy sibling shares account quota, but native policy cannot address its missing org identity.
    rid += 1
    db.execute('INSERT INTO auth_credentials VALUES (?, ?, ?, ?, ?, ?)',
               (rid, codex, 'email:26h|legacy', None,
                json.dumps({'email': '26h', 'accountId': '26h'}), 'oauth'))
    legacy_id = rid
    rid += 1
    db.execute('INSERT INTO auth_credentials VALUES (?, ?, ?, ?, ?, ?)',
               (rid, codex, 'email:26h|manual', 'manual: held',
                json.dumps({'email': '26h', 'accountId': '26h', 'orgId': 'canonical'}), 'oauth'))
    if block_scope:
        scope, seconds = block_scope
        db.execute('INSERT INTO auth_credential_blocks VALUES (?, ?, ?)',
                   (credential_ids[codex, '26h'], (now + seconds) * 1000, scope))
    db.execute('INSERT INTO auth_credential_blocks VALUES (?, ?, ?)',
               (credential_ids['anthropic', 'early'], (now + 3600) * 1000, 'chat'))
    first = next(policy for policy in configured if policy['account']['accountId'] == '26h')
    if policy_mode == 'mismatch':
        first['account']['orgId'] = 'different'
    elif policy_mode == 'ambiguous':
        del first['account']['orgId']
    elif policy_mode == 'reserved':
        first['reservePct'] = 10
    elif policy_mode == 'duplicate':
        configured.append(dict(first))
    elif policy_mode == 'missing':
        del first['reservePct']
    elif policy_mode == 'nonfinite':
        first['reservePct'] = float('nan')
    elif policy_mode == 'out-of-range':
        first['reservePct'] = 101
    elif policy_mode == 'all-reserved':
        first['reservePct'] = 100
    elif policy_mode in ('mixed', 'mixed-blocked'):
        first['reservePct'] = 10
        rid += 1
        db.execute('INSERT INTO auth_credentials VALUES (?, ?, ?, ?, ?, ?)',
                   (rid, codex, 'email:26h|alternate', None,
                    json.dumps({'email': '26h', 'accountId': '26h', 'orgId': 'alternate'}), 'oauth'))
        configured.append({'provider': codex, 'account': {'accountId': '26h', 'orgId': 'alternate'},
                           'reservePct': 0})
        if policy_mode == 'mixed-blocked':
            db.execute('INSERT INTO auth_credential_blocks VALUES (?, ?, ?)',
                       (rid, (now + 3600) * 1000, 'chat'))

    def config_get(*args):
        assert args == ('config', 'get', 'auth.accountPolicies', '--json')
        if policy_mode == 'oserror':
            raise OSError('fixture')
        if policy_mode == 'timeout':
            raise subprocess.TimeoutExpired('fixture', 1)
        return 'invalid' if policy_mode == 'unavailable' else json.dumps({'value': configured})

    original_state = json.loads(json.dumps(state))
    fetches = []
    def fixture_fetch():
        fetches.append(True)
        return {'reports': []}

    with patch.dict(ns['run_once'].__globals__, {
        'DRY': True,
        'fetch_usage': fixture_fetch,
        'load_state': lambda: state,
        'omp': config_get,
        'omp_panes': lambda: [],
        'codex_catalogs': lambda *args: {},
        'set_claude_agent_models': lambda *args: None,
        'pin_antigravity_account_access': lambda: None,
        'read_codex_tier': lambda: 'ultrafast',
        'broadcast': lambda *args: None,
        'apply_budget': lambda *args, **kwargs: None,
        'log': lambda *args: None,
    }), patch('sqlite3.connect', return_value=db):
        native_caps = ns['codex_policy_caps'](db)
        if native_caps is not None:
            assert legacy_id not in native_caps, 'the unaddressable legacy sibling must never inherit its canonical policy'
            if policy_mode in (None, 'reserved', 'all-reserved', 'mixed', 'mixed-blocked'):
                assert native_caps[credential_ids[codex, '26h']] == (100 - first['reservePct']) / 100, 'rotation ceiling must match the explicit native reserve'
        interval = ns['run_once']()
    if policy_mode in ('unavailable', 'oserror', 'timeout'):
        assert not fetches and state == original_state, 'unreadable native policies must leave usage and account state untouched'
        return None, interval
    assert state['quotaActive']['anthropic'] == ['26h', '27h', 'early'], 'Codex-only scope and policy guards must preserve Anthropic failover'
    return state['quotaActive'][codex], interval

assert rotation_fixture() == (['26h'], 60), 'a 95% canonical account needs a short poll while its legacy sibling stays held'
assert rotation_fixture(usage=.9499) == (['26h'], 180), 'normal headroom must keep the three-minute poll'
assert rotation_fixture(usage=.9999) == (['26h'], 60), 'near-exhausted active Codex quota needs a short poll'
assert rotation_fixture(usage=1.0) == (['27h'], 180), 'an exhausted earlier account must advance without keeping the short poll'
for scope in ('auth', 'chat', 'shared'):
    assert rotation_fixture(block_scope=(scope, 3600)) == (['27h'], 180), 'native blocks must advance beyond canonical and unaddressable legacy siblings'
assert rotation_fixture(block_scope=('chat', -1)) == (['26h'], 60), 'expired native blocks must not hold a recovered account'
assert rotation_fixture(block_scope=('spark', 3600)) == (['26h'], 60), 'Spark-only blocks must not disable Sol/Astra chat'
for policy_mode in ('mismatch', 'ambiguous', 'duplicate', 'missing', 'nonfinite', 'out-of-range'):
    assert rotation_fixture(policy_mode=policy_mode) == (['27h'], 180), 'only a unique valid explicit canonical policy may route Codex'
assert rotation_fixture(usage=.90, policy_mode='reserved') == (['27h'], 180), 'an explicit 10% reserve must cap the account at 90%'
assert rotation_fixture(usage=.8999, policy_mode='reserved') == (['26h'], 180), 'a protected account below its ceiling remains usable'
assert rotation_fixture(usage=0, policy_mode='all-reserved') == (['27h'], 180), 'a 100% reserve leaves no usable quota'
assert rotation_fixture(policy_mode='mixed') == (['26h'], 60), 'the healthiest eligible sibling determines the email ceiling'
assert rotation_fixture(policy_mode='mixed-blocked') == (['27h'], 180), 'a blocked high-cap sibling must not raise the email ceiling'
for policy_mode in ('unavailable', 'oserror', 'timeout'):
    assert rotation_fixture(policy_mode=policy_mode) == (None, 180), 'unreadable policy settings must retain existing account states'
assert rotation_fixture(block_scope=('chat', 1)) == (['27h'], 30), 'block-driven polling must not spin below thirty seconds'
for reserve in (18, 41):
    cap = (100 - reserve) / 100
    assert rotation_fixture(usage=cap, reserve=reserve) == (['27h'], 180), 'integer percent ceilings must reject their exact boundary'
    assert rotation_fixture(usage=cap - .0001, reserve=reserve) == (['26h'], 180), 'integer percent ceilings must accept usage below their boundary'
reserve_cache = {
    'first': {'7d': win(.95, now + 3600)},
    'protected': {'7d': win(.90, now + 7200)},
    'backup': {'7d': win(.89, now + 10800)},
}
reserve_caps = {'first': 1.0, 'protected': .90, 'backup': .90}
assert plan(reserve_cache, reserve_cache, provider=codex, caps=reserve_caps) == {'first'}, 'explicit zero reserve must accept 95% usage'
assert not plan(['protected'], reserve_cache, provider=codex, caps=reserve_caps), 'explicit 10% reserve must reject 90% usage'
assert select(set(reserve_cache), reserve_cache, set(), minimum=2, provider=codex, caps=reserve_caps) == {'first', 'backup'}, 'backup selection must honor each native reserve ceiling'
assert not plan(['unknown'], {}, provider=codex, caps={'unknown': 0}), 'a full reserve must also reject unmeasured accounts'
def reset_fixture(*, used=1.0, credits=1, redeemable=1, mode='yes', keep=0, minutes=0,
                  outcome='success', dry=False, cause=None, auth=False, catalog=False,
                  policy=True, stale=False, unknown_post=False, repeat=False, five_hour=False,
                  active=False, sibling=False, quota_scope=None, single_weekly=False,
                  cooldown_first=False, recover_after=None, cache_used=1):
    db = sqlite3.connect(':memory:')
    db.execute('CREATE TABLE auth_credentials (id INTEGER, disabled_cause TEXT)')
    db.execute('CREATE TABLE auth_credential_blocks (credential_id INTEGER, block_scope TEXT, blocked_until_ms INTEGER)')
    original_cause = None if active else ns['CAUSE'] if cause is None else cause
    db.execute('INSERT INTO auth_credentials VALUES (1, ?)', (original_cause,))
    if sibling:
        db.execute('INSERT INTO auth_credentials VALUES (2, ?)', (ns['CAUSE'],))
    if quota_scope:
        db.execute('INSERT INTO auth_credential_blocks VALUES (1, ?, ?)',
                   (quota_scope, (now + 26 * 3600) * 1000))
    db.commit()
    at = now
    before = {
        'provider': codex, 'fetchedAt': at * 1000,
        'metadata': {'email': 'fixture', 'accountId': 'fixture-account'},
        'limits': [
            {'id': 'openai-codex:primary', 'label': '5h', 'amount': {'usedFraction': used if five_hour else 0},
             'window': {'resetsAt': (at + 3600) * 1000}},
            {'id': 'openai-codex:secondary', 'label': '7 days', 'amount': {'usedFraction': 0 if five_hour else used},
             'window': {'resetsAt': (at + 26 * 3600) * 1000}},
        ],
        'resetCredits': {'availableCount': credits},
    }
    if single_weekly:
        before['limits'] = [{
            'id': 'openai-codex:primary', 'label': '7 days', 'amount': {'usedFraction': used},
            'window': {'resetsAt': (at + 26 * 3600) * 1000, 'durationMs': 604800000},
        }]
    after = json.loads(json.dumps(before))
    for limit in after['limits']:
        limit['amount']['usedFraction'] = 0
    state, calls, checkpoints, reads = {}, [], [], []
    if cooldown_first:
        state['codexResetAttempts'] = {'fixture-account': {
            'attemptedAt': at - 60, 'lastProbeAt': at - 600, 'unblockAt': at + 26 * 3600,
            'awaitingRecovery': cooldown_first != 'settled',
        }}
    settings = {'autoRedeem5h': mode, 'autoRedeemWeekly': mode, 'keepCredits': keep,
                'minBlockedMinutes': minutes}

    def cli(*args):
        if args[:2] == ('config', 'get'):
            return json.dumps({'value': settings[args[2].split('.')[-1]]})
        assert args == ('usage', 'reset', '--provider', codex, '--json')
        return json.dumps({'generatedAt': at * 1000, 'accounts': [
            {'provider': codex, 'credentialId': rid, 'availableCount': credits, 'redeemableCount': redeemable}
            for rid in ((1, 2) if sibling else (1,))
        ]})

    def fresh(account, email):
        rid = 1 if account == 'fixture-account' else 2
        assert (account, email) == (('fixture-account', 'fixture') if rid == 1 else ('sibling-account', 'sibling'))
        assert db.execute('SELECT disabled_cause FROM auth_credentials WHERE id = ?', (rid,)).fetchone() == (None,)
        assert not db.in_transaction, 'temporary activation must commit before a separate CLI opens the store'
        reads.append(rid)
        spent = any(command[3] == f'openai-codex/{rid}' for command in calls)
        if stale or (spent and (unknown_post is True or (unknown_post == 'once' and len(reads) == 2))):
            return None
        recovered = spent and (outcome == 'success' or (recover_after is not None and len(reads) > recover_after))
        report = json.loads(json.dumps(after if recovered else before))
        report['metadata'] = {'email': email, 'accountId': account}
        return report

    def checkpoint(value):
        checkpoints.append(json.loads(json.dumps(value)))

    def redeem(command, **kwargs):
        assert command[:3] == ['omp', 'usage', 'reset'] and command[3] in ('openai-codex/1', 'openai-codex/2')
        account = 'fixture-account' if command[3].endswith('/1') else 'sibling-account'
        assert checkpoints[-1]['codexResetAttempts'][account]['awaitingRecovery'], 'persist the episode before dispatch'
        calls.append(command)
        if outcome == 'timeout':
            raise subprocess.TimeoutExpired(command, 90)
        return subprocess.CompletedProcess(command, 0 if outcome == 'success' else 1)

    try:
        with patch.dict(ns['recover_codex_account'].__globals__, {
            'DRY': dry, 'now': at, 'omp': cli, 'fresh_codex_report': fresh, 'save_state': checkpoint,
        }), patch('subprocess.run', side_effect=redeem), patch('time.time', return_value=at):
            candidates = {'fixture': [1]}
            cache = {'fixture': {'7d': win(cache_used, at + 26 * 3600)}}
            accounts = {1: ('fixture-account', original_cause)}
            caps = {1: 1.0} if policy else {}
            if sibling:
                candidates['sibling'] = [2]
                cache['sibling'] = {'7d': win(1, at + 27 * 3600)}
                accounts[2] = ('sibling-account', ns['CAUSE'])
                caps[2] = 1.0
            args = (db, state, candidates, cache, accounts, caps,
                    {1} if auth else set(), {1} if catalog else set(),
                    {1} if quota_scope in ('chat', 'shared') else set())
            recovered = ns['recover_codex_account'](*args)
            if repeat:
                state.clear()
                state.update(json.loads(json.dumps(checkpoints[-1])))
                for elapsed in (61, 1861):
                    ns['recover_codex_account'].__globals__['now'] = at + elapsed
                    ns['recover_codex_account'](*args)
        expected_cause = ns['CAUSE'] if calls else original_cause
        assert db.execute('SELECT disabled_cause FROM auth_credentials WHERE id = 1').fetchone() == (expected_cause,)
        assert not db.in_transaction, 'temporary activation must be restored and committed'
        return calls, state, recovered, reads
    finally:
        db.close()

calls, reset_state, recovered, _ = reset_fixture()
assert len(calls) == 1 and not reset_state['codexResetAttempts']['fixture-account']['awaitingRecovery'], 'the last saved credit may restore one exhausted account'
assert plan(['fixture'], {'fixture': ns['windows_of'](recovered[2], {'7 days': '7d'})}, provider=codex) == {'fixture'}, 'confirmed post-reset usage must reopen quota'
assert len(reset_fixture(active=True)[0]) == 1, 'a currently active exhausted account must reach the reset bridge before parking'
assert len(reset_fixture(sibling=True)[0]) == 1, 'at most one account may spend a saved reset in a pass'
dry_calls, dry_state, _, dry_reads = reset_fixture(dry=True)
assert not dry_calls and not dry_state and not dry_reads, 'dry runs must neither probe nor mutate reset state'
assert not reset_fixture(keep=1, credits=5)[0], 'the bridge must abstain when a positive reserve cannot be enforced atomically'
for scope in ('chat', 'shared'):
    assert len(reset_fixture(quota_scope=scope)[0]) == 1, 'quota-only blocks must not prevent authorized recovery'
assert not reset_fixture(quota_scope='auth')[0], 'a persisted authentication block must prohibit temporary activation'
for options in (
    {'used': .99}, {'used': None}, {'credits': 0}, {'credits': None}, {'redeemable': 0},
    {'mode': 'no'}, {'mode': 'unset'}, {'keep': 1}, {'minutes': 2000}, {'stale': True},
    {'dry': True}, {'cause': 'manual: held'}, {'cause': 'oauth: disabled'},
    {'auth': True}, {'catalog': True}, {'policy': False},
):
    assert not reset_fixture(**options)[0], 'unsafe or unconfirmed reset candidates must never dispatch'
for outcome in ('timeout', 'failure'):
    calls, reset_state, _, _ = reset_fixture(outcome=outcome, repeat=True)
    assert len(calls) == 1 and reset_state['codexResetAttempts']['fixture-account']['awaitingRecovery'], 'unknown spend outcomes must survive restart without another spend after cooldown'
assert len(reset_fixture(unknown_post=True)[0]) == 1, 'missing post-reset usage must not trigger a second spend'
assert len(reset_fixture(five_hour=True)[0]) == 1, '5h exhaustion honors its own consent'
single_calls, single_state, single_report, _ = reset_fixture(single_weekly=True)
assert len(single_calls) == 1 and not single_state['codexResetAttempts']['fixture-account']['awaitingRecovery'], 'a weekly primary alone must confirm successful recovery'
assert ns['codex_reset_windows'](single_report[2]) == [], 'one valid weekly primary is a complete healthy report'
unknown_calls, unknown_state, _, _ = reset_fixture(single_weekly=True, outcome='timeout', unknown_post='once',
                                                  recover_after=1, repeat=True)
assert len(unknown_calls) == 1 and not unknown_state['codexResetAttempts']['fixture-account']['awaitingRecovery'], 'a later healthy weekly primary must reconcile an unknown spend'
for pending in (True, 'settled'):
    other_calls, _, _, _ = reset_fixture(sibling=True, cooldown_first=pending)
    assert [command[3] for command in other_calls] == ['openai-codex/2'], 'a cooling-down first account must not starve an eligible sibling'
for options in ({'credits': 0}, {'used': None}, {'stale': True}, {'outcome': 'timeout'}):
    _, probe_state, _, probe_reads = reset_fixture(repeat=True, **options)
    assert probe_reads.count(1) == (3 if options.get('outcome') == 'timeout' else 2), 'no-credit, unknown, and pending probes must be throttled across restart'
    assert 'lastProbeAt' in probe_state['codexResetAttempts']['fixture-account']
assert len(reset_fixture(quota_scope='chat', cache_used=.5)[0]) == 1, 'chat blocks may trigger a fresh exhaustion probe below the cached cap'
assert not reset_fixture(quota_scope='chat', cache_used=.5, used=.5)[0], 'a chat block without fresh exhaustion must not spend'

# The freshness check rejects cached reports even when the CLI returns them after invalidation.
for timestamp, expected in ((now * 1000 - 1, False), (now * 1000, True)):
    report = {'provider': codex, 'metadata': {'accountId': 'fixture-account'}, 'fetchedAt': timestamp}
    with patch.dict(ns['fresh_codex_report'].__globals__, {
        'omp': lambda *args: json.dumps({'reports': [report]}),
    }), patch('subprocess.run'), patch('time.time', return_value=now):
        assert (ns['fresh_codex_report']('fixture-account', 'fixture') is not None) == expected
print('provider-specific quota caps, expiry cohorts, and auth failover hold')
PY
