# Changelog

## Unreleased

- Standalone local portfolio app, independent of Wealthfolio installation:
  accounts, manual holdings/cash/valuations, per-account CSV preview/replacement,
  and dated snapshot history.
- Encrypted whole-workspace persistence and backup/restore, with a loopback-only
  production server. No financial-data server endpoints or return calculations.
- Shared authenticated-encryption and revision-safe storage primitives, retaining
  compatibility with the optional addon's IPS-only backups.

- Read-only Wealthfolio account and valuation adapter with explicit data issues.
- Versioned IPS editor, passphrase-encrypted local storage, and private
  import/encrypted export.
- Deterministic allocation drift, protected/observation-only exclusions, and
  weighted TER with explicit unknown-cost coverage.
- Goal- and emergency-fund-gated, new-cash-only contribution drafts.
- Optional loopback-only Ollama fact retrieval with cloud-disabled preflight,
  validated citations, cancellation, and no model-produced arithmetic.
- Portable package scripts, build-only CI, local audit setup, and generated-data
  development preview.

No published feature release is implied. Desktop acceptance remains a local
step on the owner's installed Wealthfolio version.
