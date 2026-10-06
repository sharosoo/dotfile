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

function redactAccount(email) {
  var text = String(email || "")
  var at = text.indexOf("@")
  var local = at > 0 ? text.slice(0, at) : text
  return local.length > 2 ? local.slice(0, 2) + "…" : local
}

function credentialEmail(cred) {
  if (cred.email) return String(cred.email)
  var key = String(cred.identityKey || "")
  return key.indexOf("email:") === 0 ? key.slice(6).split("|")[0] : ""
}

// Hangs omp's credential rows (from bin/omp-accounts) under the usage
// accounts they belong to, matched by provider plus email or account id.
// Disabled credentials never show up in `omp usage`, so the ones a person
// switched off become accounts of their own; the ones omp disabled after an
// auth failure or that were deleted stay hidden, a switch cannot fix them.
// Credentials without any identity (API keys) cannot be matched to an
// account, so those accounts get no switch.
function attachCredentials(byProvider, list, credentials) {
  for (var i = 0; i < credentials.length; i++) {
    var c = credentials[i] || {}
    var pid = String(c.provider || "")
    if (pid === "") continue
    var email = credentialEmail(c)
    var accountId = String(c.accountId || "")
    var prov = byProvider[pid]
    var acct = null
    if (prov) {
      for (var a = 0; a < prov.accounts.length && !acct; a++) {
        var x = prov.accounts[a]
        if ((email !== "" && x.rawEmail === email) || (accountId !== "" && x.rawAccountId === accountId)) acct = x
      }
    }
    if (!acct) {
      if (c.userDisabled !== 1) continue
      if (!prov) {
        prov = byProvider[pid] = { id: pid, name: providerName(pid), accounts: [], keys: {} }
        list.push(prov)
      }
      acct = newAccount("credential|" + (email || accountId || c.id), String(email || accountId || ("credential " + c.id)), {})
      acct.rawEmail = email
      acct.rawAccountId = accountId
      prov.accounts.push(acct)
    }
    acct.credentials.push({ id: Number(c.id), enabled: !c.disabledCause, userDisabled: c.userDisabled === 1 })
  }
}

function newAccount(key, label, m) {
  return {
    key: key,
    email: label,
    rawEmail: String(m.email || ""),
    rawAccountId: String(m.accountId || ""),
    plan: String(m.planType || ""),
    org: String(m.orgName || ""),
    limitReached: m.limitReached === true,
    resetCredits: 0,
    limits: [],
    balances: [],
    credentials: [],
    seen: {}
  }
}

function build(data, credentials) {
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
      acct = prov.keys[key] = newAccount(key, String(m.email || m.accountId || m.projectId || "account"), m)
      acct.resetCredits = r.resetCredits ? Number(r.resetCredits.availableCount || 0) : 0
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

  attachCredentials(byProvider, list, credentials || [])

  var accountCount = 0
  for (var p = 0; p < list.length; p++) {
    var provider = list[p]
    delete provider.keys
    var peaks = []
    for (var a = 0; a < provider.accounts.length; a++) {
      var account = provider.accounts[a]
      delete account.seen
      // Off once every credential is off; switchable only when each disabled
      // credential is one a person switched off.
      var creds = account.credentials
      account.credentialIds = creds.map(function(c) { return c.id })
      account.enabled = creds.length === 0 || creds.some(function(c) { return c.enabled })
      account.switchable = creds.length > 0 && creds.every(function(c) { return c.enabled || c.userDisabled })
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
