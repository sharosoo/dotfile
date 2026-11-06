// Parsers for git's machine-readable output.

const MAX_FILES = 2000;
const MAX_DIFF_LINES = 3000;

// `git status --porcelain=v2 --branch --show-stash -z --no-renames`
export function parseStatus(out) {
  const head = { oid: null, branch: null, upstream: null, ahead: 0, behind: 0, stash: 0 };
  const staged = [], unstaged = [], untracked = [];
  for (const rec of out.split("\0")) {
    if (!rec) continue;
    if (rec.startsWith("# ")) {
      const space = rec.indexOf(" ", 2), key = rec.slice(2, space), val = rec.slice(space + 1);
      if (key === "branch.oid") head.oid = val === "(initial)" ? null : val;
      else if (key === "branch.head") head.branch = val === "(detached)" ? null : val;
      else if (key === "branch.upstream") head.upstream = val;
      else if (key === "branch.ab") {
        const m = /\+(\d+) -(\d+)/.exec(val);
        if (m) { head.ahead = +m[1]; head.behind = +m[2]; }
      } else if (key === "stash") head.stash = +val;
      continue;
    }
    if (staged.length + unstaged.length + untracked.length >= MAX_FILES) continue;
    const kind = rec[0];
    if (kind === "?") untracked.push({ path: rec.slice(2), code: "?" });
    else if (kind === "1") {
      const parts = rec.split(" "), xy = parts[1], path = parts.slice(8).join(" ");
      if (xy[0] !== ".") staged.push({ path, code: xy[0] });
      if (xy[1] !== ".") unstaged.push({ path, code: xy[1] });
    } else if (kind === "u") unstaged.push({ path: rec.split(" ").slice(10).join(" "), code: "U" });
  }
  return { head, staged, unstaged, untracked };
}

// Rows for drawing plus the raw pieces a hunk patch is rebuilt from. A one-file view skips the file title rows.
export function parseDiff(text, fileRows = false) {
  const rows = [], files = [], hunks = [];
  let file = null, hunk = null, old = 0, next = 0, width = 0;
  const lines = text.replace(/\n$/, "").split("\n");
  for (const raw of lines) {
    if (rows.length >= MAX_DIFF_LINES) { rows.push({ kind: "i", text: "… diff truncated" }); break; }
    if (raw.startsWith("diff --git ")) {
      const m = / b\/(.*)$/.exec(raw);
      file = { path: m ? m[1] : raw.slice(11), header: [raw] };
      files.push(file); hunk = null;
      if (fileRows) rows.push({ kind: "f", text: file.path });
      continue;
    }
    const at = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (at && file) {
      old = +at[1]; next = +at[2];
      hunk = { file: files.length - 1, start: rows.length, end: rows.length + 1, lines: [raw] };
      hunks.push(hunk);
      rows.push({ kind: "@", text: raw, hunk: hunks.length - 1 });
      continue;
    }
    if (!hunk) {
      if (file) file.header.push(raw);
      if (raw.startsWith("Binary files")) rows.push({ kind: "i", text: "Binary file changed" });
      continue;
    }
    hunk.lines.push(raw);
    const kind = raw[0], body = raw.length > 2000 ? raw.slice(1, 2000) + "…" : raw.slice(1);
    width = Math.max(width, body.length);
    const h = hunks.length - 1;
    if (kind === "+") rows.push({ kind, number: next++, text: body, hunk: h });
    else if (kind === "-") rows.push({ kind, number: old++, text: body, hunk: h });
    else if (kind === "\\") rows.push({ kind: "i", text: raw, hunk: h });
    else { old++; rows.push({ kind: " ", number: next++, text: body, hunk: h }); }
    hunk.end = rows.length;
  }
  return { rows, files, hunks, width };
}

// A whole untracked file as one addition, for preview only (it is staged as a file).
export function fileAsDiff(path, text) {
  const lines = text.replace(/\n$/, "").split("\n").slice(0, MAX_DIFF_LINES);
  return {
    rows: [{ kind: "@", text: `new file · ${lines.length} lines` }, ...lines.map((l, i) => ({ kind: "+", number: i + 1, text: l.length > 2000 ? l.slice(0, 2000) + "…" : l }))],
    files: [], hunks: [], width: Math.max(0, ...lines.map((l) => Math.min(2000, l.length))),
  };
}

export function hunkPatch(diff, index) {
  const h = diff.hunks[index];
  return h ? `${diff.files[h.file].header.join("\n")}\n${h.lines.join("\n")}\n` : null;
}

// Used with `git log -z`: NUL cannot occur in commit metadata, so every record is exactly LOG_FIELDS
// NUL-separated fields, with the free-text author and subject last.
export const LOG_FORMAT = "%H%x00%P%x00%at%x00%D%x00%an%x00%s";
const LOG_FIELDS = 6;

export function parseLog(out) {
  const parts = out.split("\0"), commits = [];
  for (let i = 0; i + LOG_FIELDS <= parts.length; i += LOG_FIELDS) {
    const [sha, parents, at, refs, author, subject] = parts.slice(i, i + LOG_FIELDS);
    commits.push({ sha: sha.replace(/^\n/, ""), parents: parents ? parents.split(" ") : [], author, at: +at, refs: parseRefs(refs), subject });
  }
  return commits;
}

// `%D`: "HEAD -> main, origin/main, tag: v1"
export function parseRefs(text) {
  if (!text) return [];
  const out = [];
  for (const part of text.split(", ")) {
    if (part.startsWith("HEAD -> ")) out.push({ name: part.slice(8), kind: "head" });
    else if (part === "HEAD") out.push({ name: "HEAD", kind: "head" });
    else if (part.startsWith("tag: ")) out.push({ name: part.slice(5), kind: "tag" });
    else if (part.endsWith("/HEAD")) continue;
    else out.push({ name: part, kind: part.includes("/") ? "remote" : "branch" });
  }
  return out;
}

export const BRANCH_FORMAT = "%(refname)%00%(refname:short)%00%(objectname)%00%(upstream:short)%00%(upstream:track,nobracket)%00%(HEAD)%00%(committerdate:unix)%00%(contents:subject)";

export function parseBranches(out) {
  const local = [], remote = [];
  for (const line of out.split("\n")) {
    if (!line) continue;
    const [ref, name, oid, upstream, track, head, at, subject] = line.split("\0");
    const sha = oid.slice(0, 7);
    if (ref.startsWith("refs/remotes/")) {
      if (ref.endsWith("/HEAD")) continue;
      remote.push({ ref, name, oid, sha, at: +at, subject });
    } else {
      const ahead = /ahead (\d+)/.exec(track ?? ""), behind = /behind (\d+)/.exec(track ?? "");
      local.push({ ref, name, oid, sha, upstream, gone: track === "gone", ahead: ahead ? +ahead[1] : 0, behind: behind ? +behind[1] : 0, current: head === "*", at: +at, subject });
    }
  }
  return { local, remote };
}

// The free-text subject is last, so a separator inside it cannot shift the fixed fields.
export const STASH_FORMAT = "%H%x1f%gd%x1f%ct%x1f%gs";

export function parseStashes(out) {
  return out.split("\n").filter(Boolean).map((line) => {
    const [oid, ref, at, ...subject] = line.split("\x1f");
    return { oid, ref, at: +at, subject: subject.join("\x1f") };
  });
}

// Only GitHub remotes get an owner/name: the PR view talks to GitHub.
export function parseRemote(url) {
  const m = /^(?:[a-z+]+:\/\/)?(?:[^@/]+@)?([^/:]+)(?::\d+)?[:/](.+?)(?:\.git)?\/?$/i.exec((url ?? "").trim());
  if (!m || !/github/i.test(m[1])) return null;
  const parts = m[2].split("/").filter(Boolean);
  return parts.length >= 2 ? parts.slice(-2).join("/") : null;
}

export function ago(seconds) {
  const s = Math.max(0, Date.now() / 1000 - seconds);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 86400 * 14) return `${Math.floor(s / 86400)}d`;
  if (s < 86400 * 60) return `${Math.floor(s / 604800)}w`;
  if (s < 86400 * 365) return `${Math.floor(s / 2592000)}mo`;
  return `${Math.floor(s / 31536000)}y`;
}
