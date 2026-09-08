# folio — Build Plan

> Drafted 2026-07-05 by agent, seeded from an internal deep-research report
> (orchestrator-worker method, 6 research threads + 1 verifier).
> **Build authorized; addon decision settled.** Implementation sequence updated
> 2026-09-07: deterministic review and contribution drafts precede optional AI.
> Figure-free.

> **2026-09-08 owner revision:** standalone local folio with holdings snapshots
> is now the primary form factor. Wealthfolio installation is not required.
> The original addon and engine integration remain optional. See `standalone.md`.

## TL;DR

folio is a **standalone local snapshot tracker with an optional Wealthfolio
adapter**. Manual base-currency holdings feed the existing IPS rules,
contribution drafts, and bounded explanations. Encrypted local storage contains
accounts, current holdings, recorded snapshots and the optional IPS.
It is not a new accounting or performance engine. **Math stays in code;
nothing auto-trades; figures never leave the device.**

---

## 1. Scope

### In scope for v1

- **Run folio independently** in a local browser, with encrypted on-device
  storage and a loopback-only static server; retain Wealthfolio as optional.
- **Import holdings snapshots** through a generic per-account CSV format, with
  explicit preview and replacement. Broker-specific translation is deferred.
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
- Full transaction-history accounting, FX engines and performance returns from
  the standalone snapshot data.

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

Current standalone path:

```text
Private manual entries / local CSV
              |
              v
folio browser UI -> strict portfolio document -> encrypted IndexedDB
              |                                      |
              v                                      v
snapshot adapter -> deterministic IPS rules     encrypted private backup
              |
              v
new-cash draft + optional local explanation selection
```

The loopback Node server serves compiled assets only; it never receives
portfolio records. The original optional Wealthfolio architecture is preserved
below as historical integration context, not an installation prerequisite.

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

### Vehicle decision (settled; alternatives retained as historical context)

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

- Local-first: Wealthfolio owns its on-device ledger. folio encrypts its own IPS
  at rest; it does not claim to encrypt the host SQLite database or broker files.
  Full-disk encryption and private export backups remain the owner's responsibility.
- Secrets in the **OS keychain** (Wealthfolio already does this); never in git.
- Prefer **manual/broker-export import** over any credential sharing; never
  screen-scrape.
- Proportionate threat model: device theft (full-disk encryption), accidental
  git commit (`.gitignore` + leak audit), malware. Cloud breach avoided by design.

## 8. MVP slice

1. Standalone folio running locally with manual holdings or a locally normalized
   CSV snapshot; Wealthfolio is an optional alternative data adapter.
2. IPS written and machine-readable (target allocation + bands + caps), kept
   inside the encrypted workspace with a private exported backup.
3. folio layer computes **allocation vs. IPS drift in code** and renders flags.
4. Rebalancing **draft** (new-cash-first) presented for manual sign-off.
5. Optional local model selects relevant, cited explanations from computed facts.
   Model-generated arithmetic and open-ended financial advice are not rendered.

## 9. Milestones

- **M0** — addon chosen; portable delivery and SDK 2 integration contract.
- **M1** — read-only snapshot adapter and encrypted IPS editor/import/export.
- **M2** — deterministic allocation drift, scope exclusions, and TER coverage.
- **M3** — new-cash contribution drafts with goal and emergency-fund gates.
- **M4** — bounded, optional local explanation retrieval; then measure H1–H4
  through actual use rather than declaring success from implementation alone.

The corresponding rule behavior is implemented. On 2026-09-08 it was reused by
the standalone app: manual accounts/holdings, account CSV replacement, recorded
snapshot history, encrypted workspace storage, and a local production runtime.
Wealthfolio acceptance is now optional. Private data-entry/import reconciliation
and sustained-use evidence remain owner-side work.

The IPS uses passphrase-encrypted IndexedDB, approved by the owner on 2026-09-07,
with explicit manual import/export to the private vault. The addon never assumes
arbitrary filesystem or direct SQLite access. See `ips-format.md`.

Build-only CI runs generated-data regression coverage and packaging on Windows
and Linux. No deployment, cloud data collection, or real financial fixture is
part of this workflow.

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
