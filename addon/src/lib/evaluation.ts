import { holdingKey, type AllocationRow, type DataIssue, type Evaluation, type Policy, type PolicyCategory, type Snapshot } from '../types/index.ts';
import { currencyDigits } from './money.ts';
import { parsePolicy, valuationTime } from './policy.ts';

const MAX_MINOR = BigInt(Number.MAX_SAFE_INTEGER);

export function allocationRow(category: PolicyCategory, valueMinor: number, totalMinor: number, bands: Policy['bands']): AllocationRow {
  const value = BigInt(valueMinor);
  const total = BigInt(totalMinor);
  const target = BigInt(category.targetBps);
  const delta = value * 10_000n - target * total;
  const magnitude = delta < 0n ? -delta : delta;
  const actualBps = total === 0n ? 0 : Number(value * 10_000n) / totalMinor;
  const breached = target === 0n ? value > 0n : total > 0n && (
    magnitude >= BigInt(bands.absoluteBps) * total ||
    magnitude * 10_000n >= target * BigInt(bands.relativeBps) * total
  );
  return { categoryId: category.id, label: category.label, valueMinor, targetBps: category.targetBps, actualBps, driftBps: actualBps - category.targetBps, breached };
}

export function evaluatePolicy(snapshot: Snapshot, policy: Policy, now = new Date()): Evaluation {
  const validated = parsePolicy(policy);
  const selected = new Set(validated.accountIds);
  const issues: DataIssue[] = snapshot.issues.filter((issue) => issue.accountId === undefined || selected.has(issue.accountId));
  const issue = (code: string, message: string, accountId?: string, holdingId?: string) =>
    issues.push({ code, message, ...(accountId === undefined ? {} : { accountId }), ...(holdingId === undefined ? {} : { holdingId }) });
  try { currencyDigits(snapshot.baseCurrency); } catch { issue('invalid-snapshot-currency', 'The snapshot base currency is invalid. Correct the portfolio currency and refresh.'); }
  if (snapshot.baseCurrency !== validated.baseCurrency) issue('policy-currency-mismatch', 'The IPS base currency differs from the snapshot. Align the policy with the valuation currency.');
  const nowTime = now.getTime();
  if (!Number.isFinite(nowTime)) issue('invalid-review-date', 'The review date is invalid. Check the device clock.');
  const accountCounts = new Map<string, number>();
  for (const account of snapshot.accounts) {
    if (selected.has(account.id)) accountCounts.set(account.id, (accountCounts.get(account.id) ?? 0) + 1);
  }
  for (const accountId of selected) {
    const count = accountCounts.get(accountId) ?? 0;
    if (count === 0) issue('missing-account', 'A selected account is absent or inactive. Refresh account data or review the IPS scope.', accountId);
    if (count > 1) issue('duplicate-account', 'A selected account appears more than once. Refresh the account list.', accountId);
  }
  const rules = new Map(validated.holdings.map((rule) => [holdingKey(rule.accountId, rule.holdingId), rule]));
  const seen = new Set<string>();
  const categoryValues = new Map(validated.categories.map((category) => [category.id, 0n]));
  let total = 0n;
  let rebalance = 0n;
  let observed = 0n;
  let reserved = 0n;
  let known = 0n;
  let unknown = 0n;
  let hasUnknownCost = false;
  let weightedCost = 0n;
  for (const holding of snapshot.holdings) {
    if (!selected.has(holding.accountId)) continue;
    const { accountId, holdingId } = holding;
    const key = holdingKey(accountId, holdingId);
    if (seen.has(key)) {
      issue('duplicate-holding', 'A selected holding appears more than once. Refresh the account holdings.', accountId, holdingId);
      continue;
    }
    seen.add(key);
    const rule = rules.get(key);
    if (!rule) issue('unclassified-holding', 'A selected holding is not classified. Add its treatment to the IPS.', accountId, holdingId);
    let usable = true;
    const invalid = (code: string, message: string) => { usable = false; issue(code, message, accountId, holdingId); };
    if (holding.baseCurrency !== snapshot.baseCurrency || holding.baseCurrency !== validated.baseCurrency) {
      invalid('holding-currency-mismatch', 'A holding base currency differs from the policy. Update its base-currency valuation.');
    }
    const time = valuationTime(holding.asOfDate);
    if (time === null) invalid('invalid-valuation-date', 'A holding valuation date is invalid. Refresh its valuation.');
    else if (time > nowTime) invalid('future-valuation', 'A holding valuation is future-dated. Check the device clock and valuation date.');
    else if (nowTime - time > validated.maxQuoteAgeDays * 86_400_000) invalid('stale-valuation', 'A holding valuation is too old for the IPS. Refresh its quote or manual valuation.');
    if (holding.valueMinor === null || !Number.isSafeInteger(holding.valueMinor) || holding.valueMinor < 0) {
      invalid('unusable-valuation', 'A holding has no safe nonnegative value. Resolve its valuation issues.');
    }
    if (!usable || holding.valueMinor === null) continue;
    const value = BigInt(holding.valueMinor);
    if (total + value > MAX_MINOR) {
      issue('unsafe-total', 'The selected portfolio exceeds the safe minor-unit range. Reduce the assessment scope.', accountId, holdingId);
      continue;
    }
    total += value;
    if (!rule) continue;
    if (rule.treatment === 'observe') observed += value;
    else if (rule.treatment === 'reserve') reserved += value;
    else {
      rebalance += value;
      if (rule.categoryId !== null) categoryValues.set(rule.categoryId, (categoryValues.get(rule.categoryId) ?? 0n) + value);
      if (rule.terBps === null) { unknown += value; hasUnknownCost = true; }
      else { known += value; weightedCost += value * BigInt(rule.terBps); }
    }
  }
  for (const rule of validated.holdings) {
    if (!seen.has(holdingKey(rule.accountId, rule.holdingId))) issue('missing-mapped-holding', 'An IPS-mapped holding is absent. Refresh its account or explicitly remove the obsolete mapping.', rule.accountId, rule.holdingId);
  }
  if (rebalance === 0n) issue('empty-rebalance-scope', 'There is no usable rebalancing value. Review holdings, classifications, and valuations.');
  const complete = issues.length === 0;
  return {
    complete, issues, totalMinor: Number(total), rebalanceMinor: Number(rebalance),
    observedMinor: Number(observed), reservedMinor: Number(reserved),
    rows: validated.categories.map((category) => allocationRow(category, Number(categoryValues.get(category.id) ?? 0n), Number(rebalance), validated.bands)),
    costs: {
      knownValueMinor: Number(known), unknownValueMinor: Number(unknown),
      blendedTerBps: known === 0n ? null : Number(weightedCost) / Number(known),
      complete: complete && !hasUnknownCost && known > 0n,
      overCeiling: known > 0n && weightedCost > BigInt(validated.costCeilingBps) * known,
    },
  };
}
