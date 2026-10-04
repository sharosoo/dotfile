"""
일일 LLM 서빙 PR/Issue 리포트 — fetcher skeleton
깊이 모드 enrichment는 별도 단계에서 수동으로 작성한다.

이 스크립트는 fetcher only: GitHub REST API에서 24시간 이내 PR/issue를 모아서
per-repo 마크다운 출력 + 파일 저장까지 한다. 깊이 분석(메가픽/reject가설/cross-signal)은
이 출력 위에서 별도 작성해야 한다.
"""
import urllib.request, json, os
from datetime import datetime, timedelta, timezone
from pathlib import Path

# === 설정 — workspace에 맞게 수정 ===
REPOS = [
    # (full, short_label, focus_keywords)
    # 예: ("vllm-project/vllm", "vLLM", "v1 엔진, KV cache, attention backends, PagedAttention, speculative decoding"),
]

LOOKBACK_HOURS = 24
MAX_PRS_PER_REPO = 6
MAX_ISSUES_PER_REPO = 4

# === GitHub API (no auth, no LLM) ===
def gh(url):
    req = urllib.request.Request(url, headers={
        "User-Agent": "oss-pr-daily/1.0",
        "Accept": "application/vnd.github+json",
    })
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except Exception as e:
        return {"error": str(e)}

def fetch_prs(full, state):
    return gh(f"https://api.github.com/repos/{full}/pulls?state={state}&per_page=20&sort=updated&direction=desc")

def fetch_issues(full):
    items = gh(f"https://api.github.com/repos/{full}/issues?state=open&per_page=15&sort=updated&direction=desc")
    if isinstance(items, dict) and "error" in items:
        return items
    return [i for i in items if "pull_request" not in i]

# === 메타 추출 ===
def pr_summary(pr, merged):
    title = pr["title"]
    if len(title) > 90: title = title[:87] + "..."
    labels = [l["name"] for l in pr.get("labels", [])]
    author = pr["user"]["login"]
    body = (pr.get("body") or "").strip()
    body_short = " | ".join([l.strip() for l in body.split("\n") if l.strip() and not l.strip().startswith("#")][:3])
    if len(body_short) > 280: body_short = body_short[:277] + "..."
    return {
        "num": pr["number"], "title": title, "merged": merged,
        "labels": labels[:4], "author": author, "updated": pr["updated_at"][:10],
        "body": body_short, "url": pr["html_url"],
    }

def in_window(iso_ts, hours):
    ts = datetime.fromisoformat(iso_ts.replace("Z", "+00:00"))
    return (datetime.now(timezone.utc) - ts) < timedelta(hours=hours)

# === 메인 빌드 ===
def build_report():
    KST = timezone(timedelta(hours=9))
    now_kst = datetime.now(KST).strftime("%Y-%m-%d (%a) %H:%M KST")
    lines = [f"# 📡 OSS PR/Issue Daily — {now_kst}",
             f"_(최근 {LOOKBACK_HOURS}시간 · {len(REPOS)}개 레포 · fetcher only — depth-mode enrichment 별도)_", ""]

    summary = {"merged": 0, "rejected": 0, "open_prs": 0, "open_issues": 0}

    for full, short, focus in REPOS:
        lines.append(f"\n## 🔷 {short} — `{full}`")
        lines.append(f"_포커스: {focus}_\n")

        closed = fetch_prs(full, "closed")
        if isinstance(closed, dict) and "error" in closed:
            lines.append(f"⚠️ API 오류: {closed['error']}")
            continue

        merged_prs, rejected_prs = [], []
        for pr in closed:
            if not in_window(pr["updated_at"], LOOKBACK_HOURS): continue
            merged = pr.get("merged_at") is not None
            (merged_prs if merged else rejected_prs).append(pr)
            if merged: summary["merged"] += 1
            else: summary["rejected"] += 1
            if len(merged_prs) + len(rejected_prs) >= MAX_PRS_PER_REPO * 2: break

        if merged_prs:
            lines.append(f"### ✅ MERGED ({len(merged_prs)})")
            for pr in merged_prs[:MAX_PRS_PER_REPO]:
                m = pr_summary(pr, True)
                lines.append(f"- **#{m['num']}** {m['title']} _(@{m['author']})_")
                if m['labels']: lines.append(f"  - 🏷 `{', '.join(m['labels'])}`")
                if m['body']: lines.append(f"  - 📝 _{m['body']}_")
                lines.append(f"  - 🔗 {m['url']}")
            lines.append("")

        if rejected_prs:
            lines.append(f"### ❌ REJECTED / CLOSED w/o merge ({len(rejected_prs)})")
            for pr in rejected_prs[:3]:
                m = pr_summary(pr, False)
                lines.append(f"- **#{m['num']}** {m['title']} _(@{m['author']})_")
                if m['labels']: lines.append(f"  - 🏷 `{', '.join(m['labels'])}`")
                if m['body']: lines.append(f"  - 📝 _{m['body']}_")
                lines.append(f"  - 🔗 {m['url']}")
            lines.append("")

        opens = fetch_prs(full, "open")
        if isinstance(opens, list):
            new_opens = [pr for pr in opens if in_window(pr["created_at"], LOOKBACK_HOURS)]
            if new_opens:
                lines.append(f"### 🆕 NEW OPEN ({len(new_opens)})")
                for pr in new_opens[:3]:
                    m = pr_summary(pr, False)
                    lines.append(f"- **#{m['num']}** {m['title']} _(@{m['author']})_")
                    if m['labels']: lines.append(f"  - 🏷 `{', '.join(m['labels'])}`")
                    if m['body']: lines.append(f"  - 📝 _{m['body']}_")
                    lines.append(f"  - 🔗 {m['url']}")
                summary["open_prs"] += len(new_opens)
                lines.append("")

        issues = fetch_issues(full)
        if isinstance(issues, list):
            new_issues = [i for i in issues if in_window(i["created_at"], LOOKBACK_HOURS)]
            if new_issues:
                lines.append(f"### 🐛 NEW ISSUES ({len(new_issues)})")
                for iss in new_issues[:MAX_ISSUES_PER_REPO]:
                    title = iss["title"]
                    if len(title) > 90: title = title[:87] + "..."
                    labels = [l["name"] for l in iss.get("labels", [])][:3]
                    lines.append(f"- **#{iss['number']}** {title} _(@{iss['user']['login']})_")
                    if labels: lines.append(f"  - 🏷 `{', '.join(labels)}`")
                    lines.append(f"  - 🔗 {iss['html_url']}")
                summary["open_issues"] += len(new_issues)
                lines.append("")

    lines.append("\n---\n")
    lines.append(f"**fetcher summary**: merged={summary['merged']} · rejected={summary['rejected']} · new_open_PR={summary['open_prs']} · new_issue={summary['open_issues']}")
    lines.append("\n_이 출력은 fetcher 결과입니다. Depth-mode enrichment (메가픽 3-5건, reject 가설, cross-signal)는 별도 작성하세요._")
    return "\n".join(lines)


if __name__ == "__main__":
    out = build_report()
    print(out)
    out_dir = Path.home() / "workspaces" / "<workspace>" / "notes" / "daily_pr"
    out_dir.mkdir(parents=True, exist_ok=True)
    today = datetime.now().strftime("%Y-%m-%d")
    (out_dir / f"{today}.md").write_text(out, encoding="utf-8")
    print(f"\n[SAVED] {out_dir}/{today}.md", file=__import__('sys').stderr)
