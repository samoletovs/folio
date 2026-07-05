# folio — Open Questions

> Unresolved questions block the plan or the build. Closed ones move to
> **Resolved** with the answer and date. Figure-free.

## Blocking (before any tax feature)

1. **Latvian investment account (*ieguldījumu konts*) — confirm the regime.**
   Bank/advisory sources describe tax deferral until cumulative withdrawals
   exceed deposits; the research **verifier could not confirm this against VID
   / PwC primary sources**. Confirm mechanism + current rules with VID before
   folio surfaces any deferral logic.
2. **3rd-pillar contribution cap — confirm with VID.** A cap (≈10% of gross
   income and a euro ceiling) appears only in bank sources. Confirm the
   current-year figures against VID before folio reasons about pension-relief
   headroom.

## Design

3. **Form factor → RESOLVED (2026-07-05): Wealthfolio addon** (scaffolded at
   `addon/`; see Resolved). Sub-question carried into build: what limits, if
   any, does the addon SDK impose on custom rebalancing/IPS logic?
4. **AI placement: local-only vs. hybrid.** Can the explain/Q&A experience be
   good enough with a **local model only** (Ollama), or is a cloud LLM needed
   for the language quality — and if so, exactly what figure-free structure is
   safe to send?
5. **Real-estate & pension modeling.** How to represent illiquid real estate
   (mark-to-model, excluded from rebalancing) and a private pension in a
   single allocation view without distorting drift math?
6. **Broker import fidelity.** Which export best carries lots/fees/multi-currency
   for the owner's brokers — IBKR Flex vs. each bank's CSV? What breaks on import?
7. **Market data for EU/UCITS.** Which figure-free source is reliable for
   European-listed ETF prices/NAVs (provider/exchange endpoints), given justETF
   has no public API and free US-centric APIs cover EU tickers unevenly?

## Product / behavior

8. **Rebalancing draft UX.** How should folio present a "new-cash-first"
   rebalancing draft so the owner can approve/adjust quickly?
9. **IPS format.** What machine-readable shape should the IPS take (lives in
   `.me`) so folio can check drift deterministically?

---

## Resolved

- **Form factor → Wealthfolio addon.** (2026-07-05, owner approved the plan's
  recommendation.) Scaffolded at `addon/` on `@wealthfolio/addon-sdk`; the
  plaintext-ledger skill remains the documented fallback if the SDK proves
  limiting.
- **Delivery posture → local-first, no cloud, no subdomain.** (2026-07-05,
  owner decision.) Figures stay on-device / in the `.me` vault; the repo is
  figure-free; `domain: null`.
- **Build vs. adopt → adopt-and-extend Wealthfolio.** (2026-07-05, research.)
  Rebuilding the TWR/MWR/lot engine is rejected as wasteful and error-prone.
- **Anthropic finance skills → real but advisor-oriented.** (2026-07-05,
  verified.) `anthropics/financial-services` wealth-management skills exist but
  target advisors with paid pro data feeds and are "not investment advice" —
  use their *logic* as templates, not as an adopted personal tool.
- **AI role → explain/check only; math in code; no auto-trading.** (2026-07-05,
  research.) LLMs are unreliable for numbers/prices/tax.
