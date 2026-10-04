# Independent second-pass proofreading for Korean technical HTML

Use this after a first localization pass when the request is to remove residual translationese, duplication, and grammar errors without changing facts or HTML.

## Review order

1. Read the current Korean and the English source together. Treat the source as the authority for scope, comparisons, modality, and causal relations.
2. Mark only defects that are independently defensible. Do not rewrite merely for taste.
3. Edit in bounded batches, then run the preservation audit after each batch. Reserve enough tool budget for a final full audit and diff review; never defer all verification until the end.
4. Re-read every changed sentence in context. A locally fluent replacement can create a duplicated predicate, alter the subject, or weaken a technical relation.
5. Finish with a source-alignment pass on comparative claims, quantities, and idioms.

## High-value Korean checks

- Remove doubled meanings: `동시에 ... 한꺼번에`, `유지해 ... 재사용에 사용한다`, `시작하여 ... 이르기까지 ... end-to-end`.
- Repair non-agent subjects: a cache type does not usually “process allocation”; the implementation does. A fix does not “omit a permission check” if the source says the check was missing from the fix.
- Replace literal spatial metaphors when they are not technical: `variance 앞에서`, `image 위에서`, `critical path에 위치한다`.
- Restore explicit comparison axes: `PP rank가 커질수록` may mean the rank number, not the parallelism scale.
- Keep source modality exact: “can”, “only”, “at most”, “roughly”, and conditional boundaries must survive polishing.
- Check English idioms that look plausible in Korean but are factually wrong. For example, `an order of magnitude lower` is not `한 자릿수 낮다`; express the multiplicative order relation without inventing a new numeral if numeric-token preservation is enforced.
- Prefer direct technical predicates over calques: `병목이 ... 어떻게 처리하는지로 이동한다` → `병목이 ... 처리로 이동한다`; `성립하지 않는다` may be `제대로 작동하지 않는다` when discussing planning models rather than logic.

## Safe editing pattern

For one-line HTML paragraphs, use exact old-to-new substring or block replacements whose source matches once. Group related replacements when possible instead of consuming one tool call per tiny edit. After each group:

- inspect the diff,
- run the structural/numeric/citation audit,
- search for newly duplicated Korean phrases,
- compare changed claims with the source.

A proofreading pass is incomplete if the final audit was not actually executed. If verification cannot run, report the work as partial rather than completed.
