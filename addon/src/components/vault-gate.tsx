import { useState, type FormEvent } from 'react';
import { MAX_POLICY_FILE_BYTES } from '../lib/vault.ts';

interface Props {
  exists: boolean;
  busy: boolean;
  onUnlock: (passphrase: string) => Promise<void>;
  onCreate: () => void;
  onImport: (text: string, passphrase: string) => Promise<void>;
}

export function VaultGate({ exists, busy, onUnlock, onCreate, onImport }: Props) {
  const [passphrase, setPassphrase] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    const secret = passphrase;
    setPassphrase('');
    try {
      if (file) {
        if (file.size > MAX_POLICY_FILE_BYTES) throw new Error('Choose an IPS file smaller than 1 MiB.');
        if (exists && !window.confirm('Replace the saved IPS with this file? Export your current encrypted IPS first if you need a backup.')) return;
        await onImport(await file.text(), secret);
      } else await onUnlock(secret);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The IPS could not be opened.');
    }
  }
  return (
    <section className="folio-welcome" aria-labelledby="welcome-title">
      <h2 id="welcome-title">{exists ? 'Your policy is locked' : 'Start with your investment policy'}</h2>
      <p>Your holdings stay in Wealthfolio. folio compares them with your own targets and drafts contributions for you to review. It never executes trades.</p>
      <p>The IPS is encrypted on this device. Your passphrase is not saved and cannot be recovered. Export an encrypted backup to your private vault.</p>
      <form onSubmit={submit} className="folio-stack">
        <label>Import a private IPS file (optional)
          <input type="file" accept=".json,application/json" disabled={busy} onChange={(event) => { setFile(event.target.files?.[0] ?? null); setError(''); }} />
        </label>
        <label>{file ? 'Passphrase for this import and local encryption' : 'IPS passphrase'}
          <input type="password" autoComplete="off" value={passphrase} disabled={busy}
            onChange={(event) => setPassphrase(event.target.value)} required minLength={file ? 12 : 1} />
        </label>
        {error && <p className="folio-error" role="alert">{error}</p>}
        <div className="folio-actions">
          <button type="submit" disabled={busy || (!exists && !file)}>{busy ? 'Opening IPS...' : file ? 'Import and encrypt IPS' : 'Unlock IPS'}</button>
          {!exists && <button type="button" className="folio-secondary" disabled={busy} onClick={onCreate}>Create my policy</button>}
        </div>
      </form>
      <p className="folio-note">Plain JSON imports are accepted locally. Exports are always encrypted. folio locks when hidden and after ten minutes of inactivity.</p>
    </section>
  );
}
