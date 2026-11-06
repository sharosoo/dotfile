// omp account limits and token spend.
// Broker host (turing): read from the local usage-dashboard (~/.omp/agent/tools/usage-dashboard), which merges
// `omp usage` snapshots with rotate-accounts' worker/spurt groups and indexes session token counts.
// Remote machine whose omp authenticates through a remote omp auth broker (OMP_AUTH_BROKER_URL, usually set in
// ~/.env.local): run `omp usage --json` here; it reports the broker's accounts. Spend stays a dashboard-only view.
// A machine with neither shows why instead of another machine's numbers.

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { exec, theme, props, closeOverlay } from "herdr";

// Opened as a kept window (mod.json); a press that reaches the window drags it,
// so controls and the scrolling list keep theirs.
const keepPress = (_e, cx) => cx.stop_propagation();

const API = "http://127.0.0.1:47823";
const QUOTA_MS = 60_000;
const BROKER_QUOTA_MS = 300_000;
const SPEND_MS = 120_000;
// The desktop session that launches herdr-app does not source the shell's env; read the broker URL the way fish does.
const ENV = 'set -a; [ -f "$HOME/.env.local" ] && . "$HOME/.env.local"; set +a; export PATH="$HOME/.local/share/mise/shims:$HOME/.local/bin:$PATH";';

async function brokerUrl() {
  const r = await exec("sh", ["-c", `${ENV} printf %s "$OMP_AUTH_BROKER_URL"`]).catch(() => null);
  return r?.stdout?.trim() || "";
}

// `omp usage --json` reports → the dashboard's /api/quota shape, so one renderer serves both modes.
function fromOmpUsage(u) {
  const accounts = (u.reports ?? []).map((r) => {
    const limits = (r.limits ?? []).map((l) => ({ label: l.label, window: l.window?.id, usedFraction: l.amount?.usedFraction, resetsAt: l.window?.resetsAt }));
    return {
      provider: r.provider,
      email: r.metadata?.email ?? r.metadata?.accountId ?? r.provider,
      limits,
      limitReached: limits.some((l) => (l.usedFraction ?? 0) >= 1),
      credentials: [],
    };
  });
  for (const c of u.disabledCredentials ?? []) accounts.push({ provider: c.provider, email: c.email ?? `#${c.id}`, limits: [], credentials: [{ enabled: false }] });
  return { accounts, fetchedAt: u.generatedAt ?? Date.now() };
}

const PROVIDERS = {
  anthropic: { name: "Claude", icon: "icons/claude.svg" },
  "openai-codex": { name: "Codex", icon: "icons/codex.svg" },
  "google-antigravity": { name: "Antigravity", icon: "icons/antigravity.svg" },
  "google-gemini-cli": { name: "Gemini CLI", icon: "icons/gemini.svg" },
  "xai-oauth": { name: "Grok", icon: "icons/grok.svg" },
  "github-copilot": { name: "Copilot", icon: "icons/copilot.svg" },
  commandcode: { name: "Command Code", icon: "icons/command-code.svg" },
  devin: { name: "Devin", icon: null },
};
const ORDER = ["anthropic", "openai-codex", "google-antigravity", "google-gemini-cli", "xai-oauth", "github-copilot", "commandcode", "devin"];
const TIER = { standard: "", fast: "⚡ fast", ultrafast: "⚡⚡ ultrafast" };

const providerName = (id) => PROVIDERS[id]?.name ?? id.replace(/[-_]+/g, " ");
const rank = (id) => (ORDER.indexOf(id) + 1 || ORDER.length + 1);

function compact(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(Math.round(n));
}

function until(ms, now) {
  if (!ms) return "";
  const m = Math.max(0, Math.round((ms - now) / 60_000));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h}h` : `${Math.floor(h / 24)}d ${h % 24}h`;
}

function ago(ms, now) {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  return s < 60 ? "just now" : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`;
}

const fraction = (v) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, v) : null);

// The limit closest to its wall decides an account's bar; unreadable fractions are unknown, not 0.
function peak(limits) {
  let best = null;
  for (const l of limits) {
    const f = fraction(l.usedFraction);
    if (f !== null && (!best || f > best.used)) best = { ...l, used: f };
  }
  return best;
}

function group(data) {
  const byProvider = new Map();
  for (const a of data.accounts ?? []) {
    // `omp usage` only reports enabled credentials, so an account without credential rows is live.
    const enabled = a.credentials.length === 0 || a.credentials.some((c) => c.enabled);
    const p = peak(a.limits);
    const row = {
      key: `${a.provider}|${a.email}`,
      email: a.email,
      local: a.email.split("@")[0],
      enabled,
      kind: data.accountGroups?.[a.provider]?.[a.email] ?? null,
      spurting: (data.spurt?.[a.provider] ?? []).includes(a.email),
      used: p ? p.used : null,
      limit: p,
      resetCredits: a.resetCredits ?? 0,
      limitReached: a.limitReached,
    };
    if (!byProvider.has(a.provider)) byProvider.set(a.provider, []);
    byProvider.get(a.provider).push(row);
  }
  return [...byProvider.entries()]
    .map(([id, accounts]) => {
      // Same local part on two domains (gmail/naver): show the whole address.
      const seen = new Map();
      for (const a of accounts) seen.set(a.local, (seen.get(a.local) ?? 0) + 1);
      for (const a of accounts) a.label = seen.get(a.local) > 1 ? a.email : a.local;
      accounts.sort((x, y) => (y.enabled - x.enabled) || ((y.used ?? -1) - (x.used ?? -1)) || x.label.localeCompare(y.label));
      const enabled = accounts.filter((a) => a.enabled);
      const live = enabled.filter((a) => a.used !== null);
      // Capacity left across live accounts, in whole-account units.
      const headroom = live.reduce((s, a) => s + (1 - Math.min(1, a.used)), 0);
      return { id, accounts, enabled: enabled.length, live: live.length, headroom, tier: id === "openai-codex" ? TIER[data.codexTier] ?? "" : "" };
    })
    .sort((x, y) => rank(x.id) - rank(y.id));
}

export default class OmpUsage extends View {
  init(_props, cx) {
    this.quota = null;
    this.spend = null;
    this.error = "";
    this.refreshing = false;
    this.quotaSeq = 0;
    this.broker = null;
    this.open = new Set(JSON.parse(localStorage.getItem("open") ?? '["anthropic","openai-codex"]'));
    cx.spawn(async (cx) => {
      this.broker = await brokerUrl();
      this.loadQuota(cx);
      if (!this.broker) this.loadSpend(cx);
      // A live refresh is slower than a poll; a poll started meanwhile would supersede it with older data.
      cx.timer.every(this.broker ? BROKER_QUOTA_MS : QUOTA_MS, (cx) => { if (!this.refreshing) this.loadQuota(cx); });
      if (!this.broker) cx.timer.every(SPEND_MS, (cx) => this.loadSpend(cx));
    });
  }

  async fetchQuota(live) {
    if (this.broker) {
      const r = await exec("sh", ["-c", `${ENV} omp usage --json`]);
      if (r.code !== 0) throw new Error(r.stderr.trim().split("\n").pop() || `omp usage exited ${r.code}`);
      return fromOmpUsage(JSON.parse(r.stdout));
    }
    const r = await fetch(`${API}/api/quota${live ? "/refresh" : ""}`, { method: live ? "POST" : "GET" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  // A timer GET can land after a manual refresh started; only the newest request may write.
  loadQuota(cx, live = false) {
    const seq = ++this.quotaSeq;
    if (live) this.refreshing = true;
    cx.spawn(async (cx) => {
      let quota = null, error = "";
      try {
        quota = await this.fetchQuota(live);
      } catch (e) {
        error = String(e?.message ?? e);
      }
      if (live) this.refreshing = false;
      if (seq === this.quotaSeq) {
        if (quota) { this.quota = quota; this.groups = group(quota); }
        this.error = error;
      }
      cx.notify();
    });
  }

  loadSpend(cx) {
    if (this.broker) return;
    cx.spawn(async (cx) => {
      try {
        const body = { range: 24, groups: ["provider"], filters: {}, series: "total", seriesMetric: "tokens", bucket: "auto", share: "provider", shareMetric: "cost" };
        const r = await fetch(`${API}/api/usage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        this.spend = await r.json();
      } catch {
        // Spend is secondary; the quota error already tells whether the dashboard is down.
      }
      cx.notify();
    });
  }

  toggle(id) {
    if (this.open.has(id)) this.open.delete(id);
    else this.open.add(id);
    localStorage.setItem("open", JSON.stringify([...this.open]));
  }

  barColor(t, a) {
    if (!a.enabled || a.used === null) return t.dim;
    if (a.limitReached || a.used >= 0.95) return t.blocked;
    if (a.used >= 0.75) return t.working;
    return t.done;
  }

  spendCard(t) {
    const s = this.spend;
    if (!s) return null;
    const tok = (x) => x.input + x.output + x.cacheRead + x.cacheWrite;
    const rows = [...s.rows].sort((x, y) => y.sums.cost - x.sums.cost);
    return v_flex().gap(6).p(10).rounded(8).bg(t.raised)
      .child(h_flex().justify_between().items_end()
        .child(div().text_size(11).text_color(t.muted).child("Last 24h"))
        .child(div().text_size(11).text_color(t.dim).child(`${compact(s.totals.turns)} turns`)))
      .child(h_flex().gap(14).items_end()
        .child(v_flex().child(div().text_size(20).font_semibold().text_color(t.foreground).child(`$${Math.round(s.totals.cost).toLocaleString()}`))
          .child(div().text_size(10).text_color(t.dim).child("list price")))
        .child(v_flex().child(div().text_size(20).font_semibold().text_color(t.foreground).child(compact(tok(s.totals))))
          .child(div().text_size(10).text_color(t.dim).child(`tokens · out ${compact(s.totals.output)}`))))
      .children(rows.map((r) =>
        h_flex().gap(6).text_size(11)
          .child(div().flex_1().truncate().text_color(t.muted).child(providerName(r.keys[0])))
          .child(div().text_color(t.dim).child(compact(tok(r.sums))))
          .child(div().w(52).flex_none().text_color(t.foreground).child(`$${Math.round(r.sums.cost).toLocaleString()}`))));
  }

  accountRow(t, a, now) {
    const pct = a.used === null ? null : Math.round(a.used * 100);
    const tag = a.kind === "worker" ? "W" : a.kind === "spurt" ? (a.spurting ? "S🔥" : "S") : "";
    const reset = a.limit?.resetsAt ? until(a.limit.resetsAt, now) : "";
    const tip = [a.email, a.limit?.label, reset && `resets in ${reset}`, a.resetCredits ? `${a.resetCredits} reset credits` : "", a.enabled ? "" : "off: omp does not use this account"]
      .filter(Boolean).join(" · ");
    return v_flex().id(`acct-${a.key}`).gap(3).px(10).py(4).tooltip(tip)
      .child(h_flex().gap(6).text_size(12)
        .child(div().flex_1().truncate().text_color(a.enabled ? t.foreground : t.dim).child(a.label))
        .when(tag !== "", (el) => el.child(div().text_size(10).text_color(t.dim).child(tag)))
        .when(a.resetCredits > 0, (el) => el.child(div().text_size(10).text_color(t.accent).child(`↺${a.resetCredits}`)))
        .child(div().w(34).flex_none().text_color(a.enabled ? t.muted : t.dim).child(pct === null ? "—" : `${pct}%`))
        .child(div().w(46).flex_none().text_size(11).text_color(t.dim).child(a.enabled ? reset : "off")))
      .child(div().h(3).w_full().rounded(2).bg(t.border)
        .child(div().h(3).rounded(2).bg(this.barColor(t, a)).w(`${Math.min(100, pct ?? 0)}%`).transition("width", { duration: 300 })));
  }

  providerSection(t, p, now) {
    const open = this.open.has(p.id);
    const ic = PROVIDERS[p.id]?.icon;
    return v_flex()
      .child(h_flex().id(`prov-${p.id}`).gap(8).px(10).py(6).items_center().cursor_pointer().rounded(6)
        .hover((s) => s.bg(t.hover))
        .on_mouse_down("left", keepPress)
        .on_click((_e, cx) => { this.toggle(p.id); cx.notify(); })
        .child(svg(`mods/workspace-chrome/chevron-${open ? "down" : "right"}.svg`).size(12).flex_none().text_color(t.dim))
        .when(!!ic, (el) => el.child(image(ic).w(14).h(14).flex_none()))
        .child(div().flex_1().truncate().text_size(12).font_semibold().text_color(t.foreground)
          .child(providerName(p.id) + (p.tier ? `  ${p.tier}` : "")))
        .child(div().text_size(11).text_color(t.muted)
          .child(p.live ? `${p.headroom.toFixed(1)} left · ${p.live}/${p.accounts.length}` : p.enabled ? `no data · ${p.enabled}` : `${p.accounts.length} off`)))
      .when(open, (el) => el.children(p.accounts.map((a) => this.accountRow(t, a, now))));
  }

  render() {
    const t = theme();
    const now = Date.now();
    const overlay = props()?.overlay;
    const button = (id, tip) => div().id(id).p(4).rounded(4).cursor_pointer().tooltip(tip)
      .hover((s) => s.bg(t.hover)).on_mouse_down("left", keepPress);
    const header = h_flex().gap(6).px(10).h(32).flex_none().items_center().border_b(1).border_color(t.border)
      .child(div().flex_1().truncate().text_size(12).font_semibold().text_color(t.foreground)
        .child(this.broker ? `omp usage · broker ${this.broker.replace(/^https?:\/\//, "")}` : "omp usage"))
      .when(!!this.quota, (el) => el.child(div().text_size(11).text_color(t.dim).child(ago(this.quota.fetchedAt, now))))
      .child(button("refresh", "Fetch live limits now (omp usage)")
        .on_click((_e, cx) => { this.refreshing = true; this.loadQuota(cx, true); this.loadSpend(cx); cx.notify(); })
        .child(svg("mods/omp-usage/refresh.svg").size(13).text_color(this.refreshing ? t.accent : t.muted)
          .when(this.refreshing, (el) => el.spin(900))))
      .when(!this.broker, (el) => el.child(button("open-dashboard", "Open the usage dashboard")
        .on_click(() => { exec("xdg-open", [API]); })
        .child(div().text_size(12).text_color(t.muted).child("↗"))))
      .when(!!overlay, (el) => el.child(button("close", "Close (ctrl-shift-y)")
        .on_click(() => closeOverlay(overlay))
        .child(svg("mods/workspace-chrome/x.svg").size(13).text_color(t.muted))));

    let body;
    if (this.error && !this.quota && this.broker) {
      body = v_flex().p(12).gap(6).text_size(12)
        .child(div().text_color(t.blocked).child("omp usage through the remote auth broker failed"))
        .child(div().text_color(t.muted).child(`${this.broker} · ${this.error}`))
        .child(div().text_color(t.dim).child("Check ~/.omp/auth-broker.token and that the broker host is reachable over Tailscale."));
    } else if (this.error && !this.quota) {
      body = v_flex().p(12).gap(6).text_size(12)
        .child(div().text_color(t.blocked).child("Usage dashboard is not reachable"))
        .child(div().text_color(t.muted).child(`${API} · ${this.error}`))
        .child(div().text_color(t.dim).child("On the broker host, start ~/.omp/agent/tools/usage-dashboard. On another machine, set OMP_AUTH_BROKER_URL in ~/.env.local to read the broker's accounts."));
    } else if (!this.quota) {
      body = div().p(12).text_size(12).text_color(t.muted).child("Loading…");
    } else {
      body = v_flex().gap(8).p(8)
        .when(!!this.error, (el) => el.child(div().px(2).text_size(11).text_color(t.blocked).child(`Last refresh failed: ${this.error}`)))
        .child(this.spendCard(t))
        .children(this.groups.map((p) => this.providerSection(t, p, now)));
    }

    return v_flex().id("root").size_full().bg(t.chrome)
      .child(header)
      .child(v_flex().id("scroll").flex_1().min_h(0).overflow_y_scrollbar().on_mouse_down("left", keepPress).child(body));
  }
}
