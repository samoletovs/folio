import { useState, type FormEvent } from 'react';
import { currencyDigits, formatMoney, parseAmount } from '../lib/money.ts';
import { parseLocalHolding, type LocalHolding, type PortfolioDocument } from '../lib/portfolio.ts';
import { CSV_HEADER, importHoldingsCsv, MAX_CSV_BYTES } from '../lib/portfolio-csv.ts';
import { downloadPrivateFile } from './download.ts';

function editableAmount(value: number, currency: string) {
  const digits = currencyDigits(currency);
  const scale = 10n ** BigInt(digits);
  const amount = BigInt(value);
  return digits ? `${amount / scale}.${(amount % scale).toString().padStart(digits, '0')}` : String(amount);
}
export function HoldingEditor({ document, holding, busy, onSave, onCancel }: {
  document: PortfolioDocument; holding: LocalHolding | null; busy: boolean;
  onSave: (holding: LocalHolding) => Promise<void>; onCancel: () => void;
}) {
  const [accountId, setAccountId] = useState(holding?.accountId ?? document.accounts[0]?.id ?? '');
  const [name, setName] = useState(holding?.name ?? '');
  const [symbol, setSymbol] = useState(holding?.symbol ?? '');
  const [kind, setKind] = useState<LocalHolding['kind']>(holding?.kind ?? 'security');
  const [value, setValue] = useState(holding ? editableAmount(holding.valueMinor, document.baseCurrency) : '');
  const [date, setDate] = useState(holding?.asOfDate ?? new Date().toISOString().slice(0, 10));
  const [units, setUnits] = useState(holding?.units ?? '');
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    try {
      await onSave(parseLocalHolding({
        id: holding?.id ?? crypto.randomUUID(), accountId, name: name.trim(), symbol: symbol.trim(),
        kind, valueMinor: parseAmount(value, document.baseCurrency), asOfDate: date,
        units: kind === 'cash' ? null : units.trim() || null,
      }));
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'The holding was not saved.'); }
  }
  return <section className="folio-editor">
    <h2>{holding ? 'Update holding' : 'Add a holding or cash balance'}</h2>
    <p>Enter its total current value in {document.baseCurrency}, as reported by your statement or manual valuation. Units are descriptive only; no prices or exchange rates are fetched.</p>
    {holding && <p className="folio-note">Stable CSV holding ID: <code>{holding.id}</code>. Keep this ID on subsequent account imports to preserve policy references.</p>}
    <form className="folio-stack" onSubmit={submit}>
      <div className="folio-edit-row">
        <label>Account<select required value={accountId} disabled={busy || holding !== null} onChange={(event) => setAccountId(event.target.value)}>{document.accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
        <label>Holding name<input required maxLength={200} value={name} disabled={busy} onChange={(event) => setName(event.target.value)} /></label>
        <label>Kind<select value={kind} disabled={busy} onChange={(event) => {
          const next = event.target.value;
          if (next === 'security' || next === 'cash' || next === 'pension' || next === 'real-estate') setKind(next);
        }}><option value="security">Investment / security</option><option value="cash">Cash balance</option><option value="pension">Private pension</option><option value="real-estate">Real estate</option></select></label>
      </div>
      <div className="folio-edit-row">
        <label>Current value ({document.baseCurrency})<input required inputMode="decimal" value={value} disabled={busy} onChange={(event) => setValue(event.target.value)} /></label>
        <label>Valued on<input required type="date" value={date} disabled={busy} onChange={(event) => setDate(event.target.value)} /></label>
        <label>Symbol or reference (optional)<input maxLength={200} value={symbol} disabled={busy} onChange={(event) => setSymbol(event.target.value)} /></label>
        {kind !== 'cash' && <label>Units (optional)<input inputMode="decimal" value={units} disabled={busy} onChange={(event) => setUnits(event.target.value)} /></label>}
      </div>
      {error && <p role="alert" className="folio-error">{error}</p>}
      <div className="folio-actions"><button disabled={busy} type="submit">{busy ? 'Encrypting...' : 'Save holding'}</button><button disabled={busy} type="button" className="folio-secondary" onClick={onCancel}>Cancel</button></div>
    </form>
  </section>;
}

export function CsvImporter({ document, busy, onImport, onCancel }: {
  document: PortfolioDocument; busy: boolean;
  onImport: (accountId: string, holdings: LocalHolding[]) => Promise<void>;
  onCancel: () => void;
}) {
  const [accountId, setAccountId] = useState(document.accounts[0]?.id ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<LocalHolding[] | null>(null);
  const [error, setError] = useState('');
  const [parsing, setParsing] = useState(false);
  async function preview(event: FormEvent) {
    event.preventDefault(); setError(''); setRows(null);
    if (!file) { setError('Choose a local CSV file.'); return; }
    setParsing(true);
    try {
      if (file.size > MAX_CSV_BYTES) throw new Error('Choose a CSV smaller than 2 MiB.');
      let text: string;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()); }
      catch { throw new Error('The CSV could not be read as UTF-8. Save a UTF-8 copy locally and retry.'); }
      setRows(importHoldingsCsv(text, accountId, document.baseCurrency));
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'The CSV could not be read.'); }
    finally { setParsing(false); }
  }
  async function apply() {
    if (!rows || !window.confirm('Replace all current holdings in the selected account with these CSV rows? Other accounts and recorded snapshots are unchanged.')) return;
    try { await onImport(accountId, rows); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'The CSV was not imported.'); }
  }
  return <section><h2>Import an account snapshot</h2>
    <p>This replaces the selected account's current holdings, not its transaction history. Use stable holding IDs on repeat imports. Values must already be in {document.baseCurrency}; this is a generic snapshot format, not an automatic broker-export translator.</p>
    <p className="folio-note">Required columns: id,name,kind,value,currency,as_of. Optional: symbol,units. Use comma-separated UTF-8 text, decimal points, and YYYY-MM-DD dates.</p>
    <form onSubmit={preview} className="folio-stack">
      <label>Account to replace<select disabled={busy || parsing} value={accountId} onChange={(event) => { setAccountId(event.target.value); setRows(null); }}>{document.accounts.map((account) => <option value={account.id} key={account.id}>{account.name}</option>)}</select></label>
      <label>Local CSV file<input required type="file" accept=".csv,text/csv" disabled={busy || parsing} onChange={(event) => { setFile(event.target.files?.[0] ?? null); setRows(null); }} /></label>
      <div className="folio-actions"><button disabled={busy || parsing} type="submit">{parsing ? 'Reading locally...' : 'Preview CSV'}</button><button type="button" className="folio-secondary" onClick={() => downloadPrivateFile(CSV_HEADER, 'folio-snapshot-template.csv', 'text/csv')}>Download empty template</button><button type="button" className="folio-secondary" disabled={busy || parsing} onClick={onCancel}>Cancel</button></div>
    </form>
    {error && <p className="folio-error" role="alert">{error}</p>}
    {rows && <div aria-live="polite"><h3>{rows.length} holdings ready for review</h3>
      <div className="folio-table-wrap" tabIndex={0} role="region" aria-label="CSV preview; scroll for all columns"><table><caption>First 20 rows of the proposed replacement</caption><thead><tr><th>Name</th><th>Kind</th><th>Value</th><th>Valued on</th></tr></thead><tbody>{rows.slice(0, 20).map((row) => <tr key={row.id}><th scope="row">{row.name}</th><td>{row.kind}</td><td>{formatMoney(row.valueMinor, document.baseCurrency)}</td><td>{row.asOfDate}</td></tr>)}</tbody></table></div>
      <p>The current {document.holdings.filter((holding) => holding.accountId === accountId).length} holdings in this account will be replaced. IPS mappings are retained so classifications can be reviewed explicitly.</p>
      <button disabled={busy} onClick={() => { void apply(); }}>{busy ? 'Encrypting import...' : 'Replace account holdings'}</button>
    </div>}
  </section>;
}
