# Pipeline checklist (refined talk notes + paper)

## Fetch
- [ ] Spoken language first (`ko` for Korean talks; not EN→KO by default)
- [ ] Full JSON on disk via stdout redirect (helper has no `-o`; no `head -c` as canonical)
- [ ] Record provider / language / segment_count / duration

## Editorial
- [ ] Fact spine from captions + PDF
- [ ] Main body = **refined** Korean notes (not ASR dump wall)
- [ ] No banned taxonomy-meta: `갈래`, `다섯 가지 축`, `구조/핵심 축`, bare axis-`축`, `줄기`, overused `줄거리`
- [ ] English `axis` not Korean `축` when meaning architectural axis
- [ ] If user asked korean-review: awkwardness inventory **before** rewrite
- [ ] `korean-technical-blog-rewriting` + `translationese-audit-catalog.md` polish
- [ ] Spoken↔report number/term map (e.g. SiTU-GLU vs "SiLU")
- [ ] Flesh out mechanisms; no forced backend-product metaphors

## Figures
- [ ] Crop by caption + drawings/images (not full-page `pdftoppm`)
- [ ] page_frac sanity (reject ~full-page accidents)
- [ ] Host with `cdn put --prefix <dir>` → `cdn.sharosoo.com` URLs (CLI verifies 200)
- [ ] Inline under claims; one-line source caption
- [ ] Optional video frames only if they show slides/diagrams

## Publish
- [ ] list_artifacts preflight; same `(project, slug)` on revision
- [ ] body >30KB → in-process MCP handler from v1
- [ ] Short safe `**bold**` only; no raw `<strong>`; no `**term(α)**로`
- [ ] `read_artifact` phrases + raw `<img>` / crop filenames
- [ ] Fix real linter issues; ≤2 passes on known false positives

## Discord
- [ ] vN + one-line contents + verified raw (or detail) URL only

## Linter map
| Warning | Fix |
|---|---|
| `empty-section` on H2 | prose line under H2 before `###` / table |
| `prefer-table` on numbered TOC | 2-col TOC table or drop TOC |
| `prefer-table` on `α_t:` callouts | fenced `text` formula block |
| residual single prefer-table | accept if body would suffer |
