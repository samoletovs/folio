import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { emptyPortfolio, parsePortfolio, portfolioSnapshot, seedPortfolioPolicy, type PortfolioDocument } from '../lib/portfolio.ts';
import { createPortfolioSession, openPortfolio, parsePortfolioFile, portfolioStore, sealPortfolio, type PortfolioSession, type SavedPortfolio } from '../lib/portfolio-vault.ts';
import { WorkspaceGate } from './workspace-gate.tsx';
import { PortfolioManager } from './portfolio-manager.tsx';
import { SnapshotHistory } from './snapshot-history.tsx';
import { PolicyEditor } from '../components/policy-editor.tsx';
import { PortfolioReview } from '../components/portfolio-review.tsx';
import { downloadPrivateFile } from './download.ts';

type Section = 'portfolio' | 'policy' | 'history';
export function StandaloneApp() {
  const [record, setRecord] = useState<SavedPortfolio | null>(null);
  const [documentValue, setDocument] = useState<PortfolioDocument | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [section, setSection] = useState<Section>('portfolio');
  const [editingPolicy, setEditingPolicy] = useState(false);
  const [generation, setGeneration] = useState(0);
  const epoch = useRef(0);
  const occupied = useRef(false);
  const key = useRef<PortfolioSession | null>(null);
  const lock = useCallback(() => {
    ++epoch.current; key.current = null; occupied.current = false;
    setDocument(null); setBusy(false); setReady(false); setError(''); setStatus('');
    setEditingPolicy(false); setSection('portfolio'); setGeneration((value) => value + 1);
  }, []);
  useEffect(() => {
    let closed = false;
    portfolioStore.read().then((result) => { if (!closed) { setRecord(result); setReady(true); } })
      .catch(() => { if (!closed) setError('Cannot read local encrypted storage. Retry, check browser storage permissions, or recover a damaged record from your backup.'); });
    return () => { closed = true; ++epoch.current; key.current = null; };
  }, [generation]);
  useEffect(() => {
    let timer = setTimeout(lock, 600_000);
    const reset = () => { clearTimeout(timer); timer = setTimeout(lock, 600_000); };
    const hide = () => { if (document.hidden) lock(); };
    document.addEventListener('visibilitychange', hide);
    document.addEventListener('pointerdown', reset); document.addEventListener('keydown', reset);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', hide); document.removeEventListener('pointerdown', reset); document.removeEventListener('keydown', reset); };
  }, [lock]);
  async function operation(action: (token: number) => Promise<void>) {
    if (occupied.current) throw new Error('Wait for the current encrypted save to finish.');
    const token = epoch.current;
    occupied.current = true; setBusy(true); setError(''); setStatus('');
    try { await action(token); }
    finally { if (token === epoch.current) { occupied.current = false; setBusy(false); } }
  }
  function requireCurrent(token: number) {
    if (token !== epoch.current || document.hidden) throw new Error('folio locked before this operation finished. Unlock and try again.');
  }
  async function save(next: PortfolioDocument) {
    await operation(async (token) => {
      const session = key.current;
      if (!session) throw new Error('Unlock the portfolio before saving.');
      const checked = parsePortfolio(next);
      const envelope = await sealPortfolio(checked, session);
      requireCurrent(token);
      const result = await portfolioStore.write(envelope, record?.revision ?? null);
      requireCurrent(token);
      setRecord(result); setDocument(checked); setStatus('Changes saved locally, encrypted.');
    });
  }
  async function create(currency: string, passphrase: string) {
    await operation(async (token) => {
      const next = emptyPortfolio(currency);
      const session = await createPortfolioSession(passphrase);
      const envelope = await sealPortfolio(next, session);
      requireCurrent(token);
      const result = await portfolioStore.write(envelope, record?.revision ?? null);
      requireCurrent(token);
      key.current = session; setRecord(result); setDocument(next); setStatus('Encrypted portfolio created. Add your first account.');
    });
  }
  async function unlock(passphrase: string) {
    if (!record) throw new Error('No saved portfolio was found. Create one or restore an encrypted backup.');
    await operation(async (token) => {
      const result = await openPortfolio(record.envelope, passphrase);
      requireCurrent(token);
      key.current = result.session; setDocument(result.document); setStatus('Portfolio unlocked on this device.');
    });
  }
  async function restore(text: string, passphrase: string) {
    await operation(async (token) => {
      const result = await openPortfolio(parsePortfolioFile(text), passphrase);
      const envelope = await sealPortfolio(result.document, result.session);
      requireCurrent(token);
      const saved = await portfolioStore.write(envelope, record?.revision ?? null);
      requireCurrent(token);
      key.current = result.session; setRecord(saved); setDocument(result.document); setStatus('Encrypted backup restored locally.');
    });
  }
  async function discard() {
    if (!record || !window.confirm('Delete this browser profile’s saved encrypted portfolio? There is no undo. Export a backup first. Your external files are not deleted.')) return;
    try { await operation(async () => { await portfolioStore.write(null, record.revision); lock(); }); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'The local portfolio was not deleted.'); }
  }
  async function recover() {
    if (!window.confirm('Discard an unreadable local record so you can restore a backup? A readable encrypted record will not be deleted.')) return;
    try { await portfolioStore.discardDamaged(); lock(); }
    catch { setError('Recovery did not discard the record. Retry storage; a readable portfolio must use the normal delete action.'); }
  }
  const snapshot = useMemo(() => documentValue ? portfolioSnapshot(documentValue) : null, [documentValue]);
  return <main className="folio">
    <header className="folio-header"><div><h1>folio</h1><p>Your private portfolio, on your device.</p></div><div className="folio-actions">
      {record && <button className="folio-secondary" disabled={busy} onClick={() => downloadPrivateFile(JSON.stringify(record.envelope), 'folio-portfolio.private.json')}>Export encrypted backup</button>}
      {documentValue && <button className="folio-secondary" onClick={lock}>Lock portfolio</button>}
    </div></header>
    {error && <div className="folio-notice" role="alert"><p className="folio-error">{error}</p>{!ready && <div className="folio-actions"><button onClick={lock}>Retry storage</button><button className="folio-secondary" onClick={() => { void recover(); }}>Recover damaged storage</button></div>}</div>}
    {!ready && !error && <p role="status">Opening local encrypted storage...</p>}
    {ready && !documentValue && <WorkspaceGate key={generation} exists={record !== null} busy={busy} onCreate={create} onUnlock={unlock} onRestore={restore} />}
    {documentValue && snapshot && <>
      <nav className="folio-nav" aria-label="Portfolio sections">
        {(['portfolio', 'policy', 'history'] as const).map((item) => <button key={item} disabled={busy} className="folio-secondary" aria-current={section === item ? 'page' : undefined} onClick={() => { setSection(item); setEditingPolicy(false); setStatus(''); }}>{item === 'portfolio' ? 'Accounts and holdings' : item === 'policy' ? 'Policy and contributions' : 'Snapshot history'}</button>)}
      </nav>
      <p className="folio-note" role="status" aria-live="polite">{busy ? 'Encrypting and saving locally...' : status || 'Submitted changes are encrypted immediately. Unsubmitted form edits are discarded on lock.'}</p>
      {section === 'portfolio' && <PortfolioManager document={documentValue} busy={busy} onSave={save} />}
      {section === 'history' && <SnapshotHistory document={documentValue} busy={busy} onSave={save} />}
      {section === 'policy' && (editingPolicy ? <PolicyEditor standalone snapshot={snapshot} policy={documentValue.policy} initialDraft={seedPortfolioPolicy(documentValue)}
        onCancel={() => setEditingPolicy(false)} onSave={async (policy) => { await save({ ...documentValue, policy }); setEditingPolicy(false); }} /> : <>
        <section><div className="folio-section-heading"><div><h2>Your investment policy</h2><p>Set your own targets and safeguards. Property starts observation-only and cash starts protected; review those classifications before saving.</p></div><div className="folio-actions"><button disabled={busy || documentValue.accounts.length === 0} onClick={() => setEditingPolicy(true)}>{documentValue.policy ? 'Edit IPS' : 'Create my IPS'}</button>{documentValue.policy && <button className="folio-secondary" disabled={busy} onClick={() => {
          if (window.confirm('Remove the IPS from this workspace? Accounts, holdings and recorded snapshots are kept.')) save({ ...documentValue, policy: null }).catch((failure: unknown) => setError(failure instanceof Error ? failure.message : 'The IPS was not removed.'));
        }}>Remove IPS</button>}</div></div>{documentValue.accounts.length === 0 && <p>Add an account in Accounts and holdings first.</p>}</section>
        {documentValue.policy && <PortfolioReview key={record?.revision} snapshot={snapshot} policy={documentValue.policy} sourceName="manual folio records" />}
      </>)}
    </>}
    <footer><p>Local snapshots, not a transaction ledger. folio does not fetch live quotes, calculate performance returns or tax, connect to brokers, or execute trades.</p>
      {!documentValue && record && <button className="folio-secondary" disabled={busy} onClick={() => { void discard(); }}>Delete saved portfolio from this browser</button>}
    </footer>
  </main>;
}
