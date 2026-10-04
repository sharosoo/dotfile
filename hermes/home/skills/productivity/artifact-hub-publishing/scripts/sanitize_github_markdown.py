#!/usr/bin/env python3
"""
Sanitize a Markdown body that contains GitHub / PR-template excerpts so it
passes Artifact Hub's `no-raw-html` linter.

Usage:
    python3 sanitize_github_markdown.py <input.md> <output.md>
    python3 sanitize_github_markdown.py -          # stdin -> stdout

What it strips / fixes:

1. Multi-line HTML comments leaked from PR-template excerpts: `<!-- ... -->`
   (including nested or unterminated forms that PR authors paste from the
   GitHub web editor's "preview" tab). These trip `no-raw-html` immediately.
2. Entity-escaped `<details>` / `<summary>` / `</summary>` / `</details>`
   leftovers from `daily_pr_report.py`-style dumps (the report script
   re-escapes some HTML but not all, so the leftovers end up as raw tags).
3. Literal angle-bracket placeholders from PR templates: `<issue number>`,
   `<name>`, `<model>`, `<repo>`, `<branch>`. The linter sees `<...>` as
   a raw tag and rejects the body even though the author meant "fill this
   in later". Replace each with a backticked `&lt;...&gt;`-style
   placeholder that renders as readable prose and is grep-friendly.
4. Collapses the 3+ blank lines that step 1 leaves behind.
5. Preserves fenced code blocks (` ``` ... ``` `) untouched so a code
   example that legitimately contains `<!--` (rare but real) is not
   destroyed. Sanitization only runs OUTSIDE code fences.

Heuristic: the resulting body must contain zero `<!--`, zero bare
`<[A-Za-z][^>]*>` outside code fences, and zero `</?details|summary>`
leftovers. The script prints a one-line audit at the end so the cron
agent can fail fast before the publish call.

Why a script and not inline regex: cron runs of depth-mode daily reports
(30-45KB) hit this exact linter every time. The sanitization is
deterministic, must run before every publish, and the failure mode (a
13-error linter rejection that wastes a publish attempt) is expensive
enough to deserve a tested helper. Keep this script's regex set
additive: when a new raw-HTML leak surfaces in a future report, add the
pattern here and rely on existing cron jobs to pick it up.
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

# Patterns that always need escaping, regardless of where they appear.
LITERAL_PLACEHOLDERS = [
    "<issue number>",
    "<name>",
    "<model>",
    "<repo>",
    "<branch>",
    "<title>",
    "<author>",
    "<org>",
    "<scope>",
    "<paths>",
]

# Pre-compiled regexes for performance on 30-45KB bodies.
RE_HTML_COMMENT = re.compile(r"<!--.*?-->", re.DOTALL)
RE_BLANK_LINES = re.compile(r"\n{3,}")
RE_LEFTOVER_DETAILS = re.compile(
    r"&lt;(/?details|/?summary)&gt;|"
    r"<(/?details|/?summary)>",
    re.IGNORECASE,
)

# Bare angle-bracket tags OUTSIDE code fences. We do not try to detect
# them inside code fences; legitimate code samples may contain `<...>`.
FENCE_RE = re.compile(r"(```.*?```|`[^`\n]*`)", re.DOTALL)


def _split_fences(body: str) -> list[tuple[str, str]]:
    """Yield (segment, kind) where kind is 'code' for fences and 'text' otherwise."""
    segments: list[tuple[str, str]] = []
    pos = 0
    for m in FENCE_RE.finditer(body):
        if m.start() > pos:
            segments.append((body[pos:m.start()], "text"))
        segments.append((m.group(0), "code"))
        pos = m.end()
    if pos < len(body):
        segments.append((body[pos:], "text"))
    return segments


def _strip_html_comments(text: str) -> str:
    """Remove nested HTML comments leaked by concatenated PR excerpts."""
    out: list[str] = []
    i = 0
    depth = 0
    while i < len(text):
        if text.startswith("<!--", i):
            depth += 1
            i += 4
            continue
        if depth and text.startswith("-->", i):
            depth -= 1
            i += 3
            continue
        if not depth:
            out.append(text[i])
        i += 1
    return "".join(out)


def _escape_bare_tags(text: str) -> str:
    """Escape any bare `<[A-Za-z][^>]*>` outside code spans."""
    return re.sub(
        r"<([A-Za-z][^>\n]*?)>",
        lambda m: f"&lt;{m.group(1)}&gt;",
        text,
    )


def _replace_placeholders(text: str) -> str:
    out = text
    for ph in LITERAL_PLACEHOLDERS:
        out = out.replace(ph, f"&lt;{ph[1:-1]}&gt;")
    return out


def sanitize(body: str) -> str:
    """Run all sanitization passes on a Markdown body."""
    out: list[str] = []
    for segment, kind in _split_fences(body):
        if kind == "code":
            out.append(segment)
            continue
        s = segment
        # 1. Strip HTML comments, including nested leaked excerpts
        s = _strip_html_comments(s)
        # 2. Strip leftover <details>/<summary> tags (both raw and entity-escaped)
        s = RE_LEFTOVER_DETAILS.sub("", s)
        # 3. Replace literal placeholders
        s = _replace_placeholders(s)
        # 4. Escape any remaining bare angle-bracket tags
        s = _escape_bare_tags(s)
        # 5. Collapse 3+ blank lines
        s = RE_BLANK_LINES.sub("\n\n", s)
        out.append(s)
    return "".join(out)


def audit(body: str) -> list[str]:
    """Return a list of remaining problems. Empty list = body is clean."""
    problems: list[str] = []
    # Run segment-split so code-fence content is not flagged.
    for segment, kind in _split_fences(body):
        if kind == "code":
            continue
        if "<!--" in segment:
            problems.append("residual HTML comment `<!--` outside code fence")
        if RE_LEFTOVER_DETAILS.search(segment):
            problems.append("residual <details>/<summary> tag outside code fence")
        for ph in LITERAL_PLACEHOLDERS:
            if ph in segment:
                problems.append(f"un-escaped placeholder {ph}")
        bare = re.findall(r"<([A-Za-z][^>\n]*?)>", segment)
        if bare:
            problems.append(
                f"bare angle-bracket tag(s) outside code fence: {bare[:3]}"
            )
    return problems


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("input", help="Input Markdown file, or '-' for stdin")
    parser.add_argument("output", help="Output Markdown file, or '-' for stdout")
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Exit non-zero if the sanitized body still has any audit problems.",
    )
    args = parser.parse_args()

    if args.input == "-":
        body = sys.stdin.read()
    else:
        body = Path(args.input).read_text(encoding="utf-8")

    cleaned = sanitize(body)

    if args.output == "-":
        sys.stdout.write(cleaned)
    else:
        Path(args.output).write_text(cleaned, encoding="utf-8")

    problems = audit(cleaned)
    if problems:
        print("AUDIT-FAIL:", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        if args.strict:
            return 1
    else:
        print(
            f"OK: {len(body)} -> {len(cleaned)} chars "
            f"({len(body) - len(cleaned)} removed, audit clean)",
            file=sys.stderr,
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
