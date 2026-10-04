# Caption triage, ASR-name collisions, and 누락 coverage (2026-08-30 Tech Bridge session)

Session-specific detail backing the SKILL.md variants. Source session: Tech Bridge "[한영자막] 프롬프트 작성은 그만두세요" (F_smvU3oqbU, 22:01, published 2026-08-29) → `speckit-spec-driven-development-session-ko` v1 (project `model-notes`, 13,871-char body, warnings 0).

## 1. Caption triage before fetching

A Korean-channel video can legitimately expose only `en` ASR. "[한영자막]" in the title means Korean subtitles are burned into the video, not a fetchable track. Triage before spending a fetch:

```bash
curl -sS -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36" \
  "https://www.youtube.com/watch?v=F_smvU3oqbU" -o watch.html
```

Regexes on watch.html that survived real use:

| What | Pattern |
|---|---|
| Available caption tracks | `"captionTracks":(\[.*?\])` → entries carry `languageCode`, `kind` (`asr`), localized `name` |
| Page title | `<title>(.*?)</title>` |
| Channel | `"ownerChannelName":"((?:[^"\\]|\\.)*)"` / `"author":"..."` |
| Duration | `"lengthSeconds":"(\d+)"` |
| Publish date | `"publishDate":"((?:[^"\\]|\\.)*)"` |
| Description block | `"shortDescription":"((?:[^"\\]|\\.)*)"` then JSON-string unescape |

The description block is high-value for Korean channels: Tech Bridge fills it with a Korean topic summary + hashtags, which confirms the topic vocabulary and feeds the meta table.

Meta-table wording when only `en` ASR exists: state the actual returned language AND the in-video subtitle situation — `한국어 트랙은 원본에 없고 채널이 한영자막을 제공`. Never describe the result as Korean captions.

## 2. ASR name collision with a REAL product

This ASR transcribed "Spec Kit" (github/spec-kit) as **"Spekit"** — and Spekit is a real GTM-knowledge company with its own MCP product launch. Unlike a garbage string (`로버스 need드모어된…`), searching a plausible real-product collision returns confident-looking but wrong results; search does not fail loudly.

Discriminating signal that resolved it in-session: the demo screen showed `specify init` and `/speckit.*` slash commands — on-screen artifacts beat search results. Rule: before researching any spoken product name, ground the spelling in what the demo actually showed (CLI invocations, slash commands, GitHub org/repo names, URLs on slides).

Unresolvable speaker name ("Luna Diva"): multi-web-search attempts found no matching MVP profile. Correct handling: state in the article that the name is ASR-rendered and unverified (발표자 실명은 영상 슬라이드나 세션 페이지에서 확인 필요), keep the self-introduction content (MVP, cloud native architect), never guess a profile, never silently drop it.

## 3. 누락 coverage check (user hard requirement: 누락 없이)

Programmatic check after drafting, before publish:

```python
import json
t = json.load(open('/tmp/<vid>/transcript.json'))
body = open('/tmp/<vid>/body.md', encoding='utf-8').read()
missing = []
for s in t['segments']:
    sec = int(s['start']); mm, ss = divmod(sec, 60)
    if f"{mm}:{ss:02d}" not in body:
        missing.append(f"[{mm}:{ss:02d}]")
print(len(t['segments']), missing)
```

Anchors only prove section alignment; content between anchors must still be carried in order. In-session: 22 segments → 12 sections, all anchors covered, `**` token count 4 (= 2 intact bold pairs), setext/heading-glue awk checks clean.

## 4. Resource appendix shape (언급된 리소스 보충)

When the user asks to "언급되는 리소스들 검색하여 내용추가": append a `[n]`-cited supplement section (one ### per resource) + closing 참고자료 list — matches the artifact-hub research-article house shape. Research confirmed in-session: Spec Kit README (132k stars, `uv tool install specify-cli…`, `.specify/memory/constitution.md`, full `/speckit.*` command table including clarify/checklist/analyze/converge that the talk skipped), MCP Inspector (`npx @modelcontextprotocol/inspector`), Spec Kit workflow-engine/catalog ecosystem (maintainer discussion #2372). A demo repo URL shown on screen but never spoken: flag as "자막에 URL 없음, 영상 마지막 슬라이드에서 확인" — do not invent.
