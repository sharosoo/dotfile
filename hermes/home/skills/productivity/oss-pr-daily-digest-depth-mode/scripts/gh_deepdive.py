"""
Inline deep-dive helper for depth-mode PR/issue enrichment.

USE: After the daily fetcher has identified your 3-5 megafic candidates and
2-3 reject candidates, this script fetches the full body and comments of those
specific PRs/issues so you can write 2-3 sentence megafics with real WHY and
label/comment-driven reject hypotheses.

Run examples:
  python3 gh_deepdive.py pr vllm-project/vllm 40408
  python3 gh_deepdive.py issue vllm-project/vllm 40412
  python3 gh_deepdive.py comments vllm-project/vllm 40408

Auth resolution order (set TOKEN once, runs authenticated):
  1. $GH_TOKEN env var (preferred for cron — set in the cron command)
  2. `gh auth token` (interactive shell already logged in via `gh auth login`)
  3. anonymous (60 req/h — rate-limited for any 10-repo deep-dive)

Anonymous rate limit is 60 req/h and is exhausted by the daily fetcher alone
on a 10-repo run, so you are almost always at or past 60 by deep-dive time
without one of (1) or (2).

This script is ephemeral — keep at /tmp/ or workspace/scripts/, NOT inside the notes tree.
"""
import urllib.request, json, os, subprocess, sys

def _resolve_token():
    tok = os.environ.get("GH_TOKEN", "").strip()
    if tok:
        return tok
    # Fall back to gh CLI's stored credential. Captures whatever keyring-backed
    # credential `gh auth login` set, without making the user re-export.
    try:
        out = subprocess.run(
            ["gh", "auth", "token"],
            capture_output=True, text=True, timeout=5
        )
        if out.returncode == 0 and out.stdout.strip():
            return out.stdout.strip()
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass
    return ""

TOKEN = _resolve_token()
if TOKEN:
    print(f"# gh_deepdive: authenticated (token len={len(TOKEN)})", file=sys.stderr)
else:
    print("# gh_deepdive: anonymous mode (60 req/h — likely rate-limited)", file=sys.stderr)

def gh(url):
    req = urllib.request.Request(url, headers={
        "User-Agent": "oss-pr-deepdive/1.0",
        "Accept": "application/vnd.github+json",
    })
    if TOKEN:
        req.add_header("Authorization", f"Bearer {TOKEN}")
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        if e.code == 403:
            return {"error": f"403 rate-limited (token={bool(TOKEN)}). Wait or set GH_TOKEN."}
        return {"error": f"HTTP {e.code}: {e.reason}"}
    except Exception as e:
        return {"error": str(e)}

def fmt_pr(d):
    print(f"=== PR #{d.get('number')} ===")
    print(f"Title: {d.get('title')}")
    print(f"State: {d.get('state')} | Merged: {d.get('merged')}")
    print(f"Author: {d.get('user', {}).get('login')}")
    print(f"Labels: {[l['name'] for l in d.get('labels', [])]}")
    print(f"Created: {d.get('created_at')} | Updated: {d.get('updated_at')}")
    print(f"Merged at: {d.get('merged_at')}")
    print(f"Base: {d.get('base', {}).get('ref')} | Head: {d.get('head', {}).get('ref')}")
    print(f"URL: {d.get('html_url')}")
    print()
    print("=== BODY (truncated 1500 chars) ===")
    body = (d.get("body") or "").strip()
    print(body[:1500])

def fmt_issue(d):
    print(f"=== Issue #{d.get('number')} ===")
    print(f"Title: {d.get('title')}")
    print(f"State: {d.get('state')}")
    print(f"Author: {d.get('user', {}).get('login')}")
    print(f"Labels: {[l['name'] for l in d.get('labels', [])]}")
    print(f"URL: {d.get('html_url')}")
    print()
    print("=== BODY (truncated 2500 chars) ===")
    body = (d.get("body") or "").strip()
    print(body[:2500])

def fmt_comments(d):
    if not isinstance(d, list):
        print(json.dumps(d, indent=2))
        return
    for c in d:
        u = c.get("user", {}).get("login", "?")
        is_bot = c.get("user", {}).get("type") == "Bot"
        bot_marker = " [BOT]" if is_bot else ""
        txt = (c.get("body") or "").strip()[:600]
        print(f"--- @{u}{bot_marker} ---")
        print(txt)
        print()

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print(__doc__)
        sys.exit(1)
    cmd, full, num = sys.argv[1], sys.argv[2], int(sys.argv[3])
    if cmd == "pr":
        fmt_pr(gh(f"https://api.github.com/repos/{full}/pulls/{num}"))
    elif cmd == "issue":
        fmt_issue(gh(f"https://api.github.com/repos/{full}/issues/{num}"))
    elif cmd == "comments":
        fmt_comments(gh(f"https://api.github.com/repos/{full}/issues/{num}/comments?per_page=20"))
    else:
        print(f"Unknown command: {cmd}. Use: pr | issue | comments")
        sys.exit(1)
