---
name: model-routing
description: "Use before spawning subagents or picking a model: model agents, work-type x criticality matrix, intelligence index and cost, omp usage headroom, quota-aware routing, review panels."
---
# Model routing

The user runs many subscriptions in parallel: Claude ×3, ChatGPT ×2 (Pro + Pro Max), Antigravity ×2, Devin Pro and CommandCode ×2 (SuperGrok exists but Grok is disabled, §0). **Each subagent is a model.** Main chooses the model per task item through `agent` and the effort through `effort`, and gives the role in the packet (`skill://agent-orchestration`).

## 0. Current account policy (2026-10-06) — overrides older guidance below

- **Grok is disabled (user, 2026-10-07).** The xAI OAuth credential (id 12) carries `disabled_cause`, the `grok` agent file was removed (`~/.omp/agent/agents/grok.md`), and Grok is out of every matrix row, review panel and cross-check. Cross-family checks now have three families: Anthropic (`opus`, `fable`), OpenAI (`astra`, `sol`, `luna`) and Google (`gemini`); `gemini` is the only third-family seat, so keep it on critical review panels and use it as the verifier when author and Main are Anthropic + OpenAI. Re-enable only when the user asks.
- **Burn the `yh*` accounts (yh04060) hard (user rule, 2026-10-06).** Both Claude `yh*` and Codex `yh*` are spent at full speed: route every slot that a yh model can take to `opus` or `astra`/`sol`, run waves wide and in parallel, and do not save yh quota for later. The rotation timer (below) brings in helper accounts when yh is blocked, so Main never downgrades to cheap models for quota reasons while any Claude/Codex account is enabled. Watch `Claude 5 Hour` only to pace waves.
- **Use `astra` aggressively, with more `sol` (user rule, 2026-10-07).** While Codex `yh*` has quota, GPT is the first family for every backend / logic / data slot at every criticality, and takes review, verifier, advisor and planning seats whenever family independence (§5) allows (it cannot review GPT-authored work; under a GPT Main pick a non-GPT reviewer). Split GPT slots **`astra` : `sol` ≈ 2 : 1** — `astra` for the hardest logic, security and critical reviews; `sol` (GPT-6.1, omit `effort` = high) for normal implementation, contracts, verification and second opinions. The "avoid routine work" notes in §2 and §4 do not apply. Spawn explicitly with `agent: "astra"` / `agent: "sol"`; astra: omit `effort` (medium), `hi` (= xhigh) only for the hardest problems.
- **Use `opus` (Claude Opus 5.5 on `yh*`) aggressively too (user rule, 2026-10-06).** While `yh*` is under 90% on `Claude 7 Day`, `opus` is the first pick for frontend / UI / copy at every criticality, the default second seat next to `astra` for backend critical/normal work, one of the two planners, and a standing review-panel and verifier seat for non-Anthropic-authored work. Prefer `opus` over `gemini`/`luna` for any slot that needs judgement; keep cheap searchers only for search/scans. The "do not route to your own family by habit" rule is suspended for `opus` while this holds — independence (§5) still applies: `opus` cannot review Opus/Anthropic-authored work, and under an Opus Main its review counts only alongside a non-Anthropic reviewer. Omit `effort` (medium); `hi` only for the hardest problems. Spread parallel Opus waves over time if `Claude 5 Hour` passes 70%.
- **Service tier: standard (`none`) everywhere (user rule, 2026-10-07, to get more volume out of the quota).** `tier.openai: none`, `tier.anthropic: none`, `task.agentServiceTierOverrides: {}`. Priority costs 2.5× (astra) / 2× (sol, luna) Codex quota; turn it back on only when the user asks for speed. Never `ultrafast` (measured 2026-10-06: Codex runs it at standard speed). Tiers are config-only (no per-spawn field) and running sessions keep the tier they started with until restarted.
- **Before every spawn wave, run `headroom.sh` and obey its `SUBAGENT BUDGET` and `ROUTING STEER` lines** (written by the rotation service). Tell the user when an account in use drops to LOW.

### Account rotation — automatic (user rule, 2026-10-07)

A systemd user service rotates Claude and Codex accounts and sets the subagent budget; Main does not flip accounts by hand. No `auth.accountPolicies` in config. **Goal: spend `yh*` (yh04060) fully first, then hand over without a stall.**

- Script: `~/.omp/agent/managed-skills/model-routing/rotate-accounts.py` — `--loop` (the service), `--once`, `--dry-run` (one pass, no changes). Unit: `systemd/omp-account-rotate.service` in the same directory (`Type=simple`, `Restart=always`). State: `~/.omp/agent/rotate-accounts.state.json` (helper windows with fetch time, primary usage samples for burn rates).
- Logs: `journalctl --user -u omp-account-rotate.service -n 30 -o cat` (prints only on changes). Pause: `systemctl --user stop omp-account-rotate.service`; resume with `start`.
- **Full burn**: `yh*` is always enabled; helpers stay **off** while yh has quota (with another account enabled, omp routes away from yh once its 5-hour window is ≥ 85%). Helpers come on when a yh window reaches 99% (Claude `5 Hour`/`7 Day`, Codex `7 days`) and go off again when it recovers.
- **No stall**: the next check is scheduled before the projected wall — 80% of (remaining / measured burn rate), clamped to 1–10 min; 1 min once yh is within 15 points of the wall with no rate yet; 2 min while a burn rate is still being measured; 5 min while yh sits spent. A failed pass retries in 1 min.
- **Usage tracking for disabled helpers**: omp does not report disabled accounts, so when a helper's data is missing or > 3 h old (and not known to have reset), the script enables it for one `omp usage` fetch and disables it again (log line `probed …`). Passed `resetsAt` = window empty.
- **Helper choice**: helpers whose windows are < 95% used; if every helper looks spent, all are enabled anyway rather than leave yh alone at its wall. Claude helpers `ad*` (admin-developers), `gl*` (global); Codex helper `zk*` (zkwmak08). **Burn rule**: a helper whose weekly window resets within 24 h with ≥ 10% left is enabled even while yh has quota.
- **Codex resets**: omp redeems yh's saved resets itself (`codexResets.autoRedeem: yes`, `keepCredits: 1` = keep one spare). With a spare-plus available, yh is held alone at its wall for 2 min (polled every 1 min) so omp can redeem; still walled after that → `zk*` on.
- **Steering live sessions** (user rule, 2026-10-07: astra may be used heavily because Codex yh has saved resets; burn Claude yh fully; **mix, never move everything** — some sessions, e.g. feat-pydantic-ai, are all backend): each pass classifies Claude yh pacing and, on a change, sends a directive with `herdr agent prompt` to every **working** omp pane (idle panes are not woken; they read it as `ROUTING STEER` in `headroom.sh`). States: `mix-opus-N` — the 5-hour window is on pace to wall more than 45 min before its reset (current burn rate; 75% used when no rate yet) → keep about N in 10 opus-eligible spawns (any slot kind, backend included) on `opus`, the rest on `astra`; N = share of the current Claude burn the window can sustain, clamped 2–8; `burn-opus` — ≥ 15% of the 7-day window left with < 30 h to its reset → `opus` wherever it fits, wide waves, backend-heavy sessions split backend about half/half; `claude-helpers` — yh spent, helpers carry Claude; `normal`. Non-urgent changes are spaced ≥ 20 min apart. A Main receiving such a directive applies it to its next spawns without stopping work.
- **Subagent budget** (`~/.omp/agent/rotate-budget.json`, shown by `headroom.sh`): per family, 32 concurrent subagents while that family is burning yh (spend it); once yh is spent and helpers carry it, `max(2, 12 / working omp sessions)` per session, counting sessions `herdr agent list` reports as `working`. `task.maxConcurrency` is set to the larger family cap (hard per-session cap; running sessions may only see it on restart — the headroom line is the live directive).
- The script only toggles rows whose `disabled_cause` is NULL or starts with `manual:` / `temporarily disabled by user`; rows omp disabled for OAuth failures or user deletes are left alone. It sets `disabled_cause = 'manual: account rotation (model-routing skill)'`; `omp usage` calls those "re-login to restore" — ignore it.
- Tunables at the top of the script (`WALL`, `REDEEM_GRACE_S`, `HELPER_LIMIT`, `BURN_HOURS`, `BURN_MIN_LEFT`, `*_INTERVAL_S`, `NEAR_*`, `PROBE_MAX_AGE_S`, `WIDE_CAP`, `HELPER_TOTAL`, `HELPER_MIN`); restart the service after editing.
- New machine: after `sync.sh restore`, run `systemctl --user enable --now ~/.omp/agent/managed-skills/model-routing/systemd/omp-account-rotate.service`.
- Manual one-off override (user request only; stop the service first or it will undo the change on its next pass): `sqlite3 ~/.omp/agent/agent.db "update auth_credentials set disabled_cause=NULL where provider='anthropic' and identity_key like 'email:global%'"`.
- Backup taken before the first manual change: `~/.omp/agent/agent.db.bak-20261006`.


## 1. Model agents

| agent | model | default thinking | family |
|---|---|---|---|
| `opus` | anthropic/claude-opus-5-5 | medium | Anthropic |
| `fable` | anthropic/claude-fable-5-1 | medium | Anthropic (separate Fable bucket) |
| `sol` | openai-codex/gpt-6.1-sol | high | OpenAI |
| `astra` | openai-codex/gpt-6-astra | medium | OpenAI |
| `luna` | openai-codex/gpt-6-luna | high | OpenAI |
| `gemini` | google-antigravity/gemini-3.8-flash → `commandcode/google/gemini-3.8-flash` when antigravity is exhausted | high | Google |
| `swe` | devin/swe-2 (Kimi K3-based) | high | Devin — **overflow only** |
| `mimo` | commandcode/xiaomi/mimo-v2.6-pro | — | CommandCode credits |
| `deepseek` | commandcode/deepseek/deepseek-v4.1-flash | high | CommandCode credits |
| `muse` | commandcode/meta/muse-spark-1.3-contributor | high | CommandCode credits, **Contributor: prompts may be retained for training** |
| `ci` `committer` `pr` `reporter` `naturalizer` | google-antigravity/gemini-3.8-flash (same commandcode fallback) | fixed | Google |

`retry.fallbackChains["google-antigravity/gemini-3.8-flash"] = [commandcode/google/gemini-3.8-flash]` (user rule, 2026-10-07): on antigravity 429/quota walls every Gemini 3.8 Flash user (`gemini`, the fixed-purpose agents, `smol`/`plan` roles, `scout`/`reviewer` overrides) moves to CommandCode credits, and returns to antigravity when its cooldown expires. That spend is accepted; do not swap Gemini slots to other families to avoid it.

`effort` on a task item (`lo`/`med`/`hi`) overrides the default and maps to the model's lowest, middle or highest level, capped at `xhigh` (`task.maxEffort`). Observed 2026-10-02: `sol` lo = low, `swe` hi = high (its `max` is above the cap, so it is clamped).

## 2. Matrix: work kind × criticality → candidates in order

**Primary providers first (user rule, 2026-10-02).** Route every slot to a model on a primary provider: `openai-codex` (`sol`, `astra`, `luna`), `anthropic` (`opus`, `fable`), `google-antigravity` (`gemini`). Spend their subscription quota down to exhaustion. `devin` (`swe`, `devin/…` mirrors) and `commandcode` (`mimo`, `deepseek`, `muse`, `commandcode/…`) are **overflow only**: use them only when every primary candidate for that slot is out of quota (exhausted / limit error / reset pending). Never pick overflow because it is free or cheap. Within primaries the family preference holds: GPT for backend, logic, data and inductive reasoning; Opus for frontend and UI.

Overflow order, only after the primary candidates are exhausted: `swe` → `mimo` → `deepseek` → `muse` (contributor-safe repos only, see the data rule below). On Devin use **only the free `swe` (SWE-2)**; never route to Devin's mirrors of other models (`devin/gpt-6-1-sol`, `devin/claude-opus-5-5`, …) — they spend Devin quota and overage money.

Take the first candidate whose provider still has quota.

| | **critical** | **normal** | **fill-in** |
|---|---|---|---|
| backend / logic / data | `astra` · `opus` · `sol` | `astra` · `opus` · `sol` · `luna` hi | `astra` · `opus` · `luna` · `gemini` |
| frontend / UI / copy | `opus` · `sol` · `opus` hi only for the hardest | `opus` · `astra` · `gemini` | `opus` · `gemini` · `luna` |
| planning | 2 plans: `astra` + `opus` (`fable` as 3rd) | `opus` or `astra` (by the ticket's kind) + `gemini` | — |
| advisor | `astra` · `fable` | `astra` · `fable` · `sol` | — |
| review panel | `gemini` · `opus` · `fable` · `astra` · `sol`, every one with quota; for diffs, exclude the author's family; `gemini` always on critical panels | 2–3 primary families | — |
| verifier | primary family different from author and Main, hi (`astra` when the author is non-GPT, `opus` when the author is non-Anthropic, `gemini` when author and Main cover Anthropic + OpenAI) | `astra` · `opus` · `luna` · `gemini` (not the author's family) | — |
| research / search / vision | fan out 2–4 searchers in parallel: `gemini` · `luna` · `scout` (each a different slice of the question) | same, 1–2 searchers | — |
| scans, cross-checks | `luna` · `gemini` | | |
| docs, commits, PRs, reports | `reporter`/`committer`/`pr`/`naturalizer` (Gemini) | | |

\* **`muse` data rule.** The Contributor route may retain prompts for training. Use it only in open-source or personal repos the user has marked contributor-safe. **Never** use it for gpai-monorepo or any company or proprietary code, and never for credentials, customer data or personal data. When unsure, do not use it. Other CommandCode routes (`mimo`, `deepseek`) are not Contributor routes, but still never receive credentials or customer data.

**Effort per family.** GPT-6.1 Sol only thinks properly at high effort: the `sol` agent defaults to high, so **omit `effort`**, and never pass `lo`/`med` for real work. GPT-6 Astra reasons well at medium: the `astra` agent defaults to medium, so omit `effort` for it too. Passing `hi` maps to their top level, which is clamped to **xhigh**; use it only for the hardest problems. `opus` and `fable` both default to medium; omit `effort` for normal critical work. `opus` `hi` (= xhigh) is reserved for the **hardest** problems: a subtle concurrency, consistency or security bug; an architecture choice that is costly to reverse; or a repair after a medium attempt failed. In the matrix, a bare agent name means "omit `effort`, use the agent default". Never use premium models or `hi` for searching, reading or summarising.

**Search and research are always cheap.** Split the question into slices (by subsystem, by source type, or code vs web) and run 2–4 cheap primary searchers **in parallel** (`gemini`, `luna`, or the bundled `scout`, which is overridden to Gemini Flash). Main merges the results. A premium model only reads the merged bundle when it has to make a decision from it. Main itself should delegate broad search instead of running long grep/web loops on its own premium model.

Criticality, decided by Main:
- **critical**: decides structure; money, auth, data integrity, migrations, concurrency; cross-cutting; open-ended; or a repair after a failure.
- **normal**: judgement needed inside a fixed contract.
- **fill-in**: the plan already decided everything and only implementation remains. If you cannot write the packet without making a decision, the slot is not fill-in.

## 3. Quota: measure before every wave

```bash
~/.omp/agent/managed-skills/model-routing/headroom.sh
```
It prints one line per provider (state = best account) and one line per account, showing every window. Output on 2026-10-02, identifiers redacted:
```
GREEN      anthropic           2 account(s)   best 89%
             gl*               89% Claude 7 Day   reset 127h  [Claude 5 Hour=94%, Claude 7 Day (Fable)=100%, Claude 7 Day=89%]
             ad*               24% Claude 7 Day   reset 35h   [Claude 5 Hour=89%, Claude 7 Day (Fable)=88%, Claude 7 Day=24%]
RED        openai-codex        1 account(s)   best 9%
             zk*               9% 7 days          reset 30h   [7 days=9%]
```

### Multiple accounts per provider

One provider can hold several logins. omp's quota is **per account and per window**, not per provider.

| provider | accounts | windows per account | notes |
|---|---|---|---|
| `anthropic` | 3 (Claude subscriptions, three orgs: `yh*`, `gl*`, `ad*`) | 5 Hour · 7 Day · 7 Day (Fable) | Opus spends 5 Hour + 7 Day. Fable spends 5 Hour + **its own** 7 Day (Fable) window, so Fable is often green when Opus is not. `yh*` is spent first (§0). Each OAuth grant expires ~30 days after login; `omp usage` warns, and the user must re-login. |
| `openai-codex` | 2 unique: `yh*` Pro Max (preferred, §0) and `zk*` Pro (stored twice) | 7 days | The two `zk*` rows share one `accountId`: one quota, the script dedupes it. omp auto-redeems yh's saved resets (`codexResets.autoRedeem: yes`, `keepCredits: 1`); see §0 rotation. |
| `google-antigravity` | 2 | Gemini (several model-group windows) · Claude & GPT (shared) | The Claude & GPT window serves only older Claude 4.x and gpt-oss here, not Opus 5.5. |
| `devin` | 1 Pro seat + overage balance | Daily · Weekly | Hosts SWE-2 and mirrors of Opus, Fable, GPT-6.x, Grok, Gemini. Usage beyond quota draws on the overage balance (real money). |
| `xai-oauth` | 1 (disabled 2026-10-07) | SuperGrok Weekly · Grok Build | Not routed (§0). |
| `commandcode` | 2 | 5-hour · weekly credits · balance | No percentage in JSON (UNMETERED). Every request spends credits. |

How accounts affect routing:
- **You cannot pin an account per spawn.** `task` picks the provider through the model; omp picks the account. `retry.usageAwareFallback` (20% reserve) moves a turn to a healthier account of the same provider before falling back to another model. A provider is therefore as healthy as its **best** account. Its total remaining capacity is the **sum** across accounts.
- Judge each model by the **window it spends**. For example, anthropic best=89% with one account at 24% on `Claude 7 Day` means Opus has roughly one healthy account left, so keep Opus for frontend critical/normal work and avoid burning it on large review panels. Fable is checked on `7 Day (Fable)` separately.
- **A short window refills fast.** Before routing big parallel waves to Anthropic, check `Claude 5 Hour` on both accounts. A wave of many parallel Opus spawns can drain one account's 5-hour window, and then all of them pile onto the other.
- **Same provider, different account is not independence.** Review independence is about the model family, never the account.
- When accounts disagree in state, put the per-account line in the routing record, e.g. `opus (anthropic: gl* 89%, ad* 24%)`.
- **Re-login and resets are user actions.** Never redeem resets or re-authenticate on your own. Report which account needs it.

### State rules (apply to the provider's best account, and to the window the model spends)

- **GREEN** (≥ 40% left): route freely.
- **LOW** (5–40%): still route to it — primary quota is meant to be spent. Prefer GREEN primaries for big parallel waves.
- **EXHAUSTED** (< 5%, limit error, or reset pending): no new work. Move to the next primary candidate in the matrix; only when every primary candidate is exhausted, use the overflow order (`swe` → `mimo` → `deepseek`). For a critical slot with no primary left, tell the user: wait for the reset or use overflow (Codex saved resets are already auto-redeemed down to the one spare; spending the spare is a user call).
- **Overflow** (`devin`, `commandcode`) spends free-promo or paid credits. Never the default; record the reason when used.
- When the GPT family is exhausted, the backend preference temporarily yields: `opus` takes backend critical/normal slots, and the verifier must then be non-Anthropic (`gemini`).
- Record it in the plan/todo: `slot → agent/effort (kind, criticality, quota state)`.

omp also protects quota automatically (`~/.omp/agent/config.yml`): a healthy **account** of the same provider (`retry.usageAwareFallback`, reserve `retry.usageReservePct` = 2). Since 2026-10-02 frontier models (Opus, Fable, Sol, Astra, Luna, Gemini, Grok) have **no** `retry.fallbackChains` entry — neither Devin mirrors nor CommandCode copies — because the primary providers are the only intended route for them; when one is exhausted, Main re-routes the slot to another primary (matrix) or, only if all primaries are exhausted, to an overflow agent (`swe`, `mimo`, `deepseek`). Remaining chains: `devin/swe-2` → `openai-codex/gpt-6-luna` → `commandcode/xiaomi/mimo-v2.6-pro`, and the Chinese-model chains (kimi/deepseek). Background: with the old 20% reserve, Codex at 9% fell through `devin/gpt-6-1-sol` to `commandcode` (403 `MODEL_NOT_IN_PLAN`), killing two Sol coders.

## 4. Model data

| model | index | $in/$out | ctx | character | strengths | avoid |
|---|---:|---:|---:|---|---|---|
| Claude Opus 5.5 | **57.6** | 4/20 | 1M | Highest index in the roster, and cheaper than Fable/Astra | Main, planning, hard code, long-context integration, natural Korean | reviewing work by Opus or under an Opus Main |
| Claude Sonnet 5.5 | 56.0 | 2/10 | 1M | Near-Opus at half price. Not in the default lists | substitute for Opus when Anthropic 5h is tight (no agent; ask the user to add one) | |
| Claude Fable 5.1 | 53.4 | 10/50 | 1M | Architecture and maintainability perspective. Uses its **own weekly bucket** | advisor, second plan, design review | routine code (cost) |
| GPT-6 Astra | 52.7 | 10/50 | 272K (codex) / 1M (devin) | Adversarial thinker; standard tier (§0) | first pick for hardest backend/logic, review, verify, advise (§0, ≈ 2:1 with sol); security, authz, concurrency, crash consistency, partial I/O | reviewing GPT-authored work |
| GPT-6.1 Sol | 51.8 | 2/10 | 272K / 1M | Reliable, literal, precise with contracts; the cross-family alternative to Opus. Needs omp ≥ 18.4.4 | backend code, verifier under an Opus Main, Main alternative | verifying Sol-authored work |
| GPT-6 Sol | 47.5 | 2/10 | 272K | Older Sol | — (use 6.1) | |
| MiMo V2.6 Pro | 46.3 | 0.435/0.87 | 1M | Best index per dollar on CommandCode | easy implementation, localized repair, routine QA | |
| GLM-5.3 | 44.8 | 1.40/4.40 | 1M | | unevaluated: trial first | |
| Kimi K3 | 43.6 | 3/15 | 1M | | unevaluated | |
| GLM-5.3 Flash | 41.8 | 0.15/0.50 | 1M | Literal and cheap | closed-set mechanical edits | anything needing semantics |
| Gemini 3.8 Flash | 40.9 | 1.50/7.50 | 1M | Fast, source-grounded prose, vision | docs, commits, PRs, reports, research sweeps, image reading | implementing, deciding |
| Qwen3.8 Max | 40.2 (0902: 45.4) | 2/6 | 1M | | unevaluated | |
| DeepSeek V4.1 Flash | 39.5 | 0.15/0.60 off-peak | 1M | Fast scanner | discovered-set scans, line-cited cross-checks, small schema-aware repairs | design |
| GPT-6 Luna | 37.3 | 0.10/0.50 | 272K / 1M | Very cheap. Needs omp ≥ 18.2.10, or it silently resolves to GPT-5.6 | research, blind-reader, reviewing non-Luna work, cheap overflow | reviewing Luna-authored work |
| DeepSeek V4 Pro | 36.0 | 0.66/1.98 | 1M | | — | |
| Devin SWE-2 | — | promo/overflow | 262K | Devin's coding model | overflow coding with fixed contracts when primaries are exhausted | default routing, open design, slices that need a decision |
| Muse Spark 1.3 Contributor | — | 0.10/0.20 | 1M | The Contributor route **may retain prompts for training** | only in repos the user marked contributor-safe (not gpai-monorepo) | company code |

Data rule: no credentials, customer data or personal data go to any CommandCode route. Proprietary code never goes to a Contributor route.

## 5. Independence

A review or verification counts only when its family differs from the author's effective model and from Main's model. Main records `author model / Main model / reviewer model`. Model agreement is not evidence; a blocker found by two or more families is strong.
