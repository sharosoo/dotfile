---
name: tabletop-game-reference-lookup
description: Use when asked about board/card game heroes, cards or rules.
---

# Tabletop game character / card lookup

For questions like "별 N개 이하 캐릭터 추천", "이 캐릭터 어떻게 생김", "카드 특징/전략" (e.g. Guards of Atlantis II) and "이 카드게임 어케함" rules explanations. Reply in 정혁's style: Korean 반말, short, Discord markdown (no tables; bullet lists).

## Identify the game first
A vague Korean description ("실버라는 보드게임, 그렘린 카드 있는 그거") is not automatically the game this skill's reference covers. Search the distinctive card/character names plus the title word without a game name first (`board game "Silver" card "Gremlin"`); the first guess (Guards of Atlantis II) was wrong, and the real hit was Bézier's Silver Bullet. When the user then says "그냥 카드게임 알려줘", they want the whole game explained (goal, setup, turn options, scoring, card powers), not just the one card. Details for that game: `references/silver-bullet.md`.

## Rules explanation (card/board game)
1. Rulebook PDF via `web_extract` (publisher or retailer PDF; text comes out one word per line but is readable). Mirrors like board-game-rules.com carry the same rules; use `read_file` on the saved path for the truncated middle.
2. Per-card power text usually lives only in the Reference Guide card (BGG file page is not extractable). Collect powers from reviews and the publisher's blog, label them as secondary-source summaries, and mark any card whose effect you could not confirm instead of guessing.
3. When the user asks to explain "시각적으로 / 하는방법과 전략": publish a guide to Artifact Hub with OpenUI blocks (see `artifact-hub-publishing`, guide-type artifacts) — that is what 정혁 asked for when offered the choice. A quick Discord-attachable alternative is an HTML infographic rendered with `chromium --headless --no-sandbox --disable-gpu --window-size=1200,1700 --screenshot=out.png file://...` (system python has no PIL/matplotlib; Noto Sans CJK renders Korean fine); `vision_analyze` the PNG for cut-off text before sending.
4. Strategy sections are your own inference from the rules (e.g. deck average vs unknown card, penalty for failed calls); say so in the document.

## Procedure
1. **Roster / complexity / tier**: `web_search` for the game's tracker + a community tier list (BGG). A tracker page that lists heroes by star tier beats prose. Cross-check the publisher's pack announcements (Gamefound/Kickstarter updates) to place heroes missing from the tracker (e.g. infer the only 1-star hero of a pack).
2. **Recommendation**: split by complexity tier, give a 1-line role per hero, then 2-3 picks by intent (safe/win, fun, beginner). Keep win-rate sources and fun-rank sources distinct and say which is which; ask team role / mode only after giving an answer.
3. **Show what a character looks like**: `web_extract` strips images. `curl -sL -A "Mozilla/5.0" <hero page>` into `~/.hermes/cache/scratch`, then `grep -oiE '[^"]+\.(png|jpg|webp)'` for image paths; download full-size variants (`*.card.webp` over `*.thumb.webp`; a `*Reference*` card is the hero board with stars/roles). Send via `MEDIA:/abs/path.webp` (webp is accepted by Discord). Run `vision_analyze` on each file first to confirm what it shows. PIL may be missing; send webp as-is instead of converting.
4. **Card text / strategy**: fan-reference text is often masked or empty. Download every card image of the hero and `vision_analyze` each in parallel ("transcribe name, level, type, colour, effect text"). Derive strategy from card interactions (ultimate synergies, branch choice per colour) and label it as your own interpretation.

## Pitfalls
- Pre-release/announcement text can contradict the current card database (reprints change cards). Trust the latest card images and state the conflict in one line.
- Vision-read card text and masked numbers are not authoritative; say the text was read from images and numbers are hidden.
- Never state a hero's star tier or role from memory; verify against the tracker, because unverified guesses turned out wrong.

See `references/guards-of-atlantis-2.md` for site URLs and the card-image path pattern.
