# Private IPS format

The IPS is a versioned JSON document validated by `addon/src/lib/policy.ts`.
Create it in the addon editor or import it from private storage. Never put an
instance, account identifiers, targets, or answers in this repository.

## Version 1

| Field | Meaning |
| --- | --- |
| `version` | Schema version; currently `1`. Unsupported versions are rejected. |
| `baseCurrency` | ISO currency code matching Wealthfolio's valuation currency. |
| `accountIds` | Unique IDs of accounts in the assessment universe. |
| `categories` | Target categories, described below; targets total 10,000 bps. |
| `holdings` | Explicit mappings of selected account/holding pairs. |
| `goals` | Named goals with calendar dates when the money is needed. |
| `bands.absoluteBps` | Absolute allocation drift threshold in basis points. |
| `bands.relativeBps` | Relative threshold as basis points of the target weight. |
| `costCeilingBps` | Maximum weighted annual TER for rebalancing-eligible value. |
| `maxQuoteAgeDays` | Maximum accepted holding valuation age. |
| `emergencyFundReady` | Owner confirmation required before new-cash drafts. |

Categories contain a stable `id`, `label`, integer `targetBps`,
`minimumHorizonYears`, and `acceptsContributions`. Horizons and contribution
eligibility are owner rules, not inferred investment recommendations.

Each holding rule contains `accountId`, `holdingId`, `categoryId`, `treatment`,
`kind`, and `terBps`. Account and holding IDs together identify a mapping.

- `rebalance`: counts toward the target denominator and requires a category.
- `observe`: visible in the overall portfolio, excluded from drift; category is null.
- `reserve`: protected cash/value, excluded from drift and not spent; category is null.

`kind` is `security`, `cash`, `pension`, or `real-estate`. Real estate must use
`observe`. Pension treatment is explicit: visibility is not permission to trade.
Represent privately valued property in Wealthfolio using its manual valuation
workflow, then map it here; folio does not maintain a second valuation ledger.

`terBps` is a sourced annual fund cost or `null` when unknown. Explicit zero is
not interchangeable with missing metadata. Goals contain `id`, `label`, and
`targetDate` in `YYYY-MM-DD` format.

## Calculation contract

Wealthfolio supplies base-currency monetary values. folio normalizes those into
currency minor units for deterministic aggregation and cash allocation; it does
not recompute prices, exchange rates, lots, or returns.

The 5/25 convention is five **percentage points** of absolute drift OR twenty-five
**percent of the target weight**, whichever threshold is reached first. A
nonzero position with a zero target is a breach, not a division-by-zero case.
The actual bands remain explicit fields in the owner's IPS.

Unknown or stale valuations, missing classifications and unresolved selected
accounts make allocation assessment incomplete. Missing TER alone leaves drift
usable while marking costs incomplete.

A draft considers new cash against post-contribution targets. It never sells;
rounding conserves minor units; restrictions can leave cash unallocated and
drift unresolved. A category allocation is not a security-level order or tax
recommendation.

## Private storage and portability

The exported envelope is `folio-encrypted-ips`, version `1`, with AES-GCM
ciphertext, a fresh nonce and salt, and the supported PBKDF2-SHA256 work factor.
Passphrases are never included. Tampering and unknown envelope versions fail
closed. Back up the encrypted export separately from the device.

The private file and the encrypted webview copy do not synchronize
automatically. Export after edits, and import deliberately on another
installation. A later schema version needs an explicit migration; the current
implementation never silently converts an unknown document.
