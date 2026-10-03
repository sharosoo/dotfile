# Arabic (العربية) translationese checklist

Read before rewriting Arabic text. Check every item, name what remains, regenerate
until clean (max 3 passes). Re-compose; don't patch.

## Table of contents
1. Word order (verb-first vs English SVO)
2. Pronoun overuse & weak resumption
3. English passive vs Arabic voice
4. Calqued prepositions & connectives
5. `إنّ` / `قام بـ` light-verb padding
6. Definiteness & `of` (idāfa) calques
7. Register & gender/number agreement
8. Run-on `و…و…` chains

---

## 1. Word order
Arabic naturally allows verb–subject–object (VSO); rigid English SVO with the verb
delayed reads translated. Let the verb lead where it fits.
- ✗ `المستخدم يمكنه أن يقوم بتغيير الإعدادات.`
- ✓ `يمكن للمستخدم تغيير الإعدادات.`

## 2. Pronoun overuse & weak resumption
Arabic encodes person in the verb; standalone pronouns (هو/هي/هم) for emphasis only.
Don't sprinkle them as English "it/they". Use proper attached pronouns instead.
- ✗ `هو مهم وهو يؤثر على المستخدم.` → ✓ `مهمٌّ ويؤثر على المستخدم.`

## 3. English passive vs Arabic voice
Arabic prefers active or internal passive (مبني للمجهول) over calqued `يتم + مصدر`.
`يتم`-everything is a strong machine-translation tell.
- ✗ `يتم معالجة هذه الميزة بواسطة النظام.`
- ✓ `يعالج النظام هذه الميزة.`

## 4. Calqued prepositions & connectives
- `فيما يتعلق بـ` (with respect to) — often deletable.
- `من خلال` (through) — often → `بـ` or a verb.
- `في حالة` (in the case of) — often → `إذا` / `عند`.
Match the Arabic collocation, not the English preposition.

## 5. Light-verb padding
`قام بـ + مصدر` (did the X-ing) calques English "carried out". Use the plain verb.
- ✗ `قام بإجراء تعديل` → ✓ `عدّل`
Also: dropping unneeded `أن` and `إنّ` openings that English forces.

## 6. Definiteness & idāfa
English "the/a" mapped mechanically; Arabic definiteness works via ال and idāfa
(possessive construct). "settings of the account" → idāfa `إعدادات الحساب`, not a
calqued `الإعدادات من الحساب`.
- ✗ `الإعدادات من الحساب` → ✓ `إعدادات الحساب`

## 7. Register & agreement
Hold a consistent register (MSA vs dialect; formal vs conversational). Translationese
drifts and breaks gender/number agreement (non-human plurals take feminine singular
agreement — a common slip).
- ✗ `الميزات الجديدة هم مفيدون` → ✓ `الميزات الجديدة مفيدة`.

## 8. Run-on `و…و…` chains
Over-coordination with و where Arabic would subordinate or break the sentence reads
translated. Vary the connectors (فـ، ثم، حيث، إذ).

---

## Worked example (regenerate, don't patch)

**Translationese draft:**
> المستخدمون يستطيعون أن يقوموا بتغيير الإعدادات الخاصة بحساباتهم. هذا يمكن الوصول إليه
> من خلال علامة تبويب الأمان.

**Symptoms:** delayed verb / English order, `يقوموا بـ` light verb, `الخاصة بـ` instead
of idāfa, `هذا` dummy subject, calqued passive `يمكن الوصول إليه`, `من خلال`.

**Native rewrite:**
> يمكن للمستخدم تغيير إعدادات حسابه من تبويب «الأمان».

Verb-led, idāfa, active, shorter — re-composed, not patched.
