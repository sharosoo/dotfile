// Shared browser-vault login for omp eval (JavaScript cells). See SKILL.md §5.1.
//   const { vaultLogin } = await import(`${process.env.HOME}/.omp/agent/managed-skills/browser-agent/login.mjs`);
//   const r = await vaultLogin(tab, "google:work", { url, consent: false });
// Runs in the eval cell, not inside tab.run: closures passed to tab.run are serialized, so secrets
// fetched here would have to travel as args. Secrets are read here, typed one key at a time into an
// element bound to its document, and dropped. Results carry fixed reason codes and origin+path URLs only.

import fs from "node:fs";
import { homedir } from "node:os";

// Absolute path: a PATH entry from a repo under test must not receive vault calls.
const VAULT = `${homedir()}/.local/bin/browser-vault`;
const MAX_STEPS = 14;
// A second password submit for the same account inside this window is refused (lockout guard across calls).
const PASSWORD_WINDOW_MS = 10 * 60 * 1000;
const LOCK_WAIT_MS = 120_000;
// A login takes at most MAX_STEPS settles; an older lock is left over from a killed kernel.
const LOCK_STALE_MS = 6 * 60 * 1000;
const NAME = /^[a-z0-9][a-z0-9_-]*$/;
const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1"]);
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const J = JSON.stringify;

// Every `reason` in a result is one of these codes; tool errors and vault stderr never reach the caller.
export const REASONS = [
  "bad_ref", "vault_error", "several_accounts", "not_registered", "policy_unavailable", "session_unavailable",
  "login_busy", "host_not_allowed", "path_not_allowed", "element_invalid", "not_top_frame", "document_changed",
  "focus_moved", "typing_failed", "not_configured", "user_step", "unknown_page", "outside_domains",
  "left_domains_after_submit", "no_identity", "wrong_account", "credentials_rejected", "password_shown_again",
  "recent_password_attempt", "marker_unavailable", "username_shown_again", "no_username", "code_shown_again",
  "otp_unavailable", "chooser_shown_again", "account_not_listed", "consent_required", "consent_unproven",
  "consent_denied", "consent_check_failed", "consent_shown_again", "consent_button_missing", "step_limit", "unexpected",
];

async function vault(...args) {
  // Explicit env: Bun.spawn otherwise uses the environment from process start, ignoring later
  // process.env changes (e.g. BROWSER_VAULT_SITES pointing at a temp vault).
  const p = Bun.spawn([VAULT, ...args], { stdout: "pipe", stderr: "ignore", stdin: "ignore", env: process.env });
  const [out, code] = await Promise.all([new Response(p.stdout).text(), p.exited]);
  return { out, code };
}

class Stop extends Error {
  constructor(result) { super(result.status); this.result = result; }
}
const stop = (status, step, reason, extra) => { throw new Stop({ status, step, reason, ...extra }); };

const dataDir = () => `${process.env.XDG_DATA_HOME || `${homedir()}/.local/share`}/sharosoo-browser`;

function privateDir(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dir, 0o700);
}

function writePrivate(file, text, flags = fs.constants.O_TRUNC) {
  const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_NOFOLLOW | flags, 0o600);
  try { fs.fchmodSync(fd, 0o600); fs.writeSync(fd, text); } finally { fs.closeSync(fd); }
}

// --- policy -----------------------------------------------------------------------------------------

async function loadPolicy(site) {
  const r = await vault("policy", site);
  if (r.code !== 0) stop("failed", "policy", "policy_unavailable");
  try { return JSON.parse(r.out); } catch { stop("failed", "policy", "policy_unavailable"); }
}

function splitEntry(entry) {
  const m = /^(?:[a-z]+:\/\/)?(\[[^\]]+\]|[^:/]+)(?::(\d+))?/i.exec(String(entry).trim());
  if (!m) return null;
  const wildcard = m[1].startsWith("*.");
  let host = m[1].replace(/^\*\./, "").replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  try { if (!host.includes(":")) host = new URL(`http://${host}`).hostname; } catch { return null; }
  return { host, wildcard, port: m[2] ? Number(m[2]) : null };
}

// Mirrors browser-vault page_allowed: exact host and port, "*.x" = subdomains only, http only on loopback.
export function hostAllowed(href, policy) {
  let u;
  try { u = new URL(href); } catch { return false; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  if (u.username || u.password) return false;
  const host = u.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (u.protocol === "http:" && !LOOPBACK.has(host)) return false;
  const port = u.port ? Number(u.port) : u.protocol === "https:" ? 443 : 80;
  return (policy.domains ?? []).some(entry => {
    const e = splitEntry(entry);
    if (!e) return false;
    const hostOk = e.wildcard ? host.endsWith(`.${e.host}`) : host === e.host;
    const portOk = policy.ignore_port || (e.port ?? (u.protocol === "https:" ? 443 : 80)) === port;
    return hostOk && portOk;
  });
}

// Policy login_paths (exact, or prefix ending in "/"), else the login_url path; nothing configured = nowhere.
function policyPathAllowed(path, policy) {
  let paths = policy.login_paths;
  if (!paths?.length && policy.login_url) { try { paths = [new URL(policy.login_url).pathname]; } catch { paths = []; } }
  return (paths ?? []).some(p => (p.endsWith("/") ? path.startsWith(p) : path === p));
}

// --- cross-call state: per-account password marker, machine-wide login lock -------------------------

const markerFile = (site, account) => `${dataDir()}/login-attempts/${site}.${account}.json`;

// Unreadable or odd markers count as recent: fail closed, the user removes the file.
function recentPasswordAttempt(file) {
  try {
    if (!fs.lstatSync(file).isFile()) return true;
    const { ts } = JSON.parse(fs.readFileSync(file, "utf8"));
    return !(Number.isFinite(ts) && Date.now() - ts >= PASSWORD_WINDOW_MS);
  } catch (e) {
    return e?.code !== "ENOENT";
  }
}

function recordPasswordAttempt(file) {
  try {
    privateDir(`${dataDir()}/login-attempts`);
    writePrivate(file, J({ ts: Date.now() }));
  } catch {
    stop("failed", "password", "marker_unavailable");
  }
}

// One login at a time: the herdr profile is shared, and two agents typing into it would race.
async function acquireLock() {
  const file = `${dataDir()}/login.lock`;
  const token = `${process.pid}-${crypto.randomUUID()}`;
  privateDir(dataDir());
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try {
      writePrivate(file, J({ token, pid: process.pid, ts: Date.now() }), fs.constants.O_EXCL);
      return () => {
        try { if (JSON.parse(fs.readFileSync(file, "utf8")).token === token) fs.rmSync(file, { force: true }); } catch { /* already gone */ }
      };
    } catch (e) {
      if (e?.code !== "EEXIST") stop("failed", "lock", "login_busy");
    }
    let held = null;
    try { held = JSON.parse(fs.readFileSync(file, "utf8")); } catch { /* being written or removed */ }
    let alive = true;
    if (held?.pid) { try { process.kill(held.pid, 0); } catch (e) { alive = e?.code === "EPERM"; } }
    if (held && (!alive || Date.now() - held.ts > LOCK_STALE_MS)) { fs.rmSync(file, { force: true }); continue; }
    if (Date.now() > deadline) stop("failed", "lock", "login_busy");
    await Bun.sleep(250);
  }
}

// --- page reading -----------------------------------------------------------------------------------

const where = href => { try { const u = new URL(href); return `${u.origin}${u.pathname}`; } catch { return "(unparsable url)"; } };
const emailsIn = s => (`${s ?? ""}`.match(EMAIL) ?? []).map(x => x.toLowerCase());

async function readPage(tab) {
  const url = await tab.url();
  const { elements = [] } = await tab.observe();
  // observe() reports <input type=password> as a plain textbox; the type attribute tells them apart.
  for (const el of elements) {
    if (el.role !== "textbox") continue;
    const h = await tab.id(el.id);
    el.type = ((await h.attr("type").catch(() => null)) || "text").toLowerCase();
    el.autocomplete = ((await h.attr("autocomplete").catch(() => null)) || "").toLowerCase();
  }
  return { url, u: new URL(url), els: elements, text: null };
}

async function pageText(tab, pg) {
  pg.text ??= (await tab.text().catch(() => "")) || "";
  return pg.text;
}

const shownEmails = pg => [...new Set(pg.els.flatMap(e => emailsIn(e.name)))];

const isPassword = e => e.role === "textbox" && e.type === "password";
const isOtp = e => e.role === "textbox" && e.type !== "password" &&
  (e.autocomplete.includes("one-time-code") || /code|코드|otp|인증|verification|authenticator|2fa|two-factor|확인 번호/i.test(e.name ?? ""));
const isUser = e => e.role === "textbox" && e.type !== "password" && !isOtp(e) &&
  (e.type === "email" || /username|email/.test(e.autocomplete) ||
   /e-?mail|user|login|account|아이디|이메일|휴대전화|phone|\bid\b/i.test(e.name ?? ""));

// Field states from observe(): used by the built-in adapters on their own login paths.
function observedForm(pg) {
  const pass = pg.els.find(isPassword), otp = pg.els.find(isOtp), user = pg.els.find(isUser);
  const loc = e => e && { id: e.id };
  if (pass) return { kind: "password", pass: loc(pass), user: loc(user) };
  if (otp) return { kind: "otp", otp: loc(otp) };
  if (user) return { kind: "username", user: loc(user) };
  return null;
}

// Page-side validity of a target: connected, rendered, on screen, enabled, and the right control type.
const VALIDATE = `function (el, kind) {
  if (!el || !el.isConnected) return "element_invalid";
  const r = el.getBoundingClientRect(), s = getComputedStyle(el);
  if (r.width < 2 || r.height < 2 || r.right <= 0 || r.bottom <= 0) return "element_invalid";
  if (s.visibility !== "visible" || s.display === "none" || Number(s.opacity) === 0) return "element_invalid";
  if (el.checkVisibility && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return "element_invalid";
  if (el.closest("[inert],[aria-hidden=true]")) return "element_invalid";
  if (el.disabled || el.readOnly) return "element_invalid";
  if (kind === "click") return "ok";
  if (kind === "submit") return el.tagName === "BUTTON" || (el.tagName === "INPUT" && /^(submit|button)$/.test(el.type)) ? "ok" : "element_invalid";
  if (el.tagName !== "INPUT") return "element_invalid";
  return (kind === "password") === (el.type === "password") ? "ok" : "element_invalid";
}`;

// 0 = absent, 1 = exactly one valid match, "bad" = several matches or an invalid one (e.g. an injected hidden field).
const SCAN = sel => `(() => { const els = document.querySelectorAll(${J(sel.css)});
  if (!els.length) return 0; if (els.length > 1) return "bad";
  return (${VALIDATE})(els[0], ${J(sel.kind)}) === "ok" ? 1 : "bad"; })()`;

// A visible captcha widget (invisible reCAPTCHA iframes are tiny or hidden and do not count).
const CAPTCHA_DOM = `(() => [...document.querySelectorAll(
  'iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="challenges.cloudflare.com"], .g-recaptcha, .h-captcha, .cf-turnstile')]
  .some(el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    return r.width > 50 && r.height > 50 && s.visibility !== "hidden" && s.display !== "none"; }))()`;

// Prompt wording, not offers: "Sign in with a passkey" buttons on ordinary login pages must not match.
const BLOCK_TEXT = [
  [/로봇이 아닙니다|i'?m not a robot|보안문자|자동입력 방지|verify you are human/i, "captcha"],
  [/use your passkey|패스키를 사용하여|insert your security key|보안 키를 (삽입|연결)/i, "passkey"],
  [/check your phone|휴대전화를 확인|approve (the|this) sign.?in|알림을 (탭|확인)하세요/i, "push"],
];

// Runs before any form detection: a page with both a challenge and a password field goes to the user.
async function detectBlock(tab, pg, adapter, allowed) {
  if (pg.els.some(e => /captcha/i.test(e.name ?? ""))) return "captcha";
  if (await tab.evaluate(CAPTCHA_DOM).catch(() => false)) return "captcha";
  const fromAdapter = await adapter.blocked?.(tab, pg);
  if (fromAdapter) return fromAdapter;
  if (adapter.textBlockers && allowed) {
    const hit = BLOCK_TEXT.find(([re]) => re.test(pg.text ?? ""));
    if (hit) return hit[1];
  }
  return null;
}

// Read only on the site's identity_paths (default "/"), so a user-content page elsewhere on the host
// cannot present a matching element.
async function selectorIdentity(tab, policy) {
  const sel = policy.identity_selector;
  if (!sel) return null;
  const paths = policy.identity_paths?.length ? policy.identity_paths : ["/"];
  const here = new URL(await tab.url());
  if (!hostAllowed(here.href, policy) || !paths.some(p => (p.endsWith("/") && p !== "/" ? here.pathname.startsWith(p) : here.pathname === p))) return null;
  const text = await tab.evaluate(`(() => { const els = document.querySelectorAll(${J(sel)});
    return els.length === 1 ? els[0].textContent : null; })()`).catch(() => null);
  return text?.trim().toLowerCase() || null;
}

// --- per-site adapters --------------------------------------------------------------------------------
// blocked(tab, pg) → step name or null; checked before anything else on the page.
// classify(tab, pg, ctx, policy) → chooser {pick, other} | consent {button} | password {pass, user?, submit?}
//   | otp {otp, submit?} | username {user, submit?} | blocked {step} | null. Field locators are
//   { id } (observe) or { css } (policy); both are bound and validated before use.
// actionPath(path, policy) → whether this path may receive typing or clicks.
// identity(tab, pg, ctx) → the account the page proves (lowercase), or null. Never inferred from
//   "navigated away" or from text containing the name; policy identity_selector is the fallback.
// identityHost(url) → a host outside `domains` that may be read (never typed into) for identity.

export const ADAPTERS = {
  google: {
    hosts: h => h === "google.com" || h.endsWith(".google.com"),
    actionPath: p => p.startsWith("/signin/") || p.startsWith("/v3/signin/") || p.startsWith("/o/oauth2/"),
    async blocked(tab, pg) {
      if (pg.u.hostname !== "accounts.google.com") return null;
      const p = pg.u.pathname;
      const challenge = /\/challenge\/([a-z]+)/.exec(p)?.[1];
      if (challenge && challenge !== "pwd" && challenge !== "totp") {
        return { dp: "push", az: "push", pk: "passkey", sk: "passkey", recaptcha: "captcha", selection: "challenge_selection" }[challenge]
          ?? `challenge:${challenge}`;
      }
      if (/\/signin\/oauth\/(warning|danger)/.test(p)) return "unverified_app";
      if (/\/signin\/(rejected|disabled)|speedbump|\/gds\//.test(p)) return "interstitial";
      return null;
    },
    async classify(tab, pg, ctx) {
      if (pg.u.hostname !== "accounts.google.com") return null;
      const p = pg.u.pathname;
      const clickable = e => e.role === "link" || e.role === "button";
      if (/chooseaccount|accountchooser|signinchooser/.test(p)) {
        const pick = ctx.email ? pg.els.find(e => clickable(e) && emailsIn(e.name).includes(ctx.email)) : null;
        const other = pg.els.find(e => clickable(e) && ["다른 계정 사용", "use another account"].includes(`${e.name}`.trim().toLowerCase()));
        return { kind: "chooser", pick: pick && { id: pick.id }, other: other && { id: other.id } };
      }
      // /signin/oauth/id = "Sign in to <app>" confirmation, /signin/oauth/v2|v3/consent = scope grant.
      if (/\/oauth\/(?:v\d\/)?(?:consent|id)(?:\/|$)|\/v3\/consent|\/o\/oauth2\/.*approval/.test(p)) {
        const b = pg.els.find(e => e.role === "button" && ["허용", "계속", "allow", "continue"].includes(`${e.name}`.trim().toLowerCase()));
        return { kind: "consent", button: b && { id: b.id } };
      }
      return observedForm(pg);
    },
    identityHost: u => u.hostname === "myaccount.google.com",
    // authuser accepts an email: myaccount then shows that signed-in account, or starts its sign-in.
    accountUrl: email => `https://myaccount.google.com/?authuser=${encodeURIComponent(email)}`,
    async identity(tab, pg) {
      if (pg.u.hostname !== "myaccount.google.com") return null;
      // The account menu button: "Google 계정: Name (email)[, Google 멤버십]" / "Google Account: Name (email)…".
      const hits = pg.els.filter(e => e.role === "button" && /^Google (계정|Account):/.test(e.name ?? ""))
        .map(e => /^Google (?:계정|Account):[^()]*\(([^()\s]+@[^()\s]+)\)/.exec(e.name)?.[1]?.toLowerCase()).filter(Boolean);
      return hits.length === 1 ? hits[0] : null;
    },
  },

  github: {
    hosts: h => h === "github.com",
    actionPath: p => ["/login", "/session", "/sessions/two-factor", "/sessions/two-factor/app", "/login/oauth/authorize"].includes(p),
    async blocked(tab, pg) {
      if (pg.u.hostname !== "github.com") return null;
      const p = pg.u.pathname;
      if (/^\/sessions\/verified-device/.test(p)) return "device_check"; // emailed code
      if (/^\/sessions\/two-factor\/webauthn/.test(p)) return "passkey";
      if (/^\/sessions\/two-factor\/mobile/.test(p)) return "push";
      return null;
    },
    async classify(tab, pg) {
      if (pg.u.hostname !== "github.com") return null;
      if (/^\/login\/oauth\/authorize/.test(pg.u.pathname)) {
        const b = pg.els.find(e => e.role === "button" && /^Authorize [A-Za-z0-9-]+$/.test(`${e.name}`.trim()));
        return { kind: "consent", button: b && { id: b.id } };
      }
      return this.actionPath(pg.u.pathname) ? observedForm(pg) : null;
    },
    async identity(tab, pg, ctx) {
      // user-login is the login name; a vault username that is an email cannot be compared with it.
      if (pg.u.hostname !== "github.com" || !ctx.username || ctx.username.includes("@")) return null;
      const login = await tab.attr('meta[name="user-login"]', "content").catch(() => null);
      return login ? login.trim().toLowerCase() : null;
    },
  },

  // Sites without an adapter: only fields named by the site's policy (login_selectors, CSS, top document).
  generic: {
    hosts: () => false,
    textBlockers: true,
    actionPath: (p, policy) => policyPathAllowed(p, policy),
    async classify(tab, pg, ctx, policy) {
      const s = policy.login_selectors;
      if (!s || typeof s !== "object" || !s.password) {
        // Never guess fields on an unknown site.
        return pg.els.some(e => isPassword(e) || isOtp(e) || isUser(e)) ? { kind: "blocked", step: "not_configured" } : null;
      }
      const scan = {};
      for (const key of ["username", "password", "otp", "submit"]) {
        if (!s[key]) { scan[key] = 0; continue; }
        scan[key] = await tab.evaluate(SCAN({ css: s[key], kind: key === "submit" ? "submit" : key })).catch(() => "bad");
      }
      if (Object.values(scan).includes("bad")) return { kind: "blocked", step: "element_invalid" };
      const loc = key => scan[key] === 1 ? { css: s[key] } : undefined;
      if (scan.password) return { kind: "password", pass: loc("password"), user: loc("username"), submit: loc("submit"), sameForm: true };
      if (scan.otp) return { kind: "otp", otp: loc("otp"), submit: loc("submit") };
      if (scan.username) return { kind: "username", user: loc("username"), submit: loc("submit") };
      return null;
    },
    async identity() { return null; },
  },
};

function pickAdapter(site, policy) {
  if (ADAPTERS[site] && site !== "generic") return ADAPTERS[site];
  for (const [name, a] of Object.entries(ADAPTERS)) {
    if (name !== "generic" && (policy.domains ?? []).some(d => a.hosts(splitEntry(d)?.host ?? ""))) return a;
  }
  return ADAPTERS.generic;
}

// --- bound elements -----------------------------------------------------------------------------------
// A target is marked with a random data-vl attribute in the top document, and the document gets a random
// window.__vlDoc. Before every key press the page must still be that document, the element must still be
// the single valid match and hold focus, and the origin/path must still be allowed (fresh policy).

async function docNonce(tab) {
  return tab.evaluate(`(() => (window.__vlDoc ??= ${J(crypto.randomUUID())}))()`).catch(() => null);
}

async function bind(tab, loc, kind) {
  const tag = crypto.randomUUID();
  let r;
  if (loc.css) {
    r = await tab.evaluate(`(() => { const els = document.querySelectorAll(${J(loc.css)});
      if (els.length !== 1) return "element_invalid"; const v = (${VALIDATE})(els[0], ${J(kind)});
      if (v === "ok") els[0].setAttribute("data-vl", ${J(tag)}); return v; })()`).catch(() => "element_invalid");
  } else {
    const h = await tab.id(loc.id);
    r = await h.evaluate(`el => { const w = el.ownerDocument.defaultView;
      if (!w || w !== w.top) return "not_top_frame"; const v = (${VALIDATE})(el, ${J(kind)});
      if (v === "ok") el.setAttribute("data-vl", ${J(tag)}); return v; }`).catch(() => "element_invalid");
  }
  return { r, sel: `[data-vl="${tag}"]`, tag, kind };
}

async function ensure(tab, b, doc, ctx, step, { focus = false } = {}) {
  const policy = ctx.policy;
  const res = await tab.evaluate(`(() => {
    if (window.__vlDoc !== ${J(doc)}) return { s: "document_changed" };
    const els = document.querySelectorAll(${J(b.sel)});
    if (els.length !== 1) return { s: "document_changed" };
    const v = (${VALIDATE})(els[0], ${J(b.kind)});
    if (v !== "ok") return { s: v };
    if (${focus} && document.activeElement !== els[0]) return { s: "focus_moved" };
    return { s: "ok", origin: location.origin, path: location.pathname };
  })()`).catch(() => ({ s: "document_changed" }));
  if (res.s !== "ok") stop("failed", step, res.s);
  if (!hostAllowed(`${res.origin}/`, policy) || !hostAllowed(await tab.url(), policy)) stop("failed", step, "host_not_allowed");
  if (!ctx.adapter.actionPath(res.path, policy)) stop("failed", step, "path_not_allowed");
}

// Re-reads the policy: each credential operation runs against the current domains and paths.
async function bindAll(tab, ctx, step, parts) {
  ctx.policy = await loadPolicy(ctx.site);
  const doc = await docNonce(tab);
  if (!doc) stop("failed", step, "document_changed");
  const bound = {};
  for (const [name, loc, kind, optional] of parts) {
    if (!loc) continue;
    const b = await bind(tab, loc, kind);
    if (b.r !== "ok" && optional) continue;
    if (b.r !== "ok") stop("failed", step, b.r);
    bound[name] = b;
    await ensure(tab, b, doc, ctx, step);
  }
  return { doc, bound };
}

async function sameForm(tab, bound, step) {
  const tags = Object.values(bound).map(b => b.tag);
  const ok = await tab.evaluate(`(() => { const q = t => document.querySelector('[data-vl="' + t + '"]');
    const els = ${J(tags)}.map(q); const f = els[0] && els[0].form;
    return !!f && els.every(e => e && e.form === f); })()`).catch(() => false);
  if (!ok) stop("failed", step, "element_invalid");
}

async function typeBound(tab, b, doc, ctx, step, value) {
  await ensure(tab, b, doc, ctx, step);
  try { await tab.focus(b.sel); } catch { stop("failed", step, "typing_failed"); }
  await ensure(tab, b, doc, ctx, step, { focus: true });
  if (await tab.evaluate(`document.querySelector(${J(b.sel)}).value !== ""`).catch(() => true)) {
    try { await tab.fill(b.sel, ""); } catch { stop("failed", step, "typing_failed"); }
  }
  for (const ch of value) {
    await ensure(tab, b, doc, ctx, step, { focus: true });
    // A tab error could quote the typed text; only the code leaves this function.
    try { await tab.type(b.sel, ch); } catch { stop("failed", step, "typing_failed"); }
  }
  await ensure(tab, b, doc, ctx, step, { focus: true });
}

async function submitBound(tab, field, submit, doc, ctx, step) {
  if (submit) {
    await ensure(tab, submit, doc, ctx, step);
    await tab.click(submit.sel);
  } else {
    await ensure(tab, field, doc, ctx, step, { focus: true });
    await tab.press("Enter", { selector: field.sel });
  }
}

// A cookie is kept only when session_domains (default: domains) cover every host the browser would send it to: a host-only
// cookie needs that exact host (or a "*.x" entry above it); a domain cookie ".d" needs an exact "d"
// entry or a "*.x" entry with d strictly under x. A parent-domain cookie (".example.com" while the
// policy lists only foo.example.com) also reaches sibling hosts, so it is dropped.
function cookieCovered(cookie, policy) {
  const raw = String(cookie.domain ?? "").toLowerCase();
  const d = raw.replace(/^\./, "");
  if (!d) return false;
  const domainCookie = raw.startsWith(".");
  // session_domains (default: domains) only widens what is saved; typing still follows domains.
  return (policy.session_domains ?? policy.domains ?? []).map(splitEntry).filter(Boolean).some(h => {
    if (!h.wildcard) return h.host === d;
    return d.endsWith(`.${h.host}`); // "*.x" covers subdomains only, never x itself
  });
}

// Built in memory instead of tab.saveState(), which writes every site's cookies in the profile to
// disk: cookies come from CDP into this process, are filtered here, and only covered ones are written.
async function sessionState(tab, policy) {
  const all = await tab.run(async ({ page }) => {
    const s = await page.createCDPSession();
    try {
      return (await s.send("Network.getAllCookies")).cookies.map(c => ({
        name: c.name, value: c.value, domain: c.domain, path: c.path, expires: c.session ? -1 : c.expires,
        httpOnly: c.httpOnly, secure: c.secure, ...(c.sameSite ? { sameSite: c.sameSite } : {}),
      }));
    } finally {
      await s.detach().catch(() => {});
    }
  });
  const cookies = all.filter(c => cookieCovered(c, policy));
  const total = all.length;
  const origins = [];
  const here = await tab.url();
  if (hostAllowed(here, policy)) {
    const ls = await tab.evaluate(`JSON.stringify(Object.entries(localStorage))`).catch(() => null);
    const pairs = ls ? JSON.parse(ls) : [];
    if (pairs.length) origins.push({ origin: new URL(here).origin, localStorage: pairs.map(([name, value]) => ({ name, value })) });
  }
  return { state: { cookies, origins }, counts: { cookies: cookies.length, cookiesTotal: total, origins: origins.length } };
}

async function saveSession(tab, ctx, policy, session) {
  // Only the filtered state touches disk: O_EXCL temp file 0600 in the 0700 sessions dir, then rename.
  const tmp = `${session.path}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    const { state, counts } = await sessionState(tab, policy);
    writePrivate(tmp, J(state), fs.constants.O_EXCL);
    fs.renameSync(tmp, session.path);
    return (await vault("session", "seal", ctx.ref)).code === 0 ? { session: "saved", saved: counts } : { session: "not_saved" };
  } catch {
    return { session: "not_saved" };
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

// --- consent ------------------------------------------------------------------------------------------

// browser-vault check: allow (0) → click; confirm (3) → click, because consent:true is the user's
// approval for this grant; deny (4) → never; anything else (vault error) → hand to the user.
export async function consentGate(site) {
  const { code } = await vault("check", site, "oauth_grant");
  if (code === 0 || code === 3) return "click";
  if (code === 4) return "consent_denied";
  return "consent_check_failed";
}

async function resolveAccount(site, account) {
  if (account) return account;
  const l = await vault("list");
  if (l.code !== 0) stop("failed", "vault", "vault_error");
  for (const line of l.out.split("\n")) {
    if (!line.trim()) continue;
    const j = JSON.parse(line);
    if (j.site !== site) continue;
    const names = Object.keys(j.accounts ?? {});
    if (names.length > 1) stop("failed", "vault", "several_accounts");
    return names[0] ?? "default";
  }
  stop("failed", "vault", "not_registered");
}

// --- entry point --------------------------------------------------------------------------------------

/**
 * Log `tab` in as vault account `ref` ("site:account").
 * - url: page to start from; omitted → continue on the current page (site login_url when blank).
 * - consent: true only after the user approved this OAuth grant in chat; otherwise consent pages
 *   return needs_user.
 * At most one username, one password and one code submit per call, and one password submit per
 * account per 10 minutes across calls; one login at a time per machine. Returns
 * { status: logged_in|needs_user|wrong_account|failed, step, reason?, ... }; logged_in always means
 * the page proved the vault account (identity "verified").
 */
export async function vaultLogin(tab, ref, { url, consent = false, timeout = 20000 } = {}) {
  const ctx = { ref, typed: { username: 0, password: 0, otp: 0 }, clicked: { chooser: 0, consent: 0 }, sessionLoaded: false, submitted: false, last: null, consentProof: false };
  let step = "start", release = null;
  try {
    const [site, acct] = String(ref).split(":");
    if (!NAME.test(site ?? "") || (acct !== undefined && !NAME.test(acct)) || String(ref).split(":").length > 2) stop("failed", "vault", "bad_ref");
    ctx.site = site;
    let policy = await loadPolicy(site);
    const marker = markerFile(site, await resolveAccount(site, acct));
    const user = await vault("get", ref, "username");
    ctx.username = user.code === 0 ? user.out.trim() : null;
    ctx.email = ctx.username?.includes("@") ? ctx.username.toLowerCase() : null;
    const want = ctx.username?.toLowerCase() ?? null;
    let session = null;
    if (policy.session) {
      const s = await vault("session", "info", ref);
      if (s.code !== 0) stop("failed", "session", "session_unavailable");
      session = JSON.parse(s.out);
    }
    const adapter = ctx.adapter = pickAdapter(site, policy);
    release = await acquireLock();

    const start = url ?? ((await tab.url()) === "about:blank" ? policy.login_url : null);
    if (start) await tab.goto(start);
    await settle(tab, null, 5000);

    for (let i = 0; i < MAX_STEPS; i++) {
      policy = await loadPolicy(site);
      const pg = await readPage(tab);
      const allowed = hostAllowed(pg.url, policy);
      if (adapter.textBlockers && allowed) await pageText(tab, pg);
      const blocked = await detectBlock(tab, pg, adapter, allowed);
      const state = blocked ? { kind: "blocked", step: blocked }
        : (await adapter.classify(tab, pg, ctx, policy)) ?? { kind: "none" };
      const at = { url: where(pg.url) };

      if (state.kind === "blocked") {
        stop("needs_user", state.step, ["not_configured", "element_invalid"].includes(state.step) ? state.step : "user_step", at);
      }

      if (state.kind === "none") {
        const here = await tab.url();
        const hereAt = { url: where(here) };
        const readable = hostAllowed(here, policy) || Boolean(adapter.identityHost?.(new URL(here)));
        if (!readable) {
          // The OAuth client's redirect after a consent click on a page that showed this exact account.
          if (ctx.last === "consent" && ctx.consentProof) return { status: "logged_in", step: "consent", identity: "verified", session: "not_saved", ...hereAt };
          if (ctx.submitted) stop("failed", step, "left_domains_after_submit", hereAt);
          stop("needs_user", step === "start" ? "unknown_page" : `after_${step}`, "outside_domains", hereAt);
        }
        const who = (await adapter.identity(tab, pg, ctx)) ?? (await selectorIdentity(tab, policy));
        // Multi-account profiles: the page shows the default account; ask once for the vault account's view.
        if (who && want && who !== want && adapter.accountUrl && !ctx.switchedAccount) {
          ctx.switchedAccount = true;
          await tab.goto(adapter.accountUrl(want));
          await settle(tab, null, 5000);
          continue;
        }
        // Account widgets render after load (a cold profile took >1 s); re-read the page a few times.
        if (!who && (ctx.identityWaits ?? 0) < 6) {
          ctx.identityWaits = (ctx.identityWaits ?? 0) + 1;
          await Bun.sleep(1000);
          i--;
          continue;
        }
        if (!who) {
          if (ctx.submitted && /wrong|incorrect|invalid|잘못|틀렸|일치하지/i.test(await pageText(tab, pg))) stop("failed", step, "credentials_rejected", hereAt);
          stop("needs_user", "verify", "no_identity", hereAt);
        }
        if (!want || who !== want) stop("wrong_account", "identity", "wrong_account", { ...hereAt, shown: [who] });
        fs.rmSync(marker, { force: true });
        const saved = session ? await saveSession(tab, ctx, policy, session) : { session: "not_saved" };
        return { status: "logged_in", step: step === "start" ? "already" : step, identity: "verified", ...saved, ...hereAt };
      }

      // Every remaining state types or clicks: only on an allowed host and action path.
      if (!allowed) stop("failed", state.kind, "host_not_allowed", at);
      if (!adapter.actionPath(pg.u.pathname, policy)) stop("failed", state.kind, "path_not_allowed", at);
      const before = await signature(tab);

      if (state.kind === "chooser") {
        if (ctx.clicked.chooser++) stop("needs_user", "chooser", "chooser_shown_again", at);
        const target = state.pick ?? state.other;
        if (!target) stop("needs_user", "chooser", "account_not_listed", at);
        const { doc, bound } = await bindAll(tab, ctx, "chooser", [["t", target, "click"]]);
        await ensure(tab, bound.t, doc, ctx, "chooser");
        await tab.click(bound.t.sel);
        step = "chooser";
      } else if (state.kind === "consent") {
        const shown = shownEmails(pg);
        if (ctx.email && shown.length && !shown.includes(ctx.email)) stop("wrong_account", "consent", "wrong_account", { ...at, shown });
        if (!consent) stop("needs_user", "consent", "consent_required", at);
        if (!ctx.email || !shown.includes(ctx.email)) stop("needs_user", "verify", "consent_unproven", at);
        const gate = await consentGate(site);
        if (gate === "consent_denied") stop("failed", "consent", gate, at);
        if (gate !== "click") stop("needs_user", "consent", gate, at);
        if (ctx.clicked.consent++) stop("needs_user", "consent", "consent_shown_again", at);
        if (!state.button) stop("needs_user", "consent", "consent_button_missing", at);
        const { doc, bound } = await bindAll(tab, ctx, "consent", [["b", state.button, "click"]]);
        ctx.consentProof = true;
        await ensure(tab, bound.b, doc, ctx, "consent");
        await tab.click(bound.b.sel);
        step = "consent";
      } else if ((state.kind === "password" || state.kind === "username") && session?.exists && !session.stale && !ctx.sessionLoaded) {
        // A saved session is tried once, before anything is typed.
        ctx.sessionLoaded = true;
        await tab.loadState(session.path);
        await tab.reload();
        step = "session";
      } else if (state.kind === "password") {
        if (ctx.typed.password) stop("failed", "password", "password_shown_again", at);
        if (recentPasswordAttempt(marker)) stop("failed", "password", "recent_password_attempt", at);
        const { doc, bound } = await bindAll(tab, ctx, "password",
          [["pass", state.pass, "password"], ["user", state.user, "username", !state.sameForm], ["submit", state.submit, "submit"]]);
        if (state.sameForm) await sameForm(tab, bound, "password");
        if (bound.user && ctx.username) {
          const current = await tab.evaluate(`document.querySelector(${J(bound.user.sel)}).value`).catch(() => "");
          if (String(current).trim().toLowerCase() !== want) await typeBound(tab, bound.user, doc, ctx, "username", ctx.username);
        }
        const pw = await vault("get", ref, "password");
        if (pw.code !== 0) stop("failed", "password", "vault_error", at);
        await typeBound(tab, bound.pass, doc, ctx, "password", pw.out);
        ctx.typed.password++;
        recordPasswordAttempt(marker);
        await submitBound(tab, bound.pass, bound.submit, doc, ctx, "password");
        ctx.submitted = true;
        step = "password";
      } else if (state.kind === "otp") {
        if (ctx.typed.otp) stop("failed", "otp", "code_shown_again", at);
        if (!policy.otp) stop("needs_user", "otp", "otp_unavailable", at);
        const { doc, bound } = await bindAll(tab, ctx, "otp", [["otp", state.otp, "otp"], ["submit", state.submit, "submit"]]);
        const code = await vault("otp", ref);
        if (code.code !== 0) stop("needs_user", "otp", "otp_unavailable", at);
        await typeBound(tab, bound.otp, doc, ctx, "otp", code.out.trim());
        ctx.typed.otp++;
        await submitBound(tab, bound.otp, bound.submit, doc, ctx, "otp");
        ctx.submitted = true;
        step = "otp";
      } else if (state.kind === "username") {
        if (ctx.typed.username) stop("failed", "username", "username_shown_again", at);
        if (!ctx.username) stop("failed", "username", "no_username", at);
        const { doc, bound } = await bindAll(tab, ctx, "username", [["user", state.user, "username"], ["submit", state.submit, "submit"]]);
        await typeBound(tab, bound.user, doc, ctx, "username", ctx.username);
        ctx.typed.username++;
        await submitBound(tab, bound.user, bound.submit, doc, ctx, "username");
        ctx.submitted = true;
        step = "username";
      }
      ctx.last = step;
      await settle(tab, before, timeout);
    }
    stop("needs_user", step, "step_limit", { url: where(await tab.url()) });
  } catch (e) {
    if (e instanceof Stop) return e.result;
    return { status: "failed", step, reason: "unexpected", error: e?.name ?? "Error" };
  } finally {
    release?.();
  }
}

// --- settling -----------------------------------------------------------------------------------------

// Page signature without input values: URL plus a hash of the visible text.
const SIG = `(() => { const t = document.body ? document.body.innerText : ""; let h = 0;
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return location.href + "|" + h; })()`;
const signature = tab => tab.evaluate(SIG).catch(() => null);

// Polls until the page differs from `before` and then holds still for two polls (SPAs render in steps).
async function settle(tab, before, timeout) {
  const deadline = Date.now() + timeout;
  let last = await signature(tab), stable = 0, changed = before == null;
  while (Date.now() < deadline) {
    await Bun.sleep(250);
    const now = await signature(tab);
    if (now !== before && now != null) changed = true;
    stable = now === last ? stable + 1 : 0;
    last = now;
    if (changed && stable >= 2) return true;
  }
  return changed;
}
