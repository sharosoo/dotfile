---
name: youtube-full-transcript-localization
description: "Use when full YouTube KO transcript + Artifact Hub publish."
version: 1.2.0
metadata:
  hermes:
    tags: [youtube, transcript, korean, translation, artifact-hub]
    related_skills: [youtube-content, artifact-hub-publishing, korean-technical-blog-rewriting, documentation-translation]
---

# YouTube Full Transcript Localization

Class workflow: **YouTube URL → native-language captions → refined Korean reading notes → paper figures inline → Artifact Hub**. Discord = short link.

Fetch mechanics live in bundled `youtube-content` (protected — do not patch it). This skill owns the **editorial + paper attach + publish** shape for 정혁.

## When to use

- 원문 트랜스크립트 정리 / 누락 없이 한국어 / 리포트 첨부 / Artifact Hub
- Talk that walks a tech report / arXiv PDF
- English tool/model-usage talk with no paper behind it — refine to Korean, verify against official docs/GitHub instead of a PDF (see Variant below)
- Long body on Artifact Hub; chat = link only

Skip for short summaries/chapters only, or static markdown doc sets (`documentation-translation`).

## Hard corrections (2026-08 session — Kimi K3 / sudoremove)

1. **Spoken language first.** Korean talk → `--language ko` (or `ko,en` only as fallback). Do **not** fetch English ASR and “translate into Korean.” User will reject the detour.
2. **Refine, do not dump.** Captions are source material. Publishable body = **editorial Korean notes** (fillers cut, sentences restored, claims kept). A wall of raw `[mm:ss] ASR…` is **not** the main article. Sparse timestamps as section anchors are fine.
3. **No outline-meta framing.** Ban: `두 갈래`, `N갈래`, `다섯 가지 축`, `N가지 핵심`, `구조 축`, `핵심 축`. Same role under other skins also ban: `줄기`, overused `줄거리`, mechanical `~쪽이다` lists. Bare Korean `축` as axis → English `axis` / `token axis` (user hard preference; do not “fix” 축 by swapping in 줄기). Name mechanisms in flowing prose.
4. **Korean quality = audit then rewrite.** If user flags 번역투 / korean-review: awkwardness inventory table first, then rewrite. Load `korean-technical-blog-rewriting` + `references/translationese-audit-catalog.md`. Flesh out for LLM-familiar readers; no forced backend-product metaphors.
5. **Paper figures = cropped regions, not full pages.** `pdftoppm` whole-page embeds fail review. Crop by Figure/Table caption bbox + nearby drawings/images, white-margin trim, host publicly, place **under the paragraph that uses them**. See artifact-hub `references/pdf-figure-crop-and-host.md`.
6. **Bold sparingly for Artifact Hub.** Short `**token**` only; never `**term(α)**로` or raw `<strong>` (`no-raw-html`).

## Pipeline

1. **Fetch (file-backed).**
   ```bash
   SKILL_DIR="$HOME/.hermes/skills/media/youtube-content"
   mkdir -p /tmp/<vid>
   # Prefer spoken language. Example Korean talk:
   python3 "$SKILL_DIR/scripts/fetch_transcript.py" "URL" --language ko --timestamps > /tmp/<vid>/transcript.json
   ```
   - Helper has **no `-o`**. Redirect stdout.
   - Do not use `head -c` for the canonical dump.
   - If `ko` is thin/broken and `en` is the only complete track, say so; still **refine** into Korean notes rather than dumping EN.

2. **Build a fact spine from captions + paper.** Mechanisms, numbers, claims, speaker judgments. Pull PDF tables/eqs the talk actually hits.
   - **Disambiguate ASR-mangled names against the paper's own text.** Korean ASR garbles paper/system names heavily (observed 2026-08: `로버스 need드모어된 VL8 앤드월드 모델스` → "Robots Need More than VLA and World Models", `휴미` → HuMI, `핵스` → HEX, `프로그래서` → Progressor, `라파` → LAPA). Do not guess from memory: download the main paper's HTML (`arxiv.org/html/<id>`) or PDF → plain text, then grep candidate English spellings/phonetics near the topic (e.g. `Hacx|Hax|HEX`), and read the match's surrounding sentence to confirm role. The paper's own bibliography resolves exact names + arXiv IDs.

3. **Write one refined Markdown on disk** (often 10–40KB refined; dual full-dump bodies can hit 60–90KB — avoid unless user insists on verbatim appendix):
   - Meta table (URL, channel, duration, **actual returned caption language**, PDF links)
   - Refined Korean body by topic (not “axis” TOC)
   - Inline cropped figures + one-line source captions
   - Spoken↔report term/number map (SiTU-GLU vs “SiLU”, 2.78T vs 2.8T, …)
   - Optional: short EN or raw-KO appendix only if user asked for verbatim dump
   - 제작 메모: caption language, refine policy, crop/host paths

4. **Citations before publication.** For any source-grounded Artifact Hub article, use the `grounded-citations` ledger while drafting: reset/register the video (and any paper or official docs), cite source-derived claims inline, run `render --cited-in <draft> --replace-in <draft>` to append the canonical `## Sources` block, and run `verify --strict` before the Artifact Hub mutation. A citation marker without the generated Sources block is incomplete. If the requested `ko` track falls back to English, cite the video as the source but state the actual returned language; never describe the result as native Korean captions.

5. **Korean quality.** Natural spoken engineering Korean; keep English technical tokens. Load `korean-technical-blog-rewriting` for the polish pass. No calques, no axis meta, no AI tour-guide signposting.

6. **Images.**
   - Crop figures (pymupdf caption+drawing bbox → trim). Verify page_frac ≪ 1.0.
   - Host: 정혁 default `github.com/sharosoo/image` → `raw.githubusercontent.com/sharosoo/image/main/<dir>/...`
   - Verify HTTP 200 + bytes before embed. No `/tmp/...` paths in published MD.
   - Optional video slide frames: only when they show slides/diagrams, not talking-head spam.

6. **Publish.** Body > 30KB → **in-process arthub handler from v1**. list → update/publish same `(project,slug)` → `read_artifact` phrases → raw grep images. Fix linter one family per version; residual single `prefer-table` after two passes OK.

7. **Discord.** Version + what changed (one line) + verified raw URL.

## Variant — English talk, no paper (2026-08 Opus 5 session)

Short English talk with no arXiv/report behind it (RoboNuggets Opus 5 output-style video, 12 min → `opus5-output-style-and-skills-ko` v3, project `model-notes`):

1. **Metadata preflight**: `curl "https://www.youtube.com/oembed?url=<URL>&format=json"` — title/channel cheaply, before any transcript spend; fills the meta table.
2. **Language**: English speech → fetch with `--language ko,en`; the helper returns `en`. Refine into Korean and record the ACTUAL returned language in the meta table ("영어 자동 캡션 기반 정리, 한국어 트랙 없음") — never describe the result as Korean captions.
3. **Fact spine without a paper**: verify the talk's named artifacts against primary sources instead of a PDF — official docs (Claude Code output-styles page confirmed the system-prompt + mid-session-reminder claims) and GitHub sources (Matt Pocock `wait-what` SKILL.md). Fold confirmed facts into the body; keep speaker guesses labeled as guesses.
4. **주장의 경계 section**: split documented behavior from speaker speculation, and flag sponsor/lead-magnet content (community promo, "PDF in description") so readers can discount it.
5. **Citations**: a numbered `## Sources` list (video + primary sources actually consulted) is sufficient for a single-video note; reserve the full grounded-citations ledger for articles with many fine-grained sourced claims.
6. **Proofread the local body (typos, 조사) BEFORE the first publish** — a post-publish typo fix costs a whole artifact version (v2→v3 this session).
7. **Project**: model/tool-usage talks → `project=model-notes`, English slug `<topic>-ko` (precedents: `kimi-k3-sudoremove-transcript-ko`, `opus5-output-style-and-skills-ko`).

## Variant — re-upload of a known talk (Tech Bridge channel)

Tech Bridge re-uploads famous talks with burned-in KO subtitles; the only fetchable track is en ASR. The deliverable is still refined Korean notes, but the original talk exists and becomes the cross-check source:

1. **Find the original video.** Search speaker + talk topic + venue (course/seminar names usually appear in the re-upload's description block). Confirm identity by matching content — oembed title, duration, chapter list — never by the re-upload's title alone.
2. **Fetch both transcripts.** Anchor the article's timestamps to the re-upload (that is the URL the user shared) and use the original's transcript as a second ASR opinion wherever the re-upload garbles a name or number.
3. **State the timestamp offset** in one line near the meta table: which video the timestamps follow and how it maps to the original (e.g. the re-upload cuts the host intro, so its 0:00 = original 10:15). Re-uploads routinely trim intros; without this line every timestamp silently misleads.
4. **Verify quoted numbers at talk time.** A speaker citing a repo stat means the repo state ON THE LECTURE DATE, not today's README. Resolve via commit history (`api.github.com/repos/<org>/<repo>/commits?path=README.md&until=<lecture date>` → `raw.githubusercontent.com/<org>/<repo>/<sha>/README.md`). Mismatch can cut both ways: the ASR may have dropped the number entirely, or the repo may have corrected the value weeks after the talk.
5. **Resolution order for a garbled token:** re-upload ASR ↔ original ASR ↔ paper/repo primary text. Never "fix" a weird ASR token from memory — `raw operator` can be the correct rendering of RAW operator (Read-Arithmetic-Write, an ICL paper's appendix operator); confirm against the cited source before rewriting it.

## Pitfalls

1. EN→KO of a Korean video (user: “애초에 한국어로 얘기한 거”).
2. Raw ASR / full dual dump when user asked for **정제**.
3. `두 갈래` / `다섯 가지 축` / `줄기` / plot-`줄거리` architecture; bare `축` for axis (use English `axis`).
4. Rewriting 번역투 before listing awkward spots when user asked audit-first.
5. Full-page PDF screenshots as “figures.”
6. Figure gallery at the end only — must be inline next to claims.
7. Bundled helper has no `-o`.
8. Silent 32KB arthub truncate — in-process for large bodies.
9. H2 then table/H3 needs one prose sentence under H2.
10. Artifact Hub bold: no raw `<strong>`; keep `**…**` short; never `**term(α)**로`.
11. Writing ASR-mangled paper names into the article as-is — resolve each against the paper's own text first (grep candidate spellings), then keep the spoken↔report mapping table so the reader sees both forms.

## Verification

- [ ] Caption language matches speech (or mismatch explained)
- [ ] Main body is refined prose, not ASR wall
- [ ] No banned taxonomy-meta (`갈래`, axis-`축`, `줄기`, overused `줄거리`, …)
- [ ] If user asked korean-review: awkwardness inventory **before** rewrite
- [ ] Each key claim has nearby cropped figure or table when PDF has one
- [ ] Image URLs 200 + appear in raw HTML as `<img>`
- [ ] `read_artifact` has distinctive refined phrases + crop paths
- [ ] Discord short + correct share link

## References

- `references/pipeline-checklist.md`
- Fetch: bundled `youtube-content`
- Publish + figure crop: `artifact-hub-publishing` → `references/pdf-figure-crop-and-host.md`
- Prose: `korean-technical-blog-rewriting` → `references/translationese-audit-catalog.md`
- Tech Bridge channel quirks, ASR-name collisions, re-upload verification: `references/techbridge-caption-triage-and-asr-collision.md`
