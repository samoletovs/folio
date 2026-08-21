# folio — Build Plan

> Drafted 2026-07-05 by agent, seeded from an internal deep-research report
> (orchestrator-worker method, 6 research threads + 1 verifier).
> **Awaiting owner review.** Figure-free.

## TL;DR

folio is a **thin, local-first layer over Wealthfolio**, not a from-scratch
portfolio app. Wealthfolio provides the on-device engine (SQLite, true
TWR/MWR, multi-account, OS-keyring secrets, AGPL); folio adds an **IPS-aware
AI layer** that explains holdings, checks the portfolio against the owner's
rules, and drafts rebalancing for sign-off. **Math stays in code; the LLM only
explains; nothing auto-trades; figures never leave the device.**

---

## 1. Scope

### In scope for v1

- **Adopt Wealthfolio** (desktop build) as the local-first spine; data on
  device only.
- **Import holdings** via CSV / broker export (Interactive Brokers **Flex Web
  Service** as the reference; manual CSV as the universal fallback).
- **One-portfolio view** wiring in private pension, real estate (mark-to-model),
  and goal/cash funds alongside brokerage.
- A **written IPS** (target allocation, 5/25 bands, cost ceiling, per-goal
  horizons) authored/maintained with AI help - the IPS stays in private local storage.
- A **folio layer** (form factor decided in §3) that:
  - explains holdings / performance in plain language (numbers from the engine),
  - **checks** current allocation vs. the IPS and flags drift ≥ 5/25 bands,
  - **drafts** rebalancing suggestions (funded by new cash first) for approval,
  - answers natural-language questions over the owner's own local data, cited.
- **Privacy-preserving AI wiring**: local model for figure-touching tasks;
  figure-free structure only to any cloud LLM.

### Out of scope for v1

- ❌ Any cloud hosting, subdomain, or remote data store.
- ❌ Auto-trading, order routing, or brokerage write access.
- ❌ LLM-computed returns, prices, allocations, or tax.
- ❌ Multi-user / sharing / sync beyond the owner's own devices.
- ❌ Live PSD2 aggregation of *holdings* (not exposed by open banking).
- ❌ Tax filing or definitive tax calculations (informational flags only).

---

## 2. Hypothesis

> A privacy-conscious owner can get most of the value of a "portfolio
> co-pilot" from a **thin AI layer over a mature local-first tracker**, with
> **zero figures leaving the device** and **zero LLM math**.

v1 proves or disproves:

1. **H1 (Thin-layer > rebuild):** Extending Wealthfolio (addon/skill) reaches
   a usable IPS-check + explain experience in **< 1 sprint**, vs. months to
   rebuild the engine.
2. **H2 (AI-as-explainer):** An LLM confined to the owner's own local data
   answers portfolio questions correctly **because the numbers come from code**,
   not the model.
3. **H3 (Privacy holds):** The whole loop runs with figures on-device only —
   cloud LLM (if used) sees figure-free structure; a local model handles the
   rest.
4. **H4 (Behavior):** Encoded allocation + 5/25 + cost rules surface real,
   actionable drift/cost flags the owner acts on.

---

## 3. Architecture (local-first)

```
        Owner's device (no cloud, no subdomain)
 ┌───────────────────────────────────────────────────────────┐
 │                                                           │
 │   Broker exports (IBKR Flex / CSV)  ──►  Wealthfolio      │
 │                                          (Rust+Tauri,      │
 │   Private IPS + figures ─────────────►    SQLite on disk,  │
 │                                           TWR/MWR engine,  │
 │                                           OS-keyring)      │
 │                                              │ local data  │
 │                                              ▼             │
 │                           ┌───────────────────────────┐   │
 │                           │  folio layer              │   │
 │                           │  (Wealthfolio addon  OR   │   │
 │                           │   local agent skill)      │   │
 │                           │  • IPS rule-check (code)  │   │
 │                           │  • rebalance drafting     │   │
 │                           │  • explain / Q&A (LLM)    │   │
 │                           └─────────────┬─────────────┘   │
 │              figure-free structure only │                 │
 │              (or fully local)           ▼                 │
 │                    Local model (Ollama)  ──┐              │
 │                    ── or ──                 │ figure-free  │
 │                    Cloud LLM (explain only)◄┘              │
 └───────────────────────────────────────────────────────────┘
```

### Vehicle decision (the key open choice — competing hypotheses)

| Rank | Form factor | For | Against |
|---|---|---|---|
| **1 (lead)** | **Wealthfolio addon** (TypeScript SDK) | Native UI, full local data access, permissioned OS-keyring secrets, ships in-app | AGPL; Rust/Tauri + TS addon learning curve |
| 2 | **Local agent skill over a plaintext ledger** (beancount/hledger) | Max ownership; a local agent reads plain text; pairs with existing skills | Build reporting/UX; steeper for non-accountants |
| 3 | Borrow **`anthropics/financial-services`** wealth-mgmt skill *logic* as templates | Official rebalance/TLH/wash-sale patterns | Advisor-oriented, assumes paid pro data feeds, cloud plugin — **templates only**, not adopted as-is |
| — | Build engine from scratch | Total control | Re-implements solved TWR/MWR/lot math — **rejected** |

**Recommendation:** start with the **Wealthfolio addon** (rank 1); keep the
plaintext-ledger skill as the fallback if the addon SDK proves limiting.
**DECISION (2026-07-05): Wealthfolio addon chosen and scaffolded at
[`addon/`](../addon/).**

---

## 4. Method rules to encode (from research)

- Low-cost, diversified **index/ETF core**; target allocation is the master input.
- **One portfolio**; real estate marked-to-model and excluded from rebalancing;
  asset location across taxable vs. tax-advantaged.
- **5/25 rebalancing** bands (Swedroe), funded by new contributions/dividends first.
- Track **blended TER + turnover**; flag expensive holdings.
- Emergency fund + per-goal horizon gates before allocating; de-risk near goals.

## 5. AI guardrails (non-negotiable)

- Human-in-the-loop for **every** action; folio never executes trades.
- **Deterministic math in code**; the LLM never emits a number it computed.
- Retrieval with **verifiable citations**; "show your work".
- Model confined to the owner's **own local data**; abstains when unsure.
- Cloud LLM sees **figure-free structure only**; raw figures → local model.

## 6. EU / Latvia layer

- Holdings via **broker export** (IBKR Flex / CSV); PSD2 covers payment
  accounts only (cash), not holdings.
- **25.5%** capital-gains PIT (verify current year, VID).
- Verify the **investment-account (*ieguldījumu konts*) deferral** regime and
  **3rd-pillar** cap against VID before building any tax feature (see
  [`questions.md`](questions.md)).
- Market data from **provider/exchange endpoints** (justETF has no public API;
  free US-centric APIs cover EU/UCITS tickers unevenly).

## 7. Privacy & security

- Local-first: on-device SQLite / plaintext, encrypted at rest; backups exportable.
- Secrets in the **OS keychain** (Wealthfolio already does this); never in git.
- Prefer **manual/broker-export import** over any credential sharing; never
  screen-scrape.
- Proportionate threat model: device theft (full-disk encryption), accidental
  git commit (`.gitignore` + leak audit), malware. Cloud breach avoided by design.

## 8. MVP slice

1. Wealthfolio running locally with real holdings imported (CSV/Flex).
2. IPS written (in `.me`) and machine-readable (target allocation + bands + caps).
3. folio layer computes **allocation vs. IPS drift in code** and renders flags.
4. LLM **explains** the flags and answers Q&A over local data (figure-free to
   cloud, or fully local).
5. Rebalancing **draft** (new-cash-first) presented for manual sign-off.

## 9. Milestones

- **M0** — plan approved; form factor chosen (addon vs. skill).
- **M1** — local Wealthfolio + import working; IPS drafted.
- **M2** — deterministic IPS drift-check + flags.
- **M3** — AI explain/Q&A layer with guardrails.
- **M4** — rebalancing draft + measure H1–H4.

## 10. Risks

- **Upkeep > value** (pre-mortem): a fork/addon + AI layer may cost more than a
  spreadsheet + quarterly review. Mitigation: ship the smallest useful slice
  first; add AI only once the plain tracker is habitually used.
- **Wealthfolio maintenance/commercial drift** — watch velocity; fallback is
  Portfolio Performance (no addon AI) or the plaintext-ledger skill.
- **Latvia tax specifics unverified** — gate tax features on VID confirmation.

## 11. Subdomain decision

**None — ever.** folio is local-first; `domain: null`. No Azure, no DNS.

## 12. Done criteria (v1)

- One-portfolio view in daily use; correct, cited Q&A over own data; IPS
  drift-checks + rebalancing drafts that the owner acts on; **no figure ever
  left the device or entered git**; H1–H4 answered.

---

## Open questions

See [`questions.md`](questions.md). The two blocking ones before any tax
feature: (1) confirm the Latvian investment-account deferral regime and (2) the
3rd-pillar cap against VID primary sources.
