import { useState, type FormEvent } from 'react';
import { PORTFOLIO_FILE_BYTES } from '../lib/portfolio-vault.ts';

export function WorkspaceGate({ exists, busy, onCreate, onUnlock, onRestore }: {
  exists: boolean; busy: boolean;
  onCreate: (currency: string, passphrase: string) => Promise<void>;
  onUnlock: (passphrase: string) => Promise<void>;
  onRestore: (text: string, passphrase: string) => Promise<void>;
}) {
  const [passphrase, setPassphrase] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    if (!exists && !file && passphrase !== confirmation) { setError('The passphrases do not match.'); return; }
    const secret = passphrase; setPassphrase(''); setConfirmation('');
    try {
      if (file) {
        if (file.size > PORTFOLIO_FILE_BYTES) throw new Error('The encrypted portfolio backup exceeds 10 MiB.');
        if (exists && !window.confirm('Replace the saved portfolio with this encrypted backup? Export the current encrypted copy first if you need to keep it.')) return;
        await onRestore(await file.text(), secret);
      } else if (exists) await onUnlock(secret);
      else await onCreate(currency.trim().toUpperCase(), secret);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'The private portfolio could not be opened.'); }
  }
  return <section className="folio-welcome">
    <h2>{exists ? 'Unlock your portfolio' : 'Your portfolio, kept on this device'}</h2>
    <p>Track accounts, investments, cash and manually valued assets in folio itself. No Wealthfolio installation, broker connection or cloud account is needed.</p>
    <p>Saved data is encrypted. Use the same browser and local address each time, and keep an encrypted backup outside the repository. There is no passphrase recovery.</p>
    <form onSubmit={submit} className="folio-stack">
      {!exists && !file && <label>Portfolio base currency<input required maxLength={3} pattern="[A-Za-z]{3}" value={currency} disabled={busy} onChange={(event) => setCurrency(event.target.value)} /></label>}
      <label>{file ? 'Backup passphrase' : exists ? 'Portfolio passphrase' : 'Choose a passphrase (at least 12 characters)'}<input required type="password" minLength={exists || file ? 1 : 12} maxLength={1024} autoComplete={exists || file ? 'off' : 'new-password'} value={passphrase} disabled={busy} onChange={(event) => setPassphrase(event.target.value)} /></label>
      {!exists && !file && <label>Confirm passphrase<input required type="password" minLength={12} autoComplete="new-password" value={confirmation} disabled={busy} onChange={(event) => setConfirmation(event.target.value)} /></label>}
      <label>Restore an encrypted folio portfolio backup (optional)<input type="file" accept=".json,application/json" disabled={busy} onChange={(event) => { setFile(event.target.files?.[0] ?? null); setError(''); }} /></label>
      {error && <p role="alert" className="folio-error">{error}</p>}
      <button type="submit" disabled={busy}>{busy ? 'Opening private workspace...' : file ? 'Restore encrypted portfolio' : exists ? 'Unlock portfolio' : 'Create encrypted portfolio'}</button>
    </form>
    <p className="folio-note">This is a real local workspace, not the synthetic addon preview. Enter figures only here, not in the assistant chat. folio locks when hidden or idle for ten minutes.</p>
  </section>;
}
