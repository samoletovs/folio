import { useState, type FormEvent } from 'react';
import { formatMoney } from '../lib/money.ts';
import { totalValue, type PortfolioDocument } from '../lib/portfolio.ts';
import { holdingKey } from '../types/index.ts';

export function SnapshotHistory({ document, busy, onSave }: {
  document: PortfolioDocument; busy: boolean; onSave: (document: PortfolioDocument) => Promise<void>;
}) {
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  async function record(event: FormEvent) {
    event.preventDefault(); setError('');
    try {
      await onSave({
        ...document, snapshots: [...document.snapshots, {
          id: crypto.randomUUID(), recordedAt: new Date().toISOString(), label: label.trim(),
          accounts: document.accounts.map((account) => ({ ...account })), holdings: document.holdings.map((holding) => ({ ...holding })),
        }],
      });
      setLabel('');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'The snapshot was not recorded.'); }
  }
  async function remove(id: string) {
    if (!window.confirm('Delete this recorded snapshot? Export an encrypted backup first if you need to preserve it. Current holdings are unchanged.')) return;
    try { await onSave({ ...document, snapshots: document.snapshots.filter((item) => item.id !== id) }); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'The snapshot was not deleted.'); }
  }
  return <section><h2>Recorded snapshots</h2>
    <p>Preserve a dated copy before updating or importing new values. Snapshot totals are not investment returns: deposits, withdrawals, missing valuations and account changes are not adjusted for.</p>
    <form className="folio-contribution-form" onSubmit={record}><label>Snapshot label<input required maxLength={200} value={label} disabled={busy} onChange={(event) => setLabel(event.target.value)} /></label><button disabled={busy || document.holdings.length === 0 || document.snapshots.length >= 50} type="submit">Record current snapshot</button></form>
    {document.snapshots.length >= 50 && <p className="folio-warning">The workspace holds at most 50 recorded snapshots. Export a backup before removing older snapshots.</p>}
    {error && <p role="alert" className="folio-error">{error}</p>}
    {document.snapshots.length === 0 && <p>No snapshots recorded yet. Current holdings are saved separately whenever you submit a change.</p>}
    {[...document.snapshots].reverse().map((snapshot) => <details key={snapshot.id}>
      <summary>{snapshot.label} - {formatMoney(totalValue(snapshot.holdings), document.baseCurrency)} - {new Date(snapshot.recordedAt).toLocaleString()}</summary>
      <p>Recorded {snapshot.holdings.length} holdings. Each keeps its original valuation date, which may be older than the recording date.</p>
      <div className="folio-table-wrap" tabIndex={0} role="region" aria-label="Archived snapshot holdings"><table><caption>Archived values, not current quotes</caption><thead><tr><th>Holding</th><th>Account</th><th>Value</th><th>Valued on</th></tr></thead><tbody>
        {snapshot.holdings.map((holding) => <tr key={holdingKey(holding.accountId, holding.id)}><th scope="row">{holding.name}</th><td>{snapshot.accounts.find((account) => account.id === holding.accountId)?.name}</td><td>{formatMoney(holding.valueMinor, document.baseCurrency)}</td><td>{holding.asOfDate}</td></tr>)}
      </tbody></table></div>
      <button className="folio-secondary" disabled={busy} onClick={() => { void remove(snapshot.id); }}>Delete recorded snapshot</button>
    </details>)}
  </section>;
}
