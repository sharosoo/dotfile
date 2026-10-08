---
name: model-routing
description: "Use before spawning subagents or picking a model: model agents, work-type x criticality matrix, intelligence index and cost, omp usage headroom, quota-aware routing, review panels."
---
# Model routing

The user runs many subscriptions in parallel: Claude ×3, ChatGPT ×2 (Pro + Pro Max), Antigravity ×2, Devin Pro and CommandCode ×2 (SuperGrok exists but Grok is disabled, §0). **Each subagent is a model.** Main chooses the model per task item through `agent` and the effort through `effort`, and gives the role in the packet (`skill://agent-orchestration`).

## 0. Current account policy (2026-10-06) — overrides older guidance below

- **Grok is disabled (user, 2026-10-07).** The xAI OAuth credential (id 12) carries `disabled_cause`, the `grok` agent file was removed (`~/.omp/agent/agents/grok.md`), and Grok is out of every matrix row, review panel and cross-check. Cross-family checks now have three families: Anthropic (`opus`, `sonnet`, `haiku`, `fable`), OpenAI (`astra`, `sol`, `luna`) and Google (`gemini`); `gemini` is the only third-family seat, so keep it on critical review panels and use it as the verifier when author and Main are Anthropic + OpenAI. Re-enable only when the user asks.
- **Sol-first (user rule, 2026-10-07 evening; supersedes the earlier "burn yh with opus/astra" rules).** Claude yh and opus quota are spent for this cycle. Put every normal slot — implementation, tests, contracts, migrations, verification, second opinions, planning drafts — on `sol` with `effort: "hi"` (= xhigh) and run waves wide on it. `opus` and `astra` stay the most trusted high-intelligence models but are used **only when a slot truly needs them**: `astra` for the hardest logic, security/authz/concurrency/crash consistency and critical reviews (omit `effort` = medium, `hi` for the hardest); `opus` for critical frontend/UI/copy judgement or a mandatory Anthropic review seat. Aim for at most about **1 in 10 spawns on astra + opus combined**. Cheap models (`gemini`, `luna`) for search/scans only. Family independence (§5) still applies: a Sol-authored change needs a non-Sol verifier — `astra` or `opus` take that seat for critical work, `gemini` otherwise.
- **Service tier: standard (`none`) everywhere (user rule, 2026-10-07, to get more volume out of the quota).** `tier.openai: none`, `tier.anthropic: none`, `task.agentServiceTierOverrides: {}`. Priority costs 2.5× (astra) / 2× (sol, luna) Codex quota; turn it back on only when the user asks for speed, and never use `/fast` in a session. Never `ultrafast` (measured 2026-10-06: Codex runs it at standard speed). Tiers are config-only (no per-spawn field); running sessions pick up `omp config set tier.*` live (verified 2026-10-07: every live session logged `service_tier_change → null` within a second, and astra subagents spawned afterwards carry no tier).
- **Before every spawn wave, run `headroom.sh` and obey its `SUBAGENT BUDGET` and `ROUTING STEER` lines** (written by the rotation service). Tell the user when an account in use drops to LOW.
- **Claude Sonnet 5.5 (`sonnet`) and Haiku 5.5 (`haiku`) added (2026-10-08).** Both run on the `anthropic` subscription and count as the Anthropic family for independence (§5) alongside `opus`/`fable`. `sonnet` is a top-intelligence seat: it spends the same Claude windows as `opus` and counts toward the astra + opus budget above. `haiku` is a cheap seat next to `gemini`/`luna` (search, scans, blind-reader, fill-in), but it still spends Claude windows, so do not fan out large `haiku` waves while Claude is LOW. Measurements: §4.
- **CommandCode is out until `sh*`'s monthly reset (2026-10-08).** `zk*` (zkwmak08) cancelled its plan; its credentials (rows 18, 20) were deleted. `sh*` (row 21) hit its GOAT monthly credit limit: every model returns 400 "insufficient credits" even with weekly room left (`/alpha/billing/credits` → `monthlyCredits` 0.06). `mimo`, `deepseek`, `muse` and the `commandcode/google/gemini-3.8-flash` fallback are unusable, so overflow is `swe` only. Credential row 19 holds a URL instead of a key (omp's 401). Lift this when `sh*`'s `monthlyCredits` is positive again.

### Account rotation — automatic (user rule, 2026-10-07)

A systemd user service rotates Claude and Codex accounts and sets the subagent budget; Main does not flip accounts by hand. No `auth.accountPolicies` in config. **Goal: spend `yh*` (yh04060) fully first, then hand over without a stall.**

- Script: `~/.omp/agent/managed-skills/model-routing/rotate-accounts.py` — `--loop` (the service), `--once`, `--dry-run` (one pass, no changes). Unit: `systemd/omp-account-rotate.service` in the same directory (`Type=simple`, `Restart=always`). State: `~/.omp/agent/rotate-accounts.state.json` (helper windows with fetch time, primary usage samples for burn rates).
- Logs: `journalctl --user -u omp-account-rotate.service -n 30 -o cat` (prints only on changes). Pause: `systemctl --user stop omp-account-rotate.service`; resume with `start`.
- **Full burn**: `yh*` is always enabled; helpers stay **off** while yh has quota (with another account enabled, omp routes away from yh once its 5-hour window is ≥ 85%). Helpers come on when a yh window reaches 99% (Claude `5 Hour`/`7 Day`, Codex `7 days`) and go off again when it recovers.
- **No stall**: the next check is scheduled before the projected wall — 80% of (remaining / measured burn rate), clamped to 1–10 min; 1 min once yh is within 15 points of the wall with no rate yet; 2 min while a burn rate is still being measured; 5 min while yh sits spent. A failed pass retries in 1 min.
- **Usage tracking for disabled helpers**: omp does not report disabled accounts, so when a helper's data is missing or > 3 h old (and not known to have reset), the script enables it for one `omp usage` fetch and disables it again (log line `probed …`). Passed `resetsAt` = window empty.
- **Helper choice**: when yh is spent, the **first** healthy helper in preference order comes on — Claude: `gl*` (global) then `ad*` (admin-developers); Codex: `zk*` (zkwmak08). Healthy = every window < 95% and below the account's cap. If no Claude helper is healthy, nothing extra is enabled and sessions get the `codex-mode` directive; for Codex, `zk*` is enabled anyway rather than stall. **Burn rule**: a helper whose weekly window resets within 24 h with ≥ 10% left below its cap is enabled even while yh has quota.
- **Shared account cap (user rule, 2026-10-07)**: `gl*` (global@teamturing.com) is shared with other people — never use it past **90% of `Claude 7 Day`** (`SHARED_CAPS`). At the cap it goes off (sprint included) and `ad*` takes over; while `gl*` is on within 8 points of the cap the script polls every minute. Its usage grows while disabled here, so its cached data counts as stale after 15 min, and it is probed only when it may be needed (yh near its wall).
- **Codex resets**: omp redeems yh's saved resets itself (`codexResets.autoRedeem: yes`, `keepCredits: 1` = keep one spare). While a reset is redeemable, yh is held alone at its wall for 2 min (polled every 1 min) so omp can redeem; still walled after that, or nothing redeemable → `zk*` on. One reset was redeemed 2026-10-07 (~02:40 KST, saved resets 2 → 1); the last one stays as the spare.
- **`zk*` (zkwmak08) runs alongside yh (user rule, 2026-10-07: zk has 2 saved resets of its own)**: `alongside: True` in the script keeps it enabled next to Codex `yh*` all the time; omp ranks the two accounts and redeems each one's resets per `codexResets`.
- **User toggles win**: when the user switches the primary `yh*` off with their own cause (e.g. omp-usage bar, `manual: switched off in the omp-usage bar …`), omp stops reporting it and the script skips that provider's account flips entirely until the user turns yh back on or hands it over (rewrite the cause to the script's `manual: account rotation …`). The sol-first directive is still sent.
- **Claude 5-hour sprint** (user pattern, 2026-10-07): when yh's `Claude 5 Hour` is ≥ 75% used and a helper's own 5-hour window resets within 35 min with ≥ 30% unused and is healthy with ≥ 3 points of weekly room below its cap, the script switches yh off (its own cause, tracked from cache) and routes all Claude to that helper until 1 min before the helper's reset, then restores yh. It only moves accounts; the routing directive stays sol-first.
- **Steering live sessions**: the service sends the standing directive with `herdr agent prompt` to every **working** omp pane whose last received key differs (`steerSent` in the state file), so panes that were idle catch up when they resume; idle panes also see it as `ROUTING STEER` in `headroom.sh`. Keys: `sol-first` (the policy above); `codex-mode` — no Claude account usable (yh spent or held off by the user and no healthy helper): no opus at all, astra for the rare top-intelligence slot. The routing text lives in `SOL_FIRST` at the top of the script; change it there and restart the service.
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
| `sonnet` | anthropic/claude-sonnet-5-5 | high | Anthropic |
| `haiku` | anthropic/claude-haiku-5-5 (100K context in omp) | high | Anthropic |
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
| backend / logic / data | `astra` · `opus` · `sol` | `astra` · `opus` · `sol` · `sonnet` · `luna` hi | `astra` · `opus` · `haiku` · `luna` · `gemini` |
| frontend / UI / copy | `opus` · `sol` · `opus` hi only for the hardest | `opus` · `sonnet` · `astra` · `gemini` | `opus` · `sonnet` · `haiku` · `gemini` · `luna` |
| planning | 2 plans: `astra` + `opus` (`fable` as 3rd) | `opus` or `astra` (by the ticket's kind) + `gemini` | — |
| advisor | `astra` · `fable` | `astra` · `fable` · `sol` | — |
| review panel | `gemini` · `opus` (or `sonnet`) · `fable` · `astra` · `sol`, every one with quota; for diffs, exclude the author's family; `gemini` always on critical panels | 2–3 primary families | — |
| verifier | primary family different from author and Main, hi (`astra` when the author is non-GPT, `opus` when the author is non-Anthropic, `gemini` when author and Main cover Anthropic + OpenAI) | `astra` · `opus` · `sonnet` · `luna` · `haiku` · `gemini` (not the author's family) | — |
| research / search / vision | fan out 2–4 searchers in parallel: `gemini` · `luna` · `haiku` · `scout` (each a different slice of the question; `haiku` only for slices under 100K tokens) | same, 1–2 searchers | — |
| scans, cross-checks | `luna` · `haiku` · `gemini` | | |
| docs, commits, PRs, reports | `reporter`/`committer`/`pr`/`naturalizer` (Gemini) | | |

\* **`muse` data rule.** The Contributor route may retain prompts for training. Use it only in open-source or personal repos the user has marked contributor-safe. **Never** use it for gpai-monorepo or any company or proprietary code, and never for credentials, customer data or personal data. When unsure, do not use it. Other CommandCode routes (`mimo`, `deepseek`) are not Contributor routes, but still never receive credentials or customer data.

**Effort per family.** GPT-6.1 Sol only thinks properly at high effort: the `sol` agent defaults to high, so **omit `effort`**, and never pass `lo`/`med` for real work. GPT-6 Astra reasons well at medium: the `astra` agent defaults to medium, so omit `effort` for it too. Passing `hi` maps to their top level, which is clamped to **xhigh**; use it only for the hardest problems. `opus` and `fable` both default to medium; omit `effort` for normal critical work. `opus` `hi` (= xhigh) is reserved for the **hardest** problems: a subtle concurrency, consistency or security bug; an architecture choice that is costly to reverse; or a repair after a medium attempt failed. `sonnet` and `haiku` default to high (AA: Sonnet high is its best value point; Haiku high ≈ Luna max at similar tokens); `hi` (= xhigh) adds ~2–3 index points for far more tokens, so omit `effort`. In the matrix, a bare agent name means "omit `effort`, use the agent default". Never use premium models or `hi` for searching, reading or summarising.

**Search and research are always cheap.** Split the question into slices (by subsystem, by source type, or code vs web) and run 2–4 cheap primary searchers **in parallel** (`gemini`, `luna`, `haiku`, or the bundled `scout`, which is overridden to Gemini Flash). Main merges the results. A premium model only reads the merged bundle when it has to make a decision from it. Main itself should delegate broad search instead of running long grep/web loops on its own premium model.

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
| `anthropic` | 3 (Claude subscriptions, three orgs: `yh*`, `gl*`, `ad*`) | 5 Hour · 7 Day · 7 Day (Fable) | Opus, Sonnet and Haiku spend 5 Hour + 7 Day (no separate Sonnet/Haiku window appears in `headroom.sh` as of 2026-10-08). Fable spends 5 Hour + **its own** 7 Day (Fable) window, so Fable is often green when Opus is not. `yh*` is spent first (§0). Each OAuth grant expires ~30 days after login; `omp usage` warns, and the user must re-login. |
| `openai-codex` | 2 unique: `yh*` Pro Max (preferred, §0) and `zk*` Pro (stored twice) | 7 days | The two `zk*` rows share one `accountId`: one quota, the script dedupes it. omp auto-redeems yh's saved resets (`codexResets.autoRedeem: yes`, `keepCredits: 1`); see §0 rotation. |
| `google-antigravity` | 2 | Gemini (several model-group windows) · Claude & GPT (shared) | The Claude & GPT window serves only older Claude 4.x and gpt-oss here, not Opus 5.5. |
| `devin` | 1 Pro seat + overage balance | Daily · Weekly | Hosts SWE-2 and mirrors of Opus, Fable, GPT-6.x, Grok, Gemini. Usage beyond quota draws on the overage balance (real money). |
| `xai-oauth` | 1 (disabled 2026-10-07) | SuperGrok Weekly · Grok Build | Not routed (§0). |
| `commandcode` | 1 (`sh*`, GOAT; `zk*` cancelled 2026-10-08) | 5-hour · weekly · monthly credits | No percentage in JSON (UNMETERED). Every request spends the monthly credit pool; the 5-hour/weekly caps only throttle it. |

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
| Claude Sonnet 5.5 | 56 (max) | 2/10 | 320K (omp anthropic) / 1M | Near-Opus at half price; Terminal-Bench 4.0 64% (Opus 60%). Heaviest token use measured (~193K output tokens per AA task at max, ~7× Astra). At low/medium/high it sits behind Sol for the same cost | Opus substitute when Opus quota is tight; agentic terminal work; Anthropic review/verifier seat | cheap or high-volume slots (token burn); reviewing Anthropic-authored work |
| Claude Fable 5.1 | 53.4 | 10/50 | 1M | Architecture and maintainability perspective. Uses its **own weekly bucket** | advisor, second plan, design review | routine code (cost) |
| GPT-6 Astra | 52.7 | 10/50 | 272K (codex) / 1M (devin) | Adversarial thinker; standard tier (§0) | first pick for hardest backend/logic, review, verify, advise (§0, ≈ 2:1 with sol); security, authz, concurrency, crash consistency, partial I/O | reviewing GPT-authored work |
| GPT-6.1 Sol | 51.8 | 2/10 | 272K / 1M | Reliable, literal, precise with contracts; the cross-family alternative to Opus. Needs omp ≥ 18.4.4 | backend code, verifier under an Opus Main, Main alternative | verifying Sol-authored work |
| GPT-6 Sol | 47.5 | 2/10 | 272K | Older Sol | — (use 6.1) | |
| MiMo V2.6 Pro | 46.3 | 0.435/0.87 | 1M | Best index per dollar on CommandCode | easy implementation, localized repair, routine QA | |
| GLM-5.3 | 44.8 | 1.40/4.40 | 1M | | unevaluated: trial first | |
| Kimi K3 | 43.6 | 3/15 | 1M | | unevaluated | |
| Claude Haiku 5.5 | 43 (max) / 38 (high) | 0.10/0.50 ≤ 100K prompt, 0.50/2.50 above | 100K (omp anthropic) | Fastest model measured here (§4 bench). Terminal-Bench 4.0 33% (Gemini Flash 20%, Luna 13%). Lower factual recall than Gemini Flash/Luna but fewer hallucinations (40% vs 55%/77%). Uses ~3× Luna's tokens at max; high ≈ Luna max on score and tokens | cheap scans, research slices, blind-reader, fill-in code, cheap non-OpenAI/non-Google opinion | long-context reads (100K cap), design, reviewing Anthropic-authored work |
| GLM-5.3 Flash | 41.8 | 0.15/0.50 | 1M | Literal and cheap | closed-set mechanical edits | anything needing semantics |
| Gemini 3.8 Flash | 40.9 | 1.50/7.50 | 1M | Fast, source-grounded prose, vision | docs, commits, PRs, reports, research sweeps, image reading | implementing, deciding |
| Qwen3.8 Max | 40.2 (0902: 45.4) | 2/6 | 1M | | unevaluated | |
| DeepSeek V4.1 Flash | 39.5 | 0.15/0.60 off-peak | 1M | Fast scanner | discovered-set scans, line-cited cross-checks, small schema-aware repairs | design |
| GPT-6 Luna | 37.3 | 0.10/0.50 | 272K / 1M | Very cheap. Needs omp ≥ 18.2.10, or it silently resolves to GPT-5.6 | research, blind-reader, reviewing non-Luna work, cheap overflow | reviewing Luna-authored work |
| DeepSeek V4 Pro | 36.0 | 0.66/1.98 | 1M | | — | |
| Devin SWE-2 | — | promo/overflow | 262K | Devin's coding model | overflow coding with fixed contracts when primaries are exhausted | default routing, open design, slices that need a decision |
| Muse Spark 1.3 Contributor | — | 0.10/0.20 | 1M | The Contributor route **may retain prompts for training** | only in repos the user marked contributor-safe (not gpai-monorepo) | company code |

Data rule: no credentials, customer data or personal data go to any CommandCode route. Proprietary code never goes to a Contributor route.

### Speed bench (2026-10-08, `omp bench … --profile mix --runs 6 --par 3`, standard tier)

| agent | chat TTFT | decode tok/s (generation) | prefill tok/s | note |
|---|---:|---:|---:|---|
| `haiku` | 0.54 s | 174 | ~18,700 | fastest on every axis |
| `sonnet` | 0.89 s | 111 | ~9,000 | |
| `luna` | 1.86 s | 132 | ~3,500 | |
| `gemini` (antigravity) | 6.56 s | 112 | ~2,600 | chat output arrives in one burst after thinking |
| `swe` | 2.1–11.8 s | 33–68 | ~2,400 | high variance; long reasoning before output |
| `mimo`, `deepseek` | — | — | — | not measured: omp got 401 from credential row 19 (its `key` holds a URL, not an API key); the valid keys returned 400 "insufficient credits" (monthly limit) |

Bench prompts are short; this ranks latency and throughput, not task quality (use the index column for that).

## 5. Independence

A review or verification counts only when its family differs from the author's effective model and from Main's model. Main records `author model / Main model / reviewer model`. Model agreement is not evidence; a blocker found by two or more families is strong.
