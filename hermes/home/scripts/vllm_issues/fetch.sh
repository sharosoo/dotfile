#!/usr/bin/env bash
# vLLM good-first-issue fetcher (with body + claim detection + diff against last run).
#
# Outputs JSON to stdout with shape:
# {
#   "new_issues": [ { "number", "title", "url", "labels", "author",
#                     "updatedAt", "createdAt",
#                     "body_excerpt",   # first 600 chars
#                     "claim": { "user": "...", "body": "...", "url": "..." } | null,
#                     "claimed_by_others": bool,
#                     "summary_seed": "..."  # first 2 sentences of body for LLM digest
#                   } ],
#   "total_open": N
# }
#
# Persists state.json (seen numbers, last body hashes) and a daily snapshot.
# Diff is computed against previously seen numbers — only NEW numbers are in
# `new_issues`. closed/unlabeled issues silently fall out of `seen`.

set -euo pipefail

STATE_DIR="$HOME/.hermes/cron/vllm_issues"
STATE_FILE="$STATE_DIR/state.json"
SNAPSHOT="$STATE_DIR/snapshot_$(date -u +%Y%m%d).json"
REPO="vllm-project/vllm"
LABEL="good first issue"
FETCH_LIMIT=50
BODY_CHARS=900     # excerpt length in body
CLAIM_CHARS=400    # claim comment excerpt
PRUNE_DAYS=7       # drop an issue from tracking after N days no update

mkdir -p "$STATE_DIR"

# 1) List issues (compact, with body)
RAW=$(gh issue list -R "$REPO" --label "$LABEL" --state open --limit "$FETCH_LIMIT" \
      --json number,title,labels,createdAt,updatedAt,author,url,body 2>/dev/null) || {
  echo "FETCH_FAILED: gh issue list errored" >&2
  exit 1
}
echo "$RAW" > "$SNAPSHOT"

# 2) Load previous state
if [ -f "$STATE_FILE" ]; then
  PREV_SEEN=$(python3 -c "import json,sys; d=json.load(open('$STATE_FILE')); print(','.join(str(x) for x in d.get('seen',[])))")
else
  PREV_SEEN=""
fi

# 3) Hand off to python for: claim detection (fetched per-issue), body excerpt,
#    diff, state write, JSON output to stdout.
python3 - "$RAW" "$PREV_SEEN" "$STATE_FILE" "$BODY_CHARS" "$CLAIM_CHARS" "$PRUNE_DAYS" <<'PY'
import json, re, subprocess, sys, urllib.parse, os
from datetime import datetime, timezone

raw_s, prev_seen_s, state_file, BODY_CHARS, CLAIM_CHARS, PRUNE_DAYS = sys.argv[1:]
BODY_CHARS = int(BODY_CHARS)
CLAIM_CHARS = int(CLAIM_CHARS)
PRUNE_DAYS = int(PRUNE_DAYS)

prev_seen = set(int(x) for x in prev_seen_s.split(',') if x.strip().isdigit())
current = json.loads(raw_s)

# Claim signal words (case-insensitive). Anyone matching is flagged.
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
]
claim_re = re.compile("|".join(CLAIM_PATTERNS), re.IGNORECASE)

# Bot/bot-account names to ignore when flagging claims
BOT_PATTERNS = re.compile(r"bot$|^\[bot\]|github-actions|app/", re.IGNORECASE)

def parse(s):
    return datetime.fromisoformat(s.replace('Z', '+00:00'))

def fetch_comments(issue_number):
    # gh api path, --jq to compact user+body
    out = subprocess.run(
        ["gh", "api", f"repos/vllm-project/vllm/issues/{issue_number}/comments",
         "--jq", '.[] | {login:.user.login, body:.body, html_url:.html_url}'],
        capture_output=True, text=True, timeout=20,
    )
    if out.returncode != 0 or not out.stdout.strip():
        return []
    # gh --jq output: one JSON object per line
    out_lines = [l for l in out.stdout.splitlines() if l.strip()]
    comments = []
    for line in out_lines:
        try:
            comments.append(json.loads(line))
        except json.JSONDecodeError:
            pass
    return comments

def find_claim(comments):
    """Return the first matching claim, or None."""
    for c in comments:
        login = c.get("login", "")
        body = c.get("body", "")
        if not body:
            continue
        if BOT_PATTERNS.search(login):
            continue
        if claim_re.search(body):
            excerpt = body.strip().replace("\r", " ")
            if len(excerpt) > CLAIM_CHARS:
                excerpt = excerpt[:CLAIM_CHARS].rstrip() + "…"
            return {
                "user": login,
                "body": excerpt,
                "url": c.get("html_url", ""),
            }
    return None

def excerpt_body(body):
    body = (body or "").strip().replace("\r", " ")
    # Strip markdown headings & code fences for digestibility
    body = re.sub(r"```.*?```", " ", body, flags=re.DOTALL)
    body = re.sub(r"\s+", " ", body)
    if not body:
        return ""
    if len(body) > BODY_CHARS:
        body = body[:BODY_CHARS].rstrip() + "…"
    return body

def summary_seed(body):
    """First 1–2 sentences. Used as LLM digest hint."""
    body = (body or "").strip().replace("\r", " ")
    body = re.sub(r"```.*?```", " ", body, flags=re.DOTALL)
    body = re.sub(r"\s+", " ", body)
    if not body:
        return ""
    # Split on sentence-end punctuation
    parts = re.split(r"(?<=[.!?])\s+", body)
    seed = " ".join(parts[:2])
    if len(seed) > 320:
        seed = seed[:320].rstrip() + "…"
    return seed

now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
now = datetime.now(timezone.utc)

new_issues = []
all_seen = set()
tracked = {}

for it in current:
    n = it["number"]
    all_seen.add(n)
    last_update = parse(it["updatedAt"])
    age_days = (now - last_update).days

    # Fetch comments only for new issues, OR when forced via env VLLM_FORCE_COMMENTS=1
    # (the cron uses the diff path; manual re-scan can pass the env to refresh
    # claim data on already-seen issues).
    force_comments = os.environ.get("VLLM_FORCE_COMMENTS") == "1"
    claim = None
    claimed_by_others = False
    if n not in prev_seen or force_comments:
        comments = fetch_comments(n)
        claim = find_claim(comments)
        claimed_by_others = claim is not None

    # Build the new-issue record (only if actually new)
    if n not in prev_seen:
        new_issues.append({
            "number": n,
            "title": it["title"],
            "url": it["url"],
            "labels": [l["name"] for l in it.get("labels", [])],
            "author": (it.get("author") or {}).get("login", ""),
            "updatedAt": it["updatedAt"],
            "createdAt": it["createdAt"],
            "body_excerpt": excerpt_body(it.get("body", "")),
            "claim": claim,
            "claimed_by_others": claimed_by_others,
            "summary_seed": summary_seed(it.get("body", "")),
        })

    if age_days <= PRUNE_DAYS:
        tracked[str(n)] = {
            "title": it["title"],
            "url": it["url"],
            "updatedAt": it["updatedAt"],
        }

new_seen = sorted(prev_seen | all_seen)
state = {
    "last_run": now_iso,
    "seen": new_seen,
    "issues": tracked,
    "total_open": len(current),
}
with open(state_file, "w") as f:
    json.dump(state, f, indent=2)

out = {
    "new_issues": new_issues,
    "total_open": len(current),
    "fetched_at": now_iso,
}
print(json.dumps(out, ensure_ascii=False))
PY
