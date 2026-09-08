# folio — Agent Instructions

> Project-specific instructions for AI coding agents.

## Phase: � Build (v1)

Discovery is closed. On 2026-09-08 the owner chose a **standalone local folio
app with holdings snapshots**, without requiring a Wealthfolio installation.
Shared TypeScript + Vite + React code remains at [`addon/`](addon/); the
Wealthfolio adapter is optional. Do not rebuild a transaction/return engine.
Deterministic IPS review, encrypted portfolio storage, contribution drafts and
optional local fact retrieval are implemented. `docs/` remain the source of intent.

### Document layout

- `docs/vision.md` — problem statement, method, success criteria. Kept in sync
  as discovery deepens.
- `docs/plan.md` — approved architecture and build sequence, seeded from the
  deep-research report and updated for implementation.
- `docs/ips-format.md` — versioned private IPS structure and calculation contract.
- `docs/standalone.md` — standalone snapshots, local runtime, CSV format and backups.
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
| **Local-only browser app, not a hosted Static Web App** | Serves assets on loopback; encrypted data stays in the browser. Wealthfolio is optional. |
| **Figures stay in private local storage, never in git** | Privacy: the repo is figure-free; data never enters version control. |
| **Cloud LLM optional and figure-free only** | AI may explain figure-free structure; raw figures use a local model. |

Mirror of the [Off-the-path projects table](../.github/PLATFORM.md#off-the-path-projects-today).

### Do NOT (ever, not just during discovery)

- Provision Azure resources, add a subdomain, or reserve DNS.
- Write a cloud deploy workflow (SWA / Container Apps / Functions).
- Commit **any** figures, balances, holdings, account numbers, or statements.
- Send raw figures to a cloud LLM — use a local model or figure-free structure.
- Let an LLM compute returns, prices, allocations, or tax — **math is code**.
- Add trade-execution / auto-trading of any kind.

### Build phase — where code lives

- Shared code lives in [`addon/`](addon/). Standalone: `npm ci`,
  `npm run build:standalone`, `npm start`; open `http://127.0.0.1:4179/`.
  Optional addon: `npm run bundle`; host development uses `npm run dev:server`.
- Keep changes small and testable; wire deterministic math in code and confine
  the LLM to explanation, per the guardrails above.

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

- **Standalone snapshots, optional Wealthfolio integration.** Reuse the rule
  engine and accept manual base-currency valuations. Rebuilding an accounting,
  FX or performance-return engine remains rejected; use an established engine
  if those capabilities become necessary.
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

## Stack: standalone snapshots plus optional Wealthfolio addon

- **Standalone:** React + Vite, Node loopback static server, Web Crypto and
  IndexedDB for encrypted local workspace data.
- **Optional host:** Wealthfolio SDK 2 read-only adapter over local host data.
- **AI:** local model (Ollama) for figure-touching tasks; cloud LLM only for
  figure-free synthesis.
- **Market data:** provider/exchange endpoints (figure-free public prices).

## Build / Test / Deploy

No deploy, ever. In `addon/`, use `npm ci`, `npm run type-check`, `npm test`,
and `npm run bundle`. Tests construct synthetic data only. `npm run dev:preview`
is a generated-data browser host; real Wealthfolio acceptance uses
`npm run dev:server` and the steps in `addon/README.md`.

The standalone portfolio (including its IPS and recorded snapshots) is encrypted
in local IndexedDB with manual encrypted backup/restore. The addon keeps its
separate IPS-only store. Do not add plaintext persistence, automatic remote
fallback, or direct access to the Wealthfolio database. Keep business-rule code
independent of React and SDK runtime imports. Agents must use synthetic data
and isolated origins/profiles for browser work; never inspect a real portfolio
page or statement through cloud-agent tools.
