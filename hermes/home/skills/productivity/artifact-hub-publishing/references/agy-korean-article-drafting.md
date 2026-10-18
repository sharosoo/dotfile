# Drafting a full Korean article through `agy` from an English brief

Use when 정혁 asks for the Korean article (prose AND diagrams) to be written by `agy -p` from English intent, or when a Korean draft of mine reads as 번역투/AI-ish and he wants it rewritten from scratch. The point of the English brief is that agy never sees Korean source prose, so it cannot calque it.

## Procedure

1. **Write `brief.md` in English** in a scratch dir (e.g. `<scratch>/agy/`). Sections: reader and purpose; hard Artifact Hub format rules; Korean style rules (register 합니다체, banned words and outline-meta from the youtube-localization skill, no `X가 아니라 Y다` repetition, mark own inference as 추정); outline with section order; a numbered fact sheet carrying the `[n]` source numbers; diagram intent (what boxes, which arrows, numbered steps, which colors); image URLs with what each frame shows and `영상 약 m:ss` captions; the final `## Sources` list; a self-check list agy must run before replying. Give facts and numbers only from verified sources; agy fills gaps with plausible inventions.
2. **Run it in the background** (agy takes 10-25 min): `agy -p "Read <brief> completely and carry it out. Write the result to <article_ko.md>." --dangerously-skip-permissions --effort high --output-format text`, via `terminal(background=true, notify=true)`. Success means the output file exists; stdout redirect files may be missing and the exit code or an `error: interrupted` message can be unreliable, so check the file's mtime and content before rerunning.
3. **Fidelity review is mandatory, not optional.** Mechanically audit first (H1 count, fence info strings, banned words, `[n]` vs Sources, heading list, byte size, `preflight_ko_markdown.py`), then read the whole body against the fact sheet. Defects agy produced in practice:
   - plausible mechanism details with no source, or a real source cited for a claim it does not make;
   - hedged official wording hardened into fact (joining → acquired, will merge → solved);
   - a quoted person's statement paraphrased into a different claim;
   - invented thresholds, example products, and directory names;
   - English phrases pasted verbatim into Korean table cells;
   - flowery headings and a grand opening paragraph; 첫째/둘째/셋째 lists; `본 글` register;
   - diagram faults: client box drawn inside the server frame, arrows crossing boxes, step circles off their arrows, "D1:" prefixes leaking into titles;
   - html fence info string with an extra token (it must be exactly ```` ```html render ````).
4. **Reject with a numbered `fixes.md`** grouped as A facts to remove or correct (quote the offending phrase and state what the source says), B style and headings (give the replacement headings), C diagram corrections, D what to keep. Rerun agy with "apply every correction in place" so the rest of the text is untouched. Keep a copy of the previous version.
5. **Verify the rerun**: repeat the mechanical audit, re-read the changed regions, render each `html render` block standalone with headless chromium and vision-check it for overlaps. Fix small residue yourself (English leakage in tables, overclaims, `에 의해/를 통해`) rather than paying for another 10-25 min round.
6. **Publish** as `update_artifact` with `base_version` on the existing `(project, slug)`, read back byte-for-byte, and tell 정혁 plainly which defects agy introduced and which tone issues remain.
