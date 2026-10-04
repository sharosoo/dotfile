---
name: technical-course-materials
description: "Use when staging courses. Fetch and verify materials."
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [courses, study, materials, repositories, technical-learning]
    related_skills: [llm-serving-study-continuity, interactive-technical-tutoring]
---

# Technical course materials

## Overview

Use this skill when the user wants a technical course investigated, its authoritative materials downloaded, and a durable study workspace prepared. It owns course reconnaissance, material acquisition, freshness verification, and study-oriented orientation. It does not own generic tutoring dialogue or assignment solution generation.

## Procedure

1. **Find the canonical offering.** Search the official course domain and owning GitHub organization. Confirm the active term, schedule, lecture links, assignment links, recording playlist, prerequisites, and course policy from the official course site.
2. **Build the repository manifest.** Include the course-site repository, lecture repository, every assignment repository linked by the active site, and explicit viewer dependencies. Exclude leaderboards, forks, and old offerings unless historical comparison is requested.
3. **Choose the workspace.** For LLM-serving-adjacent courses, use `~/workspaces/llm_serving_study/<course-slug>/`; otherwise choose a course-specific workspace. Keep repositories separate so each retains its upstream remote.
4. **Clone shallowly first.** Use `git clone --depth=1` for public repositories unless history is required. Use the active `main` branch named by upstream and preserve exact remote URLs in a manifest.
5. **Verify freshness.** For each clone, compare `git -C <repo> rev-parse HEAD` with `git ls-remote <url> refs/heads/main`. Do not call a snapshot “latest” based only on repository names, GitHub `updated_at`, or a page's cached text.
6. **Inventory materials.** Count lecture PDFs, executable lecture sources, assignment handout PDFs, tracked files, and disk usage. Read the lecture README and assignment READMEs before suggesting setup commands. Avoid downloading large datasets or provisioning GPUs during acquisition.
7. **Write durable orientation.** Create `README.md` with course scope, prerequisites, local directory map, a study sequence connected to the user's existing knowledge, setup notes, and the next concrete starting point. Create `SNAPSHOT.tsv` with repository, commit, commit date, tracked-file count, and material counts.
8. **Preserve learning integrity.** Inspect repository-local agent guidance. Organizing and downloading materials is fine; do not implement assignment TODOs, generate solutions, or run expensive course infrastructure unless explicitly requested.
9. **Report tersely.** In Discord, use bullets rather than tables. State the local path, downloaded contents, counts/size, freshness verification, intentionally omitted materials, and the first study session. Cite the official course site when describing current course content.

## Decision rules

- If the official site and repository disagree on term labels, describe the active offering according to the official site and record the repository's exact commit.
- If both executable lectures and PDFs exist, keep both because they support different study modes.
- If recordings are hosted externally, retain the official playlist reference rather than mirroring videos unless offline recordings are explicitly requested.
- If a viewer dependency is required only for traces, place it under `vendor/` and document how to connect it to the lecture repository.
- If the user already has a serving study workspace, connect the course to that workspace and explicitly map the course sections to serving concepts instead of dumping a generic syllabus.

## References

- Read `references/acquisition-checklist.md` for the concrete command sequence and verification checklist.

## Common pitfalls

- Trusting a repository's `updated_at` timestamp as the active content version; the branch head can differ from metadata and must be checked directly.
- Cloning only the lecture repository; assignment handouts and viewer dependencies are often separate repositories linked by the course site.
- Downloading recordings or datasets by default; they increase size and setup cost without improving the first study session.
- Reporting a successful download without comparing local and remote commit hashes; a shallow clone can still be stale.
- Treating course material acquisition as permission to solve assignments; the durable artifact should preserve the student's implementation work.
