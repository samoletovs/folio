# folio

> Personal, **local-first** investment portfolio management - decide how to
> invest new money and manage already-invested funds, with a thin AI layer
> that **explains and checks, but never trades**.

## Research question

folio tests the nauroLabs question **"What's worth selling?"** by asking whether
privacy itself is valuable: can a useful AI-assisted portfolio tool keep every
financial figure on the user's device?

## What it does

folio is a Wealthfolio addon for seeing
one portfolio across taxable brokerage, private pension, real estate, and
goal/cash funds. It explains holdings, checks the portfolio against a written
Investment Policy Statement (IPS), and drafts
rebalancing suggestions for the owner to approve.

The deterministic Wealthfolio engine owns positions, tax lots, currency
conversion, and return calculations. folio adds a thin explanation and
rule-checking layer. It does not calculate with an LLM and never executes trades.

## Stack

- Wealthfolio addon SDK
- React 19, TypeScript, Vite
- Wealthfolio's local SQLite data store and OS keyring
- Optional local model for figure-touching explanations

## Run locally

```bash
cd addon
npm install
npm run type-check
npm run build
```

To load it in Wealthfolio's addon development mode:

```bash
npm run dev:server
```

## Status

**Build (v1).** Discovery is closed and the Wealthfolio addon is scaffolded.
The repository contains code and figure-free documentation only. There is no
cloud service, hosted deployment, or trade execution.

See [docs/vision.md](docs/vision.md) and [docs/plan.md](docs/plan.md) for the
experiment design.

## License

MIT
