# Translationese audit catalog (정혁 technical notes)

Use when the user wants korean-review **before** rewrite. Inventory first; then patch families.

## Taxonomy / outline meta (ban)

| Avoid | Why | Prefer |
|---|---|---|
| `두 갈래`, `N갈래` | study-guide branch frame | name both mechanisms in flowing prose |
| `다섯 가지 축`, `구조 축`, `핵심 축`, bare `축`=axis | user hard ban on Korean 축-as-axis | `token/depth/channel axis` (English token) |
| `줄기`, `세 줄기` | same frame under new skin | `부분`, `주제`, or name KDA/MoE/… |
| plot-word `줄거리` overuse | movie-plot tone in tech notes | `흐름`, `개요`, or drop |
| mechanical `~쪽이다` / `쪽으로 간다` lists | branch list after banning 갈래 | concrete subject+verb per option |

## English-calque report voice

| Avoid | Prefer |
|---|---|
| `포인트는 …` | state the claim directly |
| `취지다` | `…라는 말이다` / just assert |
| `관찰이다` | `…로 보인다` / `…라고 한다` |
| `로 읽으면 된다` | `…다` / `…로 보면 된다` sparingly |
| `뉘앙스다` | `…에 가깝다` once, or drop |
| `처방이다` | `대응`, `해결`, `이렇게 잡는다` |
| `초입이다` | `첫 형태`, `시작점` |
| `동선으로 읽힌다` | drop metaphor; say purpose |
| `전장`, `본선` | drop race/war metaphor unless speaker used it as quote |
| bare section `남기는 말` | real closing judgment or omit |

## Konglish / English NP dumps

| Avoid | Prefer |
|---|---|
| long English NP + 를 (`overall scaling efficiency를`) | one Korean gloss + keep short token if needed |
| `job-like 벤치` | `업무형 벤치` or describe GDPval |
| `공개 설명은 얇다` | `설명이 거의 없다` |
| `패턴 대응이 좋아진다` | say what improves (router cases, specialization, …) |
| `조각 알고리즘` | `이런 모듈/설계` |
| `흘려 보내는 정보량` | `넘기는 값의 폭`, `보내는 차원` |

## Tone collisions

| Avoid | Prefer |
|---|---|
| sudden bare 구어 (`더 하냐`) inside 설명체 | match surrounding register |
| mid-article process meta (“자막을 바탕으로 다시 썼다”) as climax | one quiet 제작 line or omit |
| “영상에서 …고 한다” stacked hearsay | quote once or state as speaker claim |

## Process

1. Full read → table: location · phrase · why · rewrite direction.
2. User OK → rewrite families in one pass.
3. Grep remaining ban list (`갈래|줄기|줄거리|구조 축|핵심 축|포인트는|취지다`).
4. Do not “fix” 축 by introducing 줄기/쪽 meta.

Related: `youtube-full-transcript-localization`, Artifact Hub bold pitfalls in `artifact-hub-publishing`.
