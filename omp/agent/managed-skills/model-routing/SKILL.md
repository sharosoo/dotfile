---
name: model-routing
description: "Use before spawning subagents or picking a model: model agents, work-type x criticality matrix, intelligence index and cost, omp usage headroom, quota-aware routing, review panels."
---
# Model routing

The user runs many subscriptions in parallel: Claude ×4 (`<identity:YH_EMAIL>`, `<identity:TURING_WORKER_03_EMAIL>`, `<identity:ADMIN_DEVELOPERS_TEAMTURING_EMAIL>`, `<identity:GLOBAL_TEAMTURING_COM_EMAIL>`), ChatGPT ×2 (Pro + Pro Max), Antigravity ×3, Devin Pro and CommandCode ×1 (SuperGrok exists but Grok is disabled, §0). **Each subagent is a model.** Main chooses the model per task item through `agent` and the effort through `effort`, and gives the role in the packet (`skill://agent-orchestration`).

## 0. Current account policy (2026-11-24) — overrides older guidance below

- **Gemini runs only through `agy-agent` (2026-11-19; supersedes older Gemini routing below).** Main runs `agy-agent gemini` for Gemini 4 Hydrogen (high), and the wrap-up roles use Hydrogen too (`ci`: medium; others: high). `agy-agent reviewer` uses Gemini 4 Neon (xhigh) as the independent Google-family reviewer alongside Fable and Astra. The upgraded Antigravity Ultra login serves both models. There is no default fallback to 3.8 Flash and no Gemini `task` agent. Devin is SWE-only.
- **Grok is disabled (user, 2026-10-07).** The xAI OAuth credential (id 12) carries `disabled_cause`, the `grok` agent file was removed (`~/.omp/agent/agents/grok.md`), and Grok is out of every matrix row, review panel and cross-check. Cross-family checks now have three families: Anthropic (`opus`, `sonnet`, `haiku`, `fable`), OpenAI (`astra`, `sol`, `luna`) and Google (`gemini`); `gemini` is the only third-family seat, so keep it on critical review panels and use it as the verifier when author and Main are Anthropic + OpenAI. Re-enable only when the user asks.
- **Astra-first implementation, backend in pairs (user, 2026-11-24).** GPT-6 Astra takes non-frontend implementation plus deep work, planning, reviews and bug hunts. Backend implementation always pairs Astra with Opus on the same slice, never Astra alone. GPT-6.1 Sol fills the Astra seat only when Astra is unavailable, blocked or out of quota. agy Orchestrator keeps real independent slices; frontend, UI and product copy stay with Opus. Fable never implements. Spend all available ChatGPT subscription quota on useful work, no filler; Astra and Sol are one family, so keep Fable or Neon for OpenAI-authored work.
- **Codex tier.** The selected tier is `ultrafast` for GPT-6.1 Sol and GPT-6 Astra. The usage dashboard and `rotate-accounts.py --set-tier` update the selected tier; follow the live setting.
- **Before every spawn wave, run `headroom.sh` and obey its `SUBAGENT BUDGET` and `ROUTING STEER` lines** (written by the rotation service). Tell the user when an account in use drops to LOW.
- **`HOST LOAD` and `LEDGER` lines in `headroom.sh` (2026-11-12, skill://failure-ladder).** `HOST LOAD GREEN|YELLOW|RED` is read live from `/proc/loadavg` and `/proc/pressure/io`: RED → start no build/test wave, wait and re-run; YELLOW → one build/test job at a time. `LEDGER BROKEN`, `LEDGER: … proposed`, `LEDGER INVALID` and `LEDGER STALE` come from `~/.omp/agent/incidents-status.json`, which this service refreshes through `failure-ladder/reverify.py` at start and every 6 h (a missing status file also prints `LEDGER STALE`). They are internal: never quote them in user replies or Discord (user, 2026-11-26); report a new one to 총무 with `tell_chongmu` (kind `report`).
- **Claude Sonnet 5.5 (`sonnet`) and Haiku 5.5 (`haiku`) added (2026-10-08).** Both run on the `anthropic` subscription and count as the Anthropic family for independence (§5) alongside `opus`/`fable`. `sonnet` spends the same Claude windows as `opus` and is the default Claude seat since 2026-10-12 (see the directive bullet). `haiku` is a cheap seat next to `gemini`/`luna` (search, scans, blind-reader, fill-in), but it still spends Claude windows, so do not fan out large `haiku` waves while Claude is LOW. Measurements: §4.
- **`gemini` (Argon), `swe`, `deepseek` (1017), and `minimax` (M3.1-Flash) take regular implementation slots (user rules, 2026-10-12 → 2026-10-19).** `gemini` now runs on **Gemini 4 Argon** (`google-antigravity/gemini-4-argon`, AA index 53, DeepSWE 77.9%, AutomationBench 78% #1, hallucination 15%) and is a **primary coding/implementation worker**, not just a search/docs model: use `gemini` actively for real implementation waves (especially when Argon quota is high or the user asks for Argon-heavy execution, reserving `sol`, `astra`, and `opus` for verification, reviews, and top-intelligence work). Outside `weareteamturing/gpai-monorepo`, fill-in and fixed-contract/bug-fix implementation slots also go to `swe` (SWE-2, Devin free; `hi` normal, `med` fill-in), `deepseek` (`commandcode/deepseek/deepseek-v4.1-flash`, **DeepSeek-V4.1-Flash-1017**; omit `effort` = `high` for normal coding/bug-fixes/reviews, `lo` = `low` for fill-in/scans, `hi` = `max` for hard bug-hunting), and `minimax` (`commandcode/minimax/minimax-m3.1-flash`, **MiniMax M3.1 Flash**, AA index 42, DeepSWE 73.7%, AutomationBench-AA 73%, HLE 48%, $0.15/$0.60 24/7). `deepseek` and `minimax` also serve as independent 4th- and 5th-family reviewers/verifiers outside gpai-monorepo. **In `gpai-monorepo`, `deepseek` and `minimax` are NEVER used** (user rule + CommandCode data rule), and `swe` stays overflow only (§2).
- **CommandCode restored (2026-10-18).** `sh*` (`<identity:SHININGMOON_SNU_AC_EMAIL>`, row 21) refilled to `$70` monthly credits (`$14` 5-hour window cap, `$35` weekly window cap, reported as % in `headroom.sh`). Broken credential row 19 (which held the URL `https://commandcode.ai/studio` instead of an API key and caused 401s) is disabled in `agent.db`.

### Account rotation — provider reserves and expiry first (2026-11-24)

- **Reserve**: Codex accounts may use their full subscription quota and are parked at reported 100% of a current window until recovery is confirmed. Their native per-account policies set `reservePct: 0`; rotation honors any explicit protective reserve and parks unmatched or ambiguous credentials. `retry.usageReservePct: 10` and `retry.usageReservePolicy: fail-closed` remain the fallback for other providers. Claude keeps its 90% cap, including the Fable window; agy keeps its existing reserve. Codex automatic saved resets are authorized: `codexResets.autoRedeem5h: yes`, `autoRedeemWeekly: yes`, `keepCredits: 0`, `minBlockedMinutes: 0`; the native 12-hour expiry-salvage horizon remains. Other providers' resets still require separate consent. Stored credits require separate consent; no new credit purchases or automatic top-ups are authorized.
- **Expiry priority**: Codex always prefers the nearest known future weekly reset cohort (reset times less than one hour after the earliest); there is no 24-hour activation gate or account-name preference. A resetless account does not outrank a known future reset. Claude retains its existing last-24-hour cohort rule and auth-ready backups. Recompute when an account reaches its cap or a window expires. Manual and OAuth disables are not cleared.
- **Authentication failover**: Skip accounts with no unblocked credentials before expiry ranking. For Claude, fill a narrow expiry cohort with the nearest eligible backups, up to three accounts total when available, so one auth failure does not leave the provider without a spare. Never reopen a capped or manually disabled credential.
- **Codex reset recovery**: The service also invokes the native `omp usage reset` command for exhausted accounts that session auto-reset cannot reach after rotation or preflight blocking. It checks fresh usage, live credit balance and consent, preserves manual/auth/catalog exclusions, and attempts at most one spend per pass. Durable pending-episode tracking prevents a timeout or stale post-reset report from spending another credit blindly. A recovered account returns only after fresh usage confirms recovery. The bridge abstains when `keepCredits > 0`: the CLI cannot enforce a positive reserve atomically. Current policy is `keepCredits: 0`; no test may consume a real saved reset.
- **Metering**: These rules act on reported usage and new routing decisions. Providers may report late or omit a window; this code cannot stop requests already in flight, provider websites, or standalone clients that bypass OMP/`agy-agent`.
- **Operations**: `rotate-accounts.py --loop` runs in `omp-account-rotate.service`; `--once` runs one pass, and `--dry-run` previews selection. Inspect `journalctl --user -u omp-account-rotate.service -o cat` and `rotate-accounts.state.json` (`quotaActive`).
- **Steering live sessions**: the service sends every working Herdr OMP pane the same changed directive with `hc send --if working`; idle panes see it in `headroom.sh` before the next spawn wave. There is no per-terminal Sol/Astra gate (owner, 2026-11-25: GPT-6.1 Sol and GPT-6 Astra are always dispatchable; device `routing-models-available` retired). The base policies live in `pick_steer` in `rotate-accounts.py`; restart the rotation service after changing them.
- **Codex discovery**: Refresh the catalogs of identifiable interactive OMP builds every six hours. If at least one credential is verified for both GPT-6.1 Sol and GPT-6 Astra, park a previously enabled credential that is missing from both authoritative coverage and live usage. Do not park a credential on a missing catalog alone or treat a bundled model as entitlement evidence.
- **Usage snapshot**: `usage-snapshot.json` retains the last provider report for each parked account as stale. The service applies the cap on each pass (at most three minutes apart under normal load, and at known reset boundaries). `headroom.sh` reads the snapshot and live subagent budget without fetching usage.
- **`<identity:YH_EMAIL>` API usage tracking & reporting (user obligation, 2026-10-16: decide whether to keep each <identity:YH_ID> subscription)**: `~/.omp/agent/managed-skills/model-routing/yh-usage.py` (also `--json`, `--quiet`). Every assistant message in `~/.omp/agent/sessions/**/*.jsonl` records `"credentialId"`; `rotate-accounts.py` persists all seen `(id → provider, email)` pairs in `state["credentialIds"]` (seeded with `24` Codex, `25` Claude, `27` Antigravity) so history survives credential re-logins. The rotation no longer refreshes the report (user, 2026-11-09: not needed); run `yh-usage.py` by hand when you want it. `yh-usage.py` caches per-file aggregates in `~/.omp/agent/<identity:YH_ID>-usage-cache.json` by `(size, mtime_ns)` (~0.25s incremental run) and writes `~/.omp/agent/<identity:YH_ID>-usage.json` with both recorded cost and standard API list-price cost by provider, model, and KST day.
- New machine: after `sync.sh restore`, run `systemctl --user enable --now ~/.omp/agent/managed-skills/model-routing/systemd/omp-account-rotate.service`.
- **Wrap-up roles on `agy acp` (user, 2026-11-15)**: `agy-agent <role>` (`agy-agent.py`, symlinked to `~/.local/bin/agy-agent`) runs Google's official ACP stdio server through `agy_acp.py`, not `agy -p`. Main pipes the packet from bash (`agy-agent <role> < "$packet"`, `timeout: 2400`); do not spawn the matching omp task agents. Role prompts live in `agy-roles/<role>.md`; skills are inlined and `ROLE_MODELS` selects the model. Existing omp Antigravity logins and quota selection are reused without re-enabling the paused direct-OAuth provider. Each invocation stages a private 0600 native credential in `~/.local/share/agy-accounts/<email>/run-*/`; child-only `SSH_TTY` forces file auth, leaving the ordinary agy keyring/login untouched. ACP selects and verifies the advertised model and thinking level, retains native agy tools, and publishes text only after `end_turn` and process-group cleanup. `--timeout` bounds ACP execution (exit 124), not a blocked downstream stdout consumer; exit 3 still means no account has quota. Temporary native state is removed after the invocation. `agy-agent --accounts` shows picks. Focused verification: `PYTHONDONTWRITEBYTECODE=1 python -m unittest -v test_agy_acp` from this directory.
- **Visible coding on Herdr**: `agy-agent coder < "$packet"` opens an interactive pane below the calling Main pane, resolved from `HC_TERMINAL_ID`, not window focus. Run from the intended repo. The default is `gemini-pro-orchestrator-neon`, with Neon xhigh or Carbon high as model-selection fallbacks. Launch JSON gives `parent`, `terminal`, `pane` and the expected `report` path. Pane creation is not evidence of a model response or completed work. Inspect `hc read <terminal>` and collect the handoff.
- **Antigravity first-run screen**: In a newly created coder pane, if `hc read <terminal>` shows `Choose your color scheme` with `terminal` selected, send one `hc keys <terminal> enter` to confirm that theme and re-read the pane. Do not send another key if it shows sign-in, Terms of Service or data consent; only the user may complete those. Do not count a setup-blocked pane as a dispatched coder; record the block and route the slice to another eligible implementer if needed. Close owned panes when finished; never alter the user's standalone agy settings.
- **YOLO for all `agy-agent` roles**: Both transports use `--dangerously-skip-permissions`. This auto-approves tool prompts, not sign-in, Terms of Service, or first-run setup. Role restrictions are instructions, not a filesystem sandbox.


## 1. Model agents

| agent | model | default thinking | family |
|---|---|---|---|
| `opus` | anthropic/claude-opus-5-5 | medium | Anthropic |
| `fable` | anthropic/claude-fable-5-2 | high | Anthropic (separate Fable bucket) |
| `sol` | `openai-codex/gpt-6.1-sol` (ultrafast) | high | OpenAI |
| `astra` | `openai-codex/gpt-6-astra` (ultrafast) | high | OpenAI |
| `luna` | openai-codex/gpt-6-luna | high | OpenAI |
| `agy-agent gemini` | `gemini-4-hydrogen-high` on Antigravity (Main runs it from bash) | high | Google via agy |
| `agy-agent reviewer` | `gemini-4-neon-xhigh` on Antigravity (Main runs it from bash; never via Devin) | xhigh | Google via agy |
| `agy-agent coder` | Herdr → `gemini-pro-orchestrator-neon` (default), Neon xhigh or Carbon high | preset | Google via agy |
| `sonnet` | anthropic/claude-sonnet-5-5 | high | Anthropic |
| `haiku` | anthropic/claude-haiku-5-5 (100K context in omp) | high | Anthropic |
| `swe` | devin/swe-2 (Kimi K3-based) | high | Devin — **overflow only** |
| `deepseek` | commandcode/deepseek/deepseek-v4.1-flash (V4.1-Flash-1017) | high (`lo`=low, `hi`=max) | DeepSeek (CommandCode credits; **never in gpai-monorepo**) |
| `minimax` | commandcode/minimax/minimax-m3.1-flash | — | MiniMax (CommandCode credits; **never in gpai-monorepo**) |
| `muse` | commandcode/meta/muse-spark-1.3-contributor | high | CommandCode credits, **Contributor: prompts may be retained for training** |
| `agy-agent ci/committer/pr/reporter/naturalizer` | Gemini 4 Hydrogen via ACP (`ci`: medium; others: high) | fixed | Google via agy |

`effort` on a task item (`lo`/`med`/`hi`) overrides the default and maps to the model's lowest, middle or highest level, capped at `xhigh` (`task.maxEffort`). Observed 2026-10-02: `sol` lo = low, `swe` hi = high (its `max` is above the cap, so it is clamped).

## 2. Matrix: work kind × criticality → candidates in order

Choose by fit and quota. For comparable normal implementation slices, rotate among Sol, agy Orchestrator and Opus across waves. Devin is SWE-only. In gpai-monorepo, SWE is overflow only and CommandCode workers are excluded. Outside it, `deepseek`, `minimax` and `swe` are extra review seats, not regular implementers.

| Work | Critical | Normal | Fill-in |
|---|---|---|---|
| backend / logic / data | `astra` · `sol` · `opus` | `sol` · `agy-agent coder` · `opus` | `sol` · `agy-agent coder` · `opus` |
| frontend / UI / copy | `opus` | `opus` | `opus` |
| planning | `fable` + `astra` | `fable` + `astra`; `agy-agent gemini` for an extra Google opinion | — |
| advisor | `astra` · `fable` | `astra` · `fable` · `sol` | — |
| review panel | `fable` · `astra` · `agy-agent reviewer` (Neon, when available); exclude the author's family | 2–3 independent families when available | — |
| verifier | primary family different from author and Main, hi (`astra` when the author is non-GPT, `opus` when the author is non-Anthropic, `agy-agent reviewer` when author and Main cover Anthropic + OpenAI) | `astra` · `opus` · `sonnet` · `luna` · `haiku` · `agy-agent gemini` (not the author's family) | — |
| research / search / vision | fan out 2–4 searchers in parallel: `agy-agent gemini` · `luna` · `haiku` · `scout` (each a different slice of the question; `haiku` only for slices under 100K tokens) | same, 1–2 searchers | — |
| scans, cross-checks | `luna` · `haiku` · `agy-agent gemini` | | |
| docs, commits, PRs, reports | `agy-agent reporter`/`committer`/`pr`/`naturalizer` (Gemini) | | |

`agy-agent gemini`/`reviewer` are not `task` agents: Main writes the packet to a temp file and runs them from bash (user, 2026-11-15: "그거 다 agy agent로 변경해야함").

\* **`muse` and `deepseek` data rule.** The `muse` Contributor route may retain prompts for training: use it only in open-source or personal repos the user has marked contributor-safe, **never** for gpai-monorepo or any company or proprietary code. `deepseek` is not a Contributor route, but is also **never** used in gpai-monorepo (user rule, 2026-10-18), and no CommandCode route (`deepseek`, `muse`) ever receives credentials, API keys, customer data or personal data.

**Effort per family.** Ordinary Sol, Astra, Opus and Fable work omits `effort` and uses the configured defaults. Reviews and bug hunts use `effort: "hi"` (the model's highest supported level, capped at `xhigh`); Neon uses `agy-agent reviewer` at `xhigh`. Do not increase effort for simple searches or summaries. More Codex use means useful independent slices and deeper review coverage, not duplicate work to consume tokens.

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
| `openai-codex` | Native ChatGPT account pool, selected by weekly reset time rather than account name | all reported current windows | Duplicate logins sharing an `accountId` share one quota. Native account policies remove the Codex reserve; the rotation excludes exhausted/auth-blocked accounts and preserves manual disables. Automatic saved resets are authorized, including the last credit. |
| `google-antigravity` | 2 | Gemini (several model-group windows) · Claude & GPT (shared) | The Claude & GPT window serves only older Claude 4.x and gpt-oss here, not Opus 5.5. |
| `devin` | 1 Pro seat + overage balance | Daily · Weekly | Hosts SWE-2 and mirrors of Opus, Fable, GPT-6.x, Grok, Gemini. Usage beyond quota draws on the overage balance (real money). |
| `xai-oauth` | 1 (disabled 2026-10-07) | SuperGrok Weekly · Grok Build | Not routed (§0). |
| `commandcode` | 1 (`sh*`, GOAT; `zk*` cancelled 2026-10-08) | 5-hour · weekly · monthly credits | No percentage in JSON (UNMETERED). Every request spends the monthly credit pool; the 5-hour/weekly caps only throttle it. |

How accounts affect routing:
- **Accounts are selected centrally.** `task` selects the provider/model; the rotation service restricts the eligible account cohort and OMP selects within it. Codex has no reserve; other providers retain their configured reserve. Displayed quota on parked accounts is last-known data, not proof that they are currently in use.
- Judge each model by the **window it spends**. For example, anthropic best=89% with one account at 24% on `Claude 7 Day` means Opus has roughly one healthy account left, so keep Opus for frontend critical/normal work and avoid burning it on large review panels. Fable is checked on `7 Day (Fable)` separately.
- **A short window refills fast.** Before routing big parallel waves to Anthropic, check `Claude 5 Hour` on both accounts. A wave of many parallel Opus spawns can drain one account's 5-hour window, and then all of them pile onto the other.
- **Same provider, different account is not independence.** Review independence is about the model family, never the account.
- When accounts disagree in state, put the per-account line in the routing record, e.g. `opus (anthropic: gl* 89%, ad* 24%)`.
- **Re-login is a user action.** Never re-authenticate on your own. Native Codex automatic resets are authorized for 5h and weekly limits, including the last saved reset; do not manually spend credits just to test the setup. Other providers' resets need separate consent.

### State rules (apply to the provider's best account, and to the window the model spends)

- **GREEN** (≥ 40% left): route freely.
- **LOW** (5–40%): still route to it — primary quota is meant to be spent. Prefer GREEN primaries for big parallel waves.
- **EXHAUSTED**: Codex stops at 0% remaining or an upstream limit error, not at 5% or 10%. A positive Codex balance remains usable. Move to the next eligible account; native Codex automatic resets may restore exhausted quota. Resume a recovered account only after refreshed usage confirms it. Other providers retain their reserve policies. No new credit purchases or automatic top-ups are authorized.
- **Overflow** (`devin`, `commandcode`) spends free-promo or paid credits. Never the default; record the reason when used.
- When the GPT family is exhausted, the backend preference temporarily yields: `opus` takes backend critical/normal slots, and the verifier must then be non-Anthropic (`gemini`).
- Record it in the plan/todo: `slot → agent/effort (kind, criticality, quota state)`.

OMP's native account reserve and the rotation service must agree: Codex `reservePct: 0` with a 100% usage cap; other providers keep the global 10% reserve and their existing rotation caps. Preserve the empty fallback chains for Sol and Astra so a subscription limit does not silently charge a different provider.

## 4. Model data

| model | index | $in/$out | ctx | character | strengths | avoid |
|---|---:|---:|---:|---|---|---|
| Claude Opus 5.5 | **57.6** | 4/20 | 1M | Highest index in the roster, and cheaper than Fable/Astra | Main, planning, hard code, long-context integration, natural Korean | reviewing work by Opus or under an Opus Main |
| Claude Sonnet 5.5 | 56 (max) | 2/10 | 320K (omp anthropic) / 1M | Near-Opus at half price; Terminal-Bench 4.0 64% (Opus 60%). Heaviest token use measured (~193K output tokens per AA task at max, ~7× Astra). At low/medium/high it sits behind Sol for the same cost | Opus substitute when Opus quota is tight; agentic terminal work; Anthropic review/verifier seat | cheap or high-volume slots (token burn); reviewing Anthropic-authored work |
| Claude Fable 5.2 | — (user, 2026-11-10: clearly above Opus 5.5) | 8/40 (cache read 0.20) | 320K (omp cap) / 1M | Released 2026-11-09. Uses its **own weekly bucket** (`Claude 7 Day (Fable)`), so it is often green when Opus is not | planner, design advisor, cross-verifier of astra slices, whole-change review (§0 roles, `rules/subagent-routing.md`) | implementation, docs, tests, any writing |
| Gemini 4 Argon | 53 (high) | 2/10 launch promo, 4/20 standard | 320K (omp cap) / 1M | Google's frontier model (2026-09-30). Lowest hallucination rate measured among top models (AA-Omniscience 15% vs Astra 51%, Sol 54%) but lower accuracy (50% vs Astra 63%). ~62K output tokens per AA task (Astra 27K). Live on `google-antigravity` via `<identity:YH_ID>` (2026-10-16) | `gemini`, `smol`/`plan`, `ci`/`committer`/`pr`/`reporter`/`naturalizer`, verification, Google review seat, research/vision | deciding design; frontend/terminal-heavy agentic work (Terminal-Bench 57% vs Opus 66%) |
| GPT-6 Astra | 52.7 | 10/50 | 272K (Codex) | Adversarial thinker; `ultrafast` (§0) | deep backend, authz, concurrency, planning and reviews | independent review of OpenAI-authored work |
| GPT-6.1 Sol | 51.8 | 2/10 | 272K / 1M | Reliable, literal, precise with contracts; the cross-family alternative to Opus. Needs omp ≥ 18.4.4 | backend code, verifier under an Opus Main, Main alternative | verifying Sol-authored work |
| GPT-6 Sol | 47.5 | 2/10 | 272K | Older Sol | — (use 6.1) | |
| MiMo V2.6 Pro | 46.3 | 0.435/0.87 | 1M | Retired 2026-10-18 (`mimo.md` removed; superseded by DeepSeek V4.1-Flash-1017) | — (use `deepseek`) | |
| GLM-5.3 | 44.8 | 1.40/4.40 | 1M | | unevaluated: trial first | |
| Kimi K3 | 43.6 | 3/15 | 1M | | unevaluated | |
| Claude Haiku 5.5 | 43 (max) / 38 (high) | 0.10/0.50 ≤ 100K prompt, 0.50/2.50 above | 100K (omp anthropic) | Fastest model measured here (§4 bench). Terminal-Bench 4.0 33% (Gemini Flash 20%, Luna 13%). Lower factual recall than Gemini Flash/Luna but fewer hallucinations (40% vs 55%/77%). Uses ~3× Luna's tokens at max; high ≈ Luna max on score and tokens | cheap scans, research slices, blind-reader, fill-in code, cheap non-OpenAI/non-Google opinion | long-context reads (100K cap), design, reviewing Anthropic-authored work |
| GLM-5.3 Flash | 41.8 | 0.15/0.50 | 1M | Literal and cheap | closed-set mechanical edits | anything needing semantics |
| Gemini 3.8 Flash | 40.9 | 1.50/7.50 | 1M | Fast, source-grounded prose, vision | docs, commits, PRs, reports, research sweeps, image reading | implementing, deciding |
| Qwen3.8 Max | 40.2 (0902: 45.4) | 2/6 | 1M | | unevaluated | |
| MiniMax M3.1 Flash | **42** (AA v4.3.2; DeepSWE 73.7%, AutoBench-AA 73%, HLE 48%, AA-LCR 80%) | 0.15/0.60 24/7, $0.015 cache | 320K (omp) / 1M | 428B MoE / 23B active + 3B FP8 speculative drafter ("Space Bunny", 2026-10-19). Beats DeepSeek V4.1 Flash (0910: 39) and Gemini 3.8 Flash (41) on AA Index; strong on automation (73%), long context (80%), SciCode (53%), CyberGym (82%), DeepSWE (73.7%), weaker on Terminal-Bench 4.0 (26%) | outside gpai-monorepo: active implementation/coding worker alongside `deepseek`/`swe`/`gemini`, automation & long-context tasks, 5th-family review/verifier, scans | **never in gpai-monorepo**; never give credentials/API keys; long multi-hour terminal loops (TB4 26% vs DeepSeek 1017's 42.3%); strict `Target` path boundaries |
| DeepSeek V4.1 Flash 1017 | 39.5 (0910 AA; 1017 DeepSWE 77.0%, TB4 42.3%) | 0.15/0.60 off-peak, 0.30/1.20 peak, $0.003 cache | 320K (omp) / 1M | 2026-10-17 RL checkpoint on same 552B/16B-active CED backbone (served in-place on `commandcode/deepseek/deepseek-v4.1-flash`, vision-capable). Cuts reasoning tokens by ~21% (and ~60% at `low` effort) while jumping +11.1 on Terminal-Bench 4.0 and +8.8 on ProgramBench | outside gpai-monorepo: bug fixes (DeepSWE 77%), fill-in & normal coding with explicit contracts, parsers/scripts, 4th-family review/verifier, scans (`lo`), chart/vision reading | **never in gpai-monorepo**; never give credentials/API keys; open-ended design; packets without strict `Target` path boundaries (can rabbit-hole on self-verification or delete unrequested code) |
| GPT-6 Luna | 37.3 | 0.10/0.50 | 272K / 1M | Very cheap. Needs omp ≥ 18.2.10, or it silently resolves to GPT-5.6 | research, blind-reader, reviewing non-Luna work, cheap overflow | reviewing Luna-authored work |
| DeepSeek V4 Pro | 36.0 | 0.66/1.98 | 1M | | — | |
| Devin SWE-2 | — | promo/overflow | 262K | Devin's coding model | overflow coding with fixed contracts when primaries are exhausted | default routing, open design, slices that need a decision |
| Muse Spark 1.3 Contributor | — | 0.10/0.20 | 1M | The Contributor route **may retain prompts for training** | only in repos the user marked contributor-safe (not gpai-monorepo) | company code |

Data rule: no credentials, customer data or personal data go to any CommandCode route. Proprietary code never goes to a Contributor route.

**Gemini 4 Argon (live on `google-antigravity` 2026-10-16).** `<identity:YH_EMAIL>` was linked to `google-antigravity` (row 27) and carries `gemini-4-argon` (`accountAccess` restricts Argon to `<identity:YH_ID>`, while `sharosoo14` and `zkwmak08` remain on 3.8 Flash). All former `google-antigravity/gemini-3.8-flash` slots (`modelRoles.smol`, `modelRoles.plan`, `scout`/`reviewer` overrides, `gemini`, `ci`, `committer`, `pr`, `reporter`, `naturalizer`) now run on `google-antigravity/gemini-4-argon` (320K context cap) with `google-antigravity/gemini-3.8-flash` as fallback.

| metric | Gemini 4 Argon (high) | GPT-6 Astra | Claude Opus 5.5 | Gemini 3.8 Flash (high) | source |
|---|---:|---:|---:|---:|---|
| AA Intelligence Index | 53 | 53 (max) | — | 41 | AA |
| AA-Omniscience score / hallucination | 42 / 15% | 43 / 51% | — | 30 / — | AA |
| Terminal-Bench 4.0 | 57% | 58–59% | 60–66% | 20% | AA, model card |
| AutomationBench-AA | 78% (#1) | — | — | 60% | AA |
| DeepSWE v1.1 | 77.9% | 74.1% | 74.2% | — | model card |
| FrontierSWE v2 | 55.0% | 65.5% | 62.3% | — | model card |
| CWE-bench v1 (security) | 68.0% | 68.0% | 67.0% | — | model card |
| GraphWalks 256K–1M (long context) | 84.2% | 71.8% | 66.8% | — | model card |
| AA-LCR v1.1 (long context) | 80% | — | — | 81% | AA |
| Cost per AA task | $1.99 promo / $3.98 standard | $3.26 | — | $1.24 | AA |

Sources: [AA article](https://artificialanalysis.ai/articles/gemini-4-argon-google-top-three-labs), [AA Argon vs Flash](https://artificialanalysis.ai/models/comparisons/gemini-4-argon-vs-gemini-3-8-flash), [DeepMind model card](https://deepmind.google/models/model-cards/gemini-4-argon/) (Google-reported; Astra/Opus columns there are Google's runs). Knowledge cutoff March 2026; Google notes occasional slowness/timeouts.


**DeepSeek V4.1-Flash-1017 (live on `commandcode/deepseek/deepseek-v4.1-flash`, 2026-10-18; [survey artifact](https://artifact.sharosoo.com/a/95k5puz2en2m/bar?v=4&themeable=1)).** Released 2026-10-17 as an in-place checkpoint replacement for `deepseek-v4.1-flash` (552B total, 8B input / 16B output active Causal Encoder-Decoder, 890 B/token global KV cache, 1M context capped to 320K in omp, 66K max output, vision enabled).
- **Benchmarks (1017 vs 0910, DeepSeek-reported)**: DeepSWE v1.1 **77.0%** (+2.8; Opus 5 74.0%, GPT-5.6 Sol 73.0%), Terminal-Bench 4.0 **42.3%** (+11.1; Sol 39.9%, Opus 5 51.8%), ProgramBench **29.1%** (+8.8), NL2Repo-Bench **68.2%** (+2.8), Automation-Bench v1.0.6 **60.5%** (+5.7; Opus 5 50.3%), Apex Bench v1.1 **72.1%** (+7.5), HLE text-only **44.0%** (+4.9; overall no-tools 42.6% vs Opus 5 56.3%), Chartography **83.0%**, BabyVision **92.5%**, ZeroBench **51.0%**.
- **Independent checks (day-1)**: sference weight-only A/B on AIME/MATH-500 confirmed median reasoning output dropped **21%** at default and **60% at low effort** (`lo`) with accuracy unchanged (101/120 → 100/120), fixing 0910's broken effort dial. Kingy 7-task coding suite: 14/14 pass (tied with GPT-6.1 Sol and Sonnet 5.5) at ~1/4 the cost ($0.0157 vs $0.0577/$0.0653).
- **Known hazards & routing guardrails**:
  1. **Never use in `gpai-monorepo`** (user rule, 2026-10-18) and never expose real API keys, credentials or customer data in its packet or environment (0910 Pier sandbox report: 33% key-exfiltration attempt rate, unverified on 1017).
  2. **Strict `Target` path boundaries**: user reports note "wish-driven RL" behavior where 1017 may delete or alter unrequested code to make tests pass, or spend extra turns rabbit-holing on self-verification after reaching 90%. Always specify exact owned files in `Target` and verify with `git status` / `git diff` after the wave.
  3. **Effort**: use `lo` (`low`) for scans and fill-in (60% fewer tokens), omit (`high`) for normal coding/bug-fixes/reviews, `hi` (`max`) only for hard bug-hunting. Avoid KST peak hours (10:00–13:00, 15:00–19:00, 2× price) for large background batches when possible.
### Speed bench (2026-10-08, `omp bench … --profile mix --runs 6 --par 3`, standard tier)


**MiniMax M3.1 Flash (`minimax`, live on `commandcode/minimax/minimax-m3.1-flash`, 2026-10-20).** Formerly tested on leaderboards under the codename "Space Bunny" (`minimax-m3.1-flash-preview` through 10-19, promoted to GA `minimax/minimax-m3.1-flash` on 10-20).
- **Architecture**: 428B total / ~23B active per-token all-sparse MoE + linear-attention static-file pre-filter (compresses KV cache footprint by 65%) + dedicated 3B FP8 speculative drafter (4 candidate tokens/cycle, ~150–200+ tok/s vendor-reported), 1M context window (capped to 320K in omp via `cap-context.py`), 66K max output, native reasoning (`reasoning` field returned on CommandCode).
- **Benchmarks (Artificial Analysis v4.3.2 independent vs vendor)**:
  - **AA Intelligence Index: `42`** (ahead of DeepSeek V4.1 Flash 0910 `39`, Gemini 3.8 Flash `41`, MiMo V2.6 Flash `38`; level with Claude Haiku 5.5 xhigh `41–42`).
  - **AA sub-scores**: AutomationBench-AA **73%**, AA-LCR v1.1 (long context) **80%**, SciCode **53%**, Humanity's Last Exam **48%**, AA-Briefcase **1,474**, GDPval-AA **1,458**, CritPt **22%**, GDP.pdf **21%**, AA-Omniscience **16**, Terminal-Bench 4.0 **26%**.
  - **MiniMax-reported agentic/coding**: DeepSWE v1.1 **73.7%** (ahead of GPT-5.6 Sol 73.0%, behind DeepSeek V4.1-Flash-1017 77.0%), CyberGym **82%**, OSWorld V2 **61.7**, Agents' Last Exam **29.6**, BabyVision **91%**.
- **Cost**: **$0.15 / $0.60 per 1M tokens 24/7** (DeepSeek's off-peak rate all day, no peak doubling), cached input **$0.015/M**, AA blended **$0.1005/M**, AA task cost **$0.22** (cheaper than DeepSeek V4.1 Flash 0910's $0.27).
- **Complementary pairing with `deepseek` (V4.1-Flash-1017) outside `gpai-monorepo`**:
  - Use **`deepseek` (1017)** when the task is terminal-heavy or pure bug-fixing (TB4 42.3% vs 26%, DeepSWE 77.0% vs 73.7%).
  - Use **`minimax` (M3.1-Flash)** for long-context analysis/refactoring (AA-LCR 80%, 65% KV compression), knowledge-heavy coding (HLE 48% vs 42.6%, SciCode 53%), workflow/automation code (AutomationBench-AA 73%), during KST peak hours (10:00–13:00, 15:00–19:00) when DeepSeek doubles to $0.30/$1.20 while MiniMax stays $0.15/$0.60, or in parallel waves alongside `deepseek` as a 5th independent model family.
  - Same guardrails as `deepseek`: **never in `gpai-monorepo`**, never expose credentials/customer data, and enforce strict `Target` paths.
| agent | chat TTFT | decode tok/s (generation) | prefill tok/s | note |
|---|---:|---:|---:|---|
| `haiku` | 0.54 s | 174 | ~18,700 | fastest on every axis |
| `sonnet` | 0.89 s | 111 | ~9,000 | |
| `luna` | 1.86 s | 132 | ~3,500 | |
| `gemini` (antigravity) | 6.56 s | 112 | ~2,600 | chat output arrives in one burst after thinking |
| `swe` | 2.1–11.8 s | 33–68 | ~2,400 | high variance; long reasoning before output |
| `deepseek` | ~1.5–1.9 s | ~157–176 | — | V4.1-Flash-1017 smoke verified 2026-10-18 (3.8s end-to-end subagent turn) |

Bench prompts are short; this ranks latency and throughput, not task quality (use the index column for that).

## 5. Independence

A review or verification counts only when its family differs from the author's effective model and from Main's model. Main records `author model / Main model / reviewer model`. Model agreement is not evidence; a blocker found by two or more families is strong.
