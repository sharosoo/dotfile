# Discord ≤ 2000-char Compression Playbook

The Discord hard limit is 2000 characters per message. For a 10-repo digest with megafics + per-repo merges/rejects/opens/issues + cross-signals, the raw note (30–45KB) is 15–20× over budget. Compression is iterative and lossy; the playbook below is the order that works in practice.

## Verification one-liner
Run after every edit:
```bash
python3 -c "import sys; t=open(sys.argv[1]).read(); print(f'{len(t)} chars', 'OK' if len(t)<=2000 else f'OVER {len(t)-2000}')" <file>
```

## Compression order (apply until ≤ 2000)
Each step has typical yield and what you lose. Apply in order; stop when ≤ 2000.

| # | Technique | Typical yield | What you lose |
|---|---|---|---|
| 1 | Drop articles ("the", "a", "an") | 5–15 chars | Nothing |
| 2 | Tighten megafic descriptions to 1 short sentence | 30–80 chars | Minor nuance |
| 3 | Compress in-line lists to `·` separator (not newlines) | 100–200 chars | Vertical breathing room |
| 4 | Abbreviate long repo names only when over budget: "FlashInfer" → "FI", "TensorRT-LLM" stays | 10–20 chars | Readability of repo in cross-signal only |
| 5 | Drop redundant glue: "main 머지 1h 후" → "main 머지 후" | 5–10 chars per occurrence | Minor temporal precision |
| 6 | Drop the bottom item from any list (5th reject → 4, 8th cross-signal → 7) | 30–60 chars | Coverage of the dropped item |
| 7 | Move file path to a single final line, drop verbosity | 10–20 chars | — |
| 8 | Last resort: drop issue list entirely | 100–200 chars | Issue coverage — only if other lists are full |

## Structural skeleton (template)

```
📡 **<Title> — YYYY-MM-DD (Day) HH:MM KST**
_24h · <N>레포 · 깊이 · m<merged> r<rejected> n<new_open> i<issues>_

🔥 메가픽 <N>건
1. **<repo> #PR1→#PR2** <1-line desc> — <system-level why>
2. **<repo> #PR1+#PR2+#PR3** <1-line desc>
3. **<repo1> #PR + <repo2> #PR** <1-line desc>
4. **<repo> #PR1→#PR2** <1-line desc>
5. **<repo> #PR1+#PR2** <1-line desc>

✅ 머지 <repo-grouped bullet list with · separator>
❌ reject <one-line bullet list, key rejects only>
🆕 new open <one-line bullet list, key signals only>
🐛 issue <one-line bullet list, key production issues only>

📌 (1) <cross-signal 1> (2) <cross-signal 2> ... (8) <cross-signal 8>

📁 `<note path>`
```

## Iteration pattern that worked (worked example)
Round 0 (raw fetcher output): 25,000+ chars (impossible)
Round 1 (drop articles, merge bullets): 3,540 chars
Round 2 (tighten megafics, drop redundant glue): 3,283 chars
Round 3 (drop last reject/new-open, abbreviate one repo): 2,788 chars
Round 4 (header "10 레포" → "10레포", drop "enterprise" in 1 spot): 2,273 chars
Round 5 (cross-signal abbreviate one item): 2,056 chars
Round 6 (final tweak to two megafics): 2,000 chars — **OK**

## Hard rules
- **Never** drop the megafics block — that's the unique value.
- **Always** keep cross-signal numbers 1–5; 6–8 are first to compress.
- **Always** keep at least one entry from each section (✅/❌/🆕/🐛). If a section is empty in the raw data, drop the section header.
- **Never** use "..." or "etc." — the user wants the real list.
- **Don't** move detail to the full note and then send a vague pointer. The Discord summary must stand on its own.

## Anti-patterns
- ❌ Sending the full note (Discord truncates at 2000 with error).
- ❌ Sending two messages without explicit `[1/2]`/`[2/2]` markers (Discord merge-as-cascade).
- ❌ Trying to fit 5 megafics with 2-sentence descriptions each (impossible at 2000).
- ❌ Using full repo names everywhere (FlashInfer × 6 × N chars is significant).
