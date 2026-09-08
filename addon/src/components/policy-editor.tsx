import { useState, type FormEvent } from 'react';
import { parsePolicy } from '../lib/policy.ts';
import { parsePolicyJson } from '../lib/vault.ts';
import { holdingKey, type HoldingRule, type Policy, type Snapshot } from '../types/index.ts';

function initialPolicy(snapshot: Snapshot): Policy {
  return {
    version: 1, baseCurrency: snapshot.baseCurrency,
    accountIds: snapshot.accounts.map((account) => account.id),
    categories: [], holdings: [], goals: [],
    bands: { absoluteBps: 500, relativeBps: 2500 },
    costCeilingBps: 0, maxQuoteAgeDays: 7, emergencyFundReady: false,
  };
}

export function PolicyEditor({ snapshot, policy, onSave, onCancel, initialDraft, standalone = false }: {
  snapshot: Snapshot; policy: Policy | null;
  onSave: (policy: Policy, passphrase: string) => Promise<void>;
  onCancel: () => void;
  initialDraft?: Policy;
  standalone?: boolean;
}) {
  const [draft, setDraft] = useState(() => policy ?? initialDraft ?? initialPolicy(snapshot));
  const [passphrase, setPassphrase] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [json, setJson] = useState('');
  const mappings = new Map(draft.holdings.map((rule) => [holdingKey(rule.accountId, rule.holdingId), rule]));
  const numberValue = (value: string) => value === '' ? Number.NaN : Number(value);
  const updateRule = (accountId: string, holdingId: string, change: Partial<HoldingRule>) => {
    const key = holdingKey(accountId, holdingId);
    const previous = mappings.get(key);
    const rule: HoldingRule = {
      accountId, holdingId, categoryId: null, treatment: 'rebalance', kind: 'security', terBps: null,
      ...previous, ...change,
    };
    if (rule.kind === 'real-estate') rule.treatment = 'observe';
    if (rule.treatment !== 'rebalance') rule.categoryId = null;
    setDraft({ ...draft, holdings: [...draft.holdings.filter((item) => holdingKey(item.accountId, item.holdingId) !== key), rule] });
  };
  async function save(event: FormEvent) {
    event.preventDefault(); setError('');
    if (!standalone && passphrase !== confirmation) { setError('The passphrases do not match.'); return; }
    const secret = passphrase;
    setPassphrase(''); setConfirmation(''); setBusy(true);
    try { await onSave(parsePolicy(draft), secret); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'The IPS was not saved.'); }
    finally { setBusy(false); }
  }
  return (
    <section aria-labelledby="policy-title">
      <h2 id="policy-title">{policy ? 'Edit your policy' : 'Define your policy'}</h2>
      <p>Enter your own targets, not a model recommendation. Percentages use basis points: 100 basis points equal one percent. Changes take effect only after saving.</p>
      <form onSubmit={save} className="folio-stack">
        <fieldset disabled={busy}>
          <legend>Portfolio scope</legend>
          <p>Base currency: <strong>{draft.baseCurrency}</strong>. {standalone ? 'All manual valuations must use this currency; folio does not fetch exchange rates.' : 'Change the host currency first, then update your IPS.'}</p>
          {snapshot.accounts.map((account) => <label className="folio-check" key={account.id}>
            <input type="checkbox" checked={draft.accountIds.includes(account.id)} onChange={(event) => {
              const accountIds = event.target.checked ? [...draft.accountIds, account.id] : draft.accountIds.filter((id) => id !== account.id);
              setDraft({ ...draft, accountIds, holdings: draft.holdings.filter((rule) => accountIds.includes(rule.accountId)) });
            }} />{account.name}
          </label>)}
          {draft.accountIds.filter((id) => !snapshot.accounts.some((account) => account.id === id)).map((id) => <p key={id}>
            Selected account {id} is absent or inactive. Restore it in your portfolio or explicitly remove it from the policy.
            <button type="button" className="folio-secondary" onClick={() => setDraft({ ...draft, accountIds: draft.accountIds.filter((accountId) => accountId !== id), holdings: draft.holdings.filter((rule) => rule.accountId !== id) })}>Remove absent account from policy</button>
          </p>)}
        </fieldset>
        <fieldset disabled={busy}>
          <legend>Allocation categories</legend>
          <p>Targets must total 10,000 basis points. Only rebalancing-eligible holdings count toward them.</p>
          {draft.categories.map((category, index) => <div className="folio-edit-row" key={category.id}>
            <label>Name<input required value={category.label} onChange={(event) => setDraft({ ...draft, categories: draft.categories.map((item, i) => i === index ? { ...item, label: event.target.value } : item) })} /></label>
            <label>Target (bps)<input required type="number" min="0" max="10000" step="1" value={Number.isNaN(category.targetBps) ? '' : category.targetBps} onChange={(event) => setDraft({ ...draft, categories: draft.categories.map((item, i) => i === index ? { ...item, targetBps: numberValue(event.target.value) } : item) })} /></label>
            <label>Minimum horizon (years)<input required type="number" min="0" max="100" step="1" value={Number.isNaN(category.minimumHorizonYears) ? '' : category.minimumHorizonYears} onChange={(event) => setDraft({ ...draft, categories: draft.categories.map((item, i) => i === index ? { ...item, minimumHorizonYears: numberValue(event.target.value) } : item) })} /></label>
            <label className="folio-check"><input type="checkbox" checked={category.acceptsContributions} onChange={(event) => setDraft({ ...draft, categories: draft.categories.map((item, i) => i === index ? { ...item, acceptsContributions: event.target.checked } : item) })} />Accept new cash</label>
            <button type="button" className="folio-secondary" aria-label={`Remove category ${category.label || index + 1}`} onClick={() => setDraft({ ...draft, categories: draft.categories.filter((_, i) => i !== index), holdings: draft.holdings.map((rule) => rule.categoryId === category.id ? { ...rule, categoryId: null } : rule) })}>Remove</button>
          </div>)}
          <button type="button" className="folio-secondary" onClick={() => setDraft({ ...draft, categories: [...draft.categories, { id: crypto.randomUUID(), label: '', targetBps: 0, minimumHorizonYears: 0, acceptsContributions: true }] })}>Add category</button>
        </fieldset>
        <fieldset disabled={busy}>
          <legend>Holding classifications</legend>
          <p>Classify every holding in the selected accounts. Property is always observation-only. Reserves are visible but never included in rebalancing or spent by a draft. TER is your sourced annual fund cost; leave it blank when unknown.</p>
          {snapshot.holdings.filter((holding) => draft.accountIds.includes(holding.accountId)).map((holding) => {
            const key = holdingKey(holding.accountId, holding.holdingId);
            const rule = mappings.get(key);
            return <div className="folio-edit-row" key={key}>
              <strong>{holding.label}<small>{snapshot.accounts.find((account) => account.id === holding.accountId)?.name}</small></strong>
              <label>Kind<select value={rule?.kind ?? ''} required onChange={(event) => {
                const kind = event.target.value;
                if (kind === 'security' || kind === 'cash' || kind === 'pension' || kind === 'real-estate') updateRule(holding.accountId, holding.holdingId, { kind });
              }}><option value="">Choose kind</option><option value="security">Security</option><option value="cash">Cash</option><option value="pension">Pension</option><option value="real-estate">Real estate</option></select></label>
              <label>Treatment<select value={rule?.treatment ?? 'rebalance'} disabled={!rule || rule.kind === 'real-estate'} onChange={(event) => {
                const treatment = event.target.value;
                if (treatment === 'rebalance' || treatment === 'observe' || treatment === 'reserve') updateRule(holding.accountId, holding.holdingId, { treatment });
              }}><option value="rebalance">Rebalance</option><option value="observe">Observation only</option><option value="reserve">Protected reserve</option></select></label>
              <label>Category<select required={!rule || rule.treatment === 'rebalance'} disabled={!rule || rule.treatment === 'observe' || rule.treatment === 'reserve'} value={rule?.categoryId ?? ''} onChange={(event) => updateRule(holding.accountId, holding.holdingId, { categoryId: event.target.value || null })}>
                <option value="">Choose category</option>{draft.categories.map((category) => <option key={category.id} value={category.id}>{category.label || 'Unnamed category'}</option>)}
              </select></label>
              <label>TER (bps)<input disabled={!rule} type="number" min="0" max="10000" step="1" value={rule?.terBps ?? ''} onChange={(event) => updateRule(holding.accountId, holding.holdingId, { terBps: event.target.value === '' ? null : Number(event.target.value) })} /></label>
            </div>;
          })}
          {draft.holdings.filter((rule) => !snapshot.holdings.some((holding) => holdingKey(holding.accountId, holding.holdingId) === holdingKey(rule.accountId, rule.holdingId))).map((rule) => <p key={holdingKey(rule.accountId, rule.holdingId)}>
            A mapped holding is no longer in the snapshot. Confirm it was removed from the portfolio before removing its mapping.
            <button type="button" className="folio-secondary" onClick={() => setDraft({ ...draft, holdings: draft.holdings.filter((item) => item !== rule) })}>Remove absent mapping</button>
          </p>)}
        </fieldset>
        <fieldset disabled={busy}>
          <legend>Goals and guardrails</legend>
          {draft.goals.map((goal, index) => <div className="folio-edit-row" key={goal.id}>
            <label>Goal name<input required value={goal.label} onChange={(event) => setDraft({ ...draft, goals: draft.goals.map((item, i) => i === index ? { ...item, label: event.target.value } : item) })} /></label>
            <label>Money needed on<input required type="date" value={goal.targetDate} onChange={(event) => setDraft({ ...draft, goals: draft.goals.map((item, i) => i === index ? { ...item, targetDate: event.target.value } : item) })} /></label>
            <button type="button" className="folio-secondary" aria-label={`Remove goal ${goal.label || index + 1}`} onClick={() => setDraft({ ...draft, goals: draft.goals.filter((_, i) => i !== index) })}>Remove</button>
          </div>)}
          <button type="button" className="folio-secondary" onClick={() => setDraft({ ...draft, goals: [...draft.goals, { id: crypto.randomUUID(), label: '', targetDate: '' }] })}>Add goal</button>
          <div className="folio-edit-row">
            <label>Absolute drift band (bps)<input required type="number" min="1" max="10000" value={draft.bands.absoluteBps} onChange={(event) => setDraft({ ...draft, bands: { ...draft.bands, absoluteBps: numberValue(event.target.value) } })} /></label>
            <label>Relative drift band (bps of target)<input required type="number" min="1" max="10000" value={draft.bands.relativeBps} onChange={(event) => setDraft({ ...draft, bands: { ...draft.bands, relativeBps: numberValue(event.target.value) } })} /></label>
            <label>Weighted TER ceiling (bps)<input required type="number" min="0" max="10000" value={draft.costCeilingBps} onChange={(event) => setDraft({ ...draft, costCeilingBps: numberValue(event.target.value) })} /></label>
            <label>Maximum valuation age (days)<input required type="number" min="1" max="365" value={draft.maxQuoteAgeDays} onChange={(event) => setDraft({ ...draft, maxQuoteAgeDays: numberValue(event.target.value) })} /></label>
          </div>
          <label className="folio-check"><input type="checkbox" checked={draft.emergencyFundReady} onChange={(event) => setDraft({ ...draft, emergencyFundReady: event.target.checked })} />I have confirmed my emergency fund is adequate before allocating new cash.</label>
        </fieldset>
        <details><summary>Advanced: replace the draft with private IPS JSON</summary>
          <label>IPS JSON<textarea rows={10} spellCheck={false} value={json} onChange={(event) => setJson(event.target.value)} /></label>
          <button type="button" className="folio-secondary" disabled={busy} onClick={() => {
            try { setDraft(parsePolicy(parsePolicyJson(json))); setJson(''); setError(''); }
            catch (failure) { setError(failure instanceof Error ? failure.message : 'Invalid IPS.'); }
          }}>Load JSON into editor</button>
        </details>
        {!standalone && <fieldset disabled={busy}>
          <legend>Encrypt and save</legend>
          <p>Enter a passphrase for the updated IPS. It may be your existing passphrase or a new one; it is never retained.</p>
          <div className="folio-edit-row">
            <label>Passphrase<input required type="password" minLength={12} autoComplete="new-password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} /></label>
            <label>Confirm passphrase<input required type="password" minLength={12} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
          </div>
        </fieldset>}
        {standalone && <p>Your IPS will be saved inside the unlocked, encrypted folio workspace. The passphrase is not retained.</p>}
        {error && <p className="folio-error" role="alert">{error}</p>}
        <div className="folio-actions"><button disabled={busy} type="submit">{busy ? 'Encrypting and saving...' : 'Save encrypted IPS'}</button><button className="folio-secondary" disabled={busy} type="button" onClick={onCancel}>Cancel</button></div>
      </form>
    </section>
  );
}
