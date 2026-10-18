# New-model release review articles

Shape for 정혁's "모델이 나왔는데 벤치 비교, 유저 리뷰, 구조 설명을 아티팩트 허브에 OpenUI로 리치하게" requests. It extends the house research structure in SKILL.md (H1, 한눈에 보는 결론 blockquote, meta table, numbered sections with `[n]` citations, `## Sources`). Project `default`, descriptive slug such as `<model>-review-ko`.

## Source pass (do this before writing)

Run these in parallel: vendor announcement, Hugging Face model card (it often holds the full benchmark table, license text and limitations), the HF/transformers blog, day-0 runtime blogs (vLLM, SGLang, Baseten, NVIDIA, Unsloth), the independent evaluator page (Artificial Analysis model page plus a head-to-head comparison page), press coverage with pricing tables, one large Hacker News thread, and curated r/LocalLLaMA summaries. Read the vendor's evaluation-methodology document: it says which numbers are self-run, which come from leaderboards and which harness each coding score used.

## Checkpoint / snapshot updates of an existing model

When the user names a dated suffix (a `-1017`-style snapshot) rather than a new model, confirm what actually shipped before writing:

- Search the exact suffix next to the model name. Press often reports the snapshot hours before the vendor page changes, and the stable API alias (`deepseek-flash`) may silently switch to it; say so in the article and tell readers to log the response `system_fingerprint` to know which checkpoint answered.
- Build the benchmark table from the NEW model card's own predecessor column (not the old launch table), show the delta inside the previous-version cell (`74.2 (+2.8)`), and flag every renamed benchmark/harness and every dropped row, since those are not like-for-like. Where the card and the vendor changelog disagree on the predecessor's value, name both and say which one the table uses.
- Independent evaluators lag a snapshot by days. State plainly that Artificial Analysis / DaBench / hands-on numbers belong to the previous checkpoint, and list the previous checkpoint's known failure modes (loops, verbosity, turn inflation) in a table with a 1017-status column that says "미확인" until someone re-measures. Never present the vendor's "shorter outputs" claim as a verified fix.
- A same-day community token/latency comparison is one prompt, one run, with unknown checkpoints on the other channels: report the numbers, then list what they cannot establish.
- Distillation or "feels like model X" speculation from sample outputs goes in as unconfirmed speculation with the evidence size stated.
- Same-day threads DO exist within hours (HN gets 300+ points, Reddit and X fill up). Run the multi-community pass below on the first draft; never write "no HN/Reddit thread yet" after one failed search, because the first search usually returns the base model's launch threads, not the snapshot's.

## Multi-community reaction pass (do it on the first draft, not after the user asks)

A reaction section built from one forum gets rejected ("다시 확인, X·레딧·디시 다양하게"). Cover each channel, name what was and was not readable, and put the channel's own sample size next to every claim:

- Hacker News: search `<model> <suffix> hacker news`, open the `item?id=` page with `web_extract` (comments extract in full; a duplicate-link thread may have its comments moved to the main one). Note the point/comment count at read time.
- Reddit: load `reddit-reading` and use `scripts/reddit.py search "<suffix>" --sort new` (no `--sub` filter returned results where `--sub` returned none) then `thread <url>` for the 3–4 most relevant threads; anonymous feeds give top-level comments only. `modelsentiment.com/m/<model>` gives a per-thread sentiment index and lists the largest threads, which surfaces big ones (e.g. a safety PSA) you would otherwise miss.
- X: no usable official search. Read account timelines and search through a nitter mirror (`nitter.rdrama.net/<handle>`, `.../search?f=tweets&q=<terms>`), plus `twiscan.com/en/x/<handle>` for the vendor account. Videos are not readable: say so. Separate reactions that only restate the benchmark table from reactions backed by a test. Label self-declared fans.
- Chinese-language dev forums react first and track API fingerprints: LINUX DO (`linux.do/t/topic/<id>`, tag page `linux.do/tag/<tag>/<id>` lists newest threads), V2EX, NodeLoc all extract with `web_extract`.
- DCInside 특이점이 온다 갤러리: `web_extract` returns the post body plus the gallery list; comments and image bodies are NOT extracted, and the list's titles can be cited only as titles. Search the gallery list (`lists/?id=thesingularity&s_type=search_subject_memo&s_keyword=<kw>`) for the model's Korean name. Say "제목 위주, 댓글 미확인" in the article and give those rows no weight. Check the vendor-specific minor gallery too and report if it has no recent posts.
- Hugging Face `discussions` list and `discussions/<n>`, GitHub harness discussions: bug-style reports (loops, turn inflation) live here.
- Also run a safety sweep: `<model> exfiltrate OR misaligned OR security API key`. Agent-safety reports against the predecessor checkpoint belong in their own subsection with the single-source/unreplicated caveat and a model-independent mitigation (no real keys in agent-visible env, narrow key scope, block sandbox egress).

Test-quality tiers when summarizing hands-on evidence: (1) controlled A/B on the same prompts/seeds/hardware with only the weights changed is the best evidence for a snapshot's claims; (2) multi-task pilots that hit a pass-rate ceiling show cost only; (3) single-run vendor-operated comparisons; (4) one-prompt community anecdotes and demos where a repeat of the same prompt can flip the result. State who sells API access among the testers. Distinguish output-token reductions (measured on math/short tasks) from total agent tokens (inputs re-read every turn, cache-heavy), because the two move independently.

## Section order that worked

1. Stat grid and one callout (size, active params, context, memory footprint).
2. Release timeline (OpenUI `Timeline`).
3. Architecture: spec table, parameter breakdown, each distinctive mechanism with a mermaid flow, a computed memory/KV table, modality encoders in `Tabs`.
4. Benchmarks in two layers: vendor-reported (interactive filterable table with a 판정 column) and independent measurement (native `chart` ranking, per-eval table against the closest rival, speed/price `Stat` + `Compare`). Add any small third-party hands-on test with its sample size stated.
5. User reactions as three `Card`s (welcome / criticism / contested), plus a labelled section for predecessor-model feedback when the new model has little of its own.
6. License and access, serving/deployment (hardware table, launch commands, optimization claims), a decision flowchart, and a limitations callout.

## Rules

- Keep vendor-reported and independently measured numbers in separate tables and say which is which; vendor rows with different agent harnesses are model-plus-harness comparisons, and decimal gaps need an "within noise" note.
- Recompute architecture arithmetic from the published spec instead of repeating prose: per-expert parameters = expert total ÷ (layers × experts), KV bytes per token = 2 × kv_heads × head_dim × dtype bytes × global layers (+ window-capped local layers). Where two sources disagree (an expert shape described two ways, memory 1.5 vs 1.65 TB, runtime modality support), state the discrepancy and which source the arithmetic supports.
- Label what was actually read: a curated summary of a forum is not the thread; say "largest HN thread only" and "early reactions, N days after release". Do not attribute a predecessor model's reviews to the new model.
- Cite vendor throughput claims with their operating conditions (speculative decoding, rack, "up to" values) and contrast with the independent median speed.
- Include a safety/over-refusal row when the vendor reports safety numbers; community friction often sits there.
