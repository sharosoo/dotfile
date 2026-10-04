#!/usr/bin/env bash
# vLLM good-first-issue — DEEP scan.
# For each open good-first-issue: fetch comments, detect claim signal,
# link associated PRs (cross-references in issue body & comments),
# classify by staleness.
#
# Output: JSON to stdout. This is an ad-hoc analysis tool; not used by cron.
#
# Usage: ./deep_scan.sh > /tmp/vllm_deep.json
set -euo pipefail

gh issue list -R vllm-project/vllm --label "good first issue" --state open --limit 50 \
  --json number,title,labels,createdAt,updatedAt,author,url,body,state \
  > /tmp/vllm_deep_raw.json 2>/dev/null

python3 - <<'PY'
import json, re, subprocess as sp
from datetime import datetime, timezone

raw = json.load(open('/tmp/vllm_deep_raw.json'))
now = datetime.now(timezone.utc)

CLAIM_PATTERNS = [
    r"\bcan i work on (this|it)\b",
    r"\bassign (it|this) to me\b",
    r"\bi'?ll take (this|it)\b",
    r"\bi will (work|submit|open a pr|take|try)\b",
    r"\bi'?d like to work on (this|it)\b",
    r"\bhappy to (work|take|pick up|help|unblock)\b",
    r"\bi can (work|take|pick up|run|help)\b",
    r"\bworking on (this|it|a pr|a fix)\b",
    r"\bopen(ing)? a pr\b",
    r"\b/assign\b",                                # github /assign command
    r"\bworking on this\b",
    r"\bi('?m| am) working on\b",
    r"\bi('?m| am) currently working on\b",
    r"\bi can take this\b",
    r"\bpicking (it|this) up\b",
    r"\bremain(ing)? work\b",
    r"\bmore models next week\b",                  # soft claim, lengrongfu style
    r"\bI'll take on (a few|some|the rest|more)\b",
]
claim_re = re.compile("|".join(CLAIM_PATTERNS), re.IGNORECASE)
bot_re = re.compile(r"bot$|^\[bot\]|github-actions|app/", re.IGNORECASE)

# Soft / 1년 전 등 'stale claim' 의미: claim 코멘트가 있고, 마지막 maintainer 답글이
# 90일 이상 전이거나, 링크된 PR의 최근 activity가 90일 이상 전.
def fetch_comments(n):
    co = sp.run(['gh','api',f'repos/vllm-project/vllm/issues/{n}/comments',
                 '--jq','.[] | {login:.user.login, body:.body, created_at:.created_at, html_url:.html_url}'],
                capture_output=True, text=True, timeout=20)
    out = []
    for line in co.stdout.splitlines():
        if not line.strip(): continue
        try: out.append(json.loads(line))
        except: pass
    return out

def fetch_timeline(n):
    # events include "assigned", "cross-referenced" etc.
    co = sp.run(['gh','api',f'repos/vllm-project/vllm/issues/{n}/events',
                 '--jq','.[] | {event, actor:.actor.login, created_at, source:.source.issue.number}'],
                capture_output=True, text=True, timeout=20)
    out = []
    for line in co.stdout.splitlines():
        if not line.strip(): continue
        try: out.append(json.loads(line))
        except: pass
    return out

# PR list referenced in the issue (cross-references): scrape both body & comments
pr_re = re.compile(r"#(\d{4,6})")
def extract_pr_refs(text):
    return sorted(set(int(m.group(1)) for m in pr_re.finditer(text or "")))

def pr_state(pr_num):
    """Get latest activity of PR. Returns dict with state, merged, updated_at."""
    co = sp.run(['gh','pr','view',str(pr_num),'-R','vllm-project/vllm',
                 '--json','state,mergedAt,updatedAt,title,author,closedAt'],
                capture_output=True, text=True, timeout=20)
    if co.returncode != 0 or not co.stdout.strip():
        return None
    try: return json.loads(co.stdout)
    except: return None

def classify(claim, prs_latest, days_since_maintainer_reply):
    """Return one of: 'free' | 'active_claim' | 'stale_claim' | 'wip_pr' | 'recent_pr'."""
    if prs_latest:
        # If any PR was updated in last 30 days, very much active
        for pr in prs_latest:
            try:
                upd = datetime.fromisoformat(pr['updatedAt'].replace('Z','+00:00'))
                if (now - upd).days <= 30:
                    return 'wip_pr'
            except: pass
    if claim:
        if days_since_maintainer_reply is not None and days_since_maintainer_reply > 90:
            return 'stale_claim'
        return 'active_claim'
    return 'free'

records = []
for it in raw:
    n = it['number']
    body = it.get('body','') or ''
    comments = fetch_comments(n)
    timeline = fetch_timeline(n)

    # Find claim in comments (oldest first; latest claim wins for "current owner")
    claim = None
    for c in comments:
        if bot_re.search(c.get('login','')): continue
        if claim_re.search(c.get('body','')):
            claim = {
                'user': c['login'],
                'created_at': c['created_at'],
                'body_excerpt': (c['body'] or '').strip().replace('\r',' ')[:280],
            }
            break  # most recent first in gh API order? actually ascending. take last:
    # actually gh --jq .[] returns ascending; we want most recent claim.
    claim = None
    for c in reversed(comments):
        if bot_re.search(c.get('login','')): continue
        if claim_re.search(c.get('body','')):
            claim = {
                'user': c['login'],
                'created_at': c['created_at'],
                'body_excerpt': (c['body'] or '').strip().replace('\r',' ')[:280],
            }
            break

    # Maintainer reply: any non-claim comment in last 90 days from a maintainer?
    # Simplify: days since last *non-claim-bot* comment.
    last_human_comment = None
    for c in reversed(comments):
        if bot_re.search(c.get('login','')): continue
        last_human_comment = c
        break
    days_since_human = None
    if last_human_comment:
        try:
            dt = datetime.fromisoformat(last_human_comment['created_at'].replace('Z','+00:00'))
            days_since_human = (now - dt).days
        except: pass

    # Linked PRs from body + comments
    pr_nums = set(extract_pr_refs(body))
    for c in comments:
        pr_nums.update(extract_pr_refs(c.get('body','')))
    pr_nums.discard(n)
    pr_nums = sorted(pr_nums)

    pr_info = []
    for pn in pr_nums:
        info = pr_state(pn)
        if info:
            pr_info.append({'number': pn, **info})

    cat = classify(claim, pr_info, days_since_human if days_since_human is not None else 0)

    records.append({
        'number': n,
        'title': it['title'],
        'url': it['url'],
        'updatedAt': it['updatedAt'],
        'category': cat,
        'claim': claim,
        'last_human_comment_days_ago': days_since_human,
        'linked_prs': pr_info,
    })

out = {
    'fetched_at': now.strftime('%Y-%m-%dT%H:%M:%SZ'),
    'total': len(records),
    'by_category': {
        'free': [r for r in records if r['category']=='free'],
        'active_claim': [r for r in records if r['category']=='active_claim'],
        'stale_claim': [r for r in records if r['category']=='stale_claim'],
        'wip_pr': [r for r in records if r['category']=='wip_pr'],
    },
    'records': records,
}
print(json.dumps(out, ensure_ascii=False, indent=2))
PY
