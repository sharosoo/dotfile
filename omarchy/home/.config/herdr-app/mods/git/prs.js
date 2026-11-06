// The git panel's PRs tab: GitHub pull requests for host.repo through the `gh` CLI, so auth stays with gh.
// Everything that posts as the person (comments, replies, reviews) goes through an inline confirm bound to a
// snapshot of what was confirmed; checkout asks only when the working tree has changes.

import { div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, TextareaState, Textarea, TextView } from "gpui-base";
import { exec, run, settings, layout, notify } from "herdr";

const BROWSER = "http://127.0.0.1:47825";
const POLL_MS = 60000;
const LIST_LIMIT = 50;
const MAX_DIFF_LINES = 1500;
const SEARCH_DEBOUNCE_MS = 400;
const LIST_FIELDS = "number,title,author,headRefName,baseRefName,isDraft,reviewDecision,updatedAt,statusCheckRollup,additions,deletions,url";
const DETAIL_FIELDS = "number,title,body,author,state,isDraft,headRefName,baseRefName,headRefOid,reviewDecision,mergeable,url,statusCheckRollup,additions,deletions,changedFiles,updatedAt,reviews,comments,reviewRequests";
const THREADS_QUERY = `query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){
  reviewThreads(first:100){nodes{id isResolved isOutdated path line originalLine diffSide
    comments(first:50){nodes{databaseId author{login} body createdAt}}}}}}}`;
const MISSING_GH = "The GitHub CLI (gh) is not installed. Install it, then run `gh auth login` in a terminal.";

class SetupError extends Error {}

// exec also rejects for reasons other than a missing binary, so ask the shell before blaming the install.
async function ghMissing() {
  try { return (await exec("sh", ["-c", "command -v gh"])).code !== 0; } catch { return false; }
}

async function gh(args, cwd) {
  let r;
  try { r = await exec("gh", args, cwd ? { cwd } : undefined); }
  catch (e) {
    if (await ghMissing()) throw new SetupError(MISSING_GH);
    throw e;
  }
  if (r.code === 127) throw new SetupError(MISSING_GH);
  if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim() || `gh exited with ${r.code}`);
  return r.stdout;
}

const quote = (a) => /^[\w@%+=:,./-]+$/.test(a) ? a : `'${a.replace(/'/g, `'\\''`)}'`;
const commandLine = (args) => ["gh", ...args].map(quote).join(" ");
const errorText = (e) => String(e?.message ?? e);
const repoKey = (repo) => repo?.remote ? `${repo.root}|${repo.remote}` : null;

function find(node, id) {
  if (!node || typeof node !== "object") return null;
  if (node.id === id) return node;
  for (const c of node.children ?? []) { const hit = find(c, id); if (hit) return hit; }
  return null;
}

// Hidden copies keep their timers, so polling asks whether the PRs tab is on screen right now.
function visible(host) {
  if (host.tab !== "prs") return false;
  const root = layout(), body = find(root, "panel-body");
  if (!body?.children?.some((c) => c.id === "git")) return true;
  return !find(root, "panel")?.hidden && body.active === "git";
}

function ago(iso) {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (!Number.isFinite(m)) return "";
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / 1440)}d`;
}

function checkState(c) {
  if (c.__typename === "StatusContext") return c.state === "SUCCESS" ? "pass" : c.state === "PENDING" || c.state === "EXPECTED" ? "pending" : "fail";
  if (c.status !== "COMPLETED") return "pending";
  if (c.conclusion === "SKIPPED" || c.conclusion === "NEUTRAL") return "skip";
  return c.conclusion === "SUCCESS" ? "pass" : "fail";
}

function checkSummary(rollup) {
  const n = { pass: 0, fail: 0, pending: 0, skip: 0 };
  for (const c of rollup ?? []) n[checkState(c)]++;
  return n;
}

// Old and new line numbers per row, so review threads and line comments can anchor to either side.
function diffRows(patch) {
  const lines = patch.replace(/\n$/, "").split("\n");
  let old = 0, next = 0;
  const rows = lines.slice(0, MAX_DIFF_LINES).map((line) => {
    const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(line);
    if (m) { old = +m[1]; next = +m[2]; return { kind: "@", text: line }; }
    const kind = line[0], text = line.slice(1) || " ";
    if (kind === "-") return { kind, old: old++, text };
    if (kind === "+") return { kind, new: next++, text };
    if (kind === "\\") return { kind, text: line };
    return { kind: " ", old: old++, new: next++, text };
  });
  return { rows, truncated: lines.length > MAX_DIFF_LINES };
}

const ORDER = { fail: 0, pending: 1, pass: 2, skip: 3 };

// Everything render needs, derived once per response instead of on every frame.
function normalizeDetail(p, rawThreads) {
  const threads = rawThreads.map((th) => ({
    id: th.id, path: th.path, line: th.line, originalLine: th.originalLine, side: th.diffSide ?? "RIGHT",
    resolved: th.isResolved, outdated: th.isOutdated, rootId: th.comments.nodes[0]?.databaseId,
    where: `${th.path}${th.line != null ? `:${th.line}` : th.originalLine != null ? `:${th.originalLine}` : ""}`,
    comments: th.comments.nodes.map((c) => ({ author: c.author?.login ?? "ghost", body: c.body, at: c.createdAt })),
  })).sort((a, b) => Number(a.resolved) - Number(b.resolved));
  const byPath = new Map();
  for (const th of threads) {
    let g = byPath.get(th.path);
    if (!g) byPath.set(th.path, g = { count: 0, floating: [], at: new Map() });
    g.count++;
    if (th.line == null) { g.floating.push(th); continue; }
    const k = `${th.side === "LEFT" ? "L" : "R"}${th.line}`;
    g.at.set(k, [...(g.at.get(k) ?? []), th]);
  }
  const checks = (p.statusCheckRollup ?? []).map((c) => ({
    state: checkState(c), name: c.name ?? c.context ?? "check", url: c.detailsUrl ?? c.targetUrl ?? null,
    sub: c.__typename === "StatusContext" ? c.description : [c.workflowName, c.conclusion?.toLowerCase() ?? c.status?.toLowerCase()].filter(Boolean).join(" · "),
  })).sort((a, b) => ORDER[a.state] - ORDER[b.state]);
  const events = [
    ...(p.comments ?? []).map((c) => ({ at: c.createdAt, who: c.author?.login ?? "ghost", what: "commented", body: c.body })),
    ...(p.reviews ?? []).filter((r) => r.body?.trim() || r.state !== "COMMENTED").map((r) => ({
      at: r.submittedAt, who: r.author?.login ?? "ghost", body: r.body, tone: r.state,
      what: r.state === "APPROVED" ? "approved" : r.state === "CHANGES_REQUESTED" ? "requested changes" : r.state === "DISMISSED" ? "review dismissed" : "reviewed",
    })),
  ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return {
    threads, byPath, checks, events, checkCounts: checkSummary(p.statusCheckRollup),
    openThreads: threads.filter((th) => !th.resolved).length,
    reviewers: (p.reviewRequests ?? []).map((r) => r.login ?? r.name ?? r.slug).join(", "),
  };
}

export function prsInit(host) {
  const S = host.prs = {
    key: null, filter: "all", query: "", list: [], loading: false, error: null, setup: null, login: null,
    listSeq: 0, searchSeq: 0, lastLoad: 0, armed: false, pollGen: 0,
    detail: null, compose: null, confirm: null, busy: false, note: null, hasText: false,
    // Submits print the gh command instead of running it; set by scratch tests, never by the UI.
    dryRun: false, lastCommand: null,
    search: InputState.new({ placeholder: "Search open PRs" }),
    text: TextareaState.new({ placeholder: "Write a comment (Markdown)", rows: 4 }),
  };
  S.search.on("change", (_e, cx) => {
    S.query = S.search.value();
    const seq = ++S.searchSeq;
    cx.timer.after(SEARCH_DEBOUNCE_MS, (cx) => { if (seq === S.searchSeq) loadList(host, cx); });
  });
  S.search.on("submit", (_e, cx) => loadList(host, cx));
  S.text.on("change", (_e, cx) => {
    const has = Boolean(S.text.value().trim());
    // A confirm covers the exact text shown with it; editing afterwards needs a fresh confirm.
    const stale = S.confirm?.kind === "submit";
    if (stale) S.confirm = null;
    if (has !== S.hasText || stale) { S.hasText = has; cx.notify(); }
  });
}

async function ensureGh(S) {
  if (S.login) return;
  let r;
  try { r = await exec("gh", ["auth", "status", "--hostname", "github.com"]); }
  catch (e) {
    if (await ghMissing()) throw new SetupError(MISSING_GH);
    throw e;
  }
  if (r.code === 127) throw new SetupError(MISSING_GH);
  if (r.code !== 0) {
    const text = (r.stderr || r.stdout).trim();
    if (/gh auth login|not logged in/i.test(text)) throw new SetupError("gh is not signed in to github.com. Run `gh auth login` in a terminal, then reload.");
    throw new Error(text || `gh auth status exited with ${r.code}`);
  }
  try { S.login = (await gh(["api", "user", "--jq", ".login"])).trim(); }
  catch (e) {
    if (e instanceof SetupError) throw e;
    throw new SetupError(`gh is signed in but could not reach GitHub (network, or an expired login: run \`gh auth login\`). ${errorText(e)}`);
  }
}

function loadList(host, cx) {
  const S = host.prs, repo = host.repo, key = repoKey(repo);
  if (!key) return;
  const seq = ++S.listSeq;
  S.loading = true;
  cx.spawn(async (cx) => {
    try {
      await ensureGh(S);
      const args = ["pr", "list", "-R", repo.remote, "--state", "open", "--limit", String(LIST_LIMIT), "--json", LIST_FIELDS];
      if (S.filter === "mine") args.push("--author", "@me");
      const search = [S.filter === "review" ? "review-requested:@me" : "", S.query.trim()].filter(Boolean).join(" ");
      if (search) args.push("--search", search);
      const out = await gh(args);
      if (seq !== S.listSeq || S.key !== key) return;
      S.list = JSON.parse(out).map((p) => ({
        number: p.number, title: p.title, author: p.author?.login ?? "ghost", head: p.headRefName, base: p.baseRefName,
        draft: p.isDraft, decision: p.reviewDecision, updated: p.updatedAt, add: p.additions, del: p.deletions, url: p.url,
        checks: checkSummary(p.statusCheckRollup),
      }));
      S.error = null; S.setup = null;
    } catch (e) {
      if (seq !== S.listSeq) return;
      if (e instanceof SetupError) S.setup = e.message; else { S.setup = null; S.error = errorText(e); }
    } finally {
      if (seq === S.listSeq) { S.loading = false; S.lastLoad = Date.now(); }
      cx.notify();
    }
  });
}

// One timer at a time; it re-arms only while the list is visible, so a hidden tab or an open PR stops polling.
function armPoll(host, cx) {
  const S = host.prs;
  if (S.armed || S.detail || !visible(host)) return;
  S.armed = true;
  const gen = ++S.pollGen;
  cx.timer.after(POLL_MS, (cx) => {
    if (gen !== S.pollGen) return;
    S.armed = false;
    if (S.detail || !visible(host) || !repoKey(host.repo)) return;
    if (!S.loading) loadList(host, cx);
    armPoll(host, cx);
  });
}

function openPr(host, cx, item) {
  const S = host.prs;
  S.detail = { number: item.number, item, tab: "overview", loading: true, data: null, view: null, files: null, file: null, detailSeq: 0, filesSeq: 0 };
  S.compose = null; S.confirm = null; S.note = null;
  loadDetail(host, cx);
}

function closePr(S) {
  S.detail = null; S.compose = null; S.confirm = null; S.note = null;
}

function loadDetail(host, cx) {
  const S = host.prs, d = S.detail, remote = host.repo.remote, [owner, name] = remote.split("/");
  const seq = ++d.detailSeq;
  d.loading = true;
  cx.spawn(async (cx) => {
    try {
      const [view, threads] = await Promise.all([
        gh(["pr", "view", String(d.number), "-R", remote, "--json", DETAIL_FIELDS]),
        gh(["api", "graphql", "-f", `owner=${owner}`, "-f", `name=${name}`, "-F", `number=${d.number}`, "-f", `query=${THREADS_QUERY}`]),
      ]);
      if (S.detail !== d || seq !== d.detailSeq) return;
      d.data = JSON.parse(view);
      d.view = normalizeDetail(d.data, JSON.parse(threads).data?.repository?.pullRequest?.reviewThreads?.nodes ?? []);
      d.error = null;
      if (d.tab === "files" || d.files) loadFiles(host, cx);
    } catch (e) {
      if (S.detail === d && seq === d.detailSeq) d.error = errorText(e);
    } finally {
      if (S.detail === d && seq === d.detailSeq) d.loading = false;
      cx.notify();
    }
  });
}

function loadFiles(host, cx) {
  const S = host.prs, d = S.detail, remote = host.repo.remote;
  const seq = ++d.filesSeq;
  d.filesLoading = true; d.filesError = null;
  cx.spawn(async (cx) => {
    try {
      const out = await gh(["api", `repos/${remote}/pulls/${d.number}/files?per_page=100`, "--paginate",
        "--jq", ".[] | {filename,status,additions,deletions,patch,previous_filename}"]);
      if (S.detail !== d || seq !== d.filesSeq) return;
      d.files = out.split("\n").filter(Boolean).map((l) => JSON.parse(l)).map((f) => {
        const parts = f.filename.split("/"), name = parts.pop();
        return {
          path: f.filename, prev: f.previous_filename, status: f.status, add: f.additions, del: f.deletions, patch: f.patch ?? null,
          dir: parts.length ? parts.join("/") + "/" : "", name, diff: null,
          letter: f.status === "added" ? "A" : f.status === "removed" ? "D" : f.status === "renamed" ? "R" : "M",
        };
      });
      const open = d.files.find((f) => f.path === d.file);
      if (open) parseDiff(open); else d.file = null;
    } catch (e) {
      if (S.detail === d && seq === d.filesSeq) d.filesError = errorText(e);
    } finally {
      if (S.detail === d && seq === d.filesSeq) d.filesLoading = false;
      cx.notify();
    }
  });
}

function parseDiff(f) {
  if (f.patch && !f.diff) f.diff = diffRows(f.patch);
}

function safeUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch { return null; }
}

function openUrl(cx, url) {
  const href = safeUrl(url);
  if (!href) { notify({ title: "Not opened", body: `Only http and https links open from here: ${url}`, level: "warning" }); return; }
  cx.spawn(async () => {
    try {
      const r = await fetch(`${BROWSER}/open`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: href, newTab: true }) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      run("layout.select", { stack: "panel-body", child: "browser" });
      run("layout.show", { id: "panel" });
    } catch {
      try {
        const r = await exec("xdg-open", [href]);
        if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim() || `xdg-open exited with ${r.code}`);
      } catch (e) {
        notify({ title: "Could not open the link", body: `${href}: ${errorText(e)}`, level: "error" });
      }
    }
  });
}

function startCompose(S, compose) {
  const same = S.compose && JSON.stringify({ ...S.compose, event: null }) === JSON.stringify({ ...compose, event: null });
  if (!same) { S.text.set_value(""); S.hasText = false; }
  S.compose = compose; S.confirm = null; S.note = null;
  S.text.focus();
}

function submitArgs(c, number, head, remote, body) {
  const n = String(number);
  // `--body=` keeps a body that starts with "-" from being read as a flag.
  if (c.kind === "comment") return ["pr", "comment", n, "-R", remote, `--body=${body}`];
  if (c.kind === "review") return ["pr", "review", n, "-R", remote, `--${c.event}`, ...(body ? [`--body=${body}`] : [])];
  if (c.kind === "reply") return ["api", "-X", "POST", `repos/${remote}/pulls/${n}/comments/${c.commentId}/replies`, "-f", `body=${body}`];
  return ["api", "-X", "POST", `repos/${remote}/pulls/${n}/comments`, "-f", `body=${body}`, "-f", `commit_id=${head}`,
    "-f", `path=${c.path}`, "-F", `line=${c.line}`, "-f", `side=${c.side}`];
}

function confirmText(S, snap) {
  const c = snap.compose, who = S.login ? `@${S.login}` : "you", n = `#${snap.number}`;
  if (c.kind === "comment") return `Post this comment on ${n} as ${who}?`;
  if (c.kind === "reply") return `Reply to ${c.to} on ${c.path} as ${who}?`;
  if (c.kind === "line") return `Comment on ${c.path}:${c.line} as ${who}?`;
  if (c.event === "approve") return `Approve ${n} as ${who}?`;
  if (c.event === "request-changes") return `Request changes on ${n} as ${who}?`;
  return `Submit a review comment on ${n} as ${who}?`;
}

// Freezes what the person is about to confirm: the PR, its head commit, the target and the text.
function askSubmit(host, cx) {
  const S = host.prs, d = S.detail, c = S.compose, body = S.text.value().trim();
  if (!c || !d?.data || S.busy) return;
  if (!body && !(c.kind === "review" && c.event === "approve")) { S.note = "Write something first."; cx.notify(); return; }
  const compose = { ...c }, head = d.data.headRefOid;
  S.confirm = { kind: "submit", detail: d, source: c, number: d.number, head, compose, body, args: submitArgs(compose, d.number, head, host.repo.remote, body) };
  S.note = null;
  cx.notify();
}

function submit(host, cx, snap) {
  const S = host.prs;
  // Stale buttons (after navigation, an edit, or a second click) find a different or empty confirm and do nothing.
  if (!snap || S.confirm !== snap || S.busy || S.detail !== snap.detail) return;
  S.confirm = null;
  S.lastCommand = commandLine(snap.args);
  if (S.dryRun) { S.note = `Dry run: ${S.lastCommand}`; cx.notify(); return; }
  S.busy = true;
  cx.spawn(async (cx) => {
    try {
      await gh(snap.args);
      if (S.detail !== snap.detail) return;
      if (S.compose === snap.source) { S.text.set_value(""); S.hasText = false; S.compose = null; }
      S.note = "Posted.";
      loadDetail(host, cx);
    } catch (e) {
      if (S.detail === snap.detail) S.note = `Failed: ${errorText(e)}`;
    } finally {
      S.busy = false;
      cx.notify();
    }
  });
  cx.notify();
}

function askCheckout(host, cx, d) {
  const S = host.prs, root = host.repo.root, remote = host.repo.remote;
  if (S.busy || S.detail !== d) return;
  S.busy = true; S.note = null; S.confirm = null;
  const snap = { kind: "checkout", detail: d, number: d.number, branch: d.data?.headRefName ?? `#${d.number}`, root, remote };
  cx.spawn(async (cx) => {
    let dirty = 0;
    try {
      const r = await exec("git", ["--no-optional-locks", "status", "--porcelain"], { cwd: root });
      if (r.code !== 0) throw new Error(r.stderr.trim());
      dirty = r.stdout.split("\n").filter(Boolean).length;
    } catch (e) {
      S.busy = false;
      if (S.detail === d) S.note = `Checkout failed: ${errorText(e)}`;
      cx.notify();
      return;
    }
    S.busy = false;
    if (S.detail !== d) { cx.notify(); return; }
    if (dirty) { S.confirm = { ...snap, dirty }; cx.notify(); }
    else { S.confirm = snap; checkout(host, cx, snap); }
  });
  cx.notify();
}

function checkout(host, cx, snap) {
  const S = host.prs;
  if (!snap || S.confirm !== snap || S.busy || S.detail !== snap.detail) return;
  const args = ["pr", "checkout", String(snap.number), "-R", snap.remote];
  S.confirm = null;
  S.lastCommand = commandLine(args);
  if (S.dryRun) { S.note = `Dry run: ${S.lastCommand}`; cx.notify(); return; }
  S.busy = true;
  cx.spawn(async (cx) => {
    try { await gh(args, snap.root); if (S.detail === snap.detail) S.note = `Checked out ${snap.branch}.`; }
    catch (e) { if (S.detail === snap.detail) S.note = `Checkout failed: ${errorText(e)}`; }
    finally { S.busy = false; cx.notify(); }
  });
  cx.notify();
}

export function prsRender(host, t, cx) {
  const S = host.prs, key = repoKey(host.repo);
  if (key !== S.key) {
    S.key = key; S.list = []; S.error = null; closePr(S);
    if (key) loadList(host, cx);
  } else if (key && !S.detail && !S.loading && Date.now() - S.lastLoad > POLL_MS && visible(host)) loadList(host, cx);
  if (key) armPoll(host, cx);

  const ui = new Ui(host, t);
  if (!host.repo?.root) return ui.message("Open a terminal in a git repository to see its pull requests.");
  if (!host.repo.remote) return ui.message("This repository has no GitHub remote, so there are no pull requests to show.");
  if (S.setup) return ui.message(S.setup, true);
  return S.detail ? ui.detail() : ui.list();
}

class Ui {
  constructor(host, t) { this.host = host; this.S = host.prs; this.t = t; }

  message(text, retry) {
    const t = this.t;
    return v_flex().id("prs-message").size_full().min_h(0).p(14).gap(10).text_size(12).text_color(t.muted)
      .child(div().child(text))
      .when(Boolean(retry), (e) => e.child(this.button("prs-retry", "Reload", (_e, cx) => { this.S.setup = null; loadList(this.host, cx); })));
  }

  // Shown above data that a failed reload left in place, so it isn't mistaken for fresh.
  stale(id, text, retry) {
    const t = this.t;
    return h_flex().id(id).flex_none().px(10).py(5).gap(8).items_center().border_b(1).border_color(t.border).bg(t.surface)
      .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.ansi1).tooltip(text).child(text))
      .child(this.icon(`${id}-retry`, "Retry", "Load again", retry));
  }

  button(id, label, action, { tip, solid, danger, disabled } = {}) {
    const t = this.t;
    return div().id(id).h(26).px(10).flex().flex_none().items_center().rounded(6).text_size(12)
      .when(Boolean(tip), (e) => e.tooltip(tip))
      .when(Boolean(disabled), (e) => e.bg(t.raised).text_color(t.dim))
      .when(!disabled && Boolean(solid), (e) => e.bg(danger ? t.ansi1 : t.solid).text_color(danger ? t.background : t.solid_foreground).cursor_pointer())
      .when(!disabled && !solid, (e) => e.border_1().border_color(t.border).text_color(t.foreground).cursor_pointer().hover((s) => s.bg(t.hover)))
      .on_click((ev, cx) => { if (!disabled) action(ev, cx); })
      .child(label);
  }

  icon(id, label, tip, action) {
    const t = this.t;
    return div().id(id).px(6).h(24).flex().flex_none().items_center().rounded(5).text_size(12).text_color(t.muted)
      .cursor_pointer().tooltip(tip).hover((s) => s.bg(t.hover).text_color(t.foreground)).on_click(action).child(label);
  }

  seg(id, label, active, action) {
    const t = this.t;
    return div().id(id).h(24).px(8).flex().flex_none().items_center().rounded(5).text_size(11.5).cursor_pointer()
      .text_color(active ? t.foreground : t.muted).when(active, (e) => e.bg(t.selected)).hover((s) => s.bg(t.hover))
      .on_click(action).child(label);
  }

  badge(text, color) {
    return div().flex_none().px(5).rounded(4).border_1().border_color(this.t.border).text_size(10.5).text_color(color).child(text);
  }

  checksBadges(n) {
    const t = this.t, out = [];
    if (n.fail) out.push(div().flex_none().text_size(11).text_color(t.ansi1).child(`✕ ${n.fail}`));
    if (n.pending) out.push(div().flex_none().text_size(11).text_color(t.ansi3).child(`● ${n.pending}`));
    if (n.pass) out.push(div().flex_none().text_size(11).text_color(t.ansi2).child(`✓ ${n.pass}`));
    return out;
  }

  decision(value) {
    const t = this.t;
    if (value === "APPROVED") return this.badge("Approved", t.ansi2);
    if (value === "CHANGES_REQUESTED") return this.badge("Changes requested", t.ansi1);
    if (value === "REVIEW_REQUIRED") return this.badge("Review required", t.muted);
    return null;
  }

  list() {
    const S = this.S, t = this.t, host = this.host;
    const setFilter = (f) => (_e, cx) => { if (S.filter !== f) { S.filter = f; S.list = []; loadList(host, cx); cx.notify(); } };
    const bar = h_flex().px(8).h(36).flex_none().gap(2).items_center().border_b(1).border_color(t.border)
      .child(this.seg("prs-all", "All", S.filter === "all", setFilter("all")))
      .child(this.seg("prs-mine", "Mine", S.filter === "mine", setFilter("mine")))
      .child(this.seg("prs-review", "Review requested", S.filter === "review", setFilter("review")))
      .child(div().flex_1())
      .child(div().text_size(11).text_color(t.dim).child(S.loading ? "…" : String(S.list.length)))
      .child(this.icon("prs-reload", "⟳", "Reload", (_e, cx) => loadList(host, cx)));
    const search = h_flex().px(8).h(38).flex_none().items_center().border_b(1).border_color(t.border)
      .child(div().id("prs-search").flex_1().min_w(0).h(28).px(8).flex().items_center().rounded(6).border_1().border_color(t.border)
        .cursor_text().on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .child(Input.new(S.search).h_full().text_size(12).text_color(t.foreground)));
    const row = (p) => v_flex().id(`prs-row-${p.number}`).px(12).py(7).gap(3).cursor_pointer().border_b(1).border_color(t.border)
      .hover((s) => s.bg(t.hover)).on_click((_e, cx) => { openPr(host, cx, p); cx.notify(); })
      .child(h_flex().gap(6).items_center()
        .child(div().flex_none().text_size(11).text_color(p.draft ? t.dim : t.ansi2).child(p.draft ? "◌" : "●"))
        .child(div().flex_none().text_size(11.5).text_color(t.dim).child(`#${p.number}`))
        .child(div().flex_1().min_w(0).truncate().text_size(12.5).child(p.title))
        .child(div().flex_none().text_size(11).text_color(t.dim).child(ago(p.updated))))
      .child(div().truncate().text_size(11).text_color(t.dim).child(`${p.author === S.login ? "you" : p.author} · ${p.head} → ${p.base}`))
      .child(h_flex().gap(8).items_center()
        .when(p.draft, (e) => e.child(this.badge("Draft", t.dim)))
        .children(this.checksBadges(p.checks))
        .when(Boolean(this.decision(p.decision)), (e) => e.child(this.decision(p.decision)))
        .child(div().flex_1())
        .child(div().flex_none().text_size(11).text_color(t.ansi2).child(`+${p.add}`))
        .child(div().flex_none().text_size(11).text_color(t.ansi1).child(`−${p.del}`)));
    let content;
    if (S.error && !S.list.length) content = div().p(12).text_size(12).text_color(t.blocked).child(`Could not load pull requests: ${S.error}`);
    else if (!S.list.length) content = div().p(12).text_size(12).text_color(t.dim).child(S.loading ? "Loading pull requests…" : "No open pull requests match.");
    else content = v_flex().children(S.list.map(row));
    return v_flex().id("prs").size_full().min_h(0).bg(t.background).text_color(t.foreground)
      .child(bar).child(search)
      .when(Boolean(S.error) && S.list.length > 0, (e) => e.child(this.stale("prs-list-stale", `Reload failed, showing older results: ${S.error}`, (_e, cx) => loadList(host, cx))))
      .child(div().id("prs-list").flex_1().min_h(0).overflow_y_scrollbar().child(content));
  }

  detail() {
    const S = this.S, t = this.t, host = this.host, d = S.detail, p = d.data ?? {}, v = d.view;
    const url = p.url ?? d.item.url;
    const reload = (_e, cx) => { loadDetail(host, cx); cx.notify(); };
    const header = h_flex().gap(4).px(8).h(36).flex_none().items_center().border_b(1).border_color(t.border)
      .child(this.icon("prs-back", "←", "Back to the list", (_e, cx) => { closePr(S); loadList(host, cx); cx.notify(); }))
      .child(div().flex_none().text_size(12).text_color(t.dim).child(`#${d.number}`))
      .child(div().flex_1().min_w(0).truncate().text_size(12).font_semibold().child(p.title ?? d.item.title))
      .child(this.icon("prs-open", "↗", "Open on GitHub in the browser panel", (_e, cx) => openUrl(cx, url)))
      .child(this.icon("prs-detail-reload", d.loading ? "…" : "⟳", "Reload", reload));
    const tab = (id, label) => this.seg(`prs-tab-${id}`, label, d.tab === id, (_e, cx) => {
      d.tab = id;
      if (id === "files" && !d.files && !d.filesLoading) loadFiles(host, cx);
      cx.notify();
    });
    const n = v?.checkCounts, open = v?.openThreads ?? 0;
    const tabs = h_flex().px(8).h(34).flex_none().gap(2).items_center().border_b(1).border_color(t.border)
      .child(tab("overview", open ? `Overview · ${open} open thread${open === 1 ? "" : "s"}` : "Overview"))
      .child(tab("files", `Files${p.changedFiles != null ? ` ${p.changedFiles}` : ""}`))
      .child(tab("checks", `Checks${v?.checks.length ? ` ${n.fail ? "✕" : n.pending ? "●" : "✓"}` : ""}`));
    let body;
    if (d.error && !d.data) body = v_flex().p(12).gap(8).text_size(12)
      .child(div().text_color(t.blocked).child(`Could not load #${d.number}: ${d.error}`))
      .child(h_flex().child(this.button("prs-detail-retry", "Retry", reload)));
    else if (!d.data) body = div().p(12).text_size(12).text_color(t.dim).child("Loading…");
    else if (d.tab === "files") body = this.files(d);
    else if (d.tab === "checks") body = this.checks(v.checks);
    else body = this.overview(d);
    return v_flex().id("prs-detail").size_full().min_h(0).bg(t.background).text_color(t.foreground)
      .child(header).child(tabs)
      .when(Boolean(d.error && d.data), (e) => e.child(this.stale("prs-detail-stale", `Reload failed, showing older data: ${d.error}`, reload)))
      .when(d.tab === "files" && Boolean(d.filesError && d.files), (e) => e.child(this.stale("prs-files-stale", `Reload failed, showing older files: ${d.filesError}`, (_e, cx) => { loadFiles(host, cx); cx.notify(); })))
      .child(div().id(`prs-body-${d.tab}`).flex_1().min_h(0).overflow_y_scrollbar().child(body))
      .when(Boolean(d.data), (e) => e.child(this.footer(d)));
  }

  markdown(id, text) {
    return TextView.markdown(id, text).selectable(true).on_link_click((url, cx) => openUrl(cx, url));
  }

  overview(d) {
    const S = this.S, t = this.t, host = this.host, p = d.data, v = d.view;
    const state = p.state === "MERGED" ? ["Merged", t.ansi5] : p.state === "CLOSED" ? ["Closed", t.ansi1] : p.isDraft ? ["Draft", t.dim] : ["Open", t.ansi2];
    const meta = v_flex().px(12).pt(10).pb(8).gap(6).border_b(1).border_color(t.border)
      .child(h_flex().gap(6).items_center().flex_wrap()
        .child(this.badge(state[0], state[1]))
        .when(Boolean(this.decision(p.reviewDecision)), (e) => e.child(this.decision(p.reviewDecision)))
        .when(p.mergeable === "CONFLICTING", (e) => e.child(this.badge("Conflicts", t.ansi1)))
        .child(div().text_size(11).text_color(t.ansi2).child(`+${p.additions}`))
        .child(div().text_size(11).text_color(t.ansi1).child(`−${p.deletions}`)))
      .child(div().text_size(11.5).text_color(t.muted).child(`${p.author?.login ?? "ghost"} wants to merge ${p.headRefName} → ${p.baseRefName} · updated ${ago(p.updatedAt)}`))
      .when(Boolean(v.reviewers), (e) => e.child(div().text_size(11).text_color(t.dim).child(`Review requested: ${v.reviewers}`)))
      .child(h_flex().gap(6).pt(2)
        .child(this.button("prs-checkout", S.busy ? "Working…" : "Checkout", (_e, cx) => askCheckout(host, cx, d), { tip: `gh pr checkout ${d.number}`, disabled: S.busy }))
        .child(this.button("prs-comment", "Comment", (_e, cx) => { startCompose(S, { kind: "comment" }); cx.notify(); }))
        .child(this.button("prs-review-start", "Review", (_e, cx) => { startCompose(S, { kind: "review", event: "approve" }); cx.notify(); })));
    const desc = div().px(12).py(10).text_size(12.5).border_b(1).border_color(t.border)
      .child(p.body?.trim() ? this.markdown(`prs-body-${d.number}`, p.body) : div().text_color(t.dim).child("No description."));
    const tone = { APPROVED: t.ansi2, CHANGES_REQUESTED: t.ansi1 };
    const timeline = v_flex().children(v.events.map((ev, i) => v_flex().px(12).py(8).gap(4).border_b(1).border_color(t.border)
      .child(h_flex().gap(6).text_size(11.5)
        .child(div().font_semibold().child(ev.who)).child(div().text_color(tone[ev.tone] ?? t.muted).child(ev.what))
        .child(div().flex_1()).child(div().text_size(11).text_color(t.dim).child(ago(ev.at))))
      .when(Boolean(ev.body?.trim()), (e) => e.child(div().text_size(12.5).child(this.markdown(`prs-ev-${d.number}-${i}`, ev.body))))));
    const threadList = v.threads.length ? v_flex().gap(8).px(12).py(10).border_b(1).border_color(t.border)
      .child(div().text_size(11).font_semibold().text_color(t.muted).child(`Review threads (${v.openThreads} open)`))
      .children(v.threads.map((th) => this.thread(th, true))) : null;
    return v_flex().child(meta).child(desc).when(Boolean(threadList), (e) => e.child(threadList)).child(timeline)
      .when(!v.events.length, (e) => e.child(div().px(12).py(10).text_size(11.5).text_color(t.dim).child("No comments yet.")));
  }

  thread(th, withPath) {
    const S = this.S, t = this.t;
    return v_flex().id(`prs-thread-${th.id}${withPath ? "" : "-inline"}`).rounded(6).border_1().border_color(t.border).bg(t.surface).overflow_hidden()
      .when(withPath || th.resolved || th.outdated, (e) => e.child(h_flex().px(8).h(24).gap(6).items_center().border_b(1).border_color(t.border).text_size(11)
        .when(withPath, (e) => e.child(div().flex_1().min_w(0).truncate().text_color(t.muted).child(th.where)))
        .when(!withPath, (e) => e.child(div().flex_1()))
        .when(th.outdated, (e) => e.child(this.badge("Outdated", t.dim)))
        .when(th.resolved, (e) => e.child(this.badge("Resolved", t.ansi2)))))
      .children(th.comments.map((c, i) => v_flex().px(8).py(6).gap(2).when(i > 0, (e) => e.border_t(1).border_color(t.border))
        .child(h_flex().gap(6).text_size(11).child(div().font_semibold().child(c.author)).child(div().text_color(t.dim).child(ago(c.at))))
        .child(div().text_size(12).child(this.markdown(`prs-tc-${th.id}-${i}`, c.body)))))
      .when(th.rootId != null, (e) => e.child(h_flex().px(8).pb(6)
        .child(this.icon(`prs-reply-${th.id}${withPath ? "" : "-inline"}`, "Reply", "Reply to this thread", (_e, cx) => {
          startCompose(S, { kind: "reply", commentId: th.rootId, to: th.comments[0]?.author ?? "the thread", path: th.where });
          cx.notify();
        }))));
  }

  files(d) {
    const t = this.t, host = this.host;
    if (d.filesError && !d.files) return v_flex().p(12).gap(8).text_size(12)
      .child(div().text_color(t.blocked).child(`Could not load the files: ${d.filesError}`))
      .child(h_flex().child(this.button("prs-files-retry", "Retry", (_e, cx) => { loadFiles(host, cx); cx.notify(); })));
    if (!d.files) return div().p(12).text_size(12).text_color(t.dim).child("Loading files…");
    return v_flex().children(d.files.map((f) => {
      const open = d.file === f.path, count = d.view.byPath.get(f.path)?.count ?? 0;
      const row = h_flex().id(`prs-file-${f.path}`).h(28).flex_none().px(10).gap(8).items_center().cursor_pointer()
        .border_b(1).border_color(t.border).when(open, (e) => e.bg(t.selected)).hover((s) => s.bg(t.hover))
        .on_click((_e, cx) => { d.file = open ? null : f.path; if (d.file) parseDiff(f); cx.notify(); })
        .child(div().w(12).flex_none().text_size(11).text_color(f.letter === "A" ? t.ansi2 : f.letter === "D" ? t.ansi1 : t.blocked).child(f.letter))
        .child(h_flex().flex_1().min_w(0).text_size(12)
          .child(div().min_w(0).truncate().text_color(t.dim).child(f.dir))
          .child(div().flex_none().max_w(260).truncate().child(f.name)))
        .when(count > 0, (e) => e.child(this.badge(`${count} thread${count === 1 ? "" : "s"}`, t.muted)))
        .child(div().flex_none().text_size(11).text_color(t.ansi2).child(`+${f.add}`))
        .child(div().flex_none().text_size(11).text_color(t.ansi1).child(`−${f.del}`));
      return v_flex().child(row).when(open, (e) => e.child(this.diff(d, f)));
    }));
  }

  diff(d, f) {
    const S = this.S, t = this.t;
    const web = (id) => this.icon(id, "Open on GitHub", "Open the files view in the browser panel", (_e, cx) => openUrl(cx, `${d.data.url}/files`));
    if (!f.diff) return h_flex().px(12).py(8).gap(8).text_size(11.5).text_color(t.dim).border_b(1).border_color(t.border)
      .child(div().child(f.status === "removed" || f.status === "renamed" ? "No text changes to show." : "This diff is too large or binary to show here."))
      .child(web(`prs-file-web-${f.path}`));
    const group = d.view.byPath.get(f.path);
    const mono = settings().font_family ?? "JetBrains Mono";
    const c = S.compose;
    const items = [];
    const inline = (list) => { for (const th of list ?? []) items.push(div().px(8).py(4).child(this.thread(th, false))); };
    if (f.prev) items.push(div().px(12).py(4).text_size(11).text_color(t.dim).child(`Renamed from ${f.prev}`));
    inline(group?.floating);
    f.diff.rows.forEach((r, i) => {
      if (r.kind === "@" || r.kind === "\\") {
        items.push(div().px(10).py(2).text_size(11).text_color(t.dim).bg(t.raised).font_family(mono).child(r.text));
        return;
      }
      const side = r.kind === "-" ? "LEFT" : "RIGHT", line = side === "LEFT" ? r.old : r.new;
      const target = c?.kind === "line" && c.path === f.path && c.line === line && c.side === side;
      items.push(h_flex().id(`prs-l-${i}`).items_start().text_size(11).font_family(mono).cursor_pointer()
        .when(r.kind === "+", (e) => e.bg(t.ansi2 + "1c")).when(r.kind === "-", (e) => e.bg(t.ansi1 + "1c"))
        .when(target, (e) => e.bg(t.selected)).hover((s) => s.bg(t.hover))
        .on_click((_e, cx) => { startCompose(S, { kind: "line", path: f.path, line, side }); cx.notify(); })
        .child(div().w(34).flex_none().text_right().pr(4).text_color(t.dim).child(r.old != null ? String(r.old) : ""))
        .child(div().w(34).flex_none().text_right().pr(6).text_color(t.dim).child(r.new != null ? String(r.new) : ""))
        .child(div().w(10).flex_none().text_color(r.kind === "+" ? t.ansi2 : r.kind === "-" ? t.ansi1 : t.dim).child(r.kind === " " ? "" : r.kind))
        .child(div().flex_1().min_w(0).pr(8).child(r.text)));
      if (group) {
        if (r.new != null) inline(group.at.get(`R${r.new}`));
        if (r.old != null && r.kind !== "+") inline(group.at.get(`L${r.old}`));
      }
    });
    if (f.diff.truncated) items.push(h_flex().px(12).py(6).gap(8).text_size(11).text_color(t.dim)
      .child(div().child(`Showing the first ${MAX_DIFF_LINES} lines.`)).child(web(`prs-file-more-${f.path}`)));
    return v_flex().border_b(1).border_color(t.border).children(items);
  }

  checks(checks) {
    const t = this.t;
    if (!checks.length) return div().p(12).text_size(12).text_color(t.dim).child("No checks reported for this pull request.");
    const marks = { fail: ["✕", t.ansi1], pending: ["●", t.ansi3], pass: ["✓", t.ansi2], skip: ["–", t.dim] };
    return v_flex().children(checks.map((c, i) => {
      const mark = marks[c.state];
      return h_flex().id(`prs-check-${i}`).px(12).py(6).gap(8).items_center().border_b(1).border_color(t.border)
        .when(Boolean(c.url), (e) => e.cursor_pointer().hover((st) => st.bg(t.hover)).on_click((_e, cx) => openUrl(cx, c.url)))
        .child(div().w(12).flex_none().text_size(12).text_color(mark[1]).child(mark[0]))
        .child(v_flex().flex_1().min_w(0)
          .child(div().truncate().text_size(12).child(c.name))
          .when(Boolean(c.sub), (e) => e.child(div().truncate().text_size(11).text_color(t.dim).child(c.sub))));
    }));
  }

  footer(d) {
    const S = this.S, t = this.t, host = this.host, c = S.compose, snap = S.confirm;
    const note = S.note ? div().text_size(11).text_color(/^(Failed|Checkout failed)/.test(S.note) ? t.ansi1 : t.muted).child(S.note) : null;
    const box = v_flex().flex_none().px(10).py(8).gap(6).border_t(1).border_color(t.border).bg(t.surface);

    if (snap?.kind === "checkout" && snap.dirty && snap.detail === d) return box
      .child(div().text_size(12).child(`The working tree has ${snap.dirty} uncommitted change${snap.dirty === 1 ? "" : "s"}. Check out ${snap.branch} anyway?`))
      .child(h_flex().gap(6).justify_end()
        .child(this.button("prs-checkout-cancel", "Cancel", (_e, cx) => { if (S.confirm === snap) S.confirm = null; cx.notify(); }))
        .child(this.button("prs-checkout-confirm", "Check out", (_e, cx) => checkout(host, cx, snap), { solid: true, danger: true, disabled: S.busy })));

    if (!c) return note ? box.child(note) : div();

    const label = c.kind === "comment" ? `Comment on #${d.number}` : c.kind === "review" ? `Review #${d.number}`
      : c.kind === "reply" ? `Reply to ${c.to} · ${c.path.split("/").pop()}`
      : `Line ${c.line}${c.side === "LEFT" ? " (old)" : ""} · ${c.path.split("/").pop()}`;
    const verb = (x) => x.kind === "review" ? (x.event === "approve" ? "Approve" : x.event === "request-changes" ? "Request changes" : "Submit review") : "Post";
    const action = verb(c);
    const ready = S.hasText || (c.kind === "review" && c.event === "approve");
    const setEvent = (event) => (_e, cx) => { c.event = event; S.confirm = null; cx.notify(); };
    box.child(h_flex().gap(6).items_center()
      .child(div().flex_1().min_w(0).truncate().text_size(11.5).font_semibold().text_color(t.muted).child(label))
      .child(this.icon("prs-compose-close", "✕", "Discard", (_e, cx) => { S.compose = null; S.confirm = null; S.note = null; cx.notify(); })));
    if (c.kind === "review") box.child(h_flex().gap(2)
      .child(this.seg("prs-ev-approve", "Approve", c.event === "approve", setEvent("approve")))
      .child(this.seg("prs-ev-changes", "Request changes", c.event === "request-changes", setEvent("request-changes")))
      .child(this.seg("prs-ev-comment", "Comment", c.event === "comment", setEvent("comment"))));
    box.child(div().id("prs-text").h(84).px(8).py(4).rounded(6).border_1().border_color(t.border).bg(t.background).cursor_text()
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .child(Textarea.new(S.text).size_full().text_size(12).text_color(t.foreground)));
    if (note) box.child(note);
    if (snap?.kind === "submit" && snap.detail === d) return box
      .child(div().text_size(12).child(confirmText(S, snap)))
      .child(div().text_size(11).text_color(t.dim).child("Everyone with access to the repository will see it."))
      .child(h_flex().gap(6).justify_end()
        .child(this.button("prs-confirm-cancel", "Back", (_e, cx) => { if (S.confirm === snap) S.confirm = null; cx.notify(); }))
        .child(this.button("prs-confirm", S.busy ? "Posting…" : `Yes, ${verb(snap.compose).toLowerCase()}`, (_e, cx) => submit(host, cx, snap),
          { solid: true, danger: snap.compose.event === "request-changes", disabled: S.busy })));
    return box.child(h_flex().gap(6).justify_end()
      .child(this.button("prs-submit", S.busy ? "Posting…" : action, (_e, cx) => askSubmit(host, cx), { solid: true, disabled: !ready || S.busy })));
  }
}
