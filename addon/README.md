# folio

**Wealthfolio is optional.** For the standalone portfolio app, use
`npm run build:standalone` then `npm start`, and open
`http://127.0.0.1:4179/`. See [the standalone guide](../docs/standalone.md).
The remainder of this document describes the optional Wealthfolio adapter.

A local, read-only IPS companion for Wealthfolio. folio evaluates allocation and
cost rules in code and drafts contributions for manual review. It never trades.

## Develop and package

Use Node.js 22.18 or later and npm, with the checked-in lockfile.

```text
npm ci
npm run type-check
npm test
npm run bundle
npm run dev:server
```

`bundle` creates a ZIP from an explicit public-file allowlist. The addon targets
the SDK 2 host contract and React supplied by Wealthfolio. Do not interpret the
minimum version in the manifest as proof of compatibility with every desktop
release: complete the acceptance steps below on the exact installed version.

`npm run dev:preview` serves a separate generated-data host at
`http://127.0.0.1:4178/dev/`. It exercises onboarding, editing, local storage and
addon disable/re-enable without reading real accounts. It is never packaged.

## Local workflow

1. Create accounts and import a manual broker CSV using Wealthfolio's existing
   UI. Reconcile positions, cash, fees, currency and import duplicates against
   the private export. Keep that work and its results outside git.
2. Open folio and create or import an IPS. Define your own categories, targets,
   goals and holding classifications; there is no suggested asset allocation.
3. Classify every selected holding. Mark property as observation-only and
   emergency or earmarked cash as a protected reserve. A pension can count
   toward exposure without folio ever creating orders or changing the account.
4. Save using a passphrase of at least twelve characters. Export an encrypted
   copy to your private vault. There is no passphrase recovery.
5. Resolve snapshot issues before relying on drift. Review cost coverage
   separately; TER comes from owner-sourced fund information, not an LLM.
6. Enter new external cash and choose a goal to draft a category distribution.
   Existing cash already present in the snapshot must not be entered again.
   Ineligible allocations remain explicitly unallocated. A draft never sells
   holdings, spends protected reserves, or writes to a brokerage.

Amounts use currency minor units internally. Target weights, TER, and drift
bands use basis points. [The IPS format](../docs/ips-format.md) describes the
versioned private document.

## Storage and privacy

Only the encrypted IPS is persisted by folio, in its own IndexedDB database in
the desktop webview. AES-256-GCM authenticates the ciphertext; PBKDF2-SHA256
derives a non-exportable key with a fresh salt. No passphrase, snapshot, draft,
question, or model response is persisted. Saving from a stale window is refused.
Exported files are encrypted; plaintext private JSON may be imported locally.

The page locks when hidden, disabled, or idle for ten minutes. Unlocking puts
the policy and portfolio in process memory, so encryption does not protect
against malware, other malicious host addons, a compromised webview, or an
unlocked device. Use full-disk encryption and trusted addons. folio does not
claim to encrypt Wealthfolio's database or the original broker exports.

The private vault file and encrypted addon copy are manually synchronized.
Export after policy edits; there is no automatic vault filesystem access.
Clearing application webview data can remove the saved copy. Keep backups.

### Local commit and push protection

From the repository root, configure an existing owner-maintained private pattern
file outside every repository worktree:

```powershell
pwsh -File scripts\setup-leak-audit.ps1 -PatternsFile "<absolute private patterns file>"
```

This installs repository-local pre-commit/pre-push gates and chains existing
hooks. No pattern file is installed automatically or copied into git. Keep
personal identifiers in that private file; never paste them into an issue or
agent conversation. The shared scanner's matching output is suppressed by the
hook because matches can themselves reveal identifiers.

The filename gate also rejects likely raw exports and private IPS files, and
CI checks tracked names and history. Filename rules cannot identify every
financial value in arbitrary source text; they supplement, not replace, the
private pattern audit and careful staging.

## Optional local Ollama

The deterministic explanations work without a model. To use question-based
retrieval, install a local GGUF model in Ollama yourself and disable its cloud
features with `OLLAMA_NO_CLOUD=1`, then restart Ollama. Permit only your exact
Wealthfolio webview origin through `OLLAMA_ORIGINS`; do not use a wildcard.

folio uses only `http://127.0.0.1:11434`. Before sending a question or any facts,
it requires `/api/status` to report `cloud.disabled: true` and `/api/show` to
describe a local GGUF model without remote-model fields. Older Ollama versions
without this status endpoint are refused, not silently trusted. Configure an
outbound firewall if your threat model requires enforcement outside the app.

The model may select up to four existing fact IDs. folio renders the matching
code-produced explanations and citations, never model-written amounts or prose.
Unsupported answers abstain; errors do not fall back to a remote service.
Requests are cancelled on navigation/lock and are not stored by folio. The local
Ollama process and its logging configuration remain part of the trusted device.

References: [Ollama local-only mode](https://docs.ollama.com/cloud#local-only),
[model details](https://docs.ollama.com/api-reference/show-model-details).

## Desktop acceptance before private daily use

Use generated data first, never real screenshots in issues or CI artifacts.

- Install the ZIP in the intended Wealthfolio desktop version; open the sidebar
  route and confirm its host styles, permissions and base currency.
- Exercise disable/re-enable, route changes, host valuation updates, loading and
  permission failures. Confirm an old assessment or draft is not retained after
  a failed refresh.
- Create a policy, close and reopen the desktop app, unlock it, then export and
  restore its encrypted backup. Wrong passphrases must fail, and a stale window
  must not overwrite newer edits.
- Confirm unclassified, stale, missing-price and missing-FX cases block drafts.
  Check property, pension and reserve treatments against the intended scope.
- With cloud disabled, exercise local retrieval and cancellation; with cloud
  enabled or an unavailable local endpoint, confirm no private chat request is
  sent. Host CSP/CORS restrictions may require local configuration.

The next owner-dependent work is this desktop acceptance, one private broker
import reconciliation, and refining the policy through normal reviews. Tax
features remain gated on VID primary sources. No cloud deployment exists.

## License

MIT. Distribution includes the repository license.
