# Architecture corpus assembly

Use this reference when a repository-grounded architecture request spans several independent concerns and a single ever-growing draft starts losing ownership, decision, or provenance boundaries.

## Core rule

Do not use the published artifact as working memory. Build and verify a local source-of-truth corpus first; assemble and publish once after review.

## Recommended shape

```text
architecture-plan/
├── README.md
├── AGENTS.md
├── docs/
│   ├── 00-concerns/          # requirement map and whole-system atlas
│   ├── 01-current-state/     # repository-grounded facts
│   ├── 02-<concern>/         # one directory per major concern
│   ├── ...
│   └── 09-migration/
├── decisions/                # accepted/rejected ADRs
├── evidence/                 # source and generated inventories, verification
├── open-questions.md
└── archive/legacy-drafts/    # preserved but non-authoritative drafts
```

Folder numbers are navigational, not ownership identifiers. Prefer class-level concerns such as memory, durable execution, collaboration, agent runtime, macroservices, deployment, and project structure.

## Workflow

1. **Freeze current evidence.** Record repository root, branch, HEAD, dirty count/state, and inspection date. Do not edit the inspected source repository.
2. **Inventory existing material.** Classify each draft as active evidence, active target design, external reference, or superseded archive. Preserve original path and SHA-256.
3. **Create a requirement map.** Give each requirement a stable family ID (`CUR-*`, `RUN-*`, `MEM-*`, etc.) and point it to the document that answers it.
4. **Use one schema across concern briefs.** Include purpose, current evidence, target owner, contracts/transports, persistence/source of truth, retries/idempotency, authorization, scaling, observability, migration, tests, forbidden dependencies, and open questions.
5. **Parallelize by non-overlapping files.** Give each researcher one concern and an exact destination path. The parent verifies the written file and official citations. Do not let multiple workers patch the same index/atlas.
6. **Wait for file stability before synthesis.** If a sibling-write guard reports a newer write, re-read and postpone the cross-document patch. Never overwrite a still-running researcher.
7. **Separate decisions from questions.** Accepted constraints go to ADRs. Product choices, thresholds, owners, and unmeasured SLOs remain in the open-question registry.
8. **Archive contradictions instead of hiding them.** Preserve the original byte-identical draft under `archive/`, update the source inventory, then remove the conflicting active copy.
9. **Generate active inventory.** Record path, lines, bytes, exact SHA-256, H1 count, and external URL count. Exclude the generated inventory itself to avoid a recursive hash.
10. **Run mechanical gates.** Require exactly one H1, balanced fences, resolving relative links, unique requirement/question/ADR IDs, registry/file agreement, no raw HTML comments, no artifact-renderer task-list pattern, no secret-shaped values, no deprecated target names, and exact generated hashes.
11. **Commit a clean local baseline.** Preserve intentional Markdown hard breaks and archived source bytes; do not rewrite provenance merely to satisfy a generic whitespace checker. Record application tests separately from documentation validation.
12. **Publish only after review.** Compile the canonical reader-facing artifact from active documents, check for unpublished human drafts/conflicts, publish once, and verify canonical/detail/rendered views.

## Evidence lanes

Keep these labels visible:

- **Current:** proven by source, schema, manifest, test, or runtime command.
- **Target:** proposed ownership, contract, migration, or deployment.
- **Reference:** external product/framework capability; not automatically selected.
- **Decision:** accepted target constraint with consequences.
- **Open question:** unresolved product, threshold, topology, owner, or SLO.
- **Archive:** provenance-only; never used as an active decision.

## Parent verification checklist

- Every required concern has a dedicated active document.
- Every target dependency boundary appears in both prose and an architecture-test gate.
- External product examples remain adapters/processors rather than domain authorities.
- Current repository paths and Git snapshot are explicit.
- Researcher-generated citations resolve to official sources.
- The inspected application repository remains unmodified.
- The local docs repository is clean and committed before publication handoff.

## Pitfalls

- Repeatedly appending corrections to one published artifact until old and new decisions coexist.
- Treating a framework or vendor product name as the bounded context.
- Keeping a superseded target ledger active merely because it contains useful historical detail.
- Allowing parallel researchers to edit the same synthesis file.
- Calling a documentation structural validator an application test suite.
- Publishing before requirement traceability, ADRs, and open questions are reconciled.
