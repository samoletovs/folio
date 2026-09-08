import { useCallback, useEffect, useRef, useState } from 'react';
import type { AddonContext } from '@wealthfolio/addon-sdk';
import type { Policy, Snapshot } from '../types/index.ts';
import { parsePolicy } from '../lib/policy.ts';
import { decryptPolicy, encryptPolicy, isEncryptedPolicy, parsePolicyJson } from '../lib/vault.ts';
import { discardDamagedVault, readVault, writeVault, type SavedVault } from '../lib/vault-store.ts';
import { useSnapshot } from '../hooks/use-snapshot.ts';
import { PolicyEditor } from '../components/policy-editor.tsx';
import { VaultGate } from '../components/vault-gate.tsx';
import { PortfolioReview } from '../components/portfolio-review.tsx';
import { DataIssues } from '../components/data-issues.tsx';
import styles from '../styles.css?inline';

export function FolioPage({ ctx }: { ctx: AddonContext }) {
  const [saved, setSaved] = useState<SavedVault | null>(null);
  const [ready, setReady] = useState(false);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [editing, setEditing] = useState(false);
  const [editingSnapshot, setEditingSnapshot] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [session, setSession] = useState(0);
  const epoch = useRef(0);
  const active = policy !== null || editing;
  const { snapshot, loading, error: snapshotError, refresh } = useSnapshot(ctx, active);
  const lock = useCallback(() => {
    ++epoch.current; setPolicy(null); setEditing(false); setEditingSnapshot(null); setBusy(false); setError('');
    setSession((value) => value + 1); setReady(false);
  }, []);
  useEffect(() => {
    let cancelled = false;
    readVault().then((value) => {
      if (!cancelled) { setSaved(value); setReady(true); }
    }).catch(() => {
      if (!cancelled) setError('Cannot open encrypted IPS storage. Reopen folio and check application storage permissions. Your saved data has not been replaced.');
    });
    return () => { cancelled = true; ++epoch.current; };
  }, [session]);
  useEffect(() => {
    let timeout = window.setTimeout(lock, 600_000);
    const activity = () => { clearTimeout(timeout); timeout = window.setTimeout(lock, 600_000); };
    const visibility = () => { if (document.hidden) lock(); };
    document.addEventListener('visibilitychange', visibility);
    document.addEventListener('pointerdown', activity);
    document.addEventListener('keydown', activity);
    return () => {
      clearTimeout(timeout);
      document.removeEventListener('visibilitychange', visibility);
      document.removeEventListener('pointerdown', activity);
      document.removeEventListener('keydown', activity);
    };
  }, [lock]);
  useEffect(() => {
    if (editing && snapshot) setEditingSnapshot(snapshot);
    if (!editing) setEditingSnapshot(null);
  }, [editing, snapshot]);
  const editorSnapshot = snapshot ?? editingSnapshot;
  async function save(next: Policy, passphrase: string) {
    const token = epoch.current;
    setBusy(true);
    try {
      const envelope = await encryptPolicy(next, passphrase);
      if (token !== epoch.current) return;
      const result = await writeVault(envelope, saved?.revision ?? null);
      if (token === epoch.current && !document.hidden) { setSaved(result); setPolicy(next); setEditing(false); setError(''); }
    } finally { if (token === epoch.current) setBusy(false); }
  }
  async function unlock(passphrase: string) {
    if (!saved) throw new Error('No saved IPS was found. Create one or import a private file.');
    const token = epoch.current;
    setBusy(true);
    try {
      const next = await decryptPolicy(saved.envelope, passphrase);
      if (token === epoch.current && !document.hidden) setPolicy(next);
    } finally { if (token === epoch.current) setBusy(false); }
  }
  async function importPolicy(text: string, passphrase: string) {
    const token = epoch.current;
    setBusy(true);
    try {
      const input = parsePolicyJson(text);
      const next = isEncryptedPolicy(input) ? await decryptPolicy(input, passphrase) : parsePolicy(input);
      if (token === epoch.current) await save(next, passphrase);
    } finally { if (token === epoch.current) setBusy(false); }
  }
  async function exportPolicy() {
    if (!saved) { setError('Save an encrypted IPS before exporting.'); return; }
    try { await ctx.api.files.openSaveDialog(JSON.stringify(saved.envelope), 'folio-ips.private.json'); }
    catch { setError('Cannot open the export dialog. Check addon file-save permissions and try again.'); }
  }
  async function forgetPolicy() {
    if (!saved || !window.confirm('Delete the encrypted IPS saved in this addon? This does not delete Wealthfolio holdings or your exported backups.')) return;
    try { await writeVault(null, saved.revision); setSaved(null); lock(); }
    catch { setError('The local IPS was not deleted. It may have changed in another window; lock and reopen folio.'); }
  }
  async function recoverStorage() {
    if (!window.confirm('Discard a damaged local IPS record so you can restore an encrypted backup? This cannot recover a lost policy or passphrase. A readable saved policy will not be deleted.')) return;
    try { await discardDamagedVault(); setSaved(null); lock(); }
    catch { setError('The record was not discarded. Retry storage; if a readable policy exists, use its normal delete action.'); }
  }
  return <main className="folio">
    <style>{styles}</style>
    <header className="folio-header"><div><h1>folio</h1><p>Your portfolio. Your policy. Your decision.</p></div>
      <div className="folio-actions">
        {active && <button className="folio-secondary" disabled={loading || busy || editing} onClick={() => { void refresh(); }}>Refresh snapshot</button>}
        {policy && !editing && <button className="folio-secondary" disabled={busy || !snapshot} onClick={() => setEditing(true)}>Edit IPS</button>}
        {saved && <button className="folio-secondary" disabled={busy} onClick={() => { void exportPolicy(); }}>Export encrypted IPS</button>}
        {active && <button className="folio-secondary" onClick={lock}>Lock</button>}
      </div>
    </header>
    {error && <div className="folio-notice" role="alert"><p className="folio-error">{error}</p>{!ready && <div className="folio-actions"><button onClick={lock}>Retry storage</button><button className="folio-secondary" onClick={() => { void recoverStorage(); }}>Recover damaged local storage</button></div>}</div>}
    {!ready && !error && <p role="status">Opening encrypted storage...</p>}
    {ready && !active && <VaultGate key={session} exists={saved !== null} busy={busy} onUnlock={unlock} onCreate={() => setEditing(true)} onImport={importPolicy} />}
    {active && loading && <p role="status">Reading local Wealthfolio accounts and valuations...</p>}
    {active && snapshotError && <div role="alert" className="folio-notice"><p className="folio-error">{snapshotError}</p><button onClick={() => { void refresh(); }}>Retry snapshot</button></div>}
    {editing && snapshot && snapshot.issues.length > 0 && <div className="folio-notice" role="alert"><h3>Wealthfolio data needs attention</h3><DataIssues issues={snapshot.issues} snapshot={snapshot} /></div>}
    {active && snapshot && snapshot.accounts.length === 0 && snapshot.issues.length === 0 && <section><h2>No active accounts yet</h2><p>Create an account and import a broker CSV in Wealthfolio first. Keep exports outside this repository, then refresh folio.</p></section>}
    {editing && editorSnapshot && editorSnapshot.accounts.length > 0 && <PolicyEditor snapshot={editorSnapshot} policy={policy} onSave={save} onCancel={() => policy ? setEditing(false) : lock()} />}
    {policy && snapshot && !editing && <PortfolioReview key={`${snapshot.fetchedAt}-${session}`} snapshot={snapshot} policy={policy} />}
    <footer><p>Local-only decision support. Wealthfolio computes valuations and returns; folio evaluates your rules. No trading or tax calculations.</p>
      {saved && !active && <button className="folio-secondary" disabled={busy} onClick={() => { void forgetPolicy(); }}>Delete saved IPS from this device</button>}
    </footer>
  </main>;
}
