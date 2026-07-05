# folio

> Personal, **local-first** investment portfolio management — decide how to
> invest new money and manage already-invested funds, with a thin AI layer
> that **explains and checks, but never trades**.

A standalone research-driven prototype. Run as an experiment: hypothesis →
prototype → measure → iterate or kill.

## Status: � Build (v1)

Discovery is closed. The owner approved the recommendation: **build folio as a
Wealthfolio addon** (see [`docs/plan.md`](docs/plan.md) §3). The addon is
scaffolded at [`addon/`](addon/) — TypeScript + Vite + React on
`@wealthfolio/addon-sdk`. Still **local-first, no cloud, no subdomain — ever**;
figures never enter git.

- Vision & problem statement → [`docs/vision.md`](docs/vision.md)
- Build plan (seeded from deep research) → [`docs/plan.md`](docs/plan.md)
- Domain glossary → [`docs/glossary.md`](docs/glossary.md)
- Open questions → [`docs/questions.md`](docs/questions.md)
- Source materials → [`docs/discovery/SOURCES.md`](docs/discovery/SOURCES.md)

## What is this?

folio is a **local-first personal portfolio manager**: a single place to see
one portfolio across taxable brokerage, private pension, real estate, and
goal/cash funds — and an AI assistant that explains holdings, checks the
portfolio against a written Investment Policy Statement (IPS), and *drafts*
rebalancing suggestions for the owner to approve.

The design was set by a deep-research report (orchestrator-worker method,
6 threads + a verifier) that lives in **mindVault** at
`02_areas/agents/research/2026-07-05-local-first-investment-portfolio-management.md`.
Its verified conclusions:

1. **Adopt-and-extend, don't rebuild.** The deterministic engine
   (positions, tax lots, multi-currency valuation, true TWR/MWR) is a solved
   problem — the strongest local-first spine today is **Wealthfolio**
   (on-device SQLite, no cloud, AGPL, a TypeScript addon SDK, OS-keyring
   secrets). folio is a **thin layer on top**, not a from-scratch build.
2. **AI explains; code computes.** LLMs are unreliable for numbers, prices,
   and tax math — so all math stays in deterministic code. The AI layer only
   explains, tags, and rule-checks against the IPS, and **never executes
   trades**.
3. **Figures never leave the device.** Real numbers live in the OneDrive
   `.me` vault (never git). This repo holds **code + figure-free docs only**.

## Off the golden path — by design

folio is a permanent, deliberate deviation from the NauroLabs golden path
(cloud SWA + `*.naurolabs.com` subdomain). See
[`AGENTS.md` § Off the golden path](AGENTS.md#off-the-golden-path) and the
[Off-the-path projects table](../.github/PLATFORM.md#off-the-path-projects-today).
There is **no Azure resource, no subdomain, and no cloud data store** — that
is the whole point.

## Research angles

Inside the personal-tool shell sits the actual research experiment — proving
or disproving:

1. **Thin-layer > rebuild** — a small addon/skill over a mature local-first
   tracker beats building the engine.
2. **AI-as-explainer** — an LLM confined to the owner's own local data adds
   real value for explanation and IPS rule-checking without touching the math.
3. **Privacy-preserving AI** — you can keep every figure on-device and still
   use AI (local model, or send figure-free structure only).
4. **One-portfolio discipline** — encoding allocation + 5/25 rebalancing +
   cost/tax rules changes real behavior.

## How discovery works

1. Drop research / statements / sketches into `docs/discovery/` (never commit
   figures — see `.gitignore`).
2. Agent processes them → updates `vision.md`, `glossary.md`, `questions.md`
   and appends a takeaway to `docs/discovery/SOURCES.md`.
3. When the plan is approved → discovery closes, build phase begins.

Only after `docs/plan.md` is approved do we pick the final form factor
(Wealthfolio addon vs. local agent skill), write code, or wire any tools.

## Conventions

- Project lifecycle: hypothesis → MVP → measure → iterate or kill
- AI-native: ask "what if AI did 90% of this?" before designing
- Local-first & privacy-first: figures on-device only; repo stays figure-free
- Open-source by default; a public, reusable artifact is one of the deliverables
