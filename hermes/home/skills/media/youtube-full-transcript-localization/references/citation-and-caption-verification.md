# YouTube → Korean Artifact Hub session notes

## Verified workflow addition

When publishing a source-grounded Korean YouTube article, a complete citation pass requires all three steps: register the source in the grounded-citations ledger, append the generated `## Sources` block with `sources.py render --cited-in <draft> --replace-in <draft>`, and run `sources.py verify --strict`. Inline `[1]` markers alone are not sufficient; verification fails when the generated Sources block is missing.

## Caption-language check

`--language ko` is a preference, not proof that Korean captions were returned. Inspect the fetch result's actual `language` and `available_languages`. If the returned track is English, state that fact in the artifact or delivery note and still refine the English source into Korean rather than describing it as native Korean captions.

## Publication verification

For a small Markdown body, native `publish_artifact` is usable. Immediately canonical-read the returned artifact, then verify the cache-busted raw URL with HTTP status, distinctive phrases, and absence of literal `**` markers. The raw endpoint is rendered HTML, not source Markdown, so compare content semantically rather than byte-for-byte.