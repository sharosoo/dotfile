# Hindi (हिन्दी) translationese checklist

Read before rewriting Hindi text. Check every item, name what remains, regenerate
until clean (max 3 passes). Hindi LLM output is especially prone to literalism and to
unnecessary English borrowing, so be strict.

## Table of contents
1. English word order leakage (SOV vs SVO)
2. Pronoun overuse
3. Unnecessary English borrowing vs over-Sanskritization
4. Calqued connectives & postpositions
5. Passive & "it is" constructions
6. Honorific / politeness level (तू / तुम / आप)
7. Idiom literalism

---

## 1. English word order leakage
Hindi is verb-final (SOV). Translationese keeps English SVO rhythm and front-loads in
English order, leaving the verb stranded or the emphasis wrong.
- ✗ `यह फ़ंक्शन process करता है डेटा को सिस्टम द्वारा।`
- ✓ `यह फ़ंक्शन डेटा को सिस्टम के ज़रिए प्रोसेस करता है।`
Reorder so the verb lands at the end and objects precede it naturally.

## 2. Pronoun overuse
Hindi drops subject pronouns when the verb agreement makes them clear.
- ✗ `वह महत्वपूर्ण है और वह उपयोगकर्ता को प्रभावित करता है।`
- ✓ `यह ज़रूरी है और उपयोगकर्ता पर असर डालता है।`

## 3. Unnecessary English borrowing vs over-Sanskritization
Two opposite failure modes — pick the natural register:
- **Over-borrowing**: dumping English nouns/verbs in Latin script where common Hindi
  words exist (`change करें` when `बदलें` is natural). Everyday tech Hindi *does* use
  some English, but translationese overdoes it inconsistently.
- **Over-Sanskritization**: reaching for stiff शुद्ध हिन्दी (`संगणक`, `कुंजीपटल`) that
  no one says, when the natural word is the borrowed one (`कंप्यूटर`, `कीबोर्ड`).
Match how the actual audience speaks; honor any glossary.

## 4. Calqued connectives & postpositions
- `के संबंध में` (with respect to) — usually deletable or → `को`.
- `के माध्यम से` (through) — often → `से` or a verb.
- `के मामले में` (in the case of) — often → `में` / `पर`.
- Sentence-initial `और / लेकिन / इसके अलावा` chains read translated; use clause
  linkers (`और` mid-clause, `जबकि`, `क्योंकि`) and let verbs carry the join.

## 5. Passive & "it is" constructions
English passive and dummy "it is X" carried over literally.
- ✗ `यह सिस्टम द्वारा संभाला जाता है।` (often awkward)
- ✓ `इसे सिस्टम संभालता है।` / active reframing.
- ✗ `यह संभव है कि आप बदल सकते हैं` (it is possible that…) → ✓ `आप बदल सकते हैं।`

## 6. Honorific / politeness level
Hold one level: तू (intimate) / तुम (familiar) / आप (respectful). Translationese drifts
between them. Choose from audience and keep verb agreement consistent.

## 7. Idiom literalism
Map figurative English to the Hindi idiom, not word-for-word.
- ✗ `break the ice` → `बर्फ़ तोड़ना`
- ✓ `माहौल हल्का करना` / `शुरुआती झिझक मिटाना`

---

## Worked example (regenerate, don't patch)

**Translationese draft:**
> उपयोगकर्ता अपने account के settings को change करने में सक्षम हैं। यह security tab
> के माध्यम से access किया जा सकता है।

**Symptoms:** English-script borrowings (account/settings/change/security/tab/access)
where natural Hindi exists, `के माध्यम से`, passive `किया जा सकता है`, `सक्षम हैं`
(able to = calque), यह dummy subject, English word order.

**Native rewrite:**
> अकाउंट सेटिंग्स आप "सिक्योरिटी" टैब में बदल सकते हैं।

(Keeps the genuinely common borrowings in Devanagari, drops the calques, verb-final,
active.) Adjust borrowing level to the target audience.
