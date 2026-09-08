import type { ContributionDraft, ContributionRow, Evaluation, Policy } from '../types/index.ts';
import { allocationRow } from './evaluation.ts';
import { calendarDate, parsePolicy } from './policy.ts';

export function draftContribution(evaluation: Evaluation, policy: Policy, contributionMinor: number, goalId: string, now = new Date()): ContributionDraft {
  const validated = parsePolicy(policy);
  if (!Number.isSafeInteger(contributionMinor) || contributionMinor <= 0) {
    throw new Error('Invalid contribution: enter positive safe integer currency minor units.');
  }
  const reasons: string[] = [];
  const blocked = (): ContributionDraft => ({ permitted: false, reasons, contributionMinor, unallocatedMinor: contributionMinor, rows: [] });
  if (!evaluation.complete || evaluation.issues.length > 0) reasons.push('Resolve incomplete portfolio data before drafting a contribution.');
  if (!validated.emergencyFundReady) reasons.push('Confirm emergency-fund readiness in the IPS before allocating new cash.');
  const goal = validated.goals.find((candidate) => candidate.id === goalId);
  const nowTime = now.getTime();
  const today = Number.isFinite(nowTime) ? calendarDate(now.toISOString().slice(0, 10)) : null;
  const targetTime = goal ? calendarDate(goal.targetDate) : null;
  if (!goal) reasons.push('Select an existing IPS goal.');
  if (today === null) reasons.push('The review date is invalid. Check the device clock.');
  else if (goal && (targetTime === null || targetTime <= today)) reasons.push('The selected goal must have a future target date.');
  const values = new Map<string, number>();
  let sum = 0n;
  for (const row of evaluation.rows) {
    if (values.has(row.categoryId) || !Number.isSafeInteger(row.valueMinor) || row.valueMinor < 0) {
      reasons.push('The allocation rows are inconsistent. Refresh the portfolio assessment.');
      return blocked();
    }
    values.set(row.categoryId, row.valueMinor);
    sum += BigInt(row.valueMinor);
  }
  if (!Number.isSafeInteger(evaluation.rebalanceMinor) || evaluation.rebalanceMinor <= 0 ||
      sum !== BigInt(evaluation.rebalanceMinor) || values.size !== validated.categories.length ||
      validated.categories.some((category) => !values.has(category.id))) {
    reasons.push('The allocation rows are incomplete or inconsistent. Refresh the portfolio assessment.');
  }
  if (!Number.isSafeInteger(evaluation.totalMinor) || evaluation.totalMinor < evaluation.rebalanceMinor ||
      BigInt(evaluation.totalMinor) + BigInt(contributionMinor) > BigInt(Number.MAX_SAFE_INTEGER)) {
    reasons.push('The contribution would exceed the safe portfolio minor-unit range.');
  }
  if (reasons.length > 0 || !goal || today === null || targetTime === null) return blocked();
  const postTotal = sum + BigInt(contributionMinor);
  const candidates = validated.categories.map((category) => {
    const before = values.get(category.id) ?? 0;
    const deficit = BigInt(category.targetBps) * postTotal - BigInt(before) * 10_000n;
    // Calendar anniversaries avoid treating leap years as a fractional horizon.
    const anniversary = new Date(today);
    const month = anniversary.getUTCMonth();
    anniversary.setUTCFullYear(anniversary.getUTCFullYear() + category.minimumHorizonYears);
    if (anniversary.getUTCMonth() !== month) anniversary.setUTCDate(0);
    const eligible = category.acceptsContributions && targetTime >= anniversary.getTime();
    return { category, before, deficit: deficit > 0n && eligible ? deficit : 0n, eligible, allocation: 0n, remainder: 0n };
  });
  if (candidates.some((candidate) => !candidate.category.acceptsContributions)) reasons.push('Categories that do not accept contributions are excluded.');
  if (candidates.some((candidate) => candidate.category.acceptsContributions && !candidate.eligible)) reasons.push('Categories whose minimum horizon exceeds the selected goal are excluded.');
  const deficitSum = candidates.reduce((total, candidate) => total + candidate.deficit, 0n);
  const available = deficitSum / 10_000n;
  const budget = available < BigInt(contributionMinor) ? available : BigInt(contributionMinor);
  if (budget > 0n && deficitSum > 0n) {
    for (const candidate of candidates) {
      const numerator = budget * candidate.deficit;
      candidate.allocation = numerator / deficitSum;
      candidate.remainder = numerator % deficitSum;
    }
    let remaining = budget - candidates.reduce((total, candidate) => total + candidate.allocation, 0n);
    const ranked = candidates.filter((candidate) => candidate.deficit > 0n).sort((left, right) => {
      if (left.remainder !== right.remainder) return left.remainder > right.remainder ? -1 : 1;
      return left.category.id < right.category.id ? -1 : left.category.id > right.category.id ? 1 : 0;
    });
    for (const candidate of ranked) {
      if (remaining === 0n) break;
      candidate.allocation += 1n;
      remaining -= 1n;
    }
  }
  const unallocatedMinor = contributionMinor - Number(budget);
  const afterTotal = Number(sum + budget);
  const rows: ContributionRow[] = candidates.map((candidate) => {
    const afterMinor = candidate.before + Number(candidate.allocation);
    const after = allocationRow(candidate.category, afterMinor, afterTotal, validated.bands);
    return {
      categoryId: candidate.category.id, label: candidate.category.label,
      contributionMinor: Number(candidate.allocation), afterMinor, afterBps: after.actualBps, remainingBreach: after.breached,
    };
  });
  if (unallocatedMinor > 0) reasons.push('Some cash cannot fill eligible positive deficits in whole minor units. It remains unallocated; review restrictions rather than spend existing reserves.');
  if (rows.some((row) => row.remainingBreach)) reasons.push('Drift remains outside the IPS bands after this buy-only draft; new cash cannot necessarily resolve every breach.');
  return { permitted: budget > 0n, reasons, contributionMinor, unallocatedMinor, rows };
}
