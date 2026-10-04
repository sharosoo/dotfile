#!/usr/bin/env python3
"""Pre-publish body preflight for Artifact Hub Markdown bodies.

Consolidates the structural checks that recurring linter warnings and renderer
quirks have taught us to run BEFORE every publish/update. Replaces the
hand-typed grep/awk one-liners scattered through the pitfalls list.

Checks
  BLOCKING
    1. setext trap        -- a '---' rule whose previous line is non-blank
                             (renders the paragraph above as an H2 underline)
    2. heading boundary   -- a '#'-heading glued to the previous line by a
                             swallowed blank line (chunked cat-join symptom)
    3. unbalanced fences  -- odd number of ``` fence lines (everything after
                             the dangling fence renders as code)
    4. raw HTML tags      -- <tag ...> outside fenced code blocks
                             (no-raw-html lint rejects the whole body)
  WARNING (renderer/linter risk -- inspect, then decide)
    5. risky bold spans   -- **...** containing ( ) " ` or curly quotes, or
                             starting with a quote (leaves literal '**')
    6. colon headings     -- ## / ### headings containing 'text: value'
                             (prefer-table trigger; fix with an em dash)
    7. bold-colon bullets -- '- **label**: text' bullets 3+ in a row
                             (prefer-table trigger; fix with an em dash)
  INFO (report only)
    body size (>30KB -> use the in-process publish handler from v1),
    ```mermaid fence count, total '**' occurrences, line count

Usage: python3 preflight_body.py <body.md> [more.md ...]
Exit 0 = no blockers, 1 = blockers found. Warnings do not affect the exit code.
"""
import re
import sys

BOLD_SPAN = re.compile(r"\*\*[^*\n]+\*\*")
RAW_TAG = re.compile(r"<[a-zA-Z][a-zA-Z0-9]*(?:\s[^<>]*)?>")
RISKY_CHARS = '()"`\u201c\u201d'
HEADING = re.compile(r"^#{1,6} ")
COLON_HEAD = re.compile(r"^#{2,6} .*[가-힣a-zA-Z0-9)\]]\s*:\s")
BOLD_COLON_BULLET = re.compile(r"^\s*(?:>\s*)?-\s*\*\*[^*]+\*\*\s*(?:\([^)]*\))?\s*:\s")


def check_file(path: str) -> int:
    try:
        text = open(path, encoding="utf-8").read()
    except OSError as exc:
        print(f"[{path}] cannot read: {exc}")
        return 1

    lines = text.split("\n")
    blockers: list[tuple[int, str]] = []
    warnings: list[tuple[int, str]] = []
    in_fence = False
    fence_lines = 0
    mermaid_blocks = 0
    prev = ""

    for i, line in enumerate(lines, start=1):
        if line.startswith("```"):
            fence_lines += 1
            if not in_fence and line[3:].strip().startswith("mermaid"):
                mermaid_blocks += 1
            in_fence = not in_fence
            prev = line
            continue

        if in_fence:
            prev = line
            continue

        # 1. setext trap
        if line.strip() == "---" and prev.strip() != "":
            blockers.append((i, f"setext trap: '---' follows non-blank line {i-1}: {prev[-60:]!r}"))
        # 2. heading boundary
        if HEADING.match(line) and prev.strip() != "":
            blockers.append((i, f"heading glued to previous line: {prev[-60:]!r} -> {line[:50]!r}"))
        # 4. raw html
        for tag in RAW_TAG.findall(line):
            blockers.append((i, f"raw HTML tag outside a fence: {tag!r}"))
        # 5. risky bold spans
        for span in BOLD_SPAN.findall(line):
            if span.startswith('**"') or span.startswith("**\u201c"):
                warnings.append((i, f"bold span starts with a quote: {span[:60]!r}"))
            elif any(c in span for c in RISKY_CHARS):
                warnings.append((i, f"bold span contains ( ) \" or backtick: {span[:60]!r}"))
        # 6. colon headings
        if COLON_HEAD.match(line):
            warnings.append((i, f"colon-bearing heading (prefer-table trigger): {line.strip()[:70]!r}"))
        # 7. bold-colon bullets
        if BOLD_COLON_BULLET.match(line):
            warnings.append((i, f"bold-colon bullet: {line.strip()[:70]!r}"))

        prev = line

    # 3. unbalanced fences
    if fence_lines % 2 == 1:
        blockers.append((len(lines), f"unbalanced code fences: {fence_lines} fence lines (odd)"))

    size = len(text.encode("utf-8"))
    bold_total = text.count("**")
    print(f"\n=== {path} ===")
    print(f"chars={len(text)} bytes={size} lines={len(lines)} fences={fence_lines} "
          f"mermaid_blocks={mermaid_blocks} '**'={bold_total}")
    if size > 30_000:
        print("INFO: body > 30KB -> publish via the in-process registry handler from v1 "
              "(deferred tool_call truncates ~32KB silently).")
    for ln, msg in blockers:
        print(f"BLOCKER line {ln}: {msg}")
    for ln, msg in warnings:
        print(f"WARNING line {ln}: {msg}")
    if not blockers and not warnings:
        print("clean: no blockers, no warnings")
    elif not blockers:
        print("no blockers; review warnings above before publishing")
    return 1 if blockers else 0


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__)
        return 2
    worst = 0
    for path in argv[1:]:
        worst |= check_file(path)
    return worst


if __name__ == "__main__":
    sys.exit(main(sys.argv))
