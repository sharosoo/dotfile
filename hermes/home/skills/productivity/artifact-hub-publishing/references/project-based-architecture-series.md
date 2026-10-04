# Project-based architecture series workflow

## When to use

When the user wants a dedicated Artifact Hub **project** (not `default`) with numbered markdown documents forming a technical architecture series. Distinct from blog deepen or batch draft — this is a new project with a fresh numbering scheme.

## Observed pattern (정혁, 2026-08-22)

User explicitly rejected surface-level overviews ("너무 디테일하지 않고 표면적으로만", "내용이 빈약한데 더 상세하게") and demanded:
- **Code-level detail**: actual data models, algorithms, sequence diagrams, implementation code (Python/Go/SQL/YAML)
- **Project parameter**: `project="gpai-2.0"` (not `default`)
- **MD format**: not HTML
- **Sequential numbered slugs**: `01-auth-architecture`, `02-runtime-python-go`, etc.
- **Index artifact**: `00-architecture-index` with links to all series documents

## Workflow

1. **Create project by first publish**: `publish_artifact` with `project="gpai-2.0"` creates the project implicitly.
2. **Publish documents sequentially**: each as a separate artifact with `project` and numbered slug.
3. **Publish index last** (or update it): contains table with links to all documents.
4. **Depth requirement**: each document must contain actual implementation code, not just prose descriptions. Include:
   - SQL schemas (CREATE TABLE)
   - Python/Go class/function implementations
   - YAML deployment specs
   - ASCII architecture diagrams (```text blocks)
   - Sequence flow diagrams
   - Comparison tables with concrete data

## Pitfalls

- **Surface-level content rejected**: 정혁 explicitly corrected "표면적으로만 해놧네" — overview summaries without code are insufficient. Each section needs implementation detail.
- **Auth first**: when the user says "auth 쪽이 가장 먼저임", respect the priority ordering. Don't start with vision/overview.
- **Don't mix projects**: GPAI 2.0 docs go in `gpai-2.0` project, not `default` or `blog`.
- **Index must be updated**: after publishing new documents, update the index artifact to include them.
- **`tags` parameter works as of 2026-08-22**: verified successful on `publish_artifact` with string array. Try directly; fall back to omitting if rejected.

## Tags convention for architecture series

Use descriptive tags: `gpai-2.0`, `architecture`, plus domain-specific tags per document (e.g., `auth`, `ory-hydra`, `jwt`, `openfga` for auth docs).
