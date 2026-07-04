# folio — Glossary

> Domain terms used across `vision.md`, `plan.md`, and `questions.md`.
> Added to during discovery.

## Strategy & measurement

- **IPS (Investment Policy Statement)** — a short written document stating
  target allocation, rebalancing rules, cost ceiling, and per-goal time
  horizons. folio's "rulebook"; the owner's IPS lives in the `.me` vault
  because it contains targets/numbers.
- **Asset allocation** — the split across asset classes (equities, bonds, cash,
  real assets). Explains ~90% of the *variability* of returns over time (not the
  *level* of return — a widely misused stat).
- **Asset location** — placing tax-inefficient assets in tax-advantaged
  accounts and tax-efficient assets in taxable accounts; adds return without
  extra risk.
- **Rebalancing** — restoring the portfolio to target weights. folio uses the
  **5/25 rule**: act when an asset drifts 5 absolute or 25% relative percentage
  points (attributed to Larry Swedroe). Prefer rebalancing with new cash first.
- **TWR (time-weighted return)** — return that removes the timing/size of
  cash flows; best for comparing strategy vs. a benchmark.
- **MWR / IRR / XIRR (money-weighted return)** — return reflecting the
  investor's actual cash-flow timing; the personal experience number.
- **TER (total expense ratio)** — annual fund cost; a top predictor of future
  fund performance. folio flags high-TER holdings.
- **Tax lot** — a specific purchase parcel with its own cost basis; needed for
  accurate gains and (elsewhere) tax-loss harvesting.
- **Sequence-of-returns risk** — the danger of poor early returns when balances
  are large / withdrawals begin.
- **Behavior gap** — the return investors lose to mistimed buying/selling.

## Instruments & jurisdiction

- **UCITS ETF** — EU-regulated pooled fund; the typical building block for an
  EU retail investor.
- **Capital-gains PIT (Latvia)** — personal income tax on investment gains,
  currently **25.5%** (verify current year with VID).
- **Investment account (*ieguldījumu konts*)** — a Latvian regime said to
  **defer** tax until cumulative withdrawals exceed deposits. **Unverified
  against VID primary** — see `questions.md`.
- **3rd pillar** — Latvian voluntary private pension; contributions carry a PIT
  relief (cap unverified against VID).
- **PSD2 / open banking** — EU regulated read-access to **payment** accounts
  (cash). Does **not** expose investment holdings — those need broker exports.
- **IBKR Flex (Web Service)** — Interactive Brokers' programmatic export of
  trades/positions/cash as XML/CSV; the reference holdings-import path.

## Tools & AI

- **Wealthfolio** — open-source, local-first portfolio tracker (Rust + Tauri +
  SQLite, AGPL, TypeScript addon SDK, OS-keyring secrets, true TWR/MWR). folio's
  adopted spine.
- **Portfolio Performance** — Java desktop, offline, EPL; fallback spine.
- **beancount / hledger / Fava** — plaintext double-entry accounting with lots
  and price directives; the fallback "local ledger a skill can read".
- **Agent Skill (SKILL.md)** — Anthropic's on-demand folder of instructions +
  scripts an agent loads via progressive disclosure.
- **`anthropics/financial-services`** — Anthropic's advisor-oriented repo with
  a wealth-management vertical (rebalance / TLH / reporting). Used only as
  *logic templates* — not adopted as-is (advisor scope, paid pro feeds, cloud).
- **MCP (Model Context Protocol)** — standard for connecting agents to external
  data/tools; complementary to Skills.
- **Ollama** — runs LLMs locally/offline; folio's default for figure-touching AI.
