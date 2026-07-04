# folio — Vision

> Source of truth for what this project is, why it exists, and what success
> looks like. Updated during discovery as we learn more. **Figure-free.**

## What is folio?

folio is a **local-first personal investment portfolio manager**. It answers
two questions for one owner:

1. **How should I invest new money?** — against a written target allocation.
2. **How do I manage what's already invested?** — track, value, rebalance,
   and stay tax- and cost-aware, across every account as one portfolio.

An AI layer sits on top to **explain** holdings and plans in plain language and
**check** the portfolio against the owner's rules — but it never computes the
numbers and never trades.

## Why it exists

Off-the-shelf trackers are either cloud-hosted (figures leave the device) or
purely manual. The owner keeps sensitive finances strictly on-device, so the
constraint is hard: **a private, local-first tool that still gets the benefit
of AI** — without ever putting figures in the cloud or trusting an LLM with
math.

## The method folio encodes

Great software here is just a disciplined method, enforced:

- **Allocation is the master input.** Default to a low-cost, broadly
  diversified index/ETF core; the target allocation drives everything.
- **One portfolio.** View taxable brokerage + private pension + real estate +
  goal/cash funds as a single allocation. Real estate is marked to model and
  **excluded from rebalancing math**. Place tax-inefficient assets in
  tax-advantaged accounts (asset location).
- **Rebalance by bands, funded by new cash.** The **5/25 rule** (act at 5
  absolute or 25% relative drift); rebalance first with new contributions and
  dividends to avoid taxable sales.
- **Cost & tax discipline.** Track blended TER and turnover; flag expensive
  holdings; be aware of capital-gains tax and tax-advantaged wrappers.
- **Behavior guardrails.** Require an emergency fund and per-goal horizon
  before allocating; warn on panic sells; de-risk near goal dates.

The owner's concrete targets live in an **Investment Policy Statement (IPS)**
kept in the `.me` vault (it contains numbers). folio reads and enforces it.

## Where AI helps — and where it must not

| AI **helps** (language / retrieval) | AI **must not** (numbers / action) |
|---|---|
| Explain concepts and holdings | Live prices / quotes |
| Draft / maintain the IPS | Performance math (TWR / MWR / XIRR) |
| Tag & categorize transactions | Tax calculations |
| Natural-language Q&A over the owner's own data | Return prediction / market timing |
| Sanity-check a plan vs. encoded rules | Auto-trading / execution |

**Guardrails:** human-in-the-loop for every action; deterministic math in code;
retrieval with verifiable citations; the model is confined to the owner's own
local data and abstains when unsure.

## Approach: adopt-and-extend

folio does **not** rebuild the portfolio engine. The verified research
recommendation is to adopt **Wealthfolio** — a mature local-first tracker
(on-device SQLite, no cloud, no account, AGPL, TypeScript addon SDK, OS-keyring
secrets, true TWR/MWR) — and add a **thin folio layer**: either a Wealthfolio
addon or a local agent skill that reads a local ledger. Form factor is decided
in [`plan.md`](plan.md).

## EU / Latvia context

- **Holdings come from broker exports** (e.g. Interactive Brokers Flex, or
  CSV) — PSD2 / open banking covers *payment* accounts only, **not** investment
  holdings.
- **25.5%** capital-gains PIT applies to investment income (verify current
  year with VID).
- The Latvian **investment account (*ieguldījumu konts*)** deferral regime and
  the **3rd-pillar** contribution cap are relevant but **unverified against VID
  primary sources** — see [`questions.md`](questions.md).

## Success looks like

- A single, trustworthy **one-portfolio view** the owner actually uses.
- The owner can ask plain-language questions about their **own** portfolio and
  get correct, cited answers — with all math done in code.
- folio flags allocation drift, expensive holdings, and rebalancing
  opportunities against the IPS — and **drafts** actions for sign-off.
- **Zero** figures ever leave the device or enter git.

## Non-goals

- ❌ Any cloud hosting, subdomain, or shared data store.
- ❌ Auto-trading or brokerage write access of any kind.
- ❌ LLM-produced numbers, prices, or tax calculations.
- ❌ Financial advice — folio is a personal decision-support tool, not advice.
- ❌ Multi-user / SaaS. One owner, one device.
