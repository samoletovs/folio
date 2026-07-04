# folio — Agent Instructions

> Project-specific instructions for AI coding agents.

## Phase: 🔍 Discovery

**There is no application code yet.** This project is in the discovery phase.
The deliverables are documents in `docs/`, not code.

### Document layout

- `docs/vision.md` — problem statement, method, success criteria. Kept in sync
  as discovery deepens.
- `docs/plan.md` — architecture & build plan, seeded from the deep-research
  report in mindVault. Awaiting owner review.
- `docs/glossary.md` — domain terms (IPS, TWR/MWR, rebalancing, asset
  location, tax lot, TER, PSD2, UCITS, 3rd pillar, investment account, …).
- `docs/questions.md` — open questions, with a **Resolved** section.
- `docs/discovery/` — raw source materials (figure-free).
- `docs/discovery/SOURCES.md` — index with one-paragraph takeaways.

## Off the golden path

folio is a **permanent, deliberate deviation** from the NauroLabs golden path.
This is intentional and must not be "corrected" back onto the path.

| Deviation | Reason |
|-----------|--------|
| **No Azure hosting, no `*.naurolabs.com` subdomain, `domain: null`** | Personal finance tool — real figures must stay on-device (never cloud). |
| **Local-first desktop/CLI, not a Static Web App** | Adopts/extends a local-first tracker (Wealthfolio) instead of an SWA. |
| **Figures live in the OneDrive `.me` vault, never in git** | Privacy: the repo is figure-free; data never enters version control. |
| **Cloud LLM optional and figure-free only** | AI may explain figure-free structure; raw figures use a local model. |

Mirror of the [Off-the-path projects table](../.github/PLATFORM.md#off-the-path-projects-today).

### Do NOT (ever, not just during discovery)

- Provision Azure resources, add a subdomain, or reserve DNS.
- Write a cloud deploy workflow (SWA / Container Apps / Functions).
- Commit **any** figures, balances, holdings, account numbers, or statements.
- Send raw figures to a cloud LLM — use a local model or figure-free structure.
- Let an LLM compute returns, prices, allocations, or tax — **math is code**.
- Add trade-execution / auto-trading of any kind.

### Do NOT (during discovery specifically)

- Scaffold code (`src/`, `api/`, addon packages, etc.).
- Finalize the form factor (Wealthfolio addon vs. local agent skill).

The signal to leave discovery is: **`docs/plan.md` is reviewed and approved by
the owner.** Nothing else.

## Discovery loop (when a new file lands in `docs/discovery/`)

1. Read it carefully. **If it contains figures, do not commit it** — extract
   only figure-free structure/lessons.
2. Extract: concepts, entities, rules, constraints, references.
3. Update `docs/vision.md` if framing shifts.
4. Update `docs/glossary.md` with any new domain terms.
5. Append unresolved items to `docs/questions.md` (or resolve them).
6. Append a one-paragraph summary + citation to `docs/discovery/SOURCES.md`.
7. **Never rewrite or delete the original source file.**

## Known framing (already established by the research — do not re-derive)

- **Adopt-and-extend Wealthfolio** as the local-first spine; folio is the thin
  AI/rule layer on top. Rebuilding the engine is rejected.
- **AI explains and checks; deterministic code computes.** No LLM math, no
  live-price trust, no auto-trading. Human-in-the-loop for every action.
- **IPS-first.** The owner's Investment Policy Statement (target allocation,
  5/25 rebalancing bands, cost ceiling, per-goal horizons) is the rulebook the
  tool enforces. The IPS itself lives in the `.me` vault (it contains targets).
- **One-portfolio view** across taxable brokerage + private pension + real
  estate (mark-to-model, excluded from rebalancing math) + goal/cash funds.
- **EU/Latvia aware:** broker CSV/Flex exports for holdings (PSD2 does *not*
  cover investment holdings); 25.5% capital-gains PIT; verify the Latvian
  investment-account deferral regime and 3rd-pillar cap against VID.

## Stack: TBD (leaning local-first)

To be decided in `docs/plan.md`. Leading candidates:

- **Spine:** Wealthfolio (Rust + Tauri + SQLite, AGPL) run locally.
- **folio layer:** a Wealthfolio **addon** (TypeScript SDK, full local data
  access, OS-keyring secrets) *or* a local **agent skill** reading a local
  ledger. Decide in the plan.
- **AI:** local model (Ollama) for figure-touching tasks; cloud LLM only for
  figure-free synthesis.
- **Market data:** provider/exchange endpoints (figure-free public prices).

But again: **decide in `docs/plan.md`, not here.**

## Build / Test / Deploy

_No deploy — ever. This runs locally. "Build" during discovery is writing docs
in `docs/`. Local build/test commands are filled in once the plan is approved._
