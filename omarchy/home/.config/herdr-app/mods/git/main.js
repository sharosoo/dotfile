// A gitui-style client for the focused terminal's repository: staging with hunks, a log graph, branches, stashes, PRs.
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, Scrollbar, v_virtual_list, VirtualListScrollHandle, Editor, EditorState } from "gpui-base";
import { spaces, panes, focused, exec, readTextFile, watchFolder, theme, settings, layout, nextCommand, window as appWindow } from "herdr";
import { parseStatus, parseDiff, fileAsDiff, hunkPatch, LOG_FORMAT, parseLog, BRANCH_FORMAT, parseBranches, STASH_FORMAT, parseStashes, parseRemote, ago } from "./parse.js";
import { newGraph, placeCommit, rowPaths, LANE, MAX_LANES } from "./graph.js";
import { prsInit, prsRender } from "./prs.js";

function location() {
  const space = spaces().find((s) => s.active), f = focused();
  const pane = f?.pane ? panes().find((p) => p.pane === f.pane) : null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: pane?.cwd || f?.cwd || space?.folder, on };
}
const key = () => JSON.stringify(location());

// Reads must write nothing under .git (index refresh, lock, fsmonitor cookie): the 4 s poll would
// otherwise touch repositories the person only looks at. Prefixes are pinned to a/ b/ because hunk
// patches go back through `git apply`, which a user's mnemonicPrefix/noprefix setting would break.
const READ = ["--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "diff.autoRefreshIndex=false", "-c", "core.quotepath=false",
  "-c", "color.ui=false", "-c", "diff.mnemonicPrefix=false", "-c", "diff.noprefix=false"];
const TABS = [["files", "Files"], ["status", "Status"], ["log", "Log"], ["branches", "Branches"], ["stash", "Stash"], ["prs", "PRs"]];
const LOG_PAGE = 200;
const ROW_H = 36;
const MAX_ROWS = 500;
const DIFF_H = 18;
const LANE_COLORS = ["ansi4", "ansi5", "ansi2", "ansi3", "ansi6", "ansi1", "ansi12", "ansi13", "ansi10", "ansi11", "ansi14", "ansi9"];
const SECTIONS = [["staged", "Staged"], ["unstaged", "Changes"], ["untracked", "Untracked"]];

const msg = (e) => String(e?.message ?? e).trim();
const info = (text) => ({ rows: [{ kind: "i", text }], files: [], hunks: [], width: 0 });
const mono = () => settings().font_family ?? "JetBrains Mono";
const refuse = (text) => Object.assign(new Error(text), { refused: true });
const diffArgs = (entry) => ["diff", ...(entry.section === "staged" ? ["--cached"] : []), "--no-ext-diff", "--no-textconv", "--", entry.path];

// The Files tab mirrors the built-in Files mod: same caps and preview setup, one tree per workspace.
const LANG = { ts: "js", tsx: "js", mts: "js", cts: "js", jsx: "js", mjs: "js", toml: "yaml", jsonc: "json", svelte: "html", vue: "html" };
const PER_FOLDER = 500, TOTAL = 5000, TREE_H = 28, POLL_FOLDERS = 8;
const treeKey = () => JSON.stringify({ ...location(), space: spaces().find((s) => s.active)?.id ?? null });

// Lists at most `limit` entries. find streams and stops at head's limit, where a shell glob would read and sort
// the whole folder first. Links are reported as links and never followed, so a linked folder does not expand.
async function directory(path, on, limit) {
  const windowsDirectory = async () => {
    // Windows PowerShell otherwise uses the console code page; exec decodes UTF-8.
    // Other reparse points (OneDrive's folders) have no LinkType and stay folders.
    // PowerShell reads curly single quotes as quotes too, so they're doubled like '.
    const r = await exec("powershell", ["-NoProfile", "-Command", "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); & { param($p, $n) @(Get-ChildItem -LiteralPath $p -Force -ErrorAction Stop | Where-Object Name -ne '.git' | Select-Object -First $n | ForEach-Object { @{ name=$_.Name; link=[bool]$_.LinkType; dir=($_.PSIsContainer -and -not $_.LinkType); linkDir=($_.PSIsContainer -and [bool]$_.LinkType) } }) | ConvertTo-Json -Compress } '" + path.replace(/['‘’‚‛]/g, "$&$&") + "' " + limit], { on });
    if (r.code !== 0) throw new Error(r.stderr || "Cannot list this folder");
    const result = JSON.parse(r.stdout || "[]");
    return Array.isArray(result) ? result : [result];
  };
  if (!on && appWindow()?.platform === "windows") return windowsDirectory();
  // A name with a newline splits into fragments that are not on disk; the existence test drops them.
  const script = 'cd -P -- "$1" || exit 1; find . -mindepth 1 -maxdepth 1 ! -name .git | head -n "$2" | while IFS= read -r p; do [ -e "$p" ] || [ -L "$p" ] || continue; if [ -L "$p" ]; then if [ -d "$p" ]; then kind=L; else kind=l; fi; elif [ -d "$p" ]; then kind=d; else kind=f; fi; printf "%s\\0%s\\0" "$kind" "${p#./}"; done; exit 0';
  let r;
  try { r = await exec("sh", ["-c", script, "files", path, String(limit)], { on }); }
  catch (e) {
    if (on && String(e).includes("cannot start sh: program not found")) return windowsDirectory();
    throw e;
  }
  if (r.code !== 0) throw new Error(r.stderr || "Cannot list this folder");
  const fields = r.stdout.split("\0"), out = [];
  for (let i = 0; i + 1 < fields.length; i += 2) {
    const kind = fields[i];
    out.push({ name: fields[i + 1], dir: kind === "d", link: kind === "l" || kind === "L", linkDir: kind === "L" });
  }
  return out;
}

// Hidden copies keep their timers; only poll git while this block is in the shown layout, nothing above
// it hidden, and every stack on the way showing its branch.
function visible() {
  const find = (n, path) => {
    if (!n) return null;
    if (n.content?.mod === "git") return [...path, n];
    for (const c of n.children ?? []) { const r = find(c, [...path, n]); if (r) return r; }
    return null;
  };
  const path = find(layout(), []);
  if (!path) return true;
  return path.every((n, i) => !n.hidden && !(n.type === "stack" && path[i + 1] && (n.active ?? n.children?.[0]?.id) !== path[i + 1].id));
}

// Destructive steps refuse while git itself is mid-operation: `git clean` and a worktree restore ignore
// index.lock, and discarding during a merge or rebase loses state the person still needs.
const FINISH = "Finish or abort it first.";
const BUSY_STATES = [["index.lock", "another git command holds the index (.git/index.lock). Wait for it, or remove the lock if none is running."],
  ["MERGE_HEAD", `a merge is in progress. ${FINISH}`], ["rebase-merge", `a rebase is in progress. ${FINISH}`],
  ["rebase-apply", `a rebase or am is in progress. ${FINISH}`], ["CHERRY_PICK_HEAD", `a cherry-pick is in progress. ${FINISH}`],
  ["REVERT_HEAD", `a revert is in progress. ${FINISH}`], ["BISECT_LOG", `a bisect is in progress. ${FINISH}`]];

function codeColor(t, code) {
  if (code === "A" || code === "?") return t.ansi2;
  if (code === "D" || code === "U") return t.ansi1;
  if (code === "R" || code === "C") return t.ansi4;
  return t.blocked;
}

// One letter per file, as the Files mod marks it, whatever mix of staged and unstaged codes it has.
function markFor(codes) {
  return codes.includes("?") || codes.includes("A") ? "A" : codes.includes("U") ? "U" : codes.includes("D") ? "D" : "M";
}

export default class Git extends View {
  init(_props, cx) {
    this.tab = localStorage.getItem("tab") ?? "status";
    this.logAll = localStorage.getItem("logAll") === "1";
    this.handle = cx.focus_handle();
    this.diffScroll = VirtualListScrollHandle.new();
    this.logScroll = VirtualListScrollHandle.new();
    this.seq = 0; this.gen = 0; this.logToken = 0; this.logFetching = 0; this.message = ""; this.typing = null;
    this.tree = null; this.treeSaved = new Map(); this.treeRowsShown = []; this.treeScroll = VirtualListScrollHandle.new();
    this.reset();
    this.repo = { cwd: null, root: null, remote: null };

    this.commitInput = this.input("Commit message", "commit", (cx) => this.commit(cx), (v, cx) => {
      const had = Boolean(this.message.trim());
      this.message = v;
      if (had !== Boolean(v.trim())) cx.notify();
    });
    this.branchInput = this.input("New branch from HEAD", "branch", (cx) => this.createBranch(cx));
    this.stashInput = this.input("Stash message (optional)", "stash", (cx) => this.stashPush(cx));

    prsInit(this);
    this.refresh(cx);
    cx.timer.every(4000, (cx) => { if (visible()) this.refresh(cx); });
    cx.timer.every(300, (cx) => { if (this.wantMore) { this.wantMore = false; this.loadMore(cx); } });
    cx.timer.every(10000, (cx) => this.pollTree(cx));
    cx.spawn(async (cx) => {
      for (;;) {
        if (await nextCommand() === "focus") { this.handle.focus(); this.refresh(cx, true); }
      }
    });
  }

  input(placeholder, name, submit, change) {
    const state = InputState.new({ placeholder });
    if (change) state.on("change", (_e, cx) => change(state.value(), cx));
    state.on("submit", (_e, cx) => submit(cx));
    state.on("focus", (_e, cx) => { this.typing = name; cx.notify(); });
    state.on("blur", (_e, cx) => { if (this.typing === name) this.typing = null; cx.notify(); });
    return state;
  }

  reset() {
    this.gen++;
    this.root = null; this.on = null; this.error = null; this.note = null; this.confirm = null; this.loading = false;
    this.head = null; this.status = { staged: [], unstaged: [], untracked: [] };
    this.sel = null; this.diff = null; this.diffKey = null; this.hunk = null; this.hunkKey = null;
    this.log = { commits: [], graph: newGraph(), done: false, loading: false, sig: null, width: 1, over: false };
    this.logSel = null; this.detail = null; this.wantMore = false;
    this.branches = { local: [], remote: [] }; this.branchSel = null;
    this.stashes = []; this.stashSel = null; this.stashDiff = null;
  }

  // Async work is bound to the repository it started on: results and actions are dropped once the machine,
  // root, cwd or generation (bumped by a repository switch and by every finished action) differs.
  token() { return { root: this.root, on: this.on, cwd: this.repo.cwd, gen: this.gen }; }
  same(tk) { return tk.root === this.root && tk.on === this.on && tk.cwd === this.repo.cwd && tk.gen === this.gen; }

  async gitOk(args, tk = this.token()) {
    const r = await exec("git", [...READ, ...args], { cwd: tk.root, on: tk.on });
    if (r.code !== 0) throw new Error(r.stderr.trim() || `git ${args[0]} failed`);
    return r.stdout;
  }

  refresh(cx, force = false) {
    if (force && this.tab === "files") this.refreshTree(cx);
    const loc = location(), ctx = key();
    if (!loc.cwd) {
      if (this.ctx !== ctx) { this.ctx = ctx; this.seq++; this.reset(); this.repo = { cwd: null, root: null, remote: null }; }
      return;
    }
    if (this.busy || (this.loading && this.ctx === ctx && !force)) return;
    this.ctx = ctx; this.loading = true;
    const seq = ++this.seq, live = () => this.seq === seq;
    cx.spawn(async (cx) => {
      try {
        const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd: loc.cwd, on: loc.on });
        if (!live()) return;
        if (top.code !== 0) {
          this.reset(); this.repo = { cwd: loc.cwd, root: null, remote: null }; this.error = "Not a git repository";
          return;
        }
        const root = top.stdout.replace(/\n$/, "");
        if (root !== this.root || loc.on !== this.on) {
          this.reset(); this.loading = true;
          const url = await exec("git", ["remote", "get-url", "origin"], { cwd: root, on: loc.on }).catch(() => null);
          if (!live()) return;
          this.root = root; this.on = loc.on;
          this.repo = { cwd: loc.cwd, root, remote: url?.code === 0 ? parseRemote(url.stdout) : null };
        } else if (this.repo.cwd !== loc.cwd) this.repo = { ...this.repo, cwd: loc.cwd };
        const tk = this.token();
        await this.loadStatus(live, tk);
        if (this.tab === "log") await this.checkLog(live, tk);
        else if (this.tab === "branches") await this.loadBranches(live, tk);
        else if (this.tab === "stash") await this.loadStashes(live, tk);
        if (!live()) return;
        this.error = null;
        if (this.confirm && (!this.same(this.confirm.tk) || !this.confirm.valid())) {
          this.confirm = null;
          this.note = { error: true, text: "Cancelled: what you were about to change has changed. Look again." };
        }
      } catch (e) { if (live()) this.error = msg(e); }
      finally { if (live()) this.loading = false; cx.notify(); }
    });
  }

  entries() {
    return SECTIONS.flatMap(([section]) => this.status[section].map((f) => ({ section, path: f.path, code: f.code })));
  }

  async loadStatus(live, tk) {
    const out = await this.gitOk(["status", "--porcelain=v2", "--branch", "--show-stash", "-z", "--no-renames", "--untracked-files=all"], tk);
    if (!live()) return;
    const s = parseStatus(out);
    this.head = s.head; this.status = s;
    const all = this.entries();
    if (this.sel && !all.some((e) => e.section === this.sel.section && e.path === this.sel.path)) this.sel = null;
    if (!this.sel && all.length) this.sel = all[0];
    if (this.tab === "status") await this.loadDiff(live, tk);
  }

  async loadDiff(live, tk) {
    const sel = this.sel;
    if (!sel) { this.diff = null; this.diffKey = null; this.pickHunk(null); return; }
    let diff;
    if (sel.section === "untracked") {
      const text = await readTextFile(`${tk.root}/${sel.path}`, { on: tk.on }).catch(() => null);
      diff = text === null ? info("Cannot preview this file (too large or unreadable)") : text.includes("\0") ? info("Binary file") : fileAsDiff(sel.path, text);
    } else {
      const out = await this.gitOk(diffArgs(sel), tk);
      diff = parseDiff(out);
      if (!diff.rows.length) diff = info(sel.code === "U" ? "Unmerged file: resolve it in an editor, then stage it" : "No text changes");
      diff.raw = out;
    }
    if (!live() || this.sel !== sel) return;
    const k = `${sel.section}\0${sel.path}`, same = this.diffKey === k;
    this.diff = diff; this.diffKey = k;
    // The hunk is remembered by its content, so staging another hunk cannot shift the selection onto a different one.
    const at = same && this.hunkKey !== null ? diff.hunks.findIndex((h) => h.lines.join("\n") === this.hunkKey) : -1;
    this.pickHunk(at < 0 ? null : at);
  }

  pickHunk(i) {
    this.hunk = i;
    this.hunkKey = i === null ? null : this.diff.hunks[i].lines.join("\n");
  }

  async checkLog(live, tk) {
    const refs = await this.gitOk(["for-each-ref", "--format=%(objectname) %(refname)", "refs/heads", "refs/remotes", "refs/tags"], tk);
    if (!live()) return;
    const sig = `${this.head?.oid}\n${this.logAll}\n${refs}`;
    if (sig !== this.log.sig) await this.fetchLog(live, true, sig, tk);
  }

  // A fresh fetch supersedes any page still loading; a page never cancels a fresh fetch.
  async fetchLog(live, fresh, sig, tk) {
    const base = fresh ? null : this.log;
    if (base && (base.done || base.loading || this.logFetching)) return;
    const token = fresh ? ++this.logToken : this.logToken;
    if (fresh) this.logFetching = token; else base.loading = true;
    try {
      if (!this.head?.oid) {
        if (live() && token === this.logToken) this.log = { commits: [], graph: newGraph(), done: true, loading: false, sig, width: 1, over: false };
        return;
      }
      const revs = this.logAll ? ["--branches", "--remotes", "--tags", "HEAD"] : ["HEAD"];
      const out = await this.gitOk(["log", "-z", "--topo-order", `--format=${LOG_FORMAT}`, `--skip=${base ? base.commits.length : 0}`, `-n${LOG_PAGE}`, ...revs, "--"], tk);
      if (!live() || token !== this.logToken || (base && base !== this.log)) return;
      const log = base ?? { commits: [], graph: newGraph(), done: false, loading: false, sig, width: 1, over: false };
      const page = parseLog(out);
      for (const c of page) {
        c.row = placeCommit(log.graph, c.sha, c.parents);
        c.paths = rowPaths(c.row, ROW_H);
        log.width = Math.min(MAX_LANES, Math.max(log.width, c.row.width));
        if (c.paths.hidden) log.over = true;
        log.commits.push(c);
      }
      log.done = page.length < LOG_PAGE;
      this.log = log;
      if (fresh && this.logSel && !log.commits.some((c) => c.sha === this.logSel)) this.logSel = null;
    } finally {
      if (base) base.loading = false;
      if (fresh && this.logFetching === token) this.logFetching = 0;
    }
  }

  loadMore(cx) {
    if (this.log.done || this.log.loading || this.logFetching || !this.root) return;
    const tk = this.token();
    cx.spawn(async (cx) => {
      try { await this.fetchLog(() => this.same(tk), false, undefined, tk); }
      catch (e) { if (this.same(tk)) this.note = { error: true, text: `Loading more commits failed: ${msg(e)}` }; }
      cx.notify();
    });
  }

  async loadBranches(live, tk) {
    const out = await this.gitOk(["for-each-ref", "--sort=-committerdate", `--format=${BRANCH_FORMAT}`, "refs/heads", "refs/remotes"], tk);
    if (!live()) return;
    this.branches = parseBranches(out);
    const all = [...this.branches.local, ...this.branches.remote];
    if (!all.some((b) => b.ref === this.branchSel)) this.branchSel = (this.branches.local.find((b) => b.current) ?? all[0])?.ref ?? null;
  }

  // Stashes are tracked by commit: stash@{n} names shift whenever one is pushed or dropped.
  async loadStashes(live, tk) {
    const out = await this.gitOk(["stash", "list", `-n${MAX_ROWS}`, `--format=${STASH_FORMAT}`], tk);
    if (!live()) return;
    this.stashes = parseStashes(out);
    if (!this.stashes.some((s) => s.oid === this.stashSel)) this.stashSel = this.stashes[0]?.oid ?? null;
    if (this.stashDiff?.oid !== this.stashSel) this.stashDiff = null;
    if (this.stashSel && !this.stashDiff) {
      const oid = this.stashSel, diff = parseDiff(await this.gitOk(["stash", "show", "-p", "--no-ext-diff", "--no-textconv", oid], tk), true);
      if (live() && this.stashSel === oid) this.stashDiff = { ...(diff.rows.length ? diff : info("Empty stash")), oid };
    }
  }

  // Runs `steps(git)` against the repository captured when the action was asked for. `git` throws on failure;
  // `git.patch(flags, patch)` pipes a hunk patch into `git apply`.
  act(cx, label, steps, { after, failed, guard = false, tk = this.token() } = {}) {
    if (this.busy || !tk.root) return;
    this.confirm = null;
    if (!this.same(tk)) { this.note = { error: true, text: `${label} cancelled: the repository changed. Look again.` }; cx.notify(); return; }
    const opts = { cwd: tk.root, on: tk.on };
    const check = (r, what) => {
      if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim() || `${what} exited ${r.code}`);
      return r.stdout;
    };
    const git = async (args) => check(await exec("git", args, opts), `git ${args[0]}`);
    git.patch = async (flags, patch) => check(await exec("sh", ["-c", `printf '%s' "$1" | git apply --whitespace=nowarn ${flags} -`, "git-apply", patch], opts), "git apply");
    git.sh = async (script) => check(await exec("sh", ["-c", script], opts), "sh");
    this.busy = label; this.note = null;
    cx.spawn(async (cx) => {
      let error = null;
      try {
        if (guard) await this.guard(git);
        await steps(git);
      } catch (e) { error = e; }
      const here = this.same(tk);
      this.gen++;
      if (here && !error) after?.();
      if (here && error && !failed?.(msg(error))) this.note = { error: true, text: `${label} ${error.refused ? "refused" : "failed"}: ${msg(error)}` };
      this.busy = null;
      this.refresh(cx, true);
      cx.notify();
    });
    cx.notify();
  }

  async guard(git) {
    const names = BUSY_STATES.map(([f]) => f).join(" ");
    const out = await git.sh(`d=$(git rev-parse --absolute-git-dir) || exit 1; for f in ${names}; do [ -e "$d/$f" ] && echo "$f"; done; exit 0`);
    const hit = BUSY_STATES.find(([f]) => out.split("\n").includes(f));
    if (hit) throw refuse(hit[1]);
  }

  // `valid` re-checks the target against freshly loaded state; refresh drops the confirm when it fails.
  ask(cx, text, label, steps, { valid = () => true, ...opts } = {}) {
    const tk = this.token();
    this.confirm = { text, label, tk, valid, run: (cx) => this.act(cx, label, steps, { ...opts, tk }) };
    cx.notify();
  }

  // Branch actions only touch the commit the person saw: a branch moved elsewhere since then is refused.
  async verifyRef(git, b) {
    const now = (await git(["rev-parse", "--verify", "-q", b.ref]).catch(() => "")).trim();
    if (now !== b.oid) throw refuse(`${b.name} ${now ? "moved" : "was deleted"} since it was shown. Look again.`);
  }

  branchStill(b) {
    return [...this.branches.local, ...this.branches.remote].some((x) => x.ref === b.ref && x.oid === b.oid);
  }

  stage(cx, entry = this.sel) {
    if (!entry || entry.section === "staged") return;
    this.act(cx, "Stage", (git) => git(["add", "--", entry.path]));
  }

  unstage(cx, entry = this.sel) {
    if (!entry || entry.section !== "staged") return;
    const args = this.head?.oid ? ["restore", "--staged", "--", entry.path] : ["rm", "--cached", "-q", "--", entry.path];
    this.act(cx, "Unstage", (git) => git(args));
  }

  listed(entry) {
    return this.status[entry.section].some((f) => f.path === entry.path);
  }

  discard(cx, entry = this.sel) {
    if (!entry || entry.section === "staged") return;
    if (entry.section === "untracked") {
      this.ask(cx, `Delete untracked file ${entry.path}?`, "Delete", (git) => git(["clean", "-f", "--", entry.path]), { guard: true, valid: () => this.listed(entry) });
      return;
    }
    const k = `${entry.section}\0${entry.path}`, raw = this.diffKey === k ? this.diff?.raw : undefined;
    if (raw === undefined) { this.note = { text: "Wait for the diff to load first" }; cx.notify(); return; }
    // Only the change that was on screen is discarded: if the file changed since, nothing is touched.
    this.ask(cx, `Discard changes to ${entry.path}? This cannot be undone.`, "Discard", async (git) => {
      await this.unchanged(git, entry, raw);
      await git(["restore", "--worktree", "--", entry.path]);
    }, { guard: true, valid: () => this.listed(entry) && this.diffKey === k && this.diff?.raw === raw });
  }

  async unchanged(git, entry, raw) {
    if (await git([...READ, ...diffArgs(entry)]) !== raw) throw refuse(`${entry.path} changed since it was shown. Look again.`);
  }

  hunkAction(cx, kind) {
    const sel = this.sel, patch = this.hunk === null || !this.diff ? null : hunkPatch(this.diff, this.hunk);
    if (!patch || !sel || sel.section === "untracked") return false;
    const k = this.diffKey, raw = this.diff.raw;
    if (raw === undefined) return false;
    // The patch is cut from the diff on screen, so it only applies to that exact state of the file.
    const apply = (flags) => async (git) => { await this.unchanged(git, sel, raw); await git.patch(flags, patch); };
    if (kind === "stage" && sel.section === "unstaged") this.act(cx, "Stage hunk", apply("--cached"));
    else if (kind === "unstage" && sel.section === "staged") this.act(cx, "Unstage hunk", apply("--cached -R"));
    else if (kind === "discard" && sel.section === "unstaged") {
      this.ask(cx, `Discard hunk ${this.hunk + 1} of ${sel.path}? This cannot be undone.`, "Discard hunk", apply("-R"),
        { guard: true, valid: () => this.diffKey === k && this.diff?.raw === raw });
    } else return false;
    return true;
  }

  stageAll(cx) { this.act(cx, "Stage all", (git) => git(["add", "-A"])); }

  unstageAll(cx) {
    const args = this.head?.oid ? ["reset", "-q"] : ["rm", "-r", "--cached", "-q", "."];
    this.act(cx, "Unstage all", (git) => git(args));
  }

  commit(cx) {
    const message = this.message.trim();
    if (!message || !this.status.staged.length || this.busy) return;
    this.act(cx, "Commit", (git) => git(["commit", "-m", message]), { after: () => {
      this.message = ""; this.commitInput.set_value(""); this.note = { text: "Committed" };
    } });
  }

  dirty() { return this.status.staged.length + this.status.unstaged.length > 0; }

  checkout(cx, b) {
    if (!b || b.current) return;
    let args;
    if (b.ref.startsWith("refs/remotes/")) {
      const local = b.name.slice(b.name.indexOf("/") + 1);
      args = this.branches.local.some((l) => l.name === local) ? ["switch", local] : ["switch", "--track", b.name];
    } else args = ["switch", b.name];
    const steps = async (git) => { await this.verifyRef(git, b); await git(args); };
    if (this.dirty()) this.ask(cx, `You have uncommitted changes. Check out ${b.name} anyway? Git keeps them if they don't conflict.`, "Checkout", steps, { valid: () => this.branchStill(b) });
    else this.act(cx, "Checkout", steps);
  }

  deleteBranch(cx, b) {
    if (!b || b.current || b.ref.startsWith("refs/remotes/")) return;
    const del = (flag) => async (git) => { await this.verifyRef(git, b); await git(["branch", flag, b.name]); };
    const valid = () => this.branchStill(b);
    this.ask(cx, `Delete branch ${b.name}?`, "Delete", del("-d"), { guard: true, valid, failed: (error) => {
      if (!/not fully merged/.test(error)) return false;
      this.ask(cx, `${b.name} is not fully merged. Delete it anyway? Its unmerged commits are lost.`, "Force delete", del("-D"), { guard: true, valid });
      return true;
    } });
  }

  createBranch(cx) {
    const name = this.branchInput.value().trim();
    if (!name) return;
    this.act(cx, "Create branch", (git) => git(["switch", "-c", name]), { after: () => { this.branchInput.set_value(""); this.note = { text: `Switched to new branch ${name}` }; } });
  }

  stashPush(cx) {
    const m = this.stashInput.value().trim();
    this.act(cx, "Stash", (git) => git(["stash", "push", "--include-untracked", ...(m ? ["-m", m] : [])]), { after: () => { this.stashInput.set_value(""); this.stashSel = null; this.stashDiff = null; } });
  }

  stashAction(cx, kind) {
    const s = this.stashes.find((x) => x.oid === this.stashSel);
    if (!s) return;
    const steps = async (git) => {
      const list = await git(["stash", "list", "--format=%H%x1f%gd"]);
      const ref = list.split("\n").map((l) => l.split("\x1f")).find(([oid]) => oid === s.oid)?.[1];
      if (!ref) throw refuse("that stash no longer exists. Look again.");
      await git(["stash", kind, ref]);
    };
    const done = { after: () => { this.stashSel = null; this.stashDiff = null; } };
    if (kind === "apply") this.act(cx, "Apply stash", steps);
    else if (kind === "pop") this.act(cx, "Pop stash", steps, done);
    else if (kind === "drop") this.ask(cx, `Drop ${s.ref} (${s.subject})? Its changes are lost.`, "Drop", steps, { ...done, valid: () => this.stashes.some((x) => x.oid === s.oid) });
  }

  setTab(tab, cx) {
    if (this.tab === tab) return;
    this.tab = tab; this.confirm = null; this.note = null;
    localStorage.setItem("tab", tab);
    this.refresh(cx, true);
    cx.notify();
  }

  select(entry, cx) {
    this.sel = entry; this.diff = null; this.diffKey = null; this.hunk = null; this.hunkKey = null;
    const tk = this.token();
    cx.spawn(async (cx) => {
      try { await this.loadDiff(() => this.same(tk), tk); }
      catch (e) { if (this.same(tk) && this.sel === entry) this.diff = info(`Cannot show this diff: ${msg(e)}`); }
      cx.notify();
    });
    cx.notify();
  }

  moveHunk(delta, cx) {
    const n = this.diff?.hunks.length ?? 0;
    if (!n) return;
    this.pickHunk(this.hunk === null ? (delta > 0 ? 0 : n - 1) : Math.max(0, Math.min(n - 1, this.hunk + delta)));
    this.diffScroll.scroll_to_item(this.diff.hunks[this.hunk].start, "top");
    cx.notify();
  }

  openCommit(sha, cx) {
    const c = this.log.commits.find((x) => x.sha === sha);
    if (!c) return;
    this.logSel = sha;
    this.detail = { commit: c, body: null, files: null, file: null, diff: null, tk: this.token() };
    const detail = this.detail;
    cx.spawn(async (cx) => {
      try {
        const [show, names] = await Promise.all([
          this.gitOk(["show", "-s", "--format=%an <%ae>%x00%B", sha], detail.tk),
          this.gitOk(["diff-tree", "-r", "--no-renames", "--name-status", "-z", ...this.commitRange(c)], detail.tk),
        ]);
        if (this.detail !== detail) return;
        const cut = show.indexOf("\0");
        detail.author = show.slice(0, cut); detail.body = show.slice(cut + 1).trim();
        const parts = names.split("\0"), files = [];
        for (let i = 0; i + 1 < parts.length; i += 2) files.push({ code: parts[i][0], path: parts[i + 1] });
        detail.files = files;
        if (files.length) await this.loadCommitFile(detail, files[0].path);
      } catch (e) { if (this.detail === detail) detail.diff = info(`Cannot show this commit: ${msg(e)}`); }
      cx.notify();
    });
    cx.notify();
  }

  // A merge shows what it brought into its first parent, as `git log --first-parent -p` would.
  commitRange(c) {
    return c.parents.length ? [c.parents[0], c.sha] : ["--no-commit-id", "--root", c.sha];
  }

  // Commits never change, so a detail view only needs its repository (reset() clears the view on a switch).
  async loadCommitFile(detail, path) {
    detail.file = path; detail.diff = null;
    const out = await this.gitOk(["diff-tree", "-p", "--no-renames", "--no-ext-diff", "--no-textconv", ...this.commitRange(detail.commit), "--", path], detail.tk);
    if (this.detail !== detail || detail.file !== path) return;
    const diff = parseDiff(out);
    detail.diff = diff.rows.length ? diff : info("No text changes");
  }

  pickCommitFile(path, cx) {
    const detail = this.detail;
    if (!detail || detail.file === path) return;
    cx.spawn(async (cx) => {
      try { await this.loadCommitFile(detail, path); }
      catch (e) { if (this.detail === detail) detail.diff = info(`Cannot show this diff: ${msg(e)}`); }
      cx.notify();
    });
    cx.notify();
  }

  pickStash(oid, cx) {
    if (this.stashSel === oid) return;
    this.stashSel = oid; this.stashDiff = null;
    const tk = this.token();
    cx.spawn(async (cx) => {
      try { await this.loadStashes(() => this.same(tk), tk); }
      catch (e) { if (this.same(tk) && this.stashSel === oid) this.stashDiff = { ...info(`Cannot show this stash: ${msg(e)}`), oid }; }
      cx.notify();
    });
    cx.notify();
  }

  // The tree follows the active workspace and its pane's folder, so it also lists folders outside any repository.
  // Expanded folders and the open preview are remembered per workspace and folder, as the Files mod does.
  syncTree(cx) {
    const next = treeKey();
    if (this.tree?.key === next) return this.tree;
    const old = this.tree;
    if (old) { old.code?.release(); old.code = null; this.treeSaved.set(old.key, { folders: old.folders, file: old.file, sel: old.sel }); }
    const { cwd, on } = location(), saved = this.treeSaved.get(next);
    this.tree = { key: next, cwd, on, entries: new Map(), folders: new Set(saved?.folders), dirty: new Set(), cut: new Set(),
      sel: saved?.sel ?? null, file: null, code: null, fileError: null, draining: false, drain: null, stale: false, pollAt: 0,
      error: null, watched: false, changed: new Set(), changedAll: false, flushing: false, lastChange: 0 };
    if (saved?.file) this.preview(saved.file, cx);
    return this.tree;
  }

  liveTree(tree) { return this.tree === tree && treeKey() === tree.key; }

  treeEntry(tree, path) {
    const cut = path.lastIndexOf("/"), parent = cut < 0 ? "" : path.slice(0, cut);
    return tree.entries.get(parent)?.find((e) => e.name === path.slice(cut + 1)) ?? null;
  }

  // The caps are spent before listing: a folder gets only the room left, and none is listed once the total is reached.
  async loadFolder(tree, path) {
    const room = () => Math.min(PER_FOLDER, TOTAL - [...tree.entries].filter(([p]) => p !== path).reduce((n, [, e]) => n + e.length, 0));
    const before = room();
    const entries = before > 0 ? await directory(path ? `${tree.cwd}/${path}` : tree.cwd, tree.on, before + 1) : [];
    if (!this.liveTree(tree) || (path && !tree.folders.has(path))) return;
    const keep = Math.max(0, room());
    if (before <= 0 || entries.length > keep) tree.cut.add(path); else tree.cut.delete(path);
    tree.entries.set(path, entries.slice(0, keep).sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name)));
  }

  // An open folder that is gone, or is no longer a real folder in its parent's listing, is closed instead of failing the tree.
  async reloadFolder(tree, path) {
    if (path && (!tree.folders.has(path) || !this.treeEntry(tree, path)?.dir)) { this.closeFolder(tree, path); return; }
    try { await this.loadFolder(tree, path); }
    catch (e) { if (!path) throw e; if (this.liveTree(tree)) this.closeFolder(tree, path); }
  }

  refreshTree(cx) {
    const tree = this.syncTree(cx);
    if (!tree.cwd) return;
    tree.stale = false;
    this.queueFolders(tree, ["", ...tree.folders], cx);
  }

  // One single-flight queue serves every listing (full refresh, watch flush, poll, opening a folder, reveal), so
  // relists never overlap and run in the order they were queued. Resolves once the queue is empty.
  queueFolders(tree, folders, cx) {
    for (const f of folders) if (f === "" || tree.folders.has(f)) tree.dirty.add(f);
    if (tree.draining) return tree.drain;
    if (!tree.dirty.size) return Promise.resolve();
    tree.draining = true;
    tree.drain = new Promise((done) => cx.spawn(async (cx) => {
      while (tree.dirty.size && this.liveTree(tree)) {
        const [f] = tree.dirty;
        tree.dirty.delete(f);
        try {
          await this.reloadFolder(tree, f);
          if (!f && this.liveTree(tree)) { tree.error = null; this.watchTree(tree, cx); }
        } catch (e) { if (this.liveTree(tree)) tree.error = msg(e); }
      }
      tree.draining = false;
      cx.notify();
      done();
    }));
    return tree.drain;
  }

  // A local change relists only the folders it touched (a batch naming the root means everything), and refreshes the
  // status the marks come from. Bursts are coalesced into one flush 300 ms after the last event; changes while the
  // tab is not shown leave the tree stale for the next poll.
  watchTree(tree, cx) {
    if (tree.on || tree.watched) return;
    tree.watched = true;
    cx.spawn(async (cx) => {
      try {
        while (this.tree === tree) {
          const paths = await watchFolder(tree.cwd);
          if (!this.liveTree(tree)) continue;
          if (this.tab !== "files" || !visible()) { tree.stale = true; continue; }
          const root = tree.cwd;
          for (const p of paths) {
            if (p === root || !p.startsWith(`${root}/`)) { tree.changedAll = true; break; }
            const rel = p.slice(root.length + 1), cut = rel.lastIndexOf("/");
            tree.changed.add(cut < 0 ? "" : rel.slice(0, cut));
          }
          tree.lastChange = Date.now();
          if (!tree.flushing) this.flushChanges(tree, cx);
        }
      } catch { if (this.tree === tree) tree.watched = false; }
    });
  }

  flushChanges(tree, cx) {
    tree.flushing = true;
    cx.spawn(async (cx) => {
      for (let wait = 300; wait > 0; wait = tree.lastChange + 300 - Date.now()) await cx.sleep(wait);
      tree.flushing = false;
      const dirs = tree.changedAll ? ["", ...tree.folders] : [...tree.changed];
      tree.changed = new Set(); tree.changedAll = false;
      if (!this.liveTree(tree)) return;
      this.queueFolders(tree, dirs, cx);
      this.refresh(cx);
    });
  }

  // Without a watch (another machine, or the watch was refused) a few open folders are relisted per tick, in turn.
  pollTree(cx) {
    const tree = this.tree;
    if (this.tab !== "files" || !visible() || !tree?.cwd || !this.liveTree(tree) || tree.draining) return;
    if (tree.stale) { this.refreshTree(cx); return; }
    if (tree.watched) return;
    const all = ["", ...tree.folders], start = tree.pollAt % all.length, batch = all.slice(start, start + POLL_FOLDERS);
    tree.pollAt = start + batch.length;
    this.queueFolders(tree, batch, cx);
  }

  closeFolder(tree, path) {
    for (const folder of [...tree.folders]) if (folder === path || folder.startsWith(path + "/")) {
      tree.folders.delete(folder);
      tree.entries.delete(folder);
      tree.cut.delete(folder);
    }
    if (tree.sel?.startsWith(path + "/")) tree.sel = path;
  }

  toggleFolder(path, cx) {
    const tree = this.tree;
    if (tree.folders.has(path)) this.closeFolder(tree, path);
    else if (this.treeEntry(tree, path)?.dir) {
      tree.folders.add(path);
      if (!tree.entries.has(path)) this.queueFolders(tree, [path], cx);
    }
    cx.notify();
  }

  // Previews, diffs and reveals stay inside the tree: a link, or a folder swapped for one since the listing, must not
  // reach files outside it. Null when the check itself failed. Windows without sh only knows what the listing said.
  async insideTree(tree, path) {
    const windows = async () => !this.treeEntry(tree, path)?.link;
    if (!tree.on && appWindow()?.platform === "windows") return windows();
    let r;
    try { r = await exec("sh", ["-c", 'for p; do realpath -e "$p" 2>/dev/null || realpath "$p" 2>/dev/null || exit 1; done', "realpath", tree.cwd, `${tree.cwd}/${path}`], { on: tree.on }); }
    catch (e) {
      if (tree.on && String(e).includes("cannot start sh: program not found")) return windows();
      throw e;
    }
    const [root, real] = r.stdout.split("\n");
    if (r.code !== 0 || !root || !real) return null;
    return real.startsWith(root.endsWith("/") ? root : `${root}/`);
  }

  preview(path, cx) {
    const tree = this.tree;
    tree.code?.release(); tree.code = null; tree.file = path; tree.fileError = null;
    if (path) tree.sel = path;
    if (!path || !cx) return;
    if (this.treeEntry(tree, path)?.linkDir) { tree.fileError = "Linked folder · links are not followed"; return; }
    cx.spawn(async (cx) => {
      try {
        const inside = await this.insideTree(tree, path);
        if (tree.file !== path || !this.liveTree(tree)) return;
        if (inside !== true) { tree.fileError = inside === false ? "This file resolves outside the folder · no preview" : "Cannot check where this file resolves · no preview"; return; }
        const text = await readTextFile(`${tree.cwd}/${path}`, { on: tree.on });
        if (tree.file !== path || !this.liveTree(tree)) return;
        if (text === null) { tree.fileError = "This file is no longer available"; return; }
        if (text.includes("\0")) { tree.fileError = "Binary file · no text preview"; return; }
        const t = theme(), ext = path.includes(".") ? path.split(".").pop() : "txt";
        tree.code?.release();
        tree.code = EditorState.new({ language: LANG[ext] ?? ext, readonly: true,
          value: text.length > 400000 ? text.slice(0, 400000) + "\n… (file truncated)" : text,
          font_family: settings().font_family, font_size: 12,
          syntax: { keyword: t.ansi5, string: t.ansi2, comment: t.dim, function: t.ansi4, type: t.ansi3, number: t.ansi1, constant: t.ansi6 } });
      } catch { if (tree.file === path && this.liveTree(tree)) tree.fileError = "Cannot preview this file (binary, too large, or unreadable)"; }
      finally { cx.notify(); }
    });
  }

  treeRows(tree, prefix = "", depth = 0, out = []) {
    if (out.length >= TOTAL || depth > 40) return out;
    for (const entry of tree.entries.get(prefix) ?? []) {
      if (out.length >= TOTAL) break;
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      out.push({ path, name: entry.name, dir: entry.dir, link: Boolean(entry.link), linkDir: Boolean(entry.linkDir), depth });
      if (entry.dir && tree.folders.has(path)) this.treeRows(tree, path, depth + 1, out);
    }
    return out;
  }

  // Status paths are relative to the repository root; the tree is rooted at the pane's folder, which may sit below it.
  repoPath(tree, path) {
    if (!this.root || tree.on !== this.on || this.repo.cwd !== tree.cwd) return null;
    const abs = `${tree.cwd}/${path}`;
    return abs.startsWith(`${this.root}/`) ? abs.slice(this.root.length + 1) : null;
  }

  markOf(tree, path) {
    const p = this.repoPath(tree, path);
    if (p === null) return null;
    if (this.markSource !== this.status) {
      const codes = new Map();
      for (const [section] of SECTIONS) for (const f of this.status[section]) codes.set(f.path, (codes.get(f.path) ?? "") + f.code);
      this.markSource = this.status; this.marks = new Map([...codes].map(([file, c]) => [file, markFor(c)]));
    }
    return this.marks.get(p) ?? null;
  }

  // Working-tree changes first: that is what the tree and its preview show.
  openDiff(path, cx) {
    const tree = this.tree, p = this.repoPath(tree, path);
    const find = () => { const all = this.entries(); return ["unstaged", "untracked", "staged"].map((s) => all.find((e) => e.section === s && e.path === p)).find(Boolean); };
    if (!find()) return;
    cx.spawn(async (cx) => {
      const inside = await this.insideTree(tree, path).catch(() => null);
      if (!this.liveTree(tree)) return;
      const entry = find();
      if (inside !== true) this.note = { error: true, text: inside === false ? `${path} resolves outside ${tree.cwd}; its diff is not opened` : `Cannot check where ${path} resolves; its diff is not opened` };
      else if (entry) { this.setTab("status", cx); this.select(entry, cx); }
      cx.notify();
    });
  }

  // `path` is relative to the repository root, as the status and commit lists show it.
  reveal(path, cx) {
    if (!this.root) return;
    const abs = `${this.root}/${path}`;
    this.setTab("files", cx);
    const tree = this.syncTree(cx);
    if (tree.on !== this.on || !tree.cwd || !abs.startsWith(`${tree.cwd}/`)) {
      this.note = { error: true, text: `${path} is outside ${tree.cwd ?? "this folder"}, the folder Files lists` };
      cx.notify();
      return;
    }
    const rel = abs.slice(tree.cwd.length + 1), parts = rel.split("/");
    const folders = parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join("/"));
    if (tree.file) this.preview(null);
    cx.spawn(async (cx) => {
      // A failed check (the file and its folders are gone) still reveals as far as the disk allows.
      const inside = await this.insideTree(tree, rel).catch(() => null);
      if (!this.liveTree(tree)) return;
      if (inside === false) { this.note = { error: true, text: `${path} resolves outside ${tree.cwd}, the folder Files lists` }; cx.notify(); return; }
      for (const f of folders) tree.folders.add(f);
      tree.sel = rel;
      await this.queueFolders(tree, ["", ...folders].filter((f) => !tree.entries.has(f)), cx);
      if (!this.liveTree(tree)) return;
      const i = this.treeRows(tree).findIndex((r) => r.path === rel);
      if (i >= 0) this.treeScroll.scroll_to_item(i, "center");
      else if (tree.sel === rel) this.note = { text: `${rel} is not on disk` };
      cx.notify();
    });
  }

  // Like the Log tab: the first click selects, a second click on the selected file opens it.
  clickTree(path, cx) {
    const tree = this.tree, r = this.treeRowsShown.find((x) => x.path === path);
    if (!tree || !r) return;
    if (r.dir) { tree.sel = path; this.toggleFolder(path, cx); }
    else if (tree.sel === path) this.preview(path, cx);
    else tree.sel = path;
    cx.notify();
  }

  treeKey(k, cx) {
    const tree = this.tree;
    if (!tree) return false;
    if (tree.file) {
      if (k === "escape" || k === "backspace" || k === "h" || k === "left") { this.preview(null); cx.notify(); }
      else if (k === "d") this.openDiff(tree.file, cx);
      else return false;
      return true;
    }
    const down = k === "j" || k === "down", up = k === "k" || k === "up";
    const rows = this.treeRowsShown, i = rows.findIndex((r) => r.path === tree.sel), r = rows[i];
    const pick = (j) => {
      const at = Math.max(0, Math.min(rows.length - 1, j));
      if (!rows[at]) return;
      tree.sel = rows[at].path; this.treeScroll.scroll_to_item(at, "center"); cx.notify();
    };
    if (down || up) pick(i < 0 ? 0 : i + (down ? 1 : -1));
    else if (k === "g" || k === "shift-g") pick(k === "g" ? 0 : rows.length - 1);
    else if (k === "enter" && r) { if (r.dir) this.toggleFolder(r.path, cx); else this.preview(r.path, cx); }
    else if ((k === "l" || k === "right") && r) {
      if (!r.dir) this.preview(r.path, cx);
      else if (!tree.folders.has(r.path)) this.toggleFolder(r.path, cx);
      else if (rows[i + 1]?.depth > r.depth) pick(i + 1);
    } else if ((k === "h" || k === "left") && r) {
      if (r.dir && tree.folders.has(r.path)) this.toggleFolder(r.path, cx);
      else if (r.path.includes("/")) pick(rows.findIndex((x) => x.path === r.path.slice(0, r.path.lastIndexOf("/"))));
    } else if (k === "d" && r && !r.dir) this.openDiff(r.path, cx);
    else return false;
    cx.notify();
    return true;
  }

  onKey(e, cx) {
    const k = e.keystroke;
    if (!this.handle.is_focused()) {
      // The read-only preview keeps focus for selecting and copying; Esc still leaves it.
      if (k === "escape" && (this.typing || (this.tab === "files" && this.tree?.file))) {
        if (!this.typing) this.preview(null);
        this.handle.focus(); cx.stop_propagation(); cx.notify();
      }
      return;
    }
    if (this.handleKey(k, cx)) cx.stop_propagation();
  }

  handleKey(k, cx) {
    if (this.confirm) {
      if (k === "enter" || k === "y") this.confirm.run(cx);
      else if (k === "escape" || k === "n") { this.confirm = null; cx.notify(); }
      else if (k === "r") this.refresh(cx, true);
      else return false;
      return true;
    }
    const ids = TABS.map(([id]) => id), at = ids.indexOf(this.tab);
    if (k === "tab" || k === "shift-tab") this.setTab(ids[(at + (k === "tab" ? 1 : ids.length - 1)) % ids.length], cx);
    else if (/^[1-9]$/.test(k) && ids[+k - 1]) this.setTab(ids[+k - 1], cx);
    else if (k === "r") this.refresh(cx, true);
    else return (this.tab === "files" || Boolean(this.root)) && this.keyIn(k, cx);
    return true;
  }

  keyIn(k, cx) {
    if (this.tab === "files") return this.treeKey(k, cx);
    const down = k === "j" || k === "down", up = k === "k" || k === "up";
    if (this.tab === "status") {
      const all = this.entries(), i = all.findIndex((x) => x.section === this.sel?.section && x.path === this.sel?.path);
      if (down || up) { const next = all[Math.max(0, Math.min(all.length - 1, i + (down ? 1 : -1)))]; if (next) this.select(next, cx); }
      else if (k === "s") { if (!this.hunkAction(cx, "stage")) this.stage(cx); }
      else if (k === "u") { if (!this.hunkAction(cx, "unstage")) this.unstage(cx); }
      else if (k === "enter") { if (this.sel?.section === "staged") this.unstage(cx); else this.stage(cx); }
      else if (k === "d") { if (!this.hunkAction(cx, "discard")) this.discard(cx); }
      else if (k === "a") this.stageAll(cx);
      else if (k === "c") this.commitInput.focus();
      else if (k === "shift-j" || k === "]") this.moveHunk(1, cx);
      else if (k === "shift-k" || k === "[") this.moveHunk(-1, cx);
      else if (k === "escape" && this.hunk !== null) { this.pickHunk(null); cx.notify(); }
      else return false;
      return true;
    }
    if (this.tab === "log") {
      if (this.detail) {
        const files = this.detail.files ?? [], i = files.findIndex((f) => f.path === this.detail.file);
        if (down || up) { const f = files[Math.max(0, Math.min(files.length - 1, i + (down ? 1 : -1)))]; if (f) this.pickCommitFile(f.path, cx); }
        else if (k === "escape" || k === "backspace" || k === "h") { this.detail = null; cx.notify(); }
        else return false;
        return true;
      }
      const commits = this.log.commits, i = commits.findIndex((c) => c.sha === this.logSel);
      if (down || up) {
        const j = Math.max(0, Math.min(commits.length - 1, i + (down ? 1 : -1)));
        if (commits[j]) { this.logSel = commits[j].sha; this.logScroll.scroll_to_item(j, "center"); }
        if (j >= commits.length - 10) this.loadMore(cx);
        cx.notify();
      } else if ((k === "enter" || k === "l") && this.logSel) this.openCommit(this.logSel, cx);
      else if ((k === "g" || k === "shift-g") && commits.length) {
        const j = k === "g" ? 0 : commits.length - 1;
        this.logSel = commits[j].sha; this.logScroll.scroll_to_item(j, k === "g" ? "top" : "center");
        if (k === "shift-g") this.loadMore(cx);
        cx.notify();
      }
      else if (k === "a") this.toggleAll(cx);
      else return false;
      return true;
    }
    if (this.tab === "branches") {
      const all = [...this.branches.local, ...this.branches.remote], i = all.findIndex((b) => b.ref === this.branchSel), b = all[i];
      if (down || up) { const n = all[Math.max(0, Math.min(all.length - 1, i + (down ? 1 : -1)))]; if (n) { this.branchSel = n.ref; cx.notify(); } }
      else if (k === "enter" || k === "space") this.checkout(cx, b);
      else if (k === "n") this.branchInput.focus();
      else if (k === "shift-d") this.deleteBranch(cx, b);
      else return false;
      return true;
    }
    if (this.tab === "stash") {
      const i = this.stashes.findIndex((s) => s.oid === this.stashSel);
      if (down || up) { const s = this.stashes[Math.max(0, Math.min(this.stashes.length - 1, i + (down ? 1 : -1)))]; if (s) this.pickStash(s.oid, cx); }
      else if (k === "a") this.stashAction(cx, "apply");
      else if (k === "p") this.stashAction(cx, "pop");
      else if (k === "shift-d") this.stashAction(cx, "drop");
      else if (k === "s") this.stashPush(cx);
      else return false;
      return true;
    }
    return false;
  }

  toggleAll(cx) {
    this.logAll = !this.logAll;
    localStorage.setItem("logAll", this.logAll ? "1" : "0");
    this.detail = null;
    this.refresh(cx, true);
    cx.notify();
  }

  button(t, id, label, action, { kind = "plain", disabled = false, tip } = {}) {
    const fg = disabled ? t.dim : kind === "primary" ? t.solid_foreground : kind === "danger" ? t.ansi1 : t.foreground;
    const bg = disabled ? t.raised : kind === "primary" ? t.solid : kind === "danger" ? t.ansi1 + "1f" : t.raised;
    return div().id(id).h(22).px(8).flex().flex_none().items_center().rounded(5).text_size(11).bg(bg).text_color(fg)
      .when(Boolean(tip), (el) => el.tooltip(tip))
      .when(!disabled, (el) => el.cursor_pointer().hover((s) => s.bg(kind === "primary" ? t.solid : t.hover)).on_click((e, cx) => { cx.stop_propagation(); action(e, cx); }))
      .child(label);
  }

  field(t, id, state, name) {
    return div().id(id).flex_1().min_w(0).h(28).px(8).flex().items_center().rounded(6).border_1()
      .border_color(this.typing === name ? t.accent : t.border).cursor_text()
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .child(Input.new(state).h_full().text_size(12).text_color(t.foreground));
  }

  badge(t, ref) {
    const c = ref.kind === "head" ? t.accent : ref.kind === "tag" ? t.ansi3 : ref.kind === "remote" ? t.ansi5 : t.ansi2;
    return div().flex_none().px(4).h(14).flex().items_center().rounded(3).border_1().border_color(c).text_color(c).text_size(9.5).child(ref.name);
  }

  header(t) {
    const h = this.head, name = this.root?.split("/").pop() ?? "Git";
    const branch = h ? h.branch ?? `detached @ ${h.oid?.slice(0, 7) ?? "?"}` : null;
    return h_flex().h(38).flex_none().px(12).gap(8).items_center().border_b(1).border_color(t.border)
      .child(div().font_semibold().text_size(13).flex_none().child(name))
      .when(Boolean(branch), (el) => el.child(div().min_w(0).truncate().px(6).py(1).rounded(4).bg(t.accent + "22").text_color(t.accent).text_size(11).child(branch)))
      .when(Boolean(h?.ahead), (el) => el.child(div().flex_none().text_size(11).text_color(t.ansi2).tooltip(`${h.ahead} to push to ${h.upstream}`).child(`↑${h.ahead}`)))
      .when(Boolean(h?.behind), (el) => el.child(div().flex_none().text_size(11).text_color(t.ansi3).tooltip(`${h.behind} to pull from ${h.upstream}`).child(`↓${h.behind}`)))
      .child(div().flex_1())
      .when(Boolean(this.busy), (el) => el.child(div().text_size(11).text_color(t.dim).child(`${this.busy}…`)))
      .child(div().id("git-refresh").px(6).h(24).flex().items_center().rounded(5).text_color(t.muted).cursor_pointer().tooltip("Refresh (r)")
        .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_click((_e, cx) => this.refresh(cx, true))
        .child(svg("mods/git/refresh.svg").size(13).text_color(this.loading ? t.accent : t.muted)));
  }

  tabsBar(t) {
    const s = this.status;
    const changes = new Set([...s.staged, ...s.unstaged, ...s.untracked].map((e) => e.path)).size;
    const count = { status: changes, stash: this.head?.stash ?? 0 };
    return h_flex().h(30).flex_none().px(6).items_end().border_b(1).border_color(t.border).children(TABS.map(([id, label], i) => {
      const active = this.tab === id;
      return h_flex().id(`tab-${id}`).h_full().px(8).gap(4).items_center().border_b(2).border_color(active ? t.accent : t.background)
        .text_size(12).text_color(active ? t.foreground : t.muted).cursor_pointer().tooltip(`${label} (${i + 1})`)
        .hover((s) => s.text_color(t.foreground)).on_click((_e, cx) => this.setTab(id, cx))
        .child(label)
        .when(Boolean(count[id]), (el) => el.child(div().px(4).rounded(6).bg(t.raised).text_size(10).text_color(t.muted).child(String(count[id]))));
    }));
  }

  footer(t) {
    return v_flex().flex_none()
      .when(Boolean(this.confirm), (el) => el.child(h_flex().mx(8).mt(6).p(8).gap(6).items_center().rounded(6).border_1().border_color(t.ansi1).bg(t.ansi1 + "14")
        .child(div().flex_1().min_w(0).text_size(11).child(this.confirm.text))
        .child(this.button(t, "confirm-yes", this.confirm.label, (_e, cx) => this.confirm?.run(cx), { kind: "danger", tip: "Enter" }))
        .child(this.button(t, "confirm-no", "Cancel", (_e, cx) => { this.confirm = null; cx.notify(); }, { tip: "Esc" }))))
      .when(Boolean(this.note), (el) => el.child(h_flex().px(10).py(5).gap(6).items_start()
        .child(div().flex_1().min_w(0).text_size(11).text_color(this.note.error ? t.ansi1 : t.dim).child(this.note.text))
        .child(div().id("note-close").text_color(t.dim).cursor_pointer().on_click((_e, cx) => { this.note = null; cx.notify(); }).child("×"))));
  }

  diffRow(r, t, hunk) {
    const on = hunk !== null && hunk !== undefined && r.hunk === hunk;
    if (r.kind === "f") return div().h(DIFF_H).w_full().px(8).bg(t.raised).font_semibold().truncate().child(r.text);
    if (r.kind === "@") return div().h(DIFF_H).w_full().px(8).truncate().bg(on ? t.selected : t.raised).text_color(on ? t.foreground : t.dim).child(r.text);
    if (r.kind === "i") return div().h(DIFF_H).w_full().px(8).truncate().text_color(t.dim).child(r.text);
    const sign = r.kind === "+" ? t.ansi2 : r.kind === "-" ? t.ansi1 : t.dim;
    return h_flex().h(DIFF_H).w_full().gap(6)
      .when(on, (el) => el.border_l(2).border_color(t.accent)).when(!on, (el) => el.pl(2))
      .when(r.kind === "+", (el) => el.bg(t.ansi2 + "1c")).when(r.kind === "-", (el) => el.bg(t.ansi1 + "1c"))
      .child(div().w(32).flex_none().text_right().text_color(t.dim).child(String(r.number)))
      .child(div().w(8).flex_none().text_color(sign).child(r.kind === " " ? "" : r.kind))
      .child(div().flex_1().min_w(0).truncate().child(r.text.replace(/\t/g, "    ")));
  }

  diffPane(t, id, diff, { hunk = null, pick, empty = "Select a file" } = {}) {
    const rows = diff?.rows ?? [], width = Math.max(280, (diff?.width ?? 0) * 7 + 70);
    let list = v_virtual_list(id, rows.length, DIFF_H, (i) => String(i), (range) => rows.slice(range.start, range.end).map((r) => this.diffRow(r, t, hunk))).size_full();
    if (id === "status-diff") list = list.track_scroll(this.diffScroll);
    if (pick) list = list.on_item_click((k, cx) => pick(rows[+k], cx));
    return div().flex_1().min_h(0).relative().font_family(mono()).text_size(11)
      .child(div().id(`${id}-x`).size_full().overflow_x_scrollbar().child(div().w_full().min_w(width).h_full().child(list)))
      .child(Scrollbar.vertical(id).absolute().inset_0())
      .when(!rows.length, (el) => el.child(div().absolute().top(8).left(0).px(12).text_color(t.dim).child(diff === null ? empty : "Loading…")));
  }

  statusPane(t) {
    const s = this.status, sel = this.sel, rows = [];
    for (const [section, title] of SECTIONS) {
      const files = s[section];
      if (!files.length) continue;
      const staged = section === "staged";
      rows.push(h_flex().h(24).flex_none().px(10).gap(6).items_center().text_size(10.5).text_color(t.muted)
        .child(div().font_semibold().child(`${title.toUpperCase()}  ${files.length}`))
        .child(div().flex_1())
        .child(div().id(`all-${section}`).px(4).rounded(4).cursor_pointer().hover((st) => st.bg(t.hover).text_color(t.foreground))
          .on_click((_e, cx) => staged ? this.unstageAll(cx) : this.stageAll(cx)).child(staged ? "Unstage all" : "Stage all")));
      for (const f of files.slice(0, MAX_ROWS)) {
        const entry = { section, path: f.path, code: f.code }, on = sel?.section === section && sel.path === f.path;
        const slash = f.path.lastIndexOf("/");
        rows.push(h_flex().id(`f-${section}-${f.path}`).h(24).flex_none().px(10).gap(6).items_center().rounded(5).cursor_pointer()
          .when(on, (el) => el.bg(t.selected)).hover((st) => st.bg(on ? t.selected : t.hover))
          .on_click((e, cx) => { if (e.click_count === 2) staged ? this.unstage(cx, entry) : this.stage(cx, entry); else this.select(entry, cx); })
          .child(div().w(10).flex_none().font_family(mono()).text_size(11).text_color(codeColor(t, f.code)).child(f.code))
          .child(h_flex().flex_1().min_w(0)
            .child(div().min_w(0).truncate().text_color(t.dim).child(slash >= 0 ? f.path.slice(0, slash + 1) : ""))
            .child(div().flex_none().max_w(240).truncate().child(f.path.slice(slash + 1))))
          .child(div().id(`fr-${section}-${f.path}`).w(18).h(18).flex().flex_none().items_center().justify_center().rounded(4).text_color(t.muted)
            .tooltip("Show in files").hover((st) => st.bg(t.raised).text_color(t.foreground))
            .on_click((_e, cx) => { cx.stop_propagation(); this.reveal(f.path, cx); }).child(svg("mods/files/folder.svg").size(12)))
          .child(div().id(`fa-${section}-${f.path}`).w(18).h(18).flex().flex_none().items_center().justify_center().rounded(4).text_color(t.muted)
            .tooltip(staged ? "Unstage (u)" : "Stage (s)").hover((st) => st.bg(t.raised).text_color(t.foreground))
            .on_click((_e, cx) => { cx.stop_propagation(); staged ? this.unstage(cx, entry) : this.stage(cx, entry); }).child(staged ? "−" : "+")));
      }
    }
    const height = this.size?.height ?? 640, listH = Math.max(56, Math.min(rows.length * 24 + 8, height * 0.38));
    const list = v_flex().id("status-files").h(listH).flex_none().p(4).overflow_y_scrollbar().children(rows)
      .when(!rows.length, (el) => el.child(div().p(8).text_color(t.dim).child(this.loading && !this.head ? "Loading…" : "Working tree clean")));

    const d = this.diff, hunks = d?.hunks.length ?? 0, h = this.hunk;
    const toolbar = h_flex().h(32).flex_none().px(8).gap(6).items_center().border_t(1).border_b(1).border_color(t.border);
    if (sel && h !== null) {
      toolbar.child(div().id("hunk-clear").text_color(t.muted).cursor_pointer().tooltip("Back to the whole file (Esc)").on_click((_e, cx) => { this.pickHunk(null); cx.notify(); }).child("×"))
        .child(div().flex_1().min_w(0).truncate().text_size(11).child(`Hunk ${h + 1} of ${hunks}`))
        .when(sel.section === "unstaged", (el) => el.child(this.button(t, "hunk-stage", "Stage hunk", (_e, cx) => this.hunkAction(cx, "stage"), { tip: "s" }))
          .child(this.button(t, "hunk-discard", "Discard", (_e, cx) => this.hunkAction(cx, "discard"), { kind: "danger", tip: "d" })))
        .when(sel.section === "staged", (el) => el.child(this.button(t, "hunk-unstage", "Unstage hunk", (_e, cx) => this.hunkAction(cx, "unstage"), { tip: "u" })));
    } else if (sel) {
      toolbar.child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.muted).child(sel.path))
        .when(hunks > 1, (el) => el.child(div().text_size(10.5).text_color(t.dim).tooltip("Click a hunk, or Shift-J / Shift-K").child(`${hunks} hunks`)))
        .when(sel.section !== "staged", (el) => el.child(this.button(t, "file-stage", "Stage", (_e, cx) => this.stage(cx), { tip: "s" }))
          .child(this.button(t, "file-discard", sel.section === "untracked" ? "Delete" : "Discard", (_e, cx) => this.discard(cx), { kind: "danger", tip: "d" })))
        .when(sel.section === "staged", (el) => el.child(this.button(t, "file-unstage", "Unstage", (_e, cx) => this.unstage(cx), { tip: "u" })));
    } else toolbar.child(div().text_size(11).text_color(t.dim).child("No file selected"));

    const canCommit = Boolean(this.message.trim()) && s.staged.length > 0 && !this.busy;
    return v_flex().flex_1().min_h(0)
      .child(list).child(toolbar)
      .child(this.diffPane(t, "status-diff", d, { hunk: h, empty: sel ? "Loading…" : "Nothing to show",
        pick: (r, cx) => { if (r?.hunk !== undefined && sel?.section !== "untracked") { this.pickHunk(this.hunk === r.hunk && r.kind === "@" ? null : r.hunk); cx.notify(); } } }))
      .child(this.footer(t))
      .child(h_flex().flex_none().p(8).gap(6).border_t(1).border_color(t.border)
        .child(this.field(t, "commit-message", this.commitInput, "commit"))
        .child(this.button(t, "commit", "Commit", (_e, cx) => this.commit(cx), { kind: "primary", disabled: !canCommit,
          tip: s.staged.length ? "Commit staged changes (Enter)" : "Stage changes first" })));
  }

  commitRow(c, t, log, selected) {
    const r = c.row, p = c.paths, lane = (i) => t[LANE_COLORS[i % LANE_COLORS.length]];
    const layer = (path, color) => window.paint_path(path, color).absolute().top(0).left(0).size_full();
    const graph = div().relative().w(log.width * LANE + 3).h(ROW_H).flex_none().overflow_hidden()
      .children([
        ...p.lines.map((l) => layer(l.path, lane(l.color))),
        ...(c.sha === this.head?.oid ? [layer(p.ring, t.accent)] : []),
        layer(p.dot, lane(r.color)),
        ...(r.merge ? [layer(p.hole, selected ? t.selected : t.background)] : []),
      ]);
    const refs = c.refs.slice(0, 3);
    return h_flex().h(ROW_H).w_full().pl(4).pr(10).gap(4).when(selected, (el) => el.bg(t.selected))
      .child(graph)
      .when(log.over, (el) => el.child(div().w(18).flex_none().pt(3).font_family(mono()).text_size(9).text_color(t.dim)
        .child(p.hidden ? `+${p.hidden}` : "")))
      .child(v_flex().flex_1().min_w(0).h_full().pt(2)
        .child(h_flex().h(17).gap(4).min_w(0).items_center()
          .children(refs.map((x) => this.badge(t, x)))
          .when(c.refs.length > 3, (el) => el.child(div().text_size(10).text_color(t.dim).child(`+${c.refs.length - 3}`)))
          .child(div().flex_1().min_w(0).truncate().child(c.subject)))
        .child(h_flex().h(15).gap(6).min_w(0).items_center().text_size(10.5).text_color(t.dim)
          .child(div().flex_none().font_family(mono()).child(c.sha.slice(0, 7)))
          .child(div().flex_1().min_w(0).truncate().child(c.author))
          .child(div().flex_none().child(ago(c.at)))));
  }

  logPane(t) {
    if (this.detail) return this.detailPane(t);
    const log = this.log, commits = log.commits, count = commits.length + (log.done ? 0 : 1), lanes = log.width;
    const toolbar = h_flex().h(30).flex_none().px(8).gap(6).items_center().border_b(1).border_color(t.border)
      .child(h_flex().rounded(5).bg(t.raised).p(2).gap(2).children([["HEAD", false], ["All branches", true]].map(([label, all]) =>
        div().id(`log-${all ? "all" : "head"}`).px(6).h(18).flex().items_center().rounded(4).text_size(11).cursor_pointer()
          .bg(this.logAll === all ? t.background : t.raised).text_color(this.logAll === all ? t.foreground : t.muted)
          .tooltip("Toggle with a").on_click((_e, cx) => { if (this.logAll !== all) this.toggleAll(cx); }).child(label))))
      .child(div().flex_1())
      .child(div().text_size(11).text_color(t.dim).child(log.done ? `${commits.length} commits` : `${commits.length}+ commits`));
    const list = v_virtual_list("log", count, ROW_H, (i) => commits[i]?.sha ?? "more", (range) => {
      if (!log.done && range.end >= commits.length - 10) this.wantMore = true;
      const out = [];
      for (let i = range.start; i < range.end; i++) {
        const c = commits[i];
        out.push(c ? this.commitRow(c, t, log, c.sha === this.logSel)
          : div().h(ROW_H).w_full().px(12).flex().items_center().text_size(11).text_color(t.dim).child("Loading more…"));
      }
      return out;
    }).size_full().track_scroll(this.logScroll).on_item_click((k, cx) => {
      if (k === "more") return;
      if (this.logSel === k) this.openCommit(k, cx); else { this.logSel = k; cx.notify(); }
    });
    return v_flex().flex_1().min_h(0)
      .child(toolbar)
      .child(div().flex_1().min_h(0).relative().child(list).child(Scrollbar.vertical("log").absolute().inset_0())
        .when(!commits.length, (el) => el.child(div().absolute().top(8).left(0).px(12).text_color(t.dim)
          .child(!this.head ? "Loading…" : !this.head.oid ? "No commits yet" : log.done ? "No commits" : "Loading…"))))
      .child(this.footer(t));
  }

  detailPane(t) {
    const d = this.detail, c = d.commit, files = d.files ?? [];
    const body = (d.body ?? "").split("\n").slice(1).join("\n").trim();
    const fileRows = files.slice(0, 1000).map((f) => {
      const on = d.file === f.path;
      return h_flex().id(`cf-${f.path}`).h(22).flex_none().px(10).gap(6).items_center().rounded(5).cursor_pointer()
        .when(on, (el) => el.bg(t.selected)).hover((s) => s.bg(on ? t.selected : t.hover))
        .on_click((_e, cx) => this.pickCommitFile(f.path, cx))
        .child(div().w(10).flex_none().font_family(mono()).text_size(11).text_color(codeColor(t, f.code)).child(f.code))
        .child(div().flex_1().min_w(0).truncate().text_size(11.5).child(f.path))
        .child(div().id(`cfr-${f.path}`).w(18).h(18).flex().flex_none().items_center().justify_center().rounded(4).text_color(t.muted)
          .tooltip("Show in files").hover((s) => s.bg(t.raised).text_color(t.foreground))
          .on_click((_e, cx) => { cx.stop_propagation(); this.reveal(f.path, cx); }).child(svg("mods/files/folder.svg").size(12)));
    });
    const height = this.size?.height ?? 640;
    return v_flex().flex_1().min_h(0)
      .child(h_flex().h(30).flex_none().px(8).gap(8).items_center().border_b(1).border_color(t.border)
        .child(div().id("detail-back").px(4).rounded(4).text_color(t.muted).cursor_pointer().tooltip("Back (Esc)").hover((s) => s.bg(t.hover).text_color(t.foreground))
          .on_click((_e, cx) => { this.detail = null; cx.notify(); }).child("←"))
        .child(div().font_family(mono()).text_size(11).text_color(t.muted).child(c.sha.slice(0, 10)))
        .child(div().flex_1())
        .child(div().text_size(11).text_color(t.dim).child(`${ago(c.at)} ago`)))
      .child(v_flex().flex_none().px(12).py(8).gap(4).border_b(1).border_color(t.border)
        .when(c.refs.length > 0, (el) => el.child(h_flex().gap(4).flex_wrap().children(c.refs.map((x) => this.badge(t, x)))))
        .child(div().font_semibold().child(c.subject))
        .child(div().text_size(11).text_color(t.dim).child(`${d.author ?? c.author} · ${new Date(c.at * 1000).toLocaleString()}${c.parents.length > 1 ? ` · merge of ${c.parents.length}` : ""}`))
        .when(Boolean(body), (el) => el.child(div().id("detail-body").h(Math.min(90, body.split("\n").length * 15 + 2)).overflow_y_scrollbar().text_size(11).text_color(t.muted).child(body))))
      .child(v_flex().id("detail-files").flex_none().h(Math.min(Math.max(1, files.length) * 22 + 8, Math.max(60, height * 0.22))).p(4).overflow_y_scrollbar().border_b(1).border_color(t.border).children(fileRows)
        .when(d.files !== null && !files.length, (el) => el.child(div().p(6).text_size(11).text_color(t.dim).child("No file changes")))
        .when(d.files === null, (el) => el.child(div().p(6).text_size(11).text_color(t.dim).child("Loading…"))))
      .child(this.diffPane(t, "commit-diff", d.diff, { empty: files.length ? "Loading…" : "" }))
      .child(this.footer(t));
  }

  branchesPane(t) {
    const rows = [], sel = this.branchSel;
    const section = (title, n) => rows.push(div().h(24).flex_none().px(10).flex().items_center().text_size(10.5).font_semibold().text_color(t.muted).child(`${title.toUpperCase()}  ${n}`));
    const row = (b, remote) => {
      const on = sel === b.ref;
      rows.push(h_flex().id(`b-${b.ref}`).h(26).flex_none().px(10).gap(6).items_center().rounded(5).cursor_pointer()
        .when(on, (el) => el.bg(t.selected)).hover((s) => s.bg(on ? t.selected : t.hover))
        .on_click((e, cx) => { this.branchSel = b.ref; if (e.click_count === 2) this.checkout(cx, b); cx.notify(); })
        .child(div().w(10).flex_none().text_color(t.accent).child(b.current ? "●" : ""))
        .child(div().flex_1().min_w(0).truncate().when(Boolean(b.current), (el) => el.font_semibold().text_color(t.accent)).child(b.name))
        .when(Boolean(b.ahead), (el) => el.child(div().flex_none().text_size(10.5).text_color(t.ansi2).tooltip(`${b.ahead} ahead of ${b.upstream}`).child(`↑${b.ahead}`)))
        .when(Boolean(b.behind), (el) => el.child(div().flex_none().text_size(10.5).text_color(t.ansi3).tooltip(`${b.behind} behind ${b.upstream}`).child(`↓${b.behind}`)))
        .when(Boolean(b.gone), (el) => el.child(div().flex_none().text_size(10.5).text_color(t.dim).tooltip(`${b.upstream} no longer exists`).child("gone")))
        .child(div().flex_none().w(28).text_right().text_size(10.5).text_color(t.dim).child(ago(b.at))));
      if (on) rows.push(h_flex().flex_none().pl(26).pr(10).pb(6).pt(2).gap(6).items_center()
        .child(div().flex_1().min_w(0).truncate().text_size(10.5).text_color(t.dim).child(`${b.sha} ${b.subject}`))
        .when(!b.current, (el) => el.child(this.button(t, "b-checkout", "Checkout", (_e, cx) => this.checkout(cx, b), { tip: "Enter" })))
        .when(!b.current && !remote, (el) => el.child(this.button(t, "b-delete", "Delete", (_e, cx) => this.deleteBranch(cx, b), { kind: "danger", tip: "Shift-D" }))));
    };
    const { local, remote } = this.branches;
    section("Local", local.length);
    local.slice(0, MAX_ROWS).forEach((b) => row(b, false));
    if (remote.length) { section("Remote", remote.length); remote.slice(0, MAX_ROWS).forEach((b) => row(b, true)); }
    return v_flex().flex_1().min_h(0)
      .child(h_flex().flex_none().p(8).gap(6).border_b(1).border_color(t.border)
        .child(this.field(t, "branch-name", this.branchInput, "branch"))
        .child(this.button(t, "branch-create", "Create", (_e, cx) => this.createBranch(cx), { tip: "Create and switch to it (n to type a name)" })))
      .child(v_flex().id("branches").flex_1().min_h(0).p(4).overflow_y_scrollbar().children(rows))
      .child(this.footer(t));
  }

  stashPane(t) {
    const rows = this.stashes.map((s) => {
      const on = this.stashSel === s.oid;
      return v_flex().id(`s-${s.oid}`).flex_none().px(10).py(4).rounded(5).cursor_pointer()
        .when(on, (el) => el.bg(t.selected)).hover((st) => st.bg(on ? t.selected : t.hover))
        .on_click((_e, cx) => this.pickStash(s.oid, cx))
        .child(h_flex().gap(6).items_center()
          .child(div().flex_none().font_family(mono()).text_size(11).text_color(t.muted).child(s.ref))
          .child(div().flex_1().min_w(0).truncate().child(s.subject))
          .child(div().flex_none().text_size(10.5).text_color(t.dim).child(ago(s.at))))
        .when(on, (el) => el.child(h_flex().pt(4).gap(6)
          .child(this.button(t, "s-apply", "Apply", (_e, cx) => this.stashAction(cx, "apply"), { tip: "a" }))
          .child(this.button(t, "s-pop", "Pop", (_e, cx) => this.stashAction(cx, "pop"), { tip: "p" }))
          .child(this.button(t, "s-drop", "Drop", (_e, cx) => this.stashAction(cx, "drop"), { kind: "danger", tip: "Shift-D" }))));
    });
    const height = this.size?.height ?? 640;
    return v_flex().flex_1().min_h(0)
      .child(h_flex().flex_none().p(8).gap(6).border_b(1).border_color(t.border)
        .child(this.field(t, "stash-message", this.stashInput, "stash"))
        .child(this.button(t, "stash-push", "Stash", (_e, cx) => this.stashPush(cx), { disabled: !this.dirty() && !this.status.untracked.length, tip: "Stash all changes, untracked files too (s)" })))
      .child(v_flex().id("stashes").flex_none().h(Math.min(Math.max(1, rows.length) * 28 + 40, height * 0.3)).p(4).overflow_y_scrollbar().children(rows)
        .when(!rows.length, (el) => el.child(div().p(6).text_size(11).text_color(t.dim).child("No stashes")))
        .when(rows.length >= MAX_ROWS, (el) => el.child(div().p(6).text_size(11).text_color(t.dim).child(`Showing the newest ${MAX_ROWS}`))))
      .when(rows.length > 0, (el) => el.child(div().flex_none().border_t(1).border_color(t.border)))
      .child(this.diffPane(t, "stash-diff", this.stashSel ? this.stashDiff : info(""), { empty: "" }))
      .child(this.footer(t));
  }

  treeRow(r, tree, t) {
    const open = r.dir && tree.folders.has(r.path), mark = r.dir ? null : this.markOf(tree, r.path);
    return h_flex().h(TREE_H).w_full().pl(8 + r.depth * 18).pr(8).gap(7).items_center().rounded(7).text_size(13)
      .when(tree.sel === r.path, (el) => el.bg(t.selected))
      .child(r.dir ? svg(`mods/files/chevron-${open ? "down" : "right"}.svg`).size(12).flex_none().text_color(t.dim) : div().w(12).flex_none())
      .child(svg(`mods/files/${r.dir || r.linkDir ? "folder" : "file"}.svg`).size(14).flex_none().text_color(r.link ? t.dim : t.muted))
      .child(div().flex_1().min_w(0).truncate().when(r.link, (el) => el.text_color(t.muted)).child(r.link ? `${r.name} ↗` : r.name))
      .when(Boolean(mark), (el) => el.child(div().text_size(11).text_color(codeColor(t, mark)).child(mark)));
  }

  filesPane(t) {
    const tree = this.tree;
    if (!tree?.cwd) return div().p(14).text_color(t.dim).child("No folder");
    if (tree.file) {
      const mark = this.markOf(tree, tree.file);
      return v_flex().flex_1().min_h(0)
        .child(h_flex().h(30).flex_none().px(8).gap(8).items_center().border_b(1).border_color(t.border)
          .child(div().id("preview-back").px(4).rounded(4).text_color(t.muted).cursor_pointer().tooltip("Back (Esc)").hover((s) => s.bg(t.hover).text_color(t.foreground))
            .on_click((_e, cx) => { this.preview(null); this.handle.focus(); cx.notify(); }).child("←"))
          .when(Boolean(mark), (el) => el.child(div().flex_none().font_family(mono()).text_size(11).text_color(codeColor(t, mark)).child(mark)))
          .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.muted).child(tree.file))
          .when(Boolean(mark), (el) => el.child(this.button(t, "preview-diff", "Diff", (_e, cx) => this.openDiff(tree.file, cx), { tip: "Show the change in Status (d)" }))))
        .child(tree.code ? Editor.new(tree.code).flex_1().min_h(0) : div().p(12).text_color(t.dim).child(tree.fileError || "Loading file…"))
        .child(this.footer(t));
    }
    const rows = this.treeRows(tree);
    this.treeRowsShown = rows;
    const sel = rows.find((r) => r.path === tree.sel && !r.dir), mark = sel ? this.markOf(tree, sel.path) : null;
    const list = v_virtual_list("files-tree", rows.length, TREE_H, (i) => rows[i].path,
      (range) => rows.slice(range.start, range.end).map((r) => this.treeRow(r, tree, t)))
      .size_full().track_scroll(this.treeScroll).on_item_click((k, cx) => this.clickTree(k, cx));
    const note = (text, color = t.dim) => div().flex_none().px(12).py(4).text_size(11).text_color(color).child(text);
    return v_flex().flex_1().min_h(0)
      .child(h_flex().h(30).flex_none().px(10).gap(6).items_center().border_b(1).border_color(t.border)
        .child(svg("mods/files/folder.svg").size(13).flex_none().text_color(t.muted))
        .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.muted).child(tree.cwd)))
      .child(div().flex_1().min_h(0).relative().px(4).py(2).child(list).child(Scrollbar.vertical("files-tree").absolute().inset_0())
        .when(!rows.length, (el) => el.child(div().absolute().top(8).left(0).px(12).text_size(12).text_color(tree.error ? t.ansi1 : t.dim)
          .child(tree.error || (tree.draining ? "Loading files…" : "No files")))))
      .when(Boolean(tree.error) && rows.length > 0, (el) => el.child(note(tree.error, t.ansi1)))
      .when(tree.cut.size > 0, (el) => el.child(note("File list limited to 500 entries per folder and 5,000 total")))
      .when(Boolean(sel), (el) => el.child(h_flex().h(32).flex_none().px(8).gap(6).items_center().border_t(1).border_color(t.border)
        .when(Boolean(mark), (el) => el.child(div().w(10).flex_none().font_family(mono()).text_size(11).text_color(codeColor(t, mark)).child(mark)))
        .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.muted).child(sel.linkDir ? `${sel.path} · linked folder, not followed` : sel.path))
        .when(!sel.linkDir, (el) => el.child(this.button(t, "tree-preview", "Preview", (_e, cx) => { this.preview(sel.path, cx); cx.notify(); }, { tip: "Enter" })))
        .when(Boolean(mark), (el) => el.child(this.button(t, "tree-diff", "Diff", (_e, cx) => this.openDiff(sel.path, cx), { tip: "Show the change in Status (d)" })))))
      .child(this.footer(t));
  }

  prsPane(t, cx) {
    let body;
    try { body = prsRender(this, t, cx); }
    catch (e) { body = div().p(12).text_size(12).text_color(t.ansi1).child(`The PR view failed: ${msg(e)}`); }
    return v_flex().flex_1().min_h(0).child(body);
  }

  render(cx) {
    if (key() !== this.ctx) this.refresh(cx);
    if (this.tab === "files" && treeKey() !== this.tree?.key) this.refreshTree(cx);
    const t = theme();
    let content;
    if (this.tab === "prs") content = this.prsPane(t, cx);
    else if (this.tab === "files") content = this.filesPane(t);
    else if (!this.root) content = div().p(14).text_color(t.dim).child(this.error ?? (this.loading ? "Loading…" : "No folder"));
    else if (this.tab === "log") content = this.logPane(t);
    else if (this.tab === "branches") content = this.branchesPane(t);
    else if (this.tab === "stash") content = this.stashPane(t);
    else content = this.statusPane(t);
    const focusMe = (_e, cx) => { if (this.tab !== "prs" && !(this.tab === "files" && this.tree?.file)) this.handle.focus(); };
    return v_flex().id("git").size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(t.border)
      .text_color(t.foreground).text_size(12)
      .track_focus(this.handle).on_key_down((e, cx) => this.onKey(e, cx))
      .on_mouse_down("left", focusMe)
      .on_size_change((size, cx) => { if (size.height !== this.size?.height) { this.size = size; cx.notify(); } })
      .child(this.header(t))
      .child(this.tabsBar(t))
      .child(content);
  }
}
