import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { ContributionDraft, Policy, Snapshot } from '../types/index.ts';
import { holdingKey } from '../types/index.ts';
import { evaluatePolicy } from '../lib/evaluation.ts';
import { draftContribution } from '../lib/contributions.ts';
import { formatBps, formatMoney, parseAmount } from '../lib/money.ts';
import { explanationFacts } from '../lib/explanations.ts';
import { ExplanationPanel } from './explanation-panel.tsx';
import { DataIssues } from './data-issues.tsx';

export function PortfolioReview({ snapshot, policy, sourceName = 'Wealthfolio' }: { snapshot: Snapshot; policy: Policy; sourceName?: string }) {
  const [reviewTime, setReviewTime] = useState(() => new Date());
  const evaluation = useMemo(() => evaluatePolicy(snapshot, policy, reviewTime), [snapshot, policy, reviewTime]);
  const [amount, setAmount] = useState('');
  const [goalId, setGoalId] = useState(policy.goals[0]?.id ?? '');
  const [draft, setDraft] = useState<ContributionDraft | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const timer = setInterval(() => { setReviewTime(new Date()); setDraft(null); }, 60_000);
    return () => clearInterval(timer);
  }, []);
  const facts = useMemo(() => explanationFacts(snapshot, policy, evaluation, draft, sourceName), [snapshot, policy, evaluation, draft, sourceName]);
  const money = (value: number) => formatMoney(value, policy.baseCurrency);
  function createDraft(event: FormEvent) {
    event.preventDefault(); setError(''); setDraft(null);
    try { setDraft(draftContribution(evaluatePolicy(snapshot, policy), policy, parseAmount(amount, policy.baseCurrency), goalId)); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Cannot create a draft. Review the amount and goal.'); }
  }
  return <>
    <section aria-labelledby="allocation-title">
      <div className="folio-section-heading"><div><h2 id="allocation-title">Portfolio against policy</h2><p>Valuations from {sourceName}. Targets and classifications from your IPS.</p></div>
        <strong className={evaluation.complete ? 'folio-status' : 'folio-error'}>{evaluation.complete ? `${evaluation.rows.filter((row) => row.breached).length} categories outside bands` : 'Assessment incomplete'}</strong>
      </div>
      {evaluation.issues.length > 0 && <div className="folio-notice" role="alert"><h3>Resolve these data issues</h3><DataIssues issues={evaluation.issues} snapshot={snapshot} /><p>Partial totals are diagnostic only. No contribution draft is available until the assessment is complete.</p></div>}
      <dl className="folio-totals">
        <div><dt>{evaluation.complete ? 'Selected portfolio' : 'Known selected value'}</dt><dd>{money(evaluation.totalMinor)}</dd></div>
        <div><dt>Rebalancing scope</dt><dd>{money(evaluation.rebalanceMinor)}</dd></div>
        <div><dt>Observation only</dt><dd>{money(evaluation.observedMinor)}</dd></div>
        <div><dt>Protected reserves</dt><dd>{money(evaluation.reservedMinor)}</dd></div>
      </dl>
      <div className="folio-table-wrap" tabIndex={0} role="region" aria-label="Allocation table; scroll horizontally for all columns"><table><caption>Allocation by policy category</caption><thead><tr><th scope="col">Category</th><th scope="col">Value</th><th scope="col">Actual</th><th scope="col">Target</th><th scope="col">Drift (pp)</th><th scope="col">Policy status</th></tr></thead><tbody>
        {evaluation.rows.map((row) => <tr key={row.categoryId}><th scope="row">{row.label}</th><td>{money(row.valueMinor)}</td><td>{evaluation.complete ? formatBps(row.actualBps) : 'Unavailable'}</td><td>{formatBps(row.targetBps)}</td><td>{evaluation.complete ? (row.driftBps / 100).toLocaleString(undefined, { maximumFractionDigits: 2, signDisplay: 'exceptZero' }) : 'Unavailable'}</td><td>{!evaluation.complete ? 'Incomplete data' : row.breached ? <strong className="folio-warning">Review drift</strong> : 'Within bands'}</td></tr>)}
      </tbody></table></div>
      <p className="folio-note">Observation-only property and protected cash are excluded from both sides of the rebalancing calculation. A flag is a prompt for review, never a trade instruction.</p>
    </section>
    <section aria-labelledby="cost-title">
      <h2 id="cost-title">Cost coverage</h2>
      <p>{!evaluation.complete ? 'Cost assessment is unavailable until the snapshot data issues are resolved.' : evaluation.costs.complete && evaluation.costs.blendedTerBps !== null
        ? <>Weighted TER: <strong>{formatBps(evaluation.costs.blendedTerBps)}</strong>. IPS ceiling: {formatBps(policy.costCeilingBps)}. {evaluation.costs.overCeiling ? <strong className="folio-warning">Review fund costs.</strong> : 'Within the cost ceiling.'}</>
        : <>Whole-portfolio TER is unavailable. Cost metadata is missing for {money(evaluation.costs.unknownValueMinor)} of rebalancing-eligible value.</>}</p>
      <p className="folio-note">TER values are owner-supplied from fund documents. Unknown is not zero. This does not include transaction fees, taxes, or turnover.</p>
    </section>
    <section aria-labelledby="draft-title">
      <h2 id="draft-title">Put new cash to work</h2>
      <p>Draft a contribution by category. Enter only new money not already included in the portfolio snapshot; existing reserves remain protected.</p>
      <form onSubmit={createDraft} className="folio-contribution-form">
        <label>New contribution ({policy.baseCurrency})<input required inputMode="decimal" value={amount} disabled={!evaluation.complete} onChange={(event) => { setAmount(event.target.value); setDraft(null); setError(''); }} /></label>
        <label>Goal<select value={goalId} disabled={!evaluation.complete} onChange={(event) => { setGoalId(event.target.value); setDraft(null); setError(''); }}>{policy.goals.map((goal) => <option value={goal.id} key={goal.id}>{goal.label} - {goal.targetDate}</option>)}</select></label>
        <button disabled={!evaluation.complete} type="submit">Draft contribution</button>
      </form>
      {error && <p role="alert" className="folio-error">{error}</p>}
      {draft && <div aria-live="polite">
        {draft.reasons.length > 0 && <ul className={draft.permitted ? 'folio-warning' : 'folio-error'}>{draft.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}
        {draft.rows.length > 0 && <>
          <div className="folio-table-wrap" tabIndex={0} role="region" aria-label="Contribution table; scroll horizontally for all columns"><table><caption>{draft.permitted ? 'Proposed distribution - review only, no orders' : 'No eligible allocation - portfolio unchanged'}</caption><thead><tr><th scope="col">Category</th><th scope="col">Add</th><th scope="col">After contribution</th><th scope="col">After weight</th><th scope="col">Remaining drift</th></tr></thead><tbody>
            {draft.rows.map((row) => <tr key={row.categoryId}><th scope="row">{row.label}</th><td>{money(row.contributionMinor)}</td><td>{money(row.afterMinor)}</td><td>{formatBps(row.afterBps)}</td><td>{row.remainingBreach ? 'Still outside bands' : 'Within bands'}</td></tr>)}
          </tbody></table></div>
        </>}
        <p>Unallocated cash: <strong>{money(draft.unallocatedMinor)}</strong>. Review eligibility, fees, available instruments, and your circumstances before acting in your broker.</p>
      </div>}
    </section>
    <section aria-labelledby="holdings-title"><h2 id="holdings-title">Snapshot provenance</h2>
      <p>Read at {new Date(snapshot.fetchedAt).toLocaleString()}. Each holding retains its own valuation date.</p>
      <div className="folio-table-wrap" tabIndex={0} role="region" aria-label="Holdings table; scroll horizontally for all columns"><table><caption>Selected holdings and their policy treatment</caption><thead><tr><th scope="col">Holding</th><th scope="col">Account</th><th scope="col">Base value</th><th scope="col">Valued on</th><th scope="col">Treatment</th></tr></thead><tbody>
        {snapshot.holdings.filter((holding) => policy.accountIds.includes(holding.accountId)).map((holding) => <tr key={holdingKey(holding.accountId, holding.holdingId)}><th scope="row">{holding.label}</th><td>{snapshot.accounts.find((account) => account.id === holding.accountId)?.name ?? 'Unknown account'}</td><td>{holding.valueMinor === null ? 'Unavailable' : money(holding.valueMinor)}</td><td>{holding.asOfDate || 'Unavailable'}</td><td>{policy.holdings.find((rule) => holdingKey(rule.accountId, rule.holdingId) === holdingKey(holding.accountId, holding.holdingId))?.treatment ?? 'Unclassified'}</td></tr>)}
      </tbody></table></div>
    </section>
    <ExplanationPanel facts={facts} />
  </>;
}
