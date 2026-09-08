import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePolicy } from '../src/lib/evaluation.ts';
import { generatedDomain } from './domain-fixture.ts';

test('whole portfolio includes property and reserves but neither affects drift or weighted TER', () => {
  const { policy, snapshot, now } = generatedDomain(4);
  const evaluation = evaluatePolicy(snapshot, policy, now);
  const values = snapshot.holdings.map((holding) => holding.valueMinor ?? 0);
  assert.equal(evaluation.complete, true);
  assert.equal(evaluation.totalMinor, values.reduce((sum, value) => sum + value, 0));
  assert.equal(evaluation.rebalanceMinor, values[0] + values[1]);
  assert.equal(evaluation.observedMinor, values[2]);
  assert.equal(evaluation.reservedMinor, values[3]);
  assert.ok(Math.abs(evaluation.rows[0].actualBps - values[0] / (values[0] + values[1]) * 10000) < 1e-9);
  assert.equal(evaluation.costs.knownValueMinor, values[0] + values[1]);
  const drift = structuredClone(evaluation.rows);
  snapshot.holdings[2].valueMinor = 1000000;
  snapshot.holdings[3].valueMinor = 1000000;
  policy.holdings[2].terBps = 10000;
  assert.deepEqual(evaluatePolicy(snapshot, policy, now).rows, drift);
  assert.deepEqual(evaluatePolicy(snapshot, policy, now).costs, evaluation.costs);
});

test('the assessment universe contains only selected accounts, holdings, and relevant issues', () => {
  const { policy, snapshot, now } = generatedDomain();
  const original = evaluatePolicy(snapshot, policy, now);
  const otherId = 'generated-outside';
  snapshot.accounts.push({ id: otherId, name: 'Generated outside' }, { id: otherId, name: 'Generated outside duplicate' });
  snapshot.holdings.push({ ...snapshot.holdings[0], accountId: otherId, valueMinor: -1, asOfDate: 'invalid' });
  snapshot.issues.push({ code: 'holdings-unavailable', message: 'Generated issue.', accountId: otherId });
  assert.deepEqual(evaluatePolicy(snapshot, policy, now), original);
  snapshot.issues.push({ code: 'settings-unavailable', message: 'Generated global issue.' });
  assert.equal(evaluatePolicy(snapshot, policy, now).complete, false);
});

test('missing selected accounts, duplicate accounts and holdings, and obsolete mappings gate completeness', () => {
  for (const change of [
    (f: ReturnType<typeof generatedDomain>) => { f.snapshot.accounts = []; },
    (f: ReturnType<typeof generatedDomain>) => { f.snapshot.accounts.push({ ...f.snapshot.accounts[0] }); },
    (f: ReturnType<typeof generatedDomain>) => { f.snapshot.holdings.push({ ...f.snapshot.holdings[0] }); },
    (f: ReturnType<typeof generatedDomain>) => { f.snapshot.holdings.pop(); },
    (f: ReturnType<typeof generatedDomain>) => { f.policy.holdings.pop(); },
  ]) {
    const fixture = generatedDomain();
    change(fixture);
    const result = evaluatePolicy(fixture.snapshot, fixture.policy, fixture.now);
    assert.equal(result.complete, false);
    assert.ok(result.issues.length > 0);
  }
});

test('unclassified holdings are visible in known whole value but do not enter the denominator', () => {
  const { snapshot, policy, now } = generatedDomain();
  const extra = { ...snapshot.holdings[0], holdingId: 'generated-unclassified', valueMinor: 19 };
  const before = evaluatePolicy(snapshot, policy, now);
  snapshot.holdings.push(extra);
  const after = evaluatePolicy(snapshot, policy, now);
  assert.equal(after.complete, false);
  assert.equal(after.totalMinor, before.totalMinor + 19);
  assert.equal(after.rebalanceMinor, before.rebalanceMinor);
  assert.ok(after.issues.some((issue) => issue.code === 'unclassified-holding' && issue.holdingId === extra.holdingId));
});

test('invalid, stale, future, and currency-mismatched values never masquerade as complete', () => {
  const dates = ['2026-02-30', '2026-09-07T25:00:00Z', '2026-09-07T12:00:00', '2026-09-07T12:00:00+14:30', '2026-08-01', '2026-09-08'];
  for (const asOfDate of dates) {
    const { snapshot, policy, now } = generatedDomain();
    snapshot.holdings[0].asOfDate = asOfDate;
    assert.equal(evaluatePolicy(snapshot, policy, now).complete, false);
  }
  for (const value of [null, NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    const { snapshot, policy, now } = generatedDomain();
    snapshot.holdings[0].valueMinor = value;
    const result = evaluatePolicy(snapshot, policy, now);
    assert.equal(result.complete, false);
    assert.ok(Number.isSafeInteger(result.totalMinor));
    assert.ok(result.rows.every((row) => Number.isFinite(row.actualBps)));
  }
  const { snapshot, policy, now } = generatedDomain();
  snapshot.holdings[0].baseCurrency = 'USD';
  assert.equal(evaluatePolicy(snapshot, policy, now).complete, false);
  snapshot.baseCurrency = 'ZZZ';
  assert.equal(evaluatePolicy(snapshot, policy, now).complete, false);
  assert.equal(evaluatePolicy(snapshot, policy, new Date(NaN)).complete, false);
});

test('quote freshness includes exact age equality and timezone-equivalent timestamps', () => {
  const { snapshot, policy, now } = generatedDomain();
  snapshot.holdings[0].asOfDate = new Date(now.getTime() - policy.maxQuoteAgeDays * 86400000).toISOString();
  assert.equal(evaluatePolicy(snapshot, policy, now).complete, true);
  snapshot.holdings[0].asOfDate = new Date(now.getTime() - policy.maxQuoteAgeDays * 86400000 - 1).toISOString();
  assert.equal(evaluatePolicy(snapshot, policy, now).complete, false);
  snapshot.holdings[0].asOfDate = '2026-09-07T14:00:00+02:00';
  assert.equal(evaluatePolicy(snapshot, policy, now).complete, true);
});

test('unknown TER is partial known-value coverage, never an assumed zero or a drift blocker', () => {
  const { snapshot, policy, now } = generatedDomain();
  policy.holdings[0].terBps = null;
  policy.holdings[1].terBps = 99;
  policy.costCeilingBps = 98;
  const result = evaluatePolicy(snapshot, policy, now);
  assert.equal(result.complete, true);
  assert.equal(result.costs.complete, false);
  assert.equal(result.costs.knownValueMinor, snapshot.holdings[1].valueMinor);
  assert.equal(result.costs.unknownValueMinor, snapshot.holdings[0].valueMinor);
  assert.equal(result.costs.blendedTerBps, 99);
  assert.equal(result.costs.overCeiling, true);
  policy.holdings[1].terBps = null;
  assert.equal(evaluatePolicy(snapshot, policy, now).costs.blendedTerBps, null);
  policy.holdings[0].terBps = 0;
  policy.holdings[1].terBps = 0;
  const zero = evaluatePolicy(snapshot, policy, now);
  assert.equal(zero.costs.complete, true);
  assert.equal(zero.costs.blendedTerBps, 0);
});

test('weighted TER uses exact integer comparison at the ceiling', () => {
  const { snapshot, policy, now } = generatedDomain();
  snapshot.holdings[0].valueMinor = 1;
  snapshot.holdings[1].valueMinor = 3;
  policy.holdings[0].terBps = 1;
  policy.holdings[1].terBps = 5;
  policy.costCeilingBps = 4;
  let result = evaluatePolicy(snapshot, policy, now);
  assert.equal(result.costs.blendedTerBps, 4);
  assert.equal(result.costs.overCeiling, false);
  snapshot.holdings[1].valueMinor += 1;
  result = evaluatePolicy(snapshot, policy, now);
  assert.equal(result.costs.blendedTerBps, 4.2);
  assert.equal(result.costs.overCeiling, true);
});

test('unknown TER metadata is not defaulted to zero even for a currently zero-valued security', () => {
  const { snapshot, policy, now } = generatedDomain();
  snapshot.holdings[0].valueMinor = 0;
  policy.holdings[0].terBps = null;
  const result = evaluatePolicy(snapshot, policy, now);
  assert.equal(result.complete, true);
  assert.equal(result.costs.complete, false);
  assert.equal(result.costs.unknownValueMinor, 0);
  assert.equal(result.costs.blendedTerBps, policy.holdings[1].terBps);
});

test('absolute and relative band equality is breached, a single unit below is not', () => {
  const { snapshot, policy, now } = generatedDomain();
  policy.categories[0].targetBps = 5000;
  policy.categories[1].targetBps = 5000;
  policy.bands = { absoluteBps: 500, relativeBps: 10000 };
  snapshot.holdings[0].valueMinor = 11000;
  snapshot.holdings[1].valueMinor = 9000;
  assert.equal(evaluatePolicy(snapshot, policy, now).rows[0].breached, true);
  snapshot.holdings[0].valueMinor -= 1;
  snapshot.holdings[1].valueMinor += 1;
  assert.equal(evaluatePolicy(snapshot, policy, now).rows[0].breached, false);
  policy.bands = { absoluteBps: 10000, relativeBps: 2500 };
  snapshot.holdings[0].valueMinor = 12500;
  snapshot.holdings[1].valueMinor = 7500;
  assert.equal(evaluatePolicy(snapshot, policy, now).rows[0].breached, true);
  snapshot.holdings[0].valueMinor -= 1;
  snapshot.holdings[1].valueMinor += 1;
  assert.equal(evaluatePolicy(snapshot, policy, now).rows[0].breached, false);
});

test('generated high-value counterexamples agree with exact independent band cross-products', () => {
  for (let seed = 1; seed <= 160; seed++) {
    const { snapshot, policy, now } = generatedDomain(seed);
    snapshot.holdings[0].valueMinor = 1_000_000_000_003 * seed;
    snapshot.holdings[1].valueMinor = 900_000_000_001 * (161 - seed);
    const total = BigInt(snapshot.holdings[0].valueMinor) + BigInt(snapshot.holdings[1].valueMinor);
    for (const [index, row] of evaluatePolicy(snapshot, policy, now).rows.entries()) {
      const value = BigInt(snapshot.holdings[index].valueMinor ?? 0);
      let delta = 10_000n * value - BigInt(row.targetBps) * total;
      if (delta < 0n) delta = -delta;
      assert.equal(row.breached,
        delta >= BigInt(policy.bands.absoluteBps) * total ||
        10_000n * delta >= BigInt(policy.bands.relativeBps) * BigInt(row.targetBps) * total);
    }
  }
});

test('a single minor unit below large-value band equality is not a breach even when display weights round equal', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const { snapshot, policy, now } = generatedDomain(seed);
    const scale = BigInt(Math.floor(Number.MAX_SAFE_INTEGER / 10000) - seed);
    const total = scale * 10000n;
    policy.categories[0].targetBps = 1000 + seed * 83;
    policy.categories[1].targetBps = 10000 - policy.categories[0].targetBps;
    policy.bands = { absoluteBps: 500, relativeBps: 10000 };
    snapshot.holdings[2].valueMinor = 0;
    snapshot.holdings[3].valueMinor = 0;
    const boundary = BigInt(policy.categories[0].targetBps + 500) * scale;
    snapshot.holdings[0].valueMinor = Number(boundary);
    snapshot.holdings[1].valueMinor = Number(total - boundary);
    assert.equal(evaluatePolicy(snapshot, policy, now).rows[0].breached, true);
    snapshot.holdings[0].valueMinor -= 1;
    snapshot.holdings[1].valueMinor += 1;
    assert.equal(evaluatePolicy(snapshot, policy, now).rows[0].breached, false);
  }
  const { snapshot, policy, now } = generatedDomain();
  const scale = 900_000_000_000n;
  policy.categories[0].targetBps = 3456;
  policy.categories[1].targetBps = 6544;
  policy.bands = { absoluteBps: 10000, relativeBps: 2500 };
  snapshot.holdings[0].valueMinor = Number(4320n * scale);
  snapshot.holdings[1].valueMinor = Number(5680n * scale);
  assert.equal(evaluatePolicy(snapshot, policy, now).rows[0].breached, true);
  snapshot.holdings[0].valueMinor -= 1;
  snapshot.holdings[1].valueMinor += 1;
  assert.equal(evaluatePolicy(snapshot, policy, now).rows[0].breached, false);
});

test('zero target/nonzero position breaches, zero/zero does not, and empty rebalancing is incomplete', () => {
  const { snapshot, policy, now } = generatedDomain();
  policy.categories[0].targetBps = 0;
  policy.categories[1].targetBps = 10000;
  assert.equal(evaluatePolicy(snapshot, policy, now).rows[0].breached, true);
  snapshot.holdings[0].valueMinor = 0;
  assert.equal(evaluatePolicy(snapshot, policy, now).rows[0].breached, false);
  snapshot.holdings[1].valueMinor = 0;
  const empty = evaluatePolicy(snapshot, policy, now);
  assert.equal(empty.complete, false);
  assert.ok(empty.rows.every((row) => Number.isFinite(row.actualBps)));
});

test('unsafe aggregation gates assessment without returning unsafe totals or NaN diagnostics', () => {
  const { snapshot, policy, now } = generatedDomain();
  snapshot.holdings[0].valueMinor = Number.MAX_SAFE_INTEGER;
  const result = evaluatePolicy(snapshot, policy, now);
  assert.equal(result.complete, false);
  assert.ok(result.issues.some((issue) => issue.code === 'unsafe-total'));
  for (const value of [result.totalMinor, result.rebalanceMinor, result.observedMinor, result.reservedMinor, result.costs.knownValueMinor]) assert.ok(Number.isSafeInteger(value));
  assert.ok(result.rows.every((row) => Number.isFinite(row.actualBps) && Number.isFinite(row.driftBps)));
});
