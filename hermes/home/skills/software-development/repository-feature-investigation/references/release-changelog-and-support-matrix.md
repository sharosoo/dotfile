# Release changelog and support-matrix questions (OSS repo you follow)

Questions like "what changed recently", "changelog for package X", "does it support Python 3.16 / free-threaded / provider Y" are answered from release notes + git tags + CI config, not from memory.

## Recent-updates question

1. `gh release list -R <owner>/<repo> -L 8`, then `gh release view <tag> -R ... --json body -q .body` for the last 2-4 releases. Read all of them in one batch; release notes group Compatibility/Breaking, Features, Fixes — keep that order in the answer (breaking first).
2. Check the release notes for the user's own handle ("New Contributors" section) and cross-check with `gh pr view <n> --json title,state,mergedAt`. Mention it; the user tracks own contributions as career evidence.
3. Close with the one or two items closest to the user's active work (e.g. caching, serving, provider semantics) instead of repeating the whole list.

## Changelog for a sub-package of a monorepo

Monorepos with one version stream (one tag for all packages) have no per-package changelog and a name like "harness eval package" may not exist at all.

1. Say plainly that no package with that name exists, then map the phrase to the nearest real directories (list top-level dirs and the package's own subdirs with `git ls-tree --name-only origin/main <dir>`).
2. `git fetch -q origin` in the local clone first, then per release range: `git log <tagA>..<tagB> --format='%as %s' -- <path1> <path2> ...`. Include the matching `docs/` pages in the path filter, otherwise docs-only and alias-rename commits are lost.
3. Map a single commit to its release with `c=$(git log origin/main --format=%h -1 --grep='<subject>'); git tag --contains $c --sort=creatordate | grep '^v' | head -1`.
4. State the limits of the path filter in the answer (changes outside the filtered paths are absent) and offer to widen it.
5. Also run `<lastTag>..origin/main` to say explicitly whether unreleased work exists.

## "Does it support X?" (Python version, free-threaded build, platform)

Check all four, then answer "no / yes / installs but untested":
- packaging: `Programming Language :: Python :: 3.x` classifiers and `requires-python` in each `pyproject.toml` (a missing upper bound means it installs but is unsupported);
- CI: `git grep -n -E '<version>|<version>t|free-?thread|nogil' origin/main -- .github pyproject.toml '*/pyproject.toml' Makefile docs`;
- issues/PRs: `gh search issues|prs -R <repo> "<term>" --json number,title,state` — filter by relevance; keyword hits on dependency-bump PRs are noise, say "no relevant results" rather than citing them;
- for already-supported versions, read the CI comments for skipped legs (e.g. lowest-versions or extras skipped for missing wheels) and report them as partial-support caveats.

Do not claim wheel/ecosystem availability you did not check; label it unverified. Offer an isolated-venv test run when the question is whether it actually works.

## Answer shape the user prefers

Short Korean 반말 answer: verdict first ("지원 안 해"), then 3-4 evidence bullets (file/CI/issue search), then one unverified-caveat line. Follow-up questions in the same thread ("3.16?", "3.14t?") get the same compact shape, reusing the earlier evidence.
