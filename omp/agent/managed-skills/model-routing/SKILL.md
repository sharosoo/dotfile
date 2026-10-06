---
name: model-routing
description: "Use before spawning subagents or picking a model: model agents, work-type x criticality matrix, intelligence index and cost, omp usage headroom, quota-aware routing, review panels."
---
# Model routing

The user runs many subscriptions in parallel: Claude ×3, ChatGPT ×2 (Pro + Pro Max), Antigravity ×2, Devin Pro, SuperGrok and CommandCode ×2. **Each subagent is a model.** Main chooses the model per task item through `agent` and the effort through `effort`, and gives the role in the packet (`skill://agent-orchestration`).

## 0. Current account policy (2026-10-06) — overrides older guidance below

- **Use `astra` aggressively (user rule, 2026-10-06).** While Codex `yh*` has headroom, `astra` is the **first** candidate for every backend / logic / data slot at every criticality (critical, normal and fill-in), and takes review, verifier, advisor and planning seats whenever family independence (§5) allows (it cannot review GPT-authored work; under a GPT Main pick a non-GPT reviewer). The "avoid routine work" notes in §2 and §4 do not apply. Spawn it explicitly with `agent: "astra"`; omit `effort` (medium), `hi` (= xhigh) only for the hardest problems.
- **Service tier: `priority` (fast), never `ultrafast`** (measured 2026-10-06: Codex runs ultrafast at standard speed). The `task` tool has no per-spawn tier field, so tiers live only in config; subagents inherit (`tier.subagent: inherit`).
  - **Codex: always `priority`.** `tier.openai: priority` plus `task.agentServiceTierOverrides: { astra: priority, security-reviewer: priority }`. Codex priority costs 2.5× (astra) / 2× (sol, luna) quota.
  - **Claude: `priority` only while every enabled Claude account is `yh*` or an account being burned before its window resets; otherwise off.** omp cannot set a tier per account, so Main switches it whenever it flips Claude accounts (table below): enabled set ⊆ {`yh*`, burn-target} → `omp config set tier.anthropic priority`; any other account enabled (e.g. `ad*` after yh hits 80%, or `gl*` re-enabled after its reset as a normal account) → `omp config reset tier.anthropic` (back to `none`). Check with `omp config get tier.anthropic`, then `dotfile/omp/sync.sh capture`. A burn-target is an account whose current window resets soon with quota left that would otherwise be wasted (e.g. `gl*` on 2026-10-06).
  - Check headroom before big waves and tell the user when an account in use drops to LOW.

### Account priority — managed by hand (user rule, 2026-10-06)

No `auth.accountPolicies` in config: omp's automatic ranking is not used to order accounts. Main enables only the accounts the order below allows and flips them itself as usage moves. Measure with `omp usage --json` (per-account `limits[].amount.used` / `window.resetsAt`) or `headroom.sh`.

| provider | order | rule |
|---|---|---|
| `anthropic` | 1. `gl*` (global@teamturing.com) → 2. `yh*` (yh04060) → 3. `ad*` (admin-developers) | Burn `gl*` first while its current window lasts (7 Day 63% used, resets ~2026-10-07 21:00). When `gl*` is spent (window ≥ 95% used or limit errors), **disable `gl*`**, leaving only `yh*`. When `yh*` reaches **80% used on `Claude 7 Day`**, **enable `ad*`** (and `gl*` if its window has reset). |
| `openai-codex` | 1. `yh*` (yh04060, Pro Max $500) → 2. `zk*` (zkwmak08, Pro) | Only `yh*` enabled. Enable `zk*` when `yh*` reaches 80% used on `7 days`, or when the user asks. |

State on 2026-10-06: disabled = Claude `ad*` (id 14), Codex `zk*` (ids 1, 2); enabled = Claude `gl*` (23, burn-target), `yh*` (25), Codex `yh*` (24). `tier.anthropic: priority` (enabled Claude set = yh + burn-target).

Disable / enable (credential rows in `~/.omp/agent/agent.db`, table `auth_credentials`; running sessions pick the change up through the auth revision trigger). `omp usage` labels such rows "re-login to restore" — ignore that; clearing `disabled_cause` restores them, no re-login needed:
```bash
# list
sqlite3 ~/.omp/agent/agent.db "select id, provider, identity_key, disabled_cause from auth_credentials where provider in ('anthropic','openai-codex')"
# disable (EMAIL prefix e.g. global, yh04060, admin-developers, zkwmak08; set provider to 'anthropic' or 'openai-codex')
sqlite3 ~/.omp/agent/agent.db "update auth_credentials set disabled_cause='manual: account priority (model-routing skill)', updated_at=strftime('%s','now') where provider='anthropic' and identity_key like 'email:EMAIL%'"
# enable
sqlite3 ~/.omp/agent/agent.db "update auth_credentials set disabled_cause=NULL, updated_at=strftime('%s','now') where provider='anthropic' and identity_key like 'email:EMAIL%'"
```
- Only touch rows whose `disabled_cause` starts with `manual:` or `temporarily disabled by user` — never revive rows omp disabled for OAuth failures (`invalid_grant`, `Grant not found`); those need a user re-login.
- Never leave a provider with zero enabled accounts. Before disabling the last-but-one, confirm the remaining account has headroom.
- After each flip: re-apply the Claude tier rule above, run `omp usage`, update the "State" line, and tell the user which account changed, why, and whether Claude fast is on or off.
- Backup taken before the first manual change: `~/.omp/agent/agent.db.bak-20261006`.


## 1. Model agents

| agent | model | default thinking | family |
|---|---|---|---|
| `opus` | anthropic/claude-opus-5-5 | medium | Anthropic |
| `fable` | anthropic/claude-fable-5-1 | medium | Anthropic (separate Fable bucket) |
| `sol` | openai-codex/gpt-6.1-sol | high | OpenAI |
| `astra` | openai-codex/gpt-6-astra | medium | OpenAI |
| `luna` | openai-codex/gpt-6-luna | high | OpenAI |
| `gemini` | google-antigravity/gemini-3.8-flash | high | Google |
| `grok` | xai-oauth/grok-4.7 | high | xAI |
| `swe` | devin/swe-2 (Kimi K3-based) | high | Devin — **overflow only** |
| `mimo` | commandcode/xiaomi/mimo-v2.6-pro | — | CommandCode credits |
| `deepseek` | commandcode/deepseek/deepseek-v4.1-flash | high | CommandCode credits |
| `muse` | commandcode/meta/muse-spark-1.3-contributor | high | CommandCode credits, **Contributor: prompts may be retained for training** |
| `ci` `committer` `pr` `reporter` `naturalizer` | gemini-3.8-flash | fixed | Google |

`effort` on a task item (`lo`/`med`/`hi`) overrides the default and maps to the model's lowest, middle or highest level, capped at `xhigh` (`task.maxEffort`). Observed 2026-10-02: `sol` lo = low, `grok` med = medium, `swe` hi = high (its `max` is above the cap, so it is clamped).

## 2. Matrix: work kind × criticality → candidates in order

**Primary providers first (user rule, 2026-10-02).** Route every slot to a model on a primary provider: `openai-codex` (`sol`, `astra`, `luna`), `anthropic` (`opus`, `fable`), `google-antigravity` (`gemini`), `xai-oauth` (`grok`). Spend their subscription quota down to exhaustion. `devin` (`swe`, `devin/…` mirrors) and `commandcode` (`mimo`, `deepseek`, `muse`, `commandcode/…`) are **overflow only**: use them only when every primary candidate for that slot is out of quota (exhausted / limit error / reset pending). Never pick overflow because it is free or cheap. Within primaries the family preference holds: GPT for backend, logic, data and inductive reasoning; Opus for frontend and UI.

Overflow order, only after the primary candidates are exhausted: `swe` → `mimo` → `deepseek` → `muse` (contributor-safe repos only, see the data rule below). On Devin use **only the free `swe` (SWE-2)**; never route to Devin's mirrors of other models (`devin/gpt-6-1-sol`, `devin/claude-opus-5-5`, …) — they spend Devin quota and overage money.

Take the first candidate whose provider still has quota.

| | **critical** | **normal** | **fill-in** |
|---|---|---|---|
| backend / logic / data | `astra` · `sol` · `opus` | `astra` · `sol` · `luna` hi · `grok` · `opus` | `astra` · `luna` · `gemini` · `grok` |
| frontend / UI / copy | `opus` · `sol` · `opus` hi only for the hardest | `opus` · `gemini` · `luna` | `gemini` · `luna` · `opus` |
| planning | 2 plans: `sol` + `opus` (`fable` as 3rd) | one primary of the ticket's kind + `gemini` or `grok` | — |
| advisor | `astra` · `fable` | `astra` · `fable` · `sol` | — |
| review panel | `grok` · `gemini` · `opus` · `fable` · `astra` · `sol`, every one with quota; for diffs, exclude the author's family | 2–3 primary families | — |
| verifier | primary family different from author and Main, hi (`astra` when the author is non-GPT) | `astra` · `luna` · `gemini` · `grok` (not the author's family) | — |
| research / search / vision | fan out 2–4 searchers in parallel: `gemini` · `luna` · `grok` · `scout` (each a different slice of the question) | same, 1–2 searchers | — |
| scans, cross-checks | `luna` · `gemini` · `grok` | | |
| docs, commits, PRs, reports | `reporter`/`committer`/`pr`/`naturalizer` (Gemini) | | |

\* **`muse` data rule.** The Contributor route may retain prompts for training. Use it only in open-source or personal repos the user has marked contributor-safe. **Never** use it for gpai-monorepo or any company or proprietary code, and never for credentials, customer data or personal data. When unsure, do not use it. Other CommandCode routes (`mimo`, `deepseek`) are not Contributor routes, but still never receive credentials or customer data.

**Effort per family.** GPT-6.1 Sol only thinks properly at high effort: the `sol` agent defaults to high, so **omit `effort`**, and never pass `lo`/`med` for real work. GPT-6 Astra reasons well at medium: the `astra` agent defaults to medium, so omit `effort` for it too. Passing `hi` maps to their top level, which is clamped to **xhigh**; use it only for the hardest problems. `opus` and `fable` both default to medium; omit `effort` for normal critical work. `opus` `hi` (= xhigh) is reserved for the **hardest** problems: a subtle concurrency, consistency or security bug; an architecture choice that is costly to reverse; or a repair after a medium attempt failed. In the matrix, a bare agent name means "omit `effort`, use the agent default". Never use premium models or `hi` for searching, reading or summarising.

**Search and research are always cheap.** Split the question into slices (by subsystem, by source type, or code vs web) and run 2–4 cheap primary searchers **in parallel** (`gemini`, `luna`, `grok`, or the bundled `scout`, which is overridden to Gemini Flash). Main merges the results. A premium model only reads the merged bundle when it has to make a decision from it. Main itself should delegate broad search instead of running long grep/web loops on its own premium model.

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
| `openai-codex` | 2 unique: `yh*` Pro Max (preferred, §0) and `zk*` Pro (stored twice) | 7 days | The two `zk*` rows share one `accountId`: one quota, the script dedupes it. Saved resets exist, but redeem them only on user request (`codexResets.autoRedeem: "no"`). |
| `google-antigravity` | 2 | Gemini (several model-group windows) · Claude & GPT (shared) | The Claude & GPT window serves only older Claude 4.x and gpt-oss here, not Opus 5.5. |
| `devin` | 1 Pro seat + overage balance | Daily · Weekly | Hosts SWE-2 and mirrors of Opus, Fable, GPT-6.x, Grok, Gemini. Usage beyond quota draws on the overage balance (real money). |
| `xai-oauth` | 1 | SuperGrok Weekly · Grok Build | |
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
- **EXHAUSTED** (< 5%, limit error, or reset pending): no new work. Move to the next primary candidate in the matrix; only when every primary candidate is exhausted, use the overflow order (`swe` → `mimo` → `deepseek`). For a critical slot with no primary left, tell the user: wait for the reset, use overflow, or redeem a Codex saved reset (manual — `codexResets.autoRedeem` is `no`).
- **Overflow** (`devin`, `commandcode`) spends free-promo or paid credits. Never the default; record the reason when used.
- When the GPT family is exhausted, the backend preference temporarily yields: `opus` takes backend critical/normal slots, and the verifier must then be non-Anthropic (`grok`, `gemini`).
- Record it in the plan/todo: `slot → agent/effort (kind, criticality, quota state)`.

omp also protects quota automatically (`~/.omp/agent/config.yml`): a healthy **account** of the same provider (`retry.usageAwareFallback`, reserve `retry.usageReservePct` = 2). Since 2026-10-02 frontier models (Opus, Fable, Sol, Astra, Luna, Gemini, Grok) have **no** `retry.fallbackChains` entry — neither Devin mirrors nor CommandCode copies — because the primary providers are the only intended route for them; when one is exhausted, Main re-routes the slot to another primary (matrix) or, only if all primaries are exhausted, to an overflow agent (`swe`, `mimo`, `deepseek`). Remaining chains: `devin/swe-2` → `openai-codex/gpt-6-luna` → `commandcode/xiaomi/mimo-v2.6-pro`, and the Chinese-model chains (kimi/deepseek). Background: with the old 20% reserve, Codex at 9% fell through `devin/gpt-6-1-sol` to `commandcode` (403 `MODEL_NOT_IN_PLAN`), killing two Sol coders.

## 4. Model data

| model | index | $in/$out | ctx | character | strengths | avoid |
|---|---:|---:|---:|---|---|---|
| Claude Opus 5.5 | **57.6** | 4/20 | 1M | Highest index in the roster, and cheaper than Fable/Astra | Main, planning, hard code, long-context integration, natural Korean | reviewing work by Opus or under an Opus Main |
| Claude Sonnet 5.5 | 56.0 | 2/10 | 1M | Near-Opus at half price. Not in the default lists | substitute for Opus when Anthropic 5h is tight (no agent; ask the user to add one) | |
| Claude Fable 5.1 | 53.4 | 10/50 | 1M | Architecture and maintainability perspective. Uses its **own weekly bucket** | advisor, second plan, design review | routine code (cost) |
| GPT-6 Astra | 52.7 | 10/50 | 272K (codex) / 1M (devin) | Adversarial thinker; runs on Codex `priority` fast tier (§0) | first pick for backend/logic, review, verify, advise (§0); security, authz, concurrency, crash consistency, partial I/O | reviewing GPT-authored work |
| GPT-6.1 Sol | 51.8 | 2/10 | 272K / 1M | Reliable, literal, precise with contracts; the cross-family alternative to Opus. Needs omp ≥ 18.4.4 | backend code, verifier under an Opus Main, Main alternative | verifying Sol-authored work |
| GPT-6 Sol | 47.5 | 2/10 | 272K | Older Sol | — (use 6.1) | |
| Grok 4.7 | 46.4 | 2/6 | 500K | Newest Grok. Tessel excluded it as untrusted on 2026-09-22 | an extra review opinion; verify every finding | implementation, sole evidence |
| MiMo V2.6 Pro | 46.3 | 0.435/0.87 | 1M | Best index per dollar on CommandCode | easy implementation, localized repair, routine QA | |
| GLM-5.3 | 44.8 | 1.40/4.40 | 1M | | unevaluated: trial first | |
| Grok 4.6 | 44.3 | 2/6 | 500K | A different family | one extra opinion when Opus and Sol both conflict | implementation |
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
