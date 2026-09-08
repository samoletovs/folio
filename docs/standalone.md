# Standalone folio

Owner decision, 2026-09-08: Wealthfolio installation is not required. The first
standalone version tracks holdings snapshots, not a full transaction ledger.
The existing policy and contribution engine is reused; accounting and
performance engines are not rebuilt.

## Local operation

From `addon/`, run `npm ci`, `npm run build:standalone`, then `npm start`.
Open `http://127.0.0.1:4179/`. Node serves only the compiled app over loopback;
accounts, holdings, IPS rules, and snapshots live in encrypted browser IndexedDB.
There are no backend data-write endpoints.

The browser, hostname, port, and profile identify the store. Use the same
address and profile each time. Changing a browser profile or visiting
`localhost` instead of `127.0.0.1` does not move your data. The production server
requires its canonical `127.0.0.1` address. Clearing browser data, losing the
profile, or losing the passphrase requires an exported backup for recovery.

Use a separate generated-data browser profile for development. Never let an
agent read a real portfolio page or real imported file. All automated fixtures
are generated and are excluded from distribution.

## Accounts and current holdings

An account needs only a private label; real account numbers are unnecessary.
Each holding records its account, name, optional symbol/reference, kind,
reported total value in the portfolio base currency, valuation date, and
optional descriptive units. Cash has no investment units.

Kinds are security, cash, pension, and real estate. No price, FX, return, or
tax is inferred. Enter the base-currency value supplied by a statement or
manual valuation. Keep the original source privately if provenance is needed.
Dates remain explicit even when stale; the IPS evaluator refuses stale or
future valuations according to the policy.

Submitting a change encrypts and persists it atomically before reporting
success. A stale browser window cannot overwrite a newer revision. Locked,
unsubmitted form edits are discarded. Removing an account removes its current
holdings after confirmation, not archived snapshots or any real brokerage
asset. Existing IPS references remain visible as issues until explicitly reviewed.

## CSV snapshot import

The generic format is UTF-8, comma-delimited, with a header:

```text
id,name,symbol,kind,value,currency,as_of,units
```

`symbol` and `units` are optional columns. All other columns are required.
The UI can download an empty header template; this repository intentionally
contains no actual financial CSV.

| Column | Required value |
| --- | --- |
| `id` | Stable holding identifier, unique within the selected account. Preserve it on repeated imports. |
| `name` | Private holding label. |
| `symbol` | Optional ticker or reference; not used to fetch prices. |
| `kind` | `security`, `cash`, `pension`, or `real-estate`. |
| `value` | Nonnegative base-currency total value, decimal point, no thousands separators. |
| `currency` | Exact uppercase portfolio base currency. Foreign-currency rows are rejected, not converted. |
| `as_of` | Genuine `YYYY-MM-DD` valuation date. |
| `units` | Optional nonnegative decimal units, at most twelve decimal places; blank for cash. |

Quoted commas and doubled quote marks are supported, as are BOM and common
line endings. Dates and monetary precision are validated locally. Duplicate
IDs, unsupported columns, invalid rows and oversized imports reject the
entire file; no partial import or silent rounding occurs.

Limits: 2 MiB and 5,000 rows. Preview the first rows and row count, then
explicitly confirm replacement of the selected account's current holdings.
Other accounts and recorded snapshots are unchanged. Reimporting the same
snapshot does not accumulate duplicates. Removed or changed kinds can require
an IPS classification review.

A workspace is bounded to 100 accounts and 5,000 current holdings in total.
An import that would exceed those bounds is rejected before saving.

This is not an automatic IBKR, bank, or other broker translator. Normalize a
broker export locally into this format. Do not upload statements to an LLM for
conversion. Existing manually created holding IDs are visible in Update holding.

## History and policy review

Record a named snapshot before replacing valuations if you want to retain the
previous state. Each snapshot copies account labels and holdings with their
own valuation dates. A recording timestamp does not refresh old valuations.
At most 50 snapshots are retained; export a backup before deleting history.

Snapshot totals are not TWR, MWR, gains, or returns. They do not adjust for
cash flows, changing accounts, or missing valuations.

Policy review uses the existing deterministic IPS engine. A new policy starts
with property observation-only and cash protected; targets are never guessed.
Changing a recorded holding kind without updating its IPS classification blocks
assessment. Source captions identify manual folio records, not Wealthfolio.

## Encryption and recovery

The whole workspace is one authenticated AES-256-GCM envelope, derived from a
passphrase using PBKDF2-SHA256. The passphrase is not retained. While unlocked,
a non-exportable derived key remains in memory so individual Save actions can
encrypt without repeatedly requesting the passphrase. Every save uses a new
nonce. Hiding the page, ten minutes of inactivity, or locking clears the
application's references to the key and plaintext.

An unlocked or compromised browser can access the data. Encryption is not a
defense against malware, malicious extensions, screenshots, or an unlocked
device. Use full-disk encryption and a trusted browser.

Encrypted backups use the `folio-encrypted-portfolio` version-1 envelope and
contain current accounts, holdings, the optional IPS, and recorded snapshots.
They are distinct from the optional addon's IPS-only backups. The encrypted file
limit is 10 MiB; the plaintext document is bounded below that limit. Backup and
restore are explicit local file operations, not sync.

Keep backups in private storage outside git. There is no password reset. If
the stored record is structurally damaged, Recover damaged storage can clear
only an unreadable record after confirmation, allowing backup restoration.
It will not silently replace a readable concurrent record.

The optional local Ollama feature retains its fixed-loopback, cloud-disabled
preflight and fact-selection-only contract. See `addon/README.md` for local
Ollama configuration. No remote model fallback is introduced.

## Next extensions, not current capabilities

Broker-specific local CSV mappings and a carefully designed transaction import
can be considered later. Performance returns should use an established,
deterministic accounting engine rather than be improvised from snapshots.
Tax features remain gated on VID primary sources. Auto-trading and cloud
financial-data hosting remain prohibited.
