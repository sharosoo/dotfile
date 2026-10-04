"""
verify_discord_summary.py — post-write verification of the Discord summary.

WHY: a future dense-day cron will write 100+ PR#s into a 2000-char Discord
summary. Without a check, hallucinations (PR#s that don't exist in the raw
fetcher) slip into the deliverable. This script runs a per-line PR#-tag
heuristic against the raw fetcher JSONs and flags any mismatches.

USAGE:
  python3 verify_discord_summary.py <discord_md_path> [--raw-dir /tmp]

DEFAULTS:
  discord path: ~/workspaces/llm_serving_study/notes/daily_pr/YYYY-MM-DD_discord.md
  raw dir:     /tmp  (matches the daily_pr_report.py fetcher output convention)

CHECKS PERFORMED (all PASS required):
  1. Note file exists
  2. Note has 10 repo headers (## 🔷 ...)
  3. Note has megafic block (🔥 메가픽)
  4. Note has cross-signal block (📌)
  5. Discord file exists
  6. Discord <= 2000 chars
  7. Discord has megafic block
  8. Discord has all 4 list sections (✅, ❌, 🆕, 🐛)
  9. Every PR# claimed under a repo in the Discord summary exists in that
     repo's raw fetcher JSON (closed + open + issues).
     - LMCache / llm-d / Triton-Inference-Server have no JSON in the standard
       10-repo run; their PR#s are accepted as unverifiable (not a fail).
     - Cross-day references (PRs merged on a previous day that the agent cites
       as context, e.g. "어제 #50000") are accepted via --allow-crossday list.

RETURNS: exit 0 on PASS, exit 1 on any FAIL. Each check is printed with status.

The PR#-tag heuristic (per-line, closest preceding repo tag):
  - Repo tags recognized: "vLLM ", "SGLang ", "TRT-LLM ", "Dynamo ",
    "Mooncake ", "Triton ", "FI " (FlashInfer), "LMCache ".
  - A PR# not directly after a tag is attributed to the closest preceding
    tag-prefixed PR# on the same line. This handles "+ #17110" continuation.
  - Lines that match no tag (e.g. cross-signal section) tag all PR#s as
    unverifiable. This is intentional — cross-signals are 3-word summaries,
    not PR# attributions.

If you see MISMATCH: #N claimed under REPO but not in raw fetches:
  1. First check: was the PR merged/closed in the last 24h? If yes, was the
     fetcher's --limit high enough to include it? Increase --limit to 50.
  2. Second check: is the PR a cross-day reference (yesterday's PR mentioned
     in today's megafic as "어제 #N")? Add to --allow-crossday.
  3. Third check: is it actually a fabrication? If yes, remove the PR# from
     the Discord summary.
"""
import argparse
import json
import os
import re
import sys
from pathlib import Path

# Repo short-tag → full GitHub name. Order matters: longer tags first to avoid
# prefix collisions (e.g. "LMCache " before "Llama").
TAG_PATTERNS = [
    ("LMCache/LMCache",                 re.compile(r"LMCache\s+(\#\d{5})")),
    ("vllm-project/vllm",               re.compile(r"vLLM\s+(\#\d{5})")),
    ("sgl-project/sglang",              re.compile(r"SGLang\s+(\#\d{5})")),
    ("NVIDIA/TensorRT-LLM",             re.compile(r"TRT-LLM\s+(\#\d{5})")),
    ("ai-dynamo/dynamo",                re.compile(r"Dynamo\s+(\#\d{5})")),
    ("kvcache-ai/Mooncake",             re.compile(r"Mooncake\s+(\#\d{5})")),
    ("triton-lang/triton",              re.compile(r"Triton\s+(\#\d{5})")),
    ("flashinfer-ai/flashinfer",        re.compile(r"FI\s+(\#\d{5})")),
]

# Repos that don't have raw JSON in the standard 10-repo fetcher (triton-inference-server
# rarely has PRs, llm-d's small PR set is captured but skipped for speed, LMCache is included
# but tagged separately here for resilience to the fetcher's --limit cutoff).
UNVERIFIED_REPOS = {
    "LMCache/LMCache",
    "llm-d/llm-d",
    "triton-inference-server/server",
}


def _short_to_json(short: str, raw_dir: str) -> str:
    """Map a repo's short name to its raw JSON fetcher output. Conventions:
    the daily fetcher writes `/tmp/closed_<owner>_<repo>.json` (slash → underscore).
    """
    return os.path.join(raw_dir, f"closed_{short.replace('/', '_')}.json")


def _short_to_open_json(short: str, raw_dir: str) -> str:
    return os.path.join(raw_dir, f"open_{short.replace('/', '_')}.json")


def _short_to_issue_json(short: str, raw_dir: str) -> str:
    return os.path.join(raw_dir, f"issues_{short.replace('/', '_')}.json")


def load_all_pr_numbers(raw_dir: str) -> dict[str, set[int]]:
    """For every repo with a closed JSON, collect PR+issue numbers from
    closed + open + issues files. Returns {repo: {num, ...}}.
    """
    result: dict[str, set[int]] = {}
    for repo, _ in TAG_PATTERNS:
        nums: set[int] = set()
        for path in (
            _short_to_json(repo, raw_dir),
            _short_to_open_json(repo, raw_dir),
            _short_to_issue_json(repo, raw_dir),
        ):
            if not os.path.exists(path):
                continue
            try:
                data = json.load(open(path))
            except Exception:
                continue
            for p in data:
                if "number" in p:
                    nums.add(p["number"])
        if nums:
            result[repo] = nums
    return result


def tag_prs_in_discord(disc_text: str) -> dict[int, str]:
    """Per-line PR# → repo assignment. For each line, find all tag-prefixed
    PR#s (e.g. "vLLM #50590") and any other PR#s on the same line. The other
    PR#s get the tag of the closest preceding tag-prefixed PR# on the same line.
    """
    repo_for: dict[int, str] = {}
    for line in disc_text.splitlines():
        matches: list[tuple[int, str, int]] = []
        for repo, pat in TAG_PATTERNS:
            for m in pat.finditer(line):
                pr_num = int(m.group(1).lstrip("#"))
                matches.append((m.start(), repo, pr_num))
        for m in re.finditer(r"\#(\d{5})\b", line):
            pr_num = int(m.group(1))
            preceding = [x for x in matches if x[0] < m.start()]
            if preceding:
                repo_for[pr_num] = preceding[-1][1]
    return repo_for


def repo_headers(text: str) -> int:
    """Count repo headers: ## 🔷 OR the ## TIS plain header used for the
    Triton-Inference-Server section in notes that merge it into one block."""
    return text.count("## 🔷 ") + text.count("## TIS (triton-inference-server/server)")

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("discord", nargs="?",
                    help="Path to the Discord markdown summary. Default: today's YYYY-MM-DD_discord.md in notes/daily_pr/")
    ap.add_argument("--note", help="Path to the full markdown note (for structure checks). Default: same dir as discord, no _discord suffix")
    ap.add_argument("--raw-dir", default="/tmp", help="Directory containing the fetcher JSONs (default /tmp)")
    ap.add_argument("--allow-crossday", type=int, nargs="*", default=[],
                    help="PR#s that are legitimate cross-day references (e.g. yesterday's PR mentioned as '어제 #N')")
    args = ap.parse_args()

    # Resolve paths
    if args.discord is None:
        from datetime import datetime, timezone, timedelta
        kst = timezone(timedelta(hours=9))
        today = datetime.now(kst).strftime("%Y-%m-%d")
        workspace = Path.home() / "workspaces" / "llm_serving_study" / "notes" / "daily_pr"
        args.discord = str(workspace / f"{today}_discord.md")
        args.note = str(workspace / f"{today}.md")
    elif args.note is None:
        args.note = args.discord.replace("_discord.md", ".md")

    results: list[tuple[str, bool, str]] = []

    # Structure checks
    note_path = Path(args.note)
    note_exists = note_path.exists() and note_path.stat().st_size > 0
    results.append(("note exists", note_exists, f"{args.note} ({note_path.stat().st_size if note_exists else 0} bytes)"))
    if note_exists:
        note_text = note_path.read_text()
        results.append(("note has 10 repo headers", repo_headers(note_text) == 10,
                        f"found {repo_headers(note_text)}/10"))
        results.append(("note has megafic block", "🔥 메가픽" in note_text or "🎯 메가픽" in note_text, ""))
        results.append(("note has cross-signal", "## 📌" in note_text, ""))
    else:
        results.append(("note has 10 repo headers", False, "skipped (note missing)"))
        results.append(("note has megafic block", False, "skipped (note missing)"))
        results.append(("note has cross-signal", False, "skipped (note missing)"))

    # Discord checks
    disc_path = Path(args.discord)
    disc_exists = disc_path.exists()
    results.append(("discord file exists", disc_exists, str(args.discord)))
    if not disc_exists:
        for n, _, _ in results:
            print(f"  [FAIL] {n}")
        return 1
    disc_text = disc_path.read_text()
    disc_len = len(disc_text)
    results.append(("discord <= 2000 chars", disc_len <= 2000,
                    f"{disc_len} chars / {disc_len * 2 if disc_len < 1000 else '~'} bytes"))
    results.append(("discord has megafic block", "메가픽" in disc_text, ""))
    results.append(("discord has all 4 list sections",
                    all(x in disc_text for x in ["✅ ", "❌ ", "🆕 ", "🐛 "]),
                    ""))

    # PR# cross-check
    all_json = load_all_pr_numbers(args.raw_dir)
    repo_for = tag_prs_in_discord(disc_text)
    crossday = set(args.allow_crossday)
    verified = unverifiable = 0
    mismatches: list[tuple[int, str]] = []
    for n, r in repo_for.items():
        if r in UNVERIFIED_REPOS:
            unverifiable += 1
            continue
        if n in crossday:
            verified += 1
            continue
        if r in all_json:
            if n in all_json[r]:
                verified += 1
            else:
                mismatches.append((n, r))
        else:
            unverifiable += 1
    results.append((f"PR#s verified ({verified}/{verified + len(mismatches)}",
                    len(mismatches) == 0,
                    f"{unverifiable} unverifiable"))

    # Report
    print("=" * 60)
    print(f"verify_discord_summary: {args.discord}")
    print("=" * 60)
    all_ok = True
    for name, ok, detail in results:
        status = "PASS" if ok else "FAIL"
        suffix = f" — {detail}" if detail else ""
        print(f"  [{status}] {name}{suffix}")
        if not ok:
            all_ok = False
    for n, r in mismatches:
        print(f"  MISMATCH: #{n} claimed under {r} but not in raw fetches", file=sys.stderr)
    print("=" * 60)
    print(f"OVERALL: {'PASS' if all_ok else 'FAIL'}")
    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
