# folio — Investor Intake & IPS Discovery Questionnaire

> A professional "know-your-investor" intake that folio uses to understand a
> person **before** recommending an allocation, a rebalancing rule, or a tool.
>
> **Questions only — never store answers here.** Answers contain personal
> financial detail and belong in the private `.me` vault (never git), where they
> compile into the owner's **Investment Policy Statement (IPS)**.
>
> Ask **one question at a time**, each with curated options **and** a free-text
> option; let the person skip anything. Adapt follow-ups to earlier answers.
> Tone: a professional portfolio manager and financial adviser — but a friend
> who's on your side.

## Why this comes first
Tools and code are downstream of the person. The same answers that shape the IPS
(allocation, rebalancing bands, risk, horizons) also settle **"do we need
Wealthfolio desktop or build our own?"** — because the right tool depends on how
many accounts you hold, how hands-on you want to be, and where you want to use
it. Decide the person first; the tool falls out.

## Section A — Your snapshot (the foundation)
1. **Life stage** — 20s / 30s / 40s / 50s / 60+ *(sets your time horizon and how much risk your timeline can absorb).*
2. **Household** — single / couple, no kids / couple with kids / other *(shapes goals and safety-net needs).*
3. **Income stability** — very stable (salaried) / mostly stable / variable / between things *(drives risk capacity — how much volatility your life can absorb).*
4. **Emergency fund** — none yet / under 3 months / 3–6 months / 6+ months of expenses *(the prerequisite before investing more).*
5. **Debt picture** — none / mortgage only / mortgage + some / meaningful high-interest debt *(high-interest debt usually beats investing returns).*

## Section B — What you hold today (types, not amounts)
6. **Asset & account types you already have** *(multi-select)* — taxable brokerage/ETFs, individual stocks, 3rd-pillar pension, 2nd-pillar pension, home you live in, rental property, cash/deposits, crypto, private business, other.
7. **How many institutions/accounts** — 1–2 / 3–4 / 5+ *(sets how much aggregation the tool must do).*
8. *(Optional, private)* **Rough total invested** — skip / under €50k / €50–150k / €150–500k / €500k+ *(only a band, only to right-size advice; stored in `.me` only).*

## Section C — Where you're going (goals & horizons)
9. **Top goals for this money** *(multi-select)* — long-term wealth/retirement, kids' future/education, buy or upgrade property, passive income, financial independence / early retirement, capital preservation, learning & experimenting.
10. **Main time horizon for the bulk** — under 3y / 3–7y / 7–15y / 15y+.
11. **Near-term earmarks (next 1–3y)** — none / property / car / education / other big expense.
12. **Contribution pattern** — adding regularly / adding occasionally / not adding now / starting to draw down.

## Section D — Risk & temperament
13. **If your portfolio fell 20% in a few months, you'd…** — sell to stop the bleeding / sell some / hold and wait / buy more at lower prices *(behaviour is the real risk).*
14. **Target risk profile** — capital preservation / balanced / growth / aggressive growth.
15. **Investing experience** — beginner / some / experienced / very experienced.
16. **How hands-on do you want to be?** — set-and-forget (rebalance 1–2×/yr) / quarterly check-ins / monthly & active / very active.

## Section E — Preferences & the tool (folio)
17. **Tax wrappers** — using 3rd pillar + investment account to the limit / partially / not yet / not sure what these are.
18. **Ethical/thematic preferences** — none / ESG-sustainable tilt / avoid certain sectors / specific themes.
19. **Where you'd use folio** — desktop app / local web in a browser / phone / minimal (spreadsheet/CLI) / no preference.
20. **Automation vs. privacy** — auto-sync from brokers (some cloud) / manual CSV import (max privacy) / a mix — *the real input to "Wealthfolio desktop vs. build our own".*
21. **The #1 thing you want folio to do for you** *(free text)* — e.g. "tell me if I'm on track", "one clear picture", "suggest rebalancing", "explain in plain language", "help with tax".

## Output
Compile answers in the private `.me` vault into an **Investment Policy
Statement**: target allocation, rebalancing bands (5/25), cost ceiling, per-goal
horizons, and a one-line tool decision (adopt Wealthfolio desktop / self-host
web / build minimal). **Never commit any answer or figure to git.**
