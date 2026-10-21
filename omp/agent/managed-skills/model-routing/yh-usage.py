#!/usr/bin/env python3
"""Track and report API-equivalent usage for yh04060@gmail.com across subscriptions.

Why: yh04060@gmail.com holds three paid subscriptions (Claude, ChatGPT Pro / Codex,
Google AI Ultra / Antigravity). To decide whether each subscription is worth keeping,
we track every assistant turn billed to a yh04060 credentialId in ~/.omp/agent/sessions,
cache per-file aggregates by (size, mtime_ns) so re-runs take <0.2s, persist the latest
report to ~/.omp/agent/yh04060-usage.json, and print a breakdown by provider, model, and day.
"""
import datetime
import glob
import json
import os
import sqlite3
import sys

HOME = os.path.expanduser("~")
AGENT_DIR = os.path.join(HOME, ".omp", "agent")
DB_PATH = os.path.join(AGENT_DIR, "agent.db")
STATE_PATH = os.path.join(AGENT_DIR, "rotate-accounts.state.json")
CACHE_PATH = os.path.join(AGENT_DIR, "yh04060-usage-cache.json")
REPORT_PATH = os.path.join(AGENT_DIR, "yh04060-usage.json")
SESSIONS_GLOB = os.path.join(AGENT_DIR, "sessions", "**", "*.jsonl")

EMAIL = "yh04060@gmail.com"
# Seeded credential IDs so history survives even if auth_credentials rows are later deleted.
SEED_CREDENTIAL_IDS = {
    24: "openai-codex",
    25: "anthropic",
    27: "google-antigravity",
}

# Standard API list prices ($ per 1M tokens: input, output, cache_read, cache_write)
STD_RATES = {
    "gpt-6-astra": (10.0, 50.0, 1.0, 0.0),
    "gpt-6.1-sol": (2.0, 10.0, 0.2, 0.0),
    "gpt-6-sol": (2.0, 10.0, 0.2, 0.0),
    "gpt-6-luna": (0.10, 0.50, 0.01, 0.0),
    "claude-opus-5-5": (4.0, 20.0, 0.40, 5.0),
    "claude-sonnet-5-5": (2.0, 10.0, 0.20, 2.50),
    "claude-fable-5-1": (10.0, 50.0, 1.0, 12.50),
    "claude-haiku-5-5": (0.10, 0.50, 0.01, 0.125),
    "claude-haiku-4-5": (1.0, 5.0, 0.10, 1.25),
    "gemini-4-argon": (2.0, 10.0, 0.10, 0.0),  # launch promo ($4/$20/$0.20 standard)
    "gemini-3.8-flash": (1.50, 7.50, 0.075, 0.0),
    "gemini-3.7-flash": (1.50, 7.50, 0.075, 0.0),
}

KST = datetime.timezone(datetime.timedelta(hours=9))


def discover_yh_credentials():
    creds = dict(SEED_CREDENTIAL_IDS)
    if os.path.exists(STATE_PATH):
        try:
            st = json.load(open(STATE_PATH))
            for cid_str, info in (st.get("credentialIds") or {}).items():
                if info.get("email") == EMAIL:
                    creds[int(cid_str)] = info["provider"]
        except Exception:
            pass
    if os.path.exists(DB_PATH):
        try:
            con = sqlite3.connect(DB_PATH, timeout=5)
            rows = con.execute(
                "SELECT id, provider, identity_key FROM auth_credentials WHERE identity_key LIKE ?",
                (f"%{EMAIL}%",),
            ).fetchall()
            con.close()
            for cid, prov, _ in rows:
                creds[int(cid)] = prov
        except Exception:
            pass
    return creds


def std_cost(model, inp, out, cr, cw, fallback):
    r = STD_RATES.get(model)
    if not r:
        return fallback
    return (inp * r[0] + out * r[1] + cr * r[2] + cw * r[3]) / 1e6


def parse_file(path, yh_creds):
    """Return list of bucketed records for yh04060 turns in a single session file."""
    buckets = {}
    with open(path, "r", errors="replace") as f:
        for line in f:
            if '"credentialId":' not in line:
                continue
            try:
                obj = json.loads(line)
            except Exception:
                continue
            m = obj.get("message") or {}
            if m.get("role") != "assistant":
                continue
            cid = m.get("credentialId")
            if cid not in yh_creds:
                continue
            prov = m.get("provider") or yh_creds[cid]
            mod = m.get("model") or "unknown"
            u = m.get("usage") or {}
            inp = int(u.get("input", 0) or 0)
            out = int(u.get("output", 0) or 0)
            cr = int(u.get("cacheRead", 0) or 0)
            cw = int(u.get("cacheWrite", 0) or 0)
            rc = float((u.get("cost") or {}).get("total", 0.0) or 0.0)
            sc = std_cost(mod, inp, out, cr, cw, rc)
            ts = int(m.get("timestamp") or 0)
            day = (
                datetime.datetime.fromtimestamp(ts / 1000.0, tz=KST).strftime("%Y-%m-%d")
                if ts
                else "unknown"
            )
            key = f"{day}|{cid}|{prov}|{mod}"
            rec = buckets.get(key)
            if rec is None:
                buckets[key] = [1, inp, out, cr, cw, rc, sc, ts, ts]
            else:
                rec[0] += 1
                rec[1] += inp
                rec[2] += out
                rec[3] += cr
                rec[4] += cw
                rec[5] += rc
                rec[6] += sc
                if ts:
                    rec[7] = min(rec[7], ts) if rec[7] else ts
                    rec[8] = max(rec[8], ts) if rec[8] else ts
    return buckets


def build_report():
    yh_creds = discover_yh_credentials()
    cache = {}
    if os.path.exists(CACHE_PATH):
        try:
            cache = json.load(open(CACHE_PATH))
        except Exception:
            cache = {}
    cached_files = cache.get("files") if cache.get("credIds") == sorted(yh_creds.keys()) else {}
    if not isinstance(cached_files, dict):
        cached_files = {}

    new_files = {}
    dirty = False
    for path in glob.glob(SESSIONS_GLOB, recursive=True):
        try:
            st = os.stat(path)
        except OSError:
            continue
        sig = [st.st_size, st.st_mtime_ns]
        prev = cached_files.get(path)
        if prev and prev.get("sig") == sig:
            new_files[path] = prev
        else:
            new_files[path] = {"sig": sig, "buckets": parse_file(path, yh_creds)}
            dirty = True

    if dirty or len(new_files) != len(cached_files):
        tmp = CACHE_PATH + ".tmp"
        with open(tmp, "w") as f:
            json.dump({"credIds": sorted(yh_creds.keys()), "files": new_files}, f)
        os.replace(tmp, CACHE_PATH)

    by_provider = {}
    by_model = {}
    by_day = {}

    def add(target, k, v):
        cur = target.get(k)
        if cur is None:
            target[k] = list(v)
        else:
            for i in range(7):
                cur[i] += v[i]
            if v[7]:
                cur[7] = min(cur[7], v[7]) if cur[7] else v[7]
            if v[8]:
                cur[8] = max(cur[8], v[8]) if cur[8] else v[8]

    for entry in new_files.values():
        for key, v in entry["buckets"].items():
            day, cid_s, prov, mod = key.split("|", 3)
            add(by_provider, prov, v)
            add(by_model, f"{prov}/{mod}", v)
            add(by_day, f"{day}|{prov}", v)

    def fmt_rec(v):
        return {
            "messages": v[0],
            "inputTokens": v[1],
            "outputTokens": v[2],
            "cacheReadTokens": v[3],
            "cacheWriteTokens": v[4],
            "recordedCostUsd": round(v[5], 2),
            "standardApiCostUsd": round(v[6], 2),
            "firstAt": datetime.datetime.fromtimestamp(v[7] / 1000.0, tz=KST).strftime("%Y-%m-%d %H:%M") if v[7] else None,
            "lastAt": datetime.datetime.fromtimestamp(v[8] / 1000.0, tz=KST).strftime("%Y-%m-%d %H:%M") if v[8] else None,
        }

    days_sorted = sorted({k.split("|", 1)[0] for k in by_day})
    daily = {}
    for d in days_sorted:
        daily[d] = {}
        for prov in ("anthropic", "openai-codex", "google-antigravity"):
            v = by_day.get(f"{d}|{prov}")
            if v:
                daily[d][prov] = {
                    "messages": v[0],
                    "recordedCostUsd": round(v[5], 2),
                    "standardApiCostUsd": round(v[6], 2),
                }

    report = {
        "email": EMAIL,
        "updatedAt": datetime.datetime.now(tz=KST).strftime("%Y-%m-%d %H:%M:%S KST"),
        "credentialIds": {str(k): v for k, v in sorted(yh_creds.items())},
        "providers": {k: fmt_rec(v) for k, v in sorted(by_provider.items())},
        "models": {k: fmt_rec(v) for k, v in sorted(by_model.items())},
        "daily": daily,
    }
    tmp_r = REPORT_PATH + ".tmp"
    with open(tmp_r, "w") as f:
        json.dump(report, f, indent=2)
    os.replace(tmp_r, REPORT_PATH)
    return report


def print_human(rep):
    print(f"=== yh04060@gmail.com API Usage Report ({rep['updatedAt']}) ===")
    print(f"Credentials tracked: {rep['credentialIds']}\n")
    print(f"{'Provider':20s} {'Msgs':>8s} {'In(M)':>8s} {'Out(M)':>8s} {'CacheR(M)':>10s} {'Rec Cost':>11s} {'Std API Cost':>13s}  {'Span (KST)'}")
    print("-" * 108)
    tot_rec = tot_std = tot_msgs = 0
    for prov, d in rep["providers"].items():
        tot_msgs += d["messages"]
        tot_rec += d["recordedCostUsd"]
        tot_std += d["standardApiCostUsd"]
        span = f"{d['firstAt']} -> {d['lastAt']}"
        print(
            f"{prov:20s} {d['messages']:8d} {d['inputTokens']/1e6:8.2f} {d['outputTokens']/1e6:8.2f} "
            f"{d['cacheReadTokens']/1e6:10.2f} ${d['recordedCostUsd']:10,.2f} ${d['standardApiCostUsd']:12,.2f}  {span}"
        )
    print("-" * 108)
    print(f"{'TOTAL':20s} {tot_msgs:8d} {'':8s} {'':8s} {'':10s} ${tot_rec:10,.2f} ${tot_std:12,.2f}\n")

    print("By Model:")
    for mod, d in rep["models"].items():
        print(
            f"  {mod:36s} msgs={d['messages']:6d}  out={d['outputTokens']/1e6:6.2f}M  "
            f"cacheR={d['cacheReadTokens']/1e6:8.2f}M  rec=${d['recordedCostUsd']:9,.2f}  std=${d['standardApiCostUsd']:9,.2f}"
        )

    print("\nBy Day (KST) — Recorded / Standard API Cost:")
    for day, provs in rep["daily"].items():
        c = provs.get("openai-codex", {})
        a = provs.get("anthropic", {})
        g = provs.get("google-antigravity", {})
        cr, cs = c.get("recordedCostUsd", 0.0), c.get("standardApiCostUsd", 0.0)
        ar, as_ = a.get("recordedCostUsd", 0.0), a.get("standardApiCostUsd", 0.0)
        gr, gs = g.get("recordedCostUsd", 0.0), g.get("standardApiCostUsd", 0.0)
        print(
            f"  {day}  Codex=${cr:8,.2f} (std ${cs:7,.2f}) | Claude=${ar:8,.2f} (std ${as_:7,.2f}) | "
            f"Antigrav=${gr:6,.2f} | Day Total=${cr+ar+gr:8,.2f} (std ${cs+as_+gs:8,.2f})"
        )


if __name__ == "__main__":
    rep = build_report()
    if "--quiet" in sys.argv:
        sys.exit(0)
    if "--json" in sys.argv:
        print(json.dumps(rep, indent=2))
    else:
        print_human(rep)
