#!/usr/bin/python3
# <swiftbar.title>omp usage</swiftbar.title>
# <swiftbar.desc>AI usage limits for every provider/account omp knows (via the turing auth broker).</swiftbar.desc>
# <swiftbar.hideAbout>true</swiftbar.hideAbout>
# <swiftbar.hideRunInTerminal>true</swiftbar.hideRunInTerminal>
# <swiftbar.hideDisablePlugin>true</swiftbar.hideDisablePlugin>
#
# macOS counterpart of omarchy/home/.config/omarchy/plugins/sharosoo.omp-usage:
# same `omp usage --json` source and the same per-account dedupe as Model.js.
# Credential on/off switches are left out: on a broker client the credentials
# live on turing, not in the local agent.db.
import json
import os
import subprocess
import time

HOME = os.path.expanduser("~")
NAMES = {
    "anthropic": "Claude",
    "openai-codex": "Codex",
    "google-antigravity": "Antigravity",
    "google-gemini-cli": "Gemini CLI",
    "xai-oauth": "Grok",
    "github-copilot": "Copilot",
    "commandcode": "Command Code",
    "zai": "Z.ai",
    "kimi": "Kimi",
}
ORDER = ["anthropic", "openai-codex", "google-antigravity", "google-gemini-cli", "xai-oauth", "github-copilot", "commandcode"]
MONO = "font=Menlo size=12"


def load_env_local():
    # fish sources ~/.env.local at login; SwiftBar does not, so OMP_AUTH_BROKER_URL is read here.
    path = os.path.join(HOME, ".env.local")
    if not os.path.exists(path):
        return
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line.startswith("export "):
                line = line[len("export "):]
            if "=" not in line or line.startswith("#"):
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip("'\""))


def find_omp():
    for p in (os.path.join(HOME, ".bun/bin/omp"), os.path.join(HOME, ".local/share/mise/shims/omp"), "/opt/homebrew/bin/omp"):
        if os.access(p, os.X_OK):
            return p
    return "omp"


def provider_name(pid):
    return NAMES.get(pid) or pid.replace("-", " ").replace("_", " ").title()


def limit_title(limit):
    label = str(limit.get("label") or "").strip()
    win = str((limit.get("window") or {}).get("label") or "").strip()
    if not win or win.lower() in label.lower():
        return label or "Limit"
    return win if not label else label + " · " + win


def fmt_amount(value, unit=""):
    try:
        n = float(value)
    except (TypeError, ValueError):
        return ""
    text = str(int(round(n))) if abs(n) >= 100 else ("%.2f" % n).rstrip("0").rstrip(".")
    return text + " " + unit if unit and unit != "percent" else text


def fmt_reset(ms):
    if not ms:
        return ""
    left = int(ms / 1000 - time.time())
    if left <= 0:
        return "resets now"
    d, rem = divmod(left, 86400)
    h, rem = divmod(rem, 3600)
    m = rem // 60
    if d:
        return "resets in %dd%dh" % (d, h)
    if h:
        return "resets in %dh%dm" % (h, m)
    return "resets in %dm" % m


def bar(fraction, cells=12):
    filled = max(0, min(cells, int(round(min(fraction, 1.0) * cells))))
    return "█" * filled + "░" * (cells - filled)


def color(fraction):
    if fraction >= 0.9:
        return "#ff5f57"
    if fraction >= 0.7:
        return "#febc2e"
    return None


def build(data):
    providers = {}
    for r in data.get("reports") or []:
        m = r.get("metadata") or {}
        pid = str(r.get("provider") or "unknown")
        prov = providers.setdefault(pid, {"id": pid, "name": provider_name(pid), "accounts": {}})
        key = "|".join(str(m.get(k) or "") for k in ("email", "accountId", "projectId"))
        acct = prov["accounts"].get(key)
        if acct is None:
            label = str(m.get("email") or m.get("accountId") or m.get("projectId") or "account")
            acct = prov["accounts"][key] = {
                "label": label.split("@")[0] if "@" in label else label,
                "plan": str(m.get("planType") or ""),
                "limits": [], "balances": [], "seen": set(),
            }
        for l in r.get("limits") or []:
            amount = l.get("amount") or {}
            scope = l.get("scope") or {}
            win = l.get("window") or {}
            title = limit_title(l)
            dedupe = scope.get("sharedGroup") or title + "|" + str(win.get("id") or "")
            if dedupe in acct["seen"]:
                continue
            acct["seen"].add(dedupe)
            if amount.get("usedFraction") is None:
                if amount.get("remaining") is not None:
                    acct["balances"].append((str(l.get("label") or "Balance"), fmt_amount(amount["remaining"], amount.get("unit"))))
                continue
            detail = ""
            if amount.get("unit") not in (None, "percent") and amount.get("used") is not None and amount.get("limit") is not None:
                detail = fmt_amount(amount["used"]) + " / " + fmt_amount(amount["limit"], amount.get("unit"))
            acct["limits"].append({
                "title": title,
                "fraction": max(0.0, float(amount.get("usedFraction") or 0)),
                "reset": win.get("resetsAt") or 0,
                "duration": win.get("durationMs") or float("inf"),
                "detail": detail,
                "exhausted": l.get("status") in ("exhausted", "blocked"),
            })
    ordered = sorted(providers.values(), key=lambda p: (ORDER.index(p["id"]) if p["id"] in ORDER else len(ORDER), p["name"]))
    for p in ordered:
        for a in p["accounts"].values():
            a["limits"].sort(key=lambda x: (x["duration"], x["title"]))
    return ordered


def main():
    load_env_local()
    # omp is a bun script; SwiftBar starts plugins with a bare PATH.
    os.environ["PATH"] = os.pathsep.join([os.path.join(HOME, ".bun/bin"), os.path.join(HOME, ".local/share/mise/shims"),
                                          "/opt/homebrew/bin", os.environ.get("PATH", "/usr/bin:/bin")])
    omp = find_omp()
    out = None
    try:
        out = subprocess.run([omp, "usage", "--json"], capture_output=True, text=True, timeout=60)
        data = json.loads(out.stdout)
    except Exception as e:  # noqa: BLE001 - any failure becomes a menu bar error state
        reason = (out.stderr.strip().splitlines() or [str(e)])[-1] if out is not None and out.stderr.strip() else str(e)
        print("omp ⚠ | sfimage=exclamationmark.triangle")
        print("---")
        print("omp usage failed: %s | color=#ff5f57" % reason.replace("|", "/")[:120])
        print("Refresh | refresh=true sfimage=arrow.clockwise")
        return

    providers = build(data)
    peak = None
    for p in providers:
        for a in p["accounts"].values():
            for l in a["limits"]:
                if peak is None or l["fraction"] > peak[2]["fraction"]:
                    peak = (p["name"], a["label"], l)

    if peak:
        c = color(peak[2]["fraction"])
        print("%d%% | sfimage=gauge.with.needle%s" % (round(peak[2]["fraction"] * 100), " color=" + c if c else ""))
    else:
        print("omp | sfimage=gauge.with.needle")
    print("---")
    if peak:
        print("Highest: %s %s · %s %d%% | size=12" % (peak[0], peak[1], peak[2]["title"], round(peak[2]["fraction"] * 100)))
        print("---")
    if not providers:
        print("omp has no provider usage to report.")

    for p in providers:
        print("%s | sfimage=sparkles size=13" % p["name"])
        for a in p["accounts"].values():
            plan = " · " + a["plan"] if a["plan"] else ""
            print("%s%s | size=12 color=#8e8e93" % (a["label"], plan))
            for l in a["limits"]:
                pct = round(l["fraction"] * 100)
                extra = " · ".join(x for x in (l["detail"], fmt_reset(l["reset"])) if x)
                c = "#ff5f57" if l["exhausted"] else color(l["fraction"])
                print("  %s %3d%%  %s | %s%s" % (bar(l["fraction"]), pct, l["title"], MONO, " color=" + c if c else ""))
                if extra:
                    print("--%s | size=12" % extra)
            for title, text in a["balances"]:
                print("  %s: %s | %s" % (title, text, MONO))
        print("---")

    gen = data.get("generatedAt")
    if gen:
        print("Updated %s | size=11 color=#8e8e93" % time.strftime("%H:%M", time.localtime(gen / 1000)))
    print("Open omp usage in Terminal | bash=%s param1=usage terminal=true sfimage=terminal" % omp)
    print("Refresh | refresh=true sfimage=arrow.clockwise")


if __name__ == "__main__":
    main()
