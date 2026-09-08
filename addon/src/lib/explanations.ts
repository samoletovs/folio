import type { ContributionDraft, Evaluation, Policy, Snapshot } from '../types/index.ts';
import { formatBps, formatMoney } from './money.ts';

export interface ExplanationFact {
  id: string;
  title: string;
  text: string;
  source: string;
}

export function explanationFacts(
  snapshot: Snapshot, policy: Policy, evaluation: Evaluation, draft: ContributionDraft | null, sourceName = 'Wealthfolio',
): ExplanationFact[] {
  const facts: ExplanationFact[] = [{
    id: 'scope',
    title: 'What is included',
    text: `${evaluation.complete ? 'The selected portfolio totals' : 'The incomplete snapshot has a known selected value of'} ${formatMoney(evaluation.totalMinor, policy.baseCurrency)}. ` +
      `${formatMoney(evaluation.rebalanceMinor, policy.baseCurrency)} is assessed against targets. ` +
      'Observation-only assets and protected reserves are excluded from the rebalancing denominator.',
    source: `${sourceName} snapshot ${snapshot.fetchedAt}; IPS account scope and holding treatments`,
  }, {
    id: 'bands',
    title: 'When a drift flag appears',
    text: `A category is flagged at ${policy.bands.absoluteBps / 100} percentage points of absolute drift ` +
      `or ${formatBps(policy.bands.relativeBps)} of its target weight, whichever is reached first. ` +
      'This is a review flag, not an instruction to trade.',
    source: 'IPS bands; deterministic allocation evaluator',
  }, {
    id: 'quality',
    title: 'Data readiness',
    text: evaluation.complete
      ? 'The current snapshot has the data required for allocation assessment. Cost coverage is reported separately.'
      : 'Allocation assessment is incomplete. Resolve the data issues shown on the dashboard before relying on drift or creating a contribution draft.',
    source: 'Snapshot data-quality gates',
  }, {
    id: 'costs',
    title: 'Fund costs',
    text: !evaluation.complete
      ? 'The portfolio snapshot is incomplete. A whole-portfolio cost assessment is unavailable until its data issues are resolved.'
      : evaluation.costs.complete && evaluation.costs.blendedTerBps !== null
      ? `Weighted TER is ${formatBps(evaluation.costs.blendedTerBps)} against a ceiling of ${formatBps(policy.costCeilingBps)}. TER excludes transaction fees and taxes.`
      : 'Some eligible holdings have no confirmed TER. Unknown costs are not treated as zero and the partial weighted value is not a whole-portfolio cost estimate.',
    source: 'Owner-supplied IPS TER metadata; deterministic weighted-cost evaluator',
  }];
  if (evaluation.complete) {
    evaluation.rows.forEach((row, index) => facts.push({
      id: `allocation-${index}`,
      title: row.label,
      text: `${row.label}: actual ${formatBps(row.actualBps)}, target ${formatBps(row.targetBps)}. ` +
        (row.breached ? 'This category exceeds a policy band.' : 'This category is within its policy bands.'),
      source: `IPS category ${row.categoryId}; ${sourceName} base-currency valuations`,
    }));
  }
  if (draft) facts.push({
    id: 'contribution',
    title: 'Contribution draft',
    text: draft.permitted
      ? `The draft considers ${formatMoney(draft.contributionMinor, policy.baseCurrency)} of new external cash. ` +
        `${formatMoney(draft.unallocatedMinor, policy.baseCurrency)} remains unallocated. Existing holdings and protected cash are not sold or spent. Review the category amounts before taking any action outside folio.`
      : `A contribution draft is blocked: ${draft.reasons.join(' ')}`,
    source: 'Selected goal, IPS emergency-fund and horizon constraints; deterministic cash allocator',
  });
  return facts;
}
