---
name: tabletop-game-hero-research
description: Use when researching tabletop game heroes, cards, strategy.
---

# Tabletop game hero/card research (Guards of Atlantis II focus)

User (정혁) asks casual Korean questions mid-game-night ("별두개이하 추천", "카드 설명", "전략", "첨에 어떻게 하지"). Answer in short Korean 반말-friendly bullets, no tables (Discord). Lead with the answer, then a few bullets. If he says "한번더 조사해바", he caught a gap: re-verify from primary sources instead of repeating memory.

## Sources that work (GoA2)
- Star/complexity roster: `https://guards2.cz/` (★ Challenging / ★★ Complex / ★★★ Very Complex / ★★★★ Wizard). **The list can omit heroes (Whisper, Swift were missing)** — confirm a hero's stars from its Reference card image, never infer from pack blurbs.
- Fun ranking: SideGame "Ranking the Guards of Atlantis II Heroes" (boardgamevideo.com) — covers only the first 22 heroes; say so. Strength/winrate: BGG "DEFINITIVE HERO TIER LIST (by a noob)". Keep fun vs. strength separate in answers.
- Rules summary (turn structure, fast travel, level up): `c.tabletopia.com/games/guards-of-atlantis-ii/rules/guards-of-atlantis-ii-summary/en`.
- Card art/text: `https://www.cockeyedandcurious.com/goa2/heroes/<hero>`. Page text only has FAQ; numbers are masked. Fetch HTML with `curl -A "Mozilla/5.0"`, grep `/goa2/cards/<hero>/*.thumb.webp`, then download the full-size variant by replacing `.thumb.webp` with `.card.webp` (600x899) at `.../cards/<hero>/<Name>v2.card.webp`. `<Hero>Referencev2.card.webp` = hero board (stars, stat bars, roles). `<Hero>IVv2` = Ultimate. Names: Gold, GoldH, Silver, RedI, RedMainII/RedAltII/RedMainIII/RedAltIII, same for Blue/Green.

## Procedure
1. Fetch the hero page, list card file names, download `.card.webp` files in one terminal loop (use `-m 30` per curl; a long loop gets auto-backgrounded — wait for it before reading).
2. Run `vision_analyze` on each card in one parallel batch with the question "Transcribe exactly: name, level, type, colour, full effect text". Send MEDIA:/abs/path.webp to show images on Discord.
3. Cross-check against Gamefound pack overview text. If a vision-read card line disagrees with the publisher preview or with what the user says is printed on his physical card (e.g. whether Misa's Gold can defeat minions), do NOT build strategy on the vision text: the user's physical card wins, and a vision misread is the likelier error. Flag the conflict in one line and ask him to confirm that card before advising around it.
4. Strategy = derived from card text; label it as interpretation and say numbers are masked.

## Pitfalls
- Vision transcription of low-res cards can misread; state that text was read from images.
- Rule claims (turn order, fast travel, level-up cost) must come from the rules summary, not memory. Fast travel replaces a whole Movement action, ignores card text, needs no interfering enemies; a round = 4 turns, then minion battle → push → retrieve cards → mandatory level up (pity coin if not).
- Conditions like "enemy hero has a card in the discard" vs "empty discard" are both used (e.g. Whisper's Swift Justice targets EMPTY discard; most others need non-empty) — read each card's condition literally before claiming synergy.
- Don't state a hero's star count or role as fact before seeing the Reference card.

## Live play-by-play mode (he is mid-game)
When he reports board state ("미니언 둘다 2칸거리", "가루스는 노란거 씀"), switch to turn-by-turn coaching:
- Track which cards are already played this round (5 cards in hand, 4 turns, one action per turn; cards come back only at end of round). Re-derive the remaining hand after each report instead of reusing an earlier plan; when he corrects which card he used, restate the used/remaining lists.
- One card = one action: moving adjacent and attacking are two turns. Attack cards only hit adjacent targets unless the text says ranged.
- Fast travel needs a card with a Movement-action icon, so a Skill card can't be assumed to fast-travel; don't recommend a card for it until he confirms its icon. Ask for positions/initiative numbers (masked on fan pages) rather than guessing.
- Defender discards from hand to block, so enemy hand size after a forced discard decides whether an attack kills; say so when advising an attack.
- Keep each answer to the decision plus 2-4 bullets; he types fragments and wants the next move, not a rules lecture. Own mistakes in one line ("내가 잘못 읽었어") and fix the plan.
- Details of kill rewards, battle-zone movement and level-up rules: the GoA2 reference file of the sibling skill `tabletop-game-reference-lookup` (load it with skill_view). These two skills overlap heavily; the curator may merge them.
