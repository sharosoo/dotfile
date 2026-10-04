# Architecture Document Publishing Patterns

## Code-First Analysis Rule (정혁 hard gate)

When publishing architecture/design documents for an existing codebase:

1. **Read actual source code FIRST** — never assume architecture from project names, README summaries, or prior context. Grep for auth middleware, JWT handling, service-to-service auth, config patterns.
2. **Document the current broken state with code references** — include actual code snippets (file path + line numbers) showing problems. 정혁 wants "현재 구조가 왜 개판인지" with evidence before solutions.
3. **Then propose the target architecture** — with exact deployment commands (Helm values, kubectl exec, YAML manifests), not just diagrams.

## Depth Expectations

정혁 rejects surface-level architecture docs. Each document must include:
- Actual code snippets from the current codebase (with file paths)
- Exact deployment commands (Helm install, kubectl exec, YAML with real values)
- Service-specific implementation code (Python/Go/TypeScript examples)
- Migration phases with concrete steps
- Full flow diagrams (ASCII art, not just component boxes)

## Project Scoping for Multi-Document Series

When the user says "gpai-2.0이라는 프로젝트를 만들어서":
- Create artifacts under the specified project name (e.g., `project: "gpai-2.0"`)
- Use numbered slugs (01-..., 02-...) for series ordering
- Publish an index artifact (00-...) that links to all documents
- Update the index after each new document is published

## Auth Document Pattern

For auth architecture documents specifically:
1. Current state analysis (read actual middleware code)
2. Problem enumeration with code references
3. Why the chosen solution (comparison table)
4. Exact deployment guide (Helm, Cloud SQL proxy, Ingress YAML)
5. Login Provider implementation (actual code)
6. Per-service auth migration (Python/Go/TS code)
7. Machine Token / service-to-service auth
8. Migration phases

## Pitfalls

- **Assuming BFF exists**: Don't introduce BFF as a separate concept unless the user's codebase already has it. The current API server may BE the BFF gradually.
- **Surface-level diagrams**: Component boxes without implementation detail are rejected. Every box needs code.
- **Missing current state**: Jumping to target architecture without documenting why the current one is broken.
- **Generic deployment**: "Deploy to GKE" without exact Helm values, YAML, and kubectl commands.
