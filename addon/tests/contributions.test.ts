import test from 'node:test';
import assert from 'node:assert/strict';
import { draftContribution } from '../src/lib/contributions.ts';
import { evaluatePolicy } from '../src/lib/evaluation.ts';
import { generatedDomain } from './domain-fixture.ts';

function generatedDraft(seed = 1, contributionMinor = 17) {
  const fixture = generatedDomain(seed);
  const evaluation = evaluatePolicy(fixture.snapshot, fixture.policy, fixture.now);
  const draft = draftContribution(evaluation, fixture.policy, contributionMinor, fixture.policy.goals[0].id, fixture.now);
  return { ...fixture, evaluation, draft };
}

test('a contribution is new cash, buy-only, and never spends observed property or existing reserves', () => {
  const { draft, evaluation } = generatedDraft();
  assert.equal(draft.permitted, true);
  assert.equal(draft.rows.reduce((sum, row) => sum + row.contributionMinor, 0), draft.contributionMinor);
  assert.equal(draft.rows.reduce((sum, row) => sum + row.afterMinor, 0), evaluation.rebalanceMinor + draft.contributionMinor);
  assert.ok(draft.rows.every((row) => row.contributionMinor >= 0));
  const large = generatedDomain();
  large.snapshot.holdings[2].valueMinor = 1000000;
  large.snapshot.holdings[3].valueMinor = 1000000;
  assert.deepEqual(
    draftContribution(evaluatePolicy(large.snapshot, large.policy, large.now), large.policy, draft.contributionMinor, large.policy.goals[0].id, large.now),
    draft,
  );
});

test('largest-remainder allocation conserves every minor unit with deterministic category-id ties', () => {
  const { policy, snapshot, now } = generatedDomain();
  policy.categories[0].targetBps = 5000;
  policy.categories[1].targetBps = 5000;
  snapshot.holdings[0].valueMinor = 10;
  snapshot.holdings[1].valueMinor = 10;
  const evaluation = evaluatePolicy(snapshot, policy, now);
  const draft = draftContribution(evaluation, policy, 3, policy.goals[0].id, now);
  assert.deepEqual(draft.rows.map((row) => row.contributionMinor), [2, 1]);
  policy.categories.reverse();
  const reordered = draftContribution(evaluatePolicy(snapshot, policy, now), policy, 3, policy.goals[0].id, now);
  assert.deepEqual(reordered.rows.map((row) => row.contributionMinor), [1, 2]);
  assert.equal(draft.unallocatedMinor, 0);
});

test('generated portfolios allocate only eligible post-contribution deficits and conserve cash exactly', () => {
  for (let seed = 1; seed <= 250; seed++) {
    const amount = seed * 11 + 1;
    const { evaluation, draft, policy } = generatedDraft(seed, amount);
    assert.equal(draft.permitted, true);
    assert.equal(draft.unallocatedMinor, 0);
    assert.equal(draft.rows.reduce((sum, row) => sum + row.contributionMinor, 0), amount);
    for (const row of draft.rows) {
      const before = evaluation.rows.find((candidate) => candidate.categoryId === row.categoryId);
      assert.ok(before);
      const category = policy.categories.find((candidate) => candidate.id === row.categoryId);
      assert.ok(category);
      assert.ok(Number.isSafeInteger(row.contributionMinor) && row.contributionMinor >= 0);
      assert.equal(row.afterMinor, before.valueMinor + row.contributionMinor);
      if (BigInt(before.valueMinor) * 10000n >= BigInt(category.targetBps) * BigInt(evaluation.rebalanceMinor + amount)) {
        assert.equal(row.contributionMinor, 0);
      }
    }
    assert.ok(Math.abs(draft.rows.reduce((sum, row) => sum + row.afterBps, 0) - 10000) < 1e-9);
  }
});

test('generated multi-category constraints conserve money and preserve exact remaining-breach diagnostics', () => {
  for (let seed = 1; seed <= 120; seed++) {
    const { policy, snapshot, now } = generatedDomain(seed);
    const count = 3 + seed % 7;
    policy.categories = Array.from({ length: count }, (_, index) => ({
      id: `generated-category-${index}`, label: `Generated category ${index}`,
      targetBps: Math.floor(10000 / count) + (index < 10000 % count ? 1 : 0),
      minimumHorizonYears: index % 3 === 0 ? 25 : 0,
      acceptsContributions: (seed + index) % 4 !== 0,
    }));
    snapshot.holdings = policy.categories.map((category, index) => ({
      ...snapshot.holdings[0], holdingId: `generated-holding-${index}`, valueMinor: (seed + 3) * (index + 1) ** 2,
    }));
    policy.holdings = snapshot.holdings.map((holding, index) => ({
      ...policy.holdings[0], holdingId: holding.holdingId, categoryId: policy.categories[index].id,
    }));
    const evaluation = evaluatePolicy(snapshot, policy, now);
    const amount = seed * 29 + 1;
    const draft = draftContribution(evaluation, policy, amount, policy.goals[0].id, now);
    const allocated = draft.rows.reduce((sum, row) => sum + row.contributionMinor, 0);
    assert.equal(allocated + draft.unallocatedMinor, amount);
    assert.equal(draft.permitted, allocated > 0);
    const total = BigInt(evaluation.rebalanceMinor + allocated);
    for (const [index, row] of draft.rows.entries()) {
      const category = policy.categories[index];
      const before = evaluation.rows[index].valueMinor;
      if (!category.acceptsContributions || category.minimumHorizonYears > 20) assert.equal(row.contributionMinor, 0);
      const deficit = BigInt(category.targetBps) * BigInt(evaluation.rebalanceMinor + amount) - BigInt(before) * 10000n;
      if (deficit <= 0n) assert.equal(row.contributionMinor, 0);
      else assert.ok(BigInt(row.contributionMinor) <= (deficit + 9999n) / 10000n);
      assert.equal(row.afterMinor, before + row.contributionMinor);
      let drift = BigInt(row.afterMinor) * 10000n - BigInt(category.targetBps) * total;
      if (drift < 0n) drift = -drift;
      assert.equal(row.remainingBreach,
        drift >= BigInt(policy.bands.absoluteBps) * total ||
        drift * 10000n >= BigInt(category.targetBps) * BigInt(policy.bands.relativeBps) * total);
    }
    assert.ok(Math.abs(draft.rows.reduce((sum, row) => sum + row.afterBps, 0) - 10000) < 1e-9);
  }
});

test('deterministic drafts do not mutate either the validated IPS or the assessment', () => {
  const { policy, evaluation, now } = generatedDraft();
  const originalPolicy = structuredClone(policy);
  const originalEvaluation = structuredClone(evaluation);
  const first = draftContribution(evaluation, policy, 37, policy.goals[0].id, now);
  assert.deepEqual(draftContribution(evaluation, policy, 37, policy.goals[0].id, now), first);
  assert.deepEqual(policy, originalPolicy);
  assert.deepEqual(evaluation, originalEvaluation);
});

test('restrictions leave explicit residual cash and after weights use only money actually allocated', () => {
  const { policy, snapshot, now } = generatedDomain();
  policy.categories[0].targetBps = 5000;
  policy.categories[1].targetBps = 5000;
  policy.categories[1].acceptsContributions = false;
  snapshot.holdings[0].valueMinor = 10;
  snapshot.holdings[1].valueMinor = 10;
  const draft = draftContribution(evaluatePolicy(snapshot, policy, now), policy, 10, policy.goals[0].id, now);
  assert.equal(draft.permitted, true);
  assert.equal(draft.rows[0].contributionMinor, 5);
  assert.equal(draft.rows[1].contributionMinor, 0);
  assert.equal(draft.unallocatedMinor, 5);
  assert.equal(draft.rows[0].afterBps, 6000);
  assert.equal(draft.rows[1].afterBps, 4000);
  assert.ok(draft.reasons.some((reason) => reason.includes('unallocated')));
  assert.ok(draft.reasons.some((reason) => reason.includes('excluded')));
});

test('unavailable allocations cannot report success and still expose diagnostic after rows', () => {
  const { policy, snapshot, now } = generatedDomain();
  for (const category of policy.categories) category.acceptsContributions = false;
  const draft = draftContribution(evaluatePolicy(snapshot, policy, now), policy, 10, policy.goals[0].id, now);
  assert.equal(draft.permitted, false);
  assert.equal(draft.unallocatedMinor, 10);
  assert.ok(draft.rows.every((row) => row.contributionMinor === 0));
  assert.ok(draft.reasons.some((reason) => reason.includes('unallocated')));
});

test('horizon-ineligible categories receive no money and selected goals must be genuinely future', () => {
  const { policy, snapshot, now } = generatedDomain();
  policy.goals[0].targetDate = '2027-09-07';
  policy.categories[0].minimumHorizonYears = 1;
  policy.categories[1].minimumHorizonYears = 2;
  const evaluation = evaluatePolicy(snapshot, policy, now);
  const draft = draftContribution(evaluation, policy, 20, policy.goals[0].id, now);
  assert.ok(draft.rows[0].contributionMinor > 0);
  assert.equal(draft.rows[1].contributionMinor, 0);
  assert.ok(draft.reasons.some((reason) => reason.includes('horizon')));
  for (const date of ['2026-09-07', '2026-09-06']) {
    policy.goals[0].targetDate = date;
    const blocked = draftContribution(evaluation, policy, 20, policy.goals[0].id, now);
    assert.equal(blocked.permitted, false);
    assert.equal(blocked.unallocatedMinor, 20);
    assert.ok(blocked.reasons.some((reason) => reason.includes('future')));
  }
});

test('minimum horizons use calendar anniversaries including leap-day clamping', () => {
  const { policy, snapshot } = generatedDomain();
  const now = new Date('2028-02-29T12:00:00Z');
  for (const holding of snapshot.holdings) holding.asOfDate = now.toISOString();
  for (const category of policy.categories) category.minimumHorizonYears = 1;
  policy.goals[0].targetDate = '2029-02-28';
  const evaluation = evaluatePolicy(snapshot, policy, now);
  assert.equal(draftContribution(evaluation, policy, 20, policy.goals[0].id, now).permitted, true);
  policy.goals[0].targetDate = '2029-02-27';
  const blocked = draftContribution(evaluation, policy, 20, policy.goals[0].id, now);
  assert.equal(blocked.permitted, false);
  assert.equal(blocked.unallocatedMinor, 20);
});

test('incomplete valuations, emergency readiness, missing goals, and invalid clocks gate new cash', () => {
  for (const mutate of [
    (f: ReturnType<typeof generatedDraft>) => { f.evaluation.complete = false; },
    (f: ReturnType<typeof generatedDraft>) => { f.evaluation.issues.push({ code: 'generated', message: 'Generated issue.' }); },
    (f: ReturnType<typeof generatedDraft>) => { f.policy.emergencyFundReady = false; },
    (f: ReturnType<typeof generatedDraft>) => { f.now = new Date(NaN); },
  ]) {
    const fixture = generatedDraft();
    mutate(fixture);
    const draft = draftContribution(fixture.evaluation, fixture.policy, 10, fixture.policy.goals[0].id, fixture.now);
    assert.equal(draft.permitted, false);
    assert.equal(draft.unallocatedMinor, 10);
    assert.ok(draft.reasons.length > 0);
  }
  const { policy, evaluation, now } = generatedDraft();
  assert.equal(draftContribution(evaluation, policy, 10, 'generated-missing-goal', now).permitted, false);
});

test('unknown costs alone do not block the deterministic new-cash draft', () => {
  const { policy, snapshot, now } = generatedDomain();
  for (const holding of policy.holdings) holding.terBps = null;
  const evaluation = evaluatePolicy(snapshot, policy, now);
  assert.equal(evaluation.costs.complete, false);
  assert.equal(draftContribution(evaluation, policy, 10, policy.goals[0].id, now).permitted, true);
});

test('zero, fractional, negative, nonfinite, and unsafe contributions are rejected safely', () => {
  const { policy, evaluation, now } = generatedDraft();
  for (const value of [0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => draftContribution(evaluation, policy, value, policy.goals[0].id, now), /Invalid contribution/);
  }
});

test('large safe drafts use BigInt products and reject whole-portfolio overflow', () => {
  const { policy, evaluation, now } = generatedDraft();
  const amount = Number.MAX_SAFE_INTEGER - evaluation.totalMinor;
  const draft = draftContribution(evaluation, policy, amount, policy.goals[0].id, now);
  assert.equal(draft.permitted, true);
  assert.equal(draft.rows.reduce((sum, row) => sum + BigInt(row.contributionMinor), 0n), BigInt(amount));
  assert.ok(draft.rows.every((row) => Number.isSafeInteger(row.afterMinor)));
  const overflow = draftContribution(evaluation, policy, amount + 1, policy.goals[0].id, now);
  assert.equal(overflow.permitted, false);
  assert.ok(overflow.reasons.some((reason) => reason.includes('safe')));
});

test('inconsistent evaluation rows cannot authorize a draft', () => {
  for (const mutate of [
    (f: ReturnType<typeof generatedDraft>) => { f.evaluation.rows[0].valueMinor = NaN; },
    (f: ReturnType<typeof generatedDraft>) => { f.evaluation.rows[0].valueMinor += 1; },
    (f: ReturnType<typeof generatedDraft>) => { f.evaluation.rows.push({ ...f.evaluation.rows[0] }); },
    (f: ReturnType<typeof generatedDraft>) => { f.evaluation.rows.pop(); },
    (f: ReturnType<typeof generatedDraft>) => { f.evaluation.totalMinor = NaN; },
  ]) {
    const fixture = generatedDraft();
    mutate(fixture);
    assert.equal(draftContribution(fixture.evaluation, fixture.policy, 10, fixture.policy.goals[0].id, fixture.now).permitted, false);
  }
});

test('cash cannot necessarily repair overweight categories, so remaining breaches stay explicit', () => {
  const { policy, snapshot, now } = generatedDomain();
  policy.categories[0].targetBps = 0;
  policy.categories[1].targetBps = 10000;
  const draft = draftContribution(evaluatePolicy(snapshot, policy, now), policy, 1, policy.goals[0].id, now);
  assert.equal(draft.rows[0].contributionMinor, 0);
  assert.equal(draft.rows[0].remainingBreach, true);
  assert.ok(draft.reasons.some((reason) => reason.includes('Drift remains')));
});

test('sub-minor-unit eligible capacity stays unallocated instead of exceeding deficits', () => {
  const { policy, snapshot, now } = generatedDomain();
  policy.categories[0].targetBps = 5000;
  policy.categories[1].targetBps = 5000;
  policy.categories[1].acceptsContributions = false;
  snapshot.holdings[0].valueMinor = 10;
  snapshot.holdings[1].valueMinor = 10;
  const draft = draftContribution(evaluatePolicy(snapshot, policy, now), policy, 1, policy.goals[0].id, now);
  assert.equal(draft.permitted, false);
  assert.equal(draft.unallocatedMinor, 1);
  assert.ok(draft.reasons.some((reason) => reason.includes('whole minor units')));
});
