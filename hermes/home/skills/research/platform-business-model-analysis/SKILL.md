---
name: platform-business-model-analysis
description: "Use for platform growth, losses, MAU, and monetization."
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [macos, linux, windows]
metadata:
  hermes:
    tags: [platforms, startups, business-models, unit-economics, MAU, monetization]
    category: research
---

# Platform business-model analysis

Use this skill for questions about consumer platforms, unicorn growth, subsidized user acquisition, startup losses, MAU, serving cost, monetization, and post-growth business-model changes. The output should distinguish observed facts from modeled assumptions and should explain the economic bridge from user scale to revenue.

## Core framing

Do not accept "collect users first, pivot later" as a universal law. Classify the move before analyzing it:

1. **Subsidized acquisition** — spend to build supply, demand, retention, or liquidity.
2. **Adjacency expansion** — add a related product that increases frequency or cross-sell; Uber Delivery and Spotify podcasts are examples of this pattern.
3. **Monetization pivot** — add subscription, ads, take-rate, virtual goods, or usage billing on an existing audience.
4. **Capability-to-B2B pivot** — turn consumer-scale operational, data, routing, safety, or workflow capability into enterprise/API revenue.
5. **Survival restructuring** — cut costs or refocus the core after a shock; this is not automatically a successful pivot.
6. **Failed growth thesis** — user growth does not rescue a structurally negative contribution margin or excessive fixed obligations.

A platform only has real option value if its acquired users transfer to the next business through retention, identity, creator/supply network, intent data, distribution, payment relationships, or reusable operational capability. MAU alone is not the asset.

## Evidence-first workflow

1. **Define the unit.** Clarify whether users are MAU, MAPC, registered accounts, subscribers, active customers, hosts, bookings, or guest arrivals. Never compare these as if interchangeable.
2. **Set the period.** Use a single fiscal year or clearly label a multi-year timeline. For current claims, retrieve the latest annual report or official earnings release.
3. **Build a company ledger.** For every case, record: founding/launch year, user metric and date, revenue, net loss or operating loss, adjusted EBITDA/free cash flow where available, loss composition, and the later business-model change.
4. **Separate loss types.** GAAP net loss can include stock compensation, impairment, investment revaluations, IPO charges, and financing effects. Report operating loss/Adjusted EBITDA separately when possible; do not call all net loss "user acquisition spend."
5. **Separate serving from accounting categories.** A line such as ` 지급수수료 ` may contain model/API fees, payment fees, contractors, licensing, or other external costs. Treat it as an upper bound unless the company discloses the API share. For AI services, model serving is driven by requests, tokens, modalities, and model mix—not MAU alone.
6. **Model the bridge.** Use formulas such as:
   - `annual direct serving = Σ(monthly active users × monthly cost per active user)`
   - `subscription revenue = MAU × paid conversion × ARPU`
   - `required ARPU = direct serving cost / paying users`
   - `net burn = serving + people + infrastructure + marketing + G&A − gross profit`
   Use a calculator tool for every arithmetic result; show assumptions next to outputs.
7. **Test the pivot.** Ask what exactly transfers from the free product to the new model, who pays, whether revenue has enough gross margin to cover inference and support costs, and whether the new model is a related expansion or a genuine reset.
8. **State ranges, not false precision.** Use a base case and a sensitivity case. If the cost split or user definition is unknown, say so explicitly and label scenario assumptions.

## AI consumer-platform checklist

For a general AI or character-chat product, track:

- MAU, DAU/MAU, 30/90-day retention, sessions per active user, and heavy-user concentration.
- Input/output tokens, model routing mix, image/audio/tool-call share, and blended inference cost.
- Paid conversion, ARPPU/ARPU, ad inventory, creator/virtual-goods revenue, B2B/API attach rate, and gross margin after serving.
- Organic acquisition and user-generated content supply; these show whether the audience is a platform asset rather than purchased traffic.
- A free user with low usage may cost far below a heavy user; a heavy cohort can dominate serving spend even when it is a small share of MAU.

When stress-testing a target, explicitly compare a 100k-MAU and 1m-MAU case. For example, at 2,000 KRW per MAU-month, serving alone is 2억 KRW/month at 100k MAU and 20억 KRW/month at 1m MAU. Then compare this with subscription revenue under multiple conversion rates; do not imply that MAU automatically becomes revenue.

## Writing and citation standard

- Lead with the correction or conclusion: platform winners do not all pivot after a fixed number of years; many expand adjacently, monetize an existing network, or fail.
- Use a compact comparison table with columns for user metric, loss metric, loss composition, timing, and post-growth model.
- Cite outside facts inline. Prefer SEC filings, annual reports, official earnings releases, and first-party company case studies; use reputable reporting for details not disclosed by the company.
- Never infer pure serving cost from a broad accounting line without labeling it as an upper bound or scenario.
- End with a practical translation to the user's scenario: required capital/runway, break-even condition, and the few metrics that must be proven before the next funding round.
- Use the `grounded-citations` workflow when external facts are retrieved; register URLs before drafting and render the Sources block mechanically.

## Common pitfalls

- Treating MAU as paying users, customers, bookings, or API calls.
- Calling every adjacent product a pivot, or assuming a pivot is successful because valuation rose.
- Dividing total net loss by users and calling the result CAC or serving cost.
- Treating non-cash IPO/stock-compensation or impairment charges as cash consumed to acquire users.
- Assuming the later B2B business was funded only by consumer traffic; verify what capability actually transferred.
- Giving a single point estimate when API share, retention, user mix, or CAC is unknown.
- Presenting a historical case as current without stating the fiscal year and re-checking current figures.

## Reference material

- See `references/platform-pivot-case-study-notes.md` for dated case-study benchmarks and source URLs from a prior analysis. Re-verify figures before using them as current facts.
