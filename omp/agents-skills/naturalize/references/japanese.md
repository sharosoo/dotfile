# Japanese (日本語) translationese checklist

Read before rewriting Japanese text. Check every item, name what remains, regenerate
until clean (max 3 passes).

## Table of contents
1. Pronoun & subject overuse
2. Passive overuse
3. Register / politeness control (敬語・文体)
4. Written vs spoken style
5. Calqued connectives & prepositions
6. Katakana/loanword over-literalism
7. Sentence-final particles & flow

---

## 1. Pronoun & subject overuse
Japanese drops subjects and avoids personal pronouns; English forces them.
- ✗ `彼はそれが重要だと彼は考えている。`
- ✓ `重要だと考えている。`
Overused calques: 彼/彼女/それ/あなた standing in for he/she/it/you. Usually drop or
use the noun / topic marker.

## 2. Passive overuse
English passive carried over where Japanese prefers active, intransitive verbs, or
the `〜ている` resultative.
- ✗ `この機能はシステムによって処理される。`
- ✓ `この機能はシステムが処理する。` / `この機能は自動で処理される。`

## 3. Register / politeness (敬語・文体)
Natural Japanese requires consistent honorific and register control — `です・ます`
vs plain `だ・である`, and appropriate 尊敬語/謙譲語. Translationese ignores this or
mixes levels. Pick the level from audience/context and hold it throughout. This is a
primary axis of naturalness, not a detail.

## 4. Written vs spoken style
Japanese has a sharp written/spoken divide. Text destined to be *spoken* (TTS, voice,
dialogue) needs polite predicates, sentence-final particles signaling intent, and
simpler syntax; markdown-style bullet structure and nested clauses read as unnatural
when voiced. Match the channel.

## 5. Calqued connectives & prepositions
- `〜に関して / 〜について` (about) — often deletable or restructure.
- `〜を通じて` (through) — often → `〜で` or a verb.
- `〜の場合` (in the case of) — usually → `〜なら` / `〜とき`.
- Sentence-initial `そして / しかし / また` + comma chains read translated; connect
  with verb endings (`〜て`, `〜が`, `〜ので`) instead.

## 6. Katakana / loanword over-literalism
Idioms mapped to literal katakana or wrong-sense words.
- ✗ `break the ice` → `氷を砕く` (destroy the ice)
- ✓ `場を和ませる` (ease the atmosphere)
Honor any provided glossary; otherwise pick the idiomatic equivalent, not the gloss.

## 7. Sentence-final particles & flow
Natural spoken Japanese uses 終助詞 (ね・よ・か) to signal stance and softness.
Their total absence in conversational text is itself a translationese tell; their
overuse in formal writing is the opposite error. Match register.

---

## Worked example (regenerate, don't patch)

**Translationese draft:**
> ユーザーは彼らのアカウントに関する設定を変更することができます。それはセキュリ
> ティタブを通じてアクセスされることができます。

**Symptoms:** 彼らの (pronoun calque), `〜に関する`, `〜することができます` (can =
calque), それは (pronoun subject), passive `アクセスされる`, `〜を通じて`.

**Native rewrite:**
> アカウント設定は「セキュリティ」タブで変更できます。

Shorter, re-composed, register held — not spot-fixed.
