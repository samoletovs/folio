# folio

A **standalone, local-only portfolio tracker** for accounts, investments, cash,
manual valuations, and Investment Policy Statement (IPS) reviews.
Wealthfolio is optional, not required.

## Run your own folio

Use Node.js 22.18 or later. The shared application code currently lives in
`addon/`; the directory name does not mean you need to install Wealthfolio.

```powershell
cd addon
npm ci
npm run build:standalone
npm start
```

Open **http://127.0.0.1:4179/** in your browser. The server binds only to loopback
and serves built application files. It has no financial-data upload endpoint.
Stopping the server does not delete the encrypted browser data.

Create an encrypted portfolio with a passphrase, add accounts, and record
holdings or cash values. All values must already be in your selected base
currency; folio does not fetch or infer quotes or exchange rates.

## Implemented

- Create and rename accounts; add, update, and remove current holdings, cash,
  private pension, and manually valued real estate.
- Preview and import a generic CSV snapshot for one account, explicitly
  replacing its current holdings rather than duplicating them.
- Preserve up to 50 dated snapshots, independent of later edits. These are
  recorded values, **not investment performance returns**.
- Define a private IPS, classify holdings, review allocation drift and known
  TER, and draft goal-gated, new-cash contributions.
- Encrypt the whole workspace in local browser storage and export/restore an
  encrypted backup. No passphrase is persisted.
- Optionally ask local Ollama to select relevant code-produced explanations,
  with cloud-disabled preflight and no model arithmetic.

See [the standalone guide](docs/standalone.md) for the CSV format, storage
boundaries and recovery, and [the IPS format](docs/ips-format.md) for policy rules.

## Privacy and limits

Use the **same browser profile and exact local address** each time. Browser
storage is origin-specific: changing the hostname, port, or profile opens a
different store. Clearing browser data can delete the saved workspace.
Export encrypted backups to private storage outside the repository.

Actual financial data belongs in the local UI only: **never in git, CI,
screenshots shared with an agent, or this project's chat**. Encryption protects
saved records, not an unlocked browser or compromised device. Use full-disk
encryption and trusted browser extensions.

No cloud hosting, brokerage connection, trade execution, tax engine,
transaction ledger, live prices, or performance-return calculation is included.

## Development and optional Wealthfolio addon

```powershell
cd addon
npm run dev:standalone
npm run type-check
npm test
```

Stop the production server before using the development server on the same
port. For development with generated data, use a separate browser profile;
never inspect real financial data through cloud-agent browser tools.

The existing Wealthfolio SDK 2 adapter is preserved. `npm run bundle` creates
its installable addon ZIP, while `npm run dev:preview` serves its **synthetic**
host at `http://127.0.0.1:4178/dev/`. That preview is separate from the real
standalone app. See [addon/README.md](addon/README.md).

Build-only CI covers both distributions; nothing is deployed or published.
The product direction and historical decisions are in [docs/plan.md](docs/plan.md).

## License

MIT
