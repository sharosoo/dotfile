# Acquisition checklist

## Discovery

- [ ] Official course site found and active offering confirmed.
- [ ] Schedule and course scope read from the official site.
- [ ] GitHub organization and active repositories identified from official links.
- [ ] Recording playlist and prerequisites recorded.

## Download

```bash
root="$HOME/workspaces/llm_serving_study/<course-slug>"
mkdir -p "$root"
git clone --depth=1 <course-site-url> "$root/course-site"
git clone --depth=1 <lectures-url> "$root/lectures"
# Repeat for each assignment repository linked by the active course site.
```

Use a small shell function for repeated clones, and keep assignment repositories under `assignments/`.

## Freshness verification

```bash
git -C "$root/<repo>" rev-parse HEAD
git ls-remote <repo-url> refs/heads/main
```

The hashes must match. For nested paths, verify the filesystem path separately before running the comparison loop.

## Inventory

```bash
git -C "$root/lectures" ls-files 'lecture_*.pdf'
git -C "$root/lectures" ls-files 'lecture_*.py'
git -C "$root/<assignment>" ls-files '*.pdf'
git -C "$root/<repo>" ls-files | wc -l
du -sh "$root"
```

Record exact commits, commit dates, tracked-file counts, lecture/handout counts, and total size in `SNAPSHOT.tsv`.

## Orientation

Read, in order:

1. Official course site schedule and prerequisites.
2. Lecture repository README.
3. Every assignment README and handout link.
4. Repository-local `AGENTS.md` or equivalent guidance.

Then write a short `README.md` that names the first lecture/assignment and connects the course to the user's existing technical track.
