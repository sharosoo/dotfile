.pragma library

// Turns `omp usage --json` into providers -> accounts -> limit windows.
// omp reports one entry per credential, so the same account can appear more
// than once (Codex with and without an org) and shared quotas are listed once
// per model (Antigravity's "Claude & GPT"). Both collapse here.

var NAMES = {
  "anthropic": "Claude",
  "openai-codex": "Codex",
  "google-antigravity": "Antigravity",
  "google-gemini-cli": "Gemini CLI",
  "xai-oauth": "Grok",
  "github-copilot": "Copilot",
  "commandcode": "Command Code",
  "zai": "Z.ai",
  "kimi": "Kimi"
}

var ORDER = ["anthropic", "openai-codex", "google-antigravity", "google-gemini-cli", "xai-oauth", "github-copilot", "commandcode"]

function providerName(id) {
  if (NAMES[id]) return NAMES[id]
  return String(id || "").replace(/[-_]+/g, " ").replace(/\b\w/g, function(c) { return c.toUpperCase() })
}

function limitTitle(limit) {
  var label = String(limit.label || "").trim()
  var win = limit.window && limit.window.label ? String(limit.window.label).trim() : ""
  if (win === "" || label.toLowerCase().indexOf(win.toLowerCase()) >= 0) return label || "Limit"
  if (label === "") return win
  return label + " · " + win
}

function formatAmount(value, unit) {
  var n = Number(value)
  if (!isFinite(n)) return ""
  var text = Math.abs(n) >= 100 ? String(Math.round(n)) : n.toFixed(2).replace(/\.?0+$/, "")
  return unit && unit !== "percent" ? text + " " + unit : text
}

function peakOf(limits) {
  var best = null
  for (var i = 0; i < limits.length; i++)
    if (!best || limits[i].percent > best.percent) best = limits[i]
  return best
}

function shortAccount(email) {
  var text = String(email || "")
  var at = text.indexOf("@")
  return at > 0 ? text.slice(0, at) : text
}

function build(data) {
  var byProvider = {}
  var list = []
  var reports = (data && data.reports) || []

  for (var i = 0; i < reports.length; i++) {
    var r = reports[i] || {}
    var m = r.metadata || {}
    var pid = String(r.provider || "unknown")
    var prov = byProvider[pid]
    if (!prov) {
      prov = byProvider[pid] = { id: pid, name: providerName(pid), accounts: [], keys: {} }
      list.push(prov)
    }

    var key = [m.email || "", m.accountId || "", m.projectId || ""].join("|")
    var acct = prov.keys[key]
    if (!acct) {
      acct = prov.keys[key] = {
        key: key,
        email: String(m.email || m.accountId || m.projectId || "account"),
        plan: String(m.planType || ""),
        org: String(m.orgName || ""),
        limitReached: m.limitReached === true,
        resetCredits: r.resetCredits ? Number(r.resetCredits.availableCount || 0) : 0,
        limits: [],
        balances: [],
        seen: {}
      }
      prov.accounts.push(acct)
    } else {
      if (acct.org === "" && m.orgName) acct.org = String(m.orgName)
      if (acct.plan === "" && m.planType) acct.plan = String(m.planType)
    }

    var limits = r.limits || []
    for (var j = 0; j < limits.length; j++) {
      var l = limits[j] || {}
      var amount = l.amount || {}
      var scope = l.scope || {}
      var win = l.window || {}
      var title = limitTitle(l)
      var dedupe = scope.sharedGroup || (title + "|" + (win.id || ""))
      if (acct.seen[dedupe]) continue
      acct.seen[dedupe] = true

      if (amount.usedFraction === undefined || amount.usedFraction === null) {
        if (amount.remaining !== undefined && amount.remaining !== null)
          acct.balances.push({ title: String(l.label || "Balance"), text: formatAmount(amount.remaining, amount.unit) })
        continue
      }

      var detail = ""
      if (amount.unit && amount.unit !== "percent" && amount.used !== undefined && amount.limit !== undefined)
        detail = formatAmount(amount.used, "") + " / " + formatAmount(amount.limit, amount.unit)

      acct.limits.push({
        title: title,
        percent: Math.max(0, Number(amount.usedFraction) || 0),
        resetAt: Number(win.resetsAt || 0),
        durationMs: Number(win.durationMs || 0),
        detail: detail,
        exhausted: l.status === "exhausted" || l.status === "blocked"
      })
    }
  }

  var accountCount = 0
  for (var p = 0; p < list.length; p++) {
    var provider = list[p]
    delete provider.keys
    var peaks = []
    for (var a = 0; a < provider.accounts.length; a++) {
      var account = provider.accounts[a]
      delete account.seen
      account.limits.sort(function(x, y) {
        return (x.durationMs || Infinity) - (y.durationMs || Infinity) || x.title.localeCompare(y.title)
      })
      account.peak = peakOf(account.limits)
      if (account.peak) peaks.push(account.peak)
    }
    provider.peak = peakOf(peaks)
    accountCount += provider.accounts.length
  }

  list.sort(function(x, y) {
    var ix = ORDER.indexOf(x.id), iy = ORDER.indexOf(y.id)
    if (ix < 0) ix = ORDER.length
    if (iy < 0) iy = ORDER.length
    return ix - iy || x.name.localeCompare(y.name)
  })

  var overall = null
  for (var q = 0; q < list.length; q++) {
    var pk = list[q].peak
    if (pk && (!overall || pk.percent > overall.limit.percent)) overall = { provider: list[q].name, limit: pk }
  }

  return {
    providers: list,
    accountCount: accountCount,
    overall: overall,
    generatedAt: Number((data && data.generatedAt) || Date.now()),
    withoutUsage: ((data && data.accountsWithoutUsage) || []).length,
    disabled: ((data && data.disabledCredentials) || []).length
  }
}
