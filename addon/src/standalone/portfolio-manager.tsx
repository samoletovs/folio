import { useState, type FormEvent } from 'react';
import { formatMoney } from '../lib/money.ts';
import { holdingKey } from '../types/index.ts';
import { replaceAccountHoldings, totalValue, type LocalHolding, type PortfolioDocument } from '../lib/portfolio.ts';
import { CsvImporter, HoldingEditor } from './holdings-editor.tsx';

export function PortfolioManager({ document, busy, onSave }: {
  document: PortfolioDocument; busy: boolean; onSave: (document: PortfolioDocument) => Promise<void>;
}) {
  const [accountName, setAccountName] = useState('');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [editor, setEditor] = useState<LocalHolding | 'new' | 'csv' | null>(null);
  const money = (value: number) => formatMoney(value, document.baseCurrency);
  async function saveAccount(event: FormEvent) {
    event.preventDefault(); setError('');
    try {
      const account = { id: accountId ?? crypto.randomUUID(), name: accountName.trim() };
      await onSave({
        ...document,
        accounts: accountId ? document.accounts.map((item) => item.id === accountId ? account : item) : [...document.accounts, account],
      });
      setAccountName(''); setAccountId(null);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'The account was not saved.'); }
  }
  async function removeAccount(id: string) {
    if (!window.confirm('Remove this account and its current holdings from folio? Recorded snapshots stay unchanged. IPS references will need review. This does not close any real account or execute a trade.')) return;
    setError('');
    try { await onSave({ ...document, accounts: document.accounts.filter((item) => item.id !== id), holdings: document.holdings.filter((holding) => holding.accountId !== id) }); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'The account was not removed.'); }
  }
  async function saveHolding(holding: LocalHolding) {
    const key = holdingKey(holding.accountId, holding.id);
    const exists = document.holdings.some((item) => holdingKey(item.accountId, item.id) === key);
    await onSave({ ...document, holdings: exists ? document.holdings.map((item) => holdingKey(item.accountId, item.id) === key ? holding : item) : [...document.holdings, holding] });
    setEditor(null);
  }
  async function removeHolding(holding: LocalHolding) {
    if (!window.confirm('Remove this holding from the current snapshot? Recorded snapshots remain unchanged. This does not sell an investment.')) return;
    setError('');
    try { await onSave({ ...document, holdings: document.holdings.filter((item) => holdingKey(item.accountId, item.id) !== holdingKey(holding.accountId, holding.id)) }); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'The holding was not removed.'); }
  }
  if (editor === 'csv') return <CsvImporter document={document} busy={busy} onCancel={() => setEditor(null)} onImport={async (id, rows) => { await onSave(replaceAccountHoldings(document, id, rows)); setEditor(null); }} />;
  if (editor !== null) return <HoldingEditor document={document} holding={editor === 'new' ? null : editor} busy={busy} onSave={saveHolding} onCancel={() => setEditor(null)} />;
  return <>
    <section aria-labelledby="accounts-title">
      <div className="folio-section-heading"><div><h2 id="accounts-title">Your accounts</h2><p>One view of the holdings you record, valued in {document.baseCurrency}. Values are manual, not live market quotes.</p></div><strong>Recorded value: {money(totalValue(document.holdings))}</strong></div>
      {document.accounts.length === 0 && <p>Add your first account, then enter holdings or import a CSV snapshot. Account names are private labels; no real account number is required.</p>}
      {document.accounts.length > 0 && <div className="folio-table-wrap" tabIndex={0} role="region" aria-label="Account values"><table><caption>Account totals from recorded holdings</caption><thead><tr><th>Account</th><th>Holdings</th><th>Recorded value</th><th>Manage</th></tr></thead><tbody>
        {document.accounts.map((account) => {
          const rows = document.holdings.filter((holding) => holding.accountId === account.id);
          return <tr key={account.id}><th scope="row">{account.name}</th><td>{rows.length}</td><td>{money(totalValue(rows))}</td><td><div className="folio-row-actions"><button className="folio-secondary" disabled={busy} onClick={() => { setAccountId(account.id); setAccountName(account.name); }} aria-label={`Rename ${account.name}`}>Rename</button><button className="folio-secondary" disabled={busy} onClick={() => { void removeAccount(account.id); }} aria-label={`Remove ${account.name}`}>Remove</button></div></td></tr>;
        })}
      </tbody></table></div>}
      <form className="folio-contribution-form" onSubmit={saveAccount}><label>{accountId ? 'Account name' : 'New account name'}<input required maxLength={200} value={accountName} disabled={busy} onChange={(event) => setAccountName(event.target.value)} /></label><button disabled={busy} type="submit">{accountId ? 'Save account name' : 'Add account'}</button>{accountId && <button type="button" className="folio-secondary" onClick={() => { setAccountId(null); setAccountName(''); }}>Cancel rename</button>}</form>
      {error && <p className="folio-error" role="alert">{error}</p>}
    </section>
    <section aria-labelledby="holdings-title">
      <div className="folio-section-heading"><div><h2 id="holdings-title">Holdings and cash</h2><p>Update the total value and valuation date when a statement or new manual valuation is available.</p></div><div className="folio-actions"><button disabled={busy || document.accounts.length === 0} onClick={() => setEditor('new')}>Add holding or cash</button><button className="folio-secondary" disabled={busy || document.accounts.length === 0} onClick={() => setEditor('csv')}>Import CSV snapshot</button></div></div>
      {document.holdings.length === 0 ? <p>No holdings have been recorded yet.</p> : <div className="folio-table-wrap" tabIndex={0} role="region" aria-label="Recorded holdings; scroll horizontally for all columns"><table><caption>Manual holdings - these are not brokerage transactions</caption><thead><tr><th>Holding</th><th>Account</th><th>Kind</th><th>Units</th><th>Value</th><th>Valued on</th><th>Manage</th></tr></thead><tbody>
        {document.holdings.map((holding) => <tr key={holdingKey(holding.accountId, holding.id)}><th scope="row">{holding.name}{holding.symbol && <small>{holding.symbol}</small>}</th><td>{document.accounts.find((account) => account.id === holding.accountId)?.name}</td><td>{holding.kind}</td><td>{holding.units ?? 'Not recorded'}</td><td>{money(holding.valueMinor)}</td><td>{holding.asOfDate}{holding.asOfDate > new Date().toISOString().slice(0, 10) && <small className="folio-warning">Future valuation date</small>}</td><td><div className="folio-row-actions"><button className="folio-secondary" disabled={busy} onClick={() => setEditor(holding)} aria-label={`Update ${holding.name}`}>Update</button><button className="folio-secondary" disabled={busy} onClick={() => { void removeHolding(holding); }} aria-label={`Remove ${holding.name}`}>Remove</button></div></td></tr>)}
      </tbody></table></div>}
    </section>
  </>;
}
