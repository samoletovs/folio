# folio — Sources Index

> Running index of source materials for this project. Each entry: a citation,
> a one-paragraph takeaway, and pointers to where it influenced `vision.md`,
> `glossary.md`, or `questions.md`. **Never commit figures** — takeaways only.

Format:

```
## YYYY-MM-DD — <short title>

**Source:** <path or URL>
**Provided by:** <initiator / agent research / etc.>

<one-paragraph takeaway>

Influenced: `vision.md` §<section>, `glossary.md` (added: …), `questions.md` (added: …)
```

---

## 2026-07-05 — Deep-research report: local-first portfolio management

**Source:** Internal deep-research report on local-first portfolio management
**Provided by:** agent research (orchestrator-worker `/dig`, 6 threads + verifier).

The founding document. Verified conclusions: (1) **adopt-and-extend** a mature
local-first tracker — **Wealthfolio** (on-device SQLite, no cloud, AGPL, TS
addon SDK, OS-keyring secrets, true TWR/MWR) — rather than rebuild the engine;
(2) **AI explains, code computes** — LLMs are unreliable for numbers/prices/tax
(FinanceBench: GPT-4-Turbo+retrieval wrong/refused 81%; Tow Center: AI search
>60% wrong), so math stays deterministic and nothing auto-trades; (3) the
owner's belief about Anthropic skills is **true but narrow** — official
`portfolio-rebalance`/`tax-loss-harvesting` skills live in
`anthropics/financial-services`, but they are advisor tools with paid pro data
feeds and "not investment advice" — reuse their *logic* as templates; (4)
method to encode: allocation-first, one-portfolio + asset location, **5/25**
rebalancing (Swedroe) funded by new cash, cost/tax discipline; (5) EU/Latvia:
holdings via broker export (PSD2 excludes holdings), 25.5% capital-gains PIT,
and an unverified investment-account deferral regime + 3rd-pillar cap to confirm
with VID; (6) privacy: figures on-device only, local model or figure-free
structure to any cloud LLM.

Influenced: `vision.md` (entire structure), `plan.md` (entire structure),
`glossary.md` (full vocabulary), `questions.md` (blocking VID items + form-factor
+ AI-placement questions).

---

## Key external references (from the report — verify at build time)

- **Wealthfolio** — github.com/wealthfolio/wealthfolio (local-first, AGPL,
  addon SDK, OS-keyring, TWR/MWR). *Opened & verified 2026-07-05.*
- **anthropics/financial-services** — github.com/anthropics/financial-services
  (Apache-2.0; wealth-management vertical; advisor-oriented; paid MCP feeds).
  *Opened & verified 2026-07-05.*
- **Anthropic Agent Skills** — docs.claude.com/en/agents-and-tools/agent-skills/overview;
  github.com/anthropics/skills.
- **FinanceBench** — arxiv.org/abs/2311.11944 (LLM numeric unreliability).
- **Tow Center AI-search audit** — cjr.org/tow_center.
- **Latvia tax** — vid.gov.lv; taxsummaries.pwc.com/latvia/individual (25.5%).
- **PSD2 vs. holdings** — finance.ec.europa.eu (FIDA extends access *beyond*
  payment accounts — confirming holdings are out of PSD2 scope today).
- **IBKR Flex Web Service** — interactivebrokers.com/campus/ibkr-api-page/flex-web-service.
- **Local-first** — inkandswitch.com/essay/local-first.
