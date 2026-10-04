#!/usr/bin/env python3
"""Preflight a Korean (or any) Markdown body for the Artifact Hub linter.

Run this on every locally composed body BEFORE the first publish. Discovering
linter problems from publish responses costs one artifact version per warning
source; this catches the whole family in one pass.

Usage: python3 preflight_ko_markdown.py FILE [FILE ...]
Exit code 1 if any ERROR-level finding exists (WARN-level do not fail the run).

Checks
  ERROR  raw HTML tags / HTML comments outside fenced code blocks
  ERROR  unpaired `**` on a line
  ERROR  no blank line before a `---` separator (setext-heading trap)
  ERROR  no blank line before an H2 heading (chunked-join trap)
  ERROR  unbalanced ``` fences
  WARN   bold span starting/ending on a quote or parenthesis (literal ** leak)
  WARN   `- **label**: text` bullet (prefer-table trigger)
  WARN   colon in an H2/H3/H4 heading (prefer-table trigger)
  WARN   H2 with no intro prose before a table/list/H3 (empty-section)
  WARN   inline code inside a task-list item
  WARN   forbidden Korean phrasing (번역투, standalone 축, 갈래/줄기/줄거리)
  WARN   escaped HTML entities (&lt; &gt; &amp;)
  WARN   image line without an italic caption line nearby
"""
import re
import sys

ERR = "ERROR"
WARN = "WARN"

FORBIDDEN_PHRASES = [
    "을 통해", "를 통해", "에 있어서", "에 의해", "정보에 입각한",
    "몇 안 되는", "축을 따라", "축에서", "축으로", "갈래", "줄기", "줄거리",
    "전부다", "보여 준다", "보여준다", "제공한다", "수행한다", "활용한다",
]


def strip_fences(lines):
    """Yield (lineno, text, inside_fence) for every line."""
    out = []
    infence = False
    for i, ln in enumerate(lines, 1):
        if ln.lstrip().startswith("```"):
            infence = not infence
            out.append((i, "", True))
            continue
        out.append((i, ln, infence))
    return out


def check(path):
    text = open(path, encoding="utf-8").read()
    lines = text.split("\n")
    stripped = strip_fences(lines)
    findings = []

    for i, ln, infence in stripped:
        if infence:
            continue
        if "<!--" in ln:
            findings.append((ERR, i, "HTML comment"))
        for m in re.finditer(r"</?[A-Za-z][^>\n]*>", ln):
            findings.append((ERR, i, "raw html: " + m.group(0)[:40]))
        if ln.count("**") % 2:
            findings.append((ERR, i, "unpaired ** (%d)" % ln.count("**")))
        for m in re.finditer(r"\*\*(.+?)\*\*", ln):
            span = m.group(1)
            if span[:1] in "\"'\u201c\u2018(\u300a\u300c" or span[-1:] in "\"'\u201d\u2019)\u300b\u300d":
                findings.append((WARN, i, "bold span touches quote/paren: " + span[:40]))
        if re.match(r"^\s*(?:>\s*)?-\s*\*\*[^*]+?\*\*(?:\s*\([^)]*\))?\s*:", ln):
            findings.append((WARN, i, "bullet label uses colon: " + ln.strip()[:60]))
        if re.match(r"^\s{0,3}#{2,4}\s", ln) and ":" in ln:
            findings.append((WARN, i, "colon in heading: " + ln.strip()[:60]))
        if ln.strip() == "---" and i >= 2 and lines[i - 2].strip() != "":
            findings.append((ERR, i, "no blank line before ---"))
        if re.match(r"^## ", ln) and i >= 2 and lines[i - 2].strip() != "":
            findings.append((ERR, i, "no blank line before heading"))
        if re.match(r"^\s*-\s*\[[ x]\]", ln) and "`" in ln:
            findings.append((WARN, i, "inline code inside task list item"))
        for p in FORBIDDEN_PHRASES:
            if p in ln:
                findings.append((WARN, i, "phrase: " + p))
        if "&lt;" in ln or "&gt;" in ln or "&amp;" in ln:
            findings.append((WARN, i, "escaped html entity"))

    for idx, (i, ln, infence) in enumerate(stripped):
        if infence:
            continue
        if ln.strip().startswith("!["):
            nxt = lines[i].strip() if i < len(lines) else ""
            nxt2 = lines[i + 1].strip() if i + 1 < len(lines) else ""
            if not (nxt.startswith("_") or nxt2.startswith("_")):
                findings.append((WARN, i, "image without italic caption line"))
            continue
        if re.match(r"^## ", ln):
            j = idx + 1
            while j < len(stripped) and stripped[j][1].strip() == "":
                j += 1
            if j < len(stripped):
                nxt = stripped[j][1].strip()
                if nxt.startswith(("###", "|", "- ", "* ", "```")):
                    findings.append((WARN, i, "H2 with no intro prose before: " + nxt[:40]))

    if text.count("```") % 2:
        findings.append((ERR, 0, "unbalanced code fences"))
    return findings


def main():
    bad = 0
    for path in sys.argv[1:]:
        findings = check(path)
        errs = [f for f in findings if f[0] == ERR]
        warns = [f for f in findings if f[0] == WARN]
        print("== %s | errors %d | warnings %d" % (path, len(errs), len(warns)))
        for lvl, line, msg in findings:
            print("   %-5s L%-5d %s" % (lvl, line, msg))
        if errs:
            bad = 1
    sys.exit(bad)


if __name__ == "__main__":
    main()
