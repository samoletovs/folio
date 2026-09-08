import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePolicy } from '../src/lib/policy.ts';
import { generatedDomain } from './domain-fixture.ts';
import type { Policy } from '../src/types/index.ts';

test('generated schema versions parse into independent validated objects', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const { policy } = generatedDomain(seed);
    const parsed = parsePolicy(policy);
    assert.deepEqual(parsed, policy);
    assert.notEqual(parsed, policy);
    assert.notEqual(parsed.holdings[0], policy.holdings[0]);
  }
});

test('schema is strict, has no implicit defaults, and does not print values or unknown keys', () => {
  const { policy } = generatedDomain();
  for (const input of [null, [], 'generated-secret', 1, { ...policy, version: 2 }, { ...policy, 'generated-secret': 1 }, { ...policy, emergencyFundReady: 'generated-secret' }]) {
    assert.throws(() => parsePolicy(input), (error: unknown) => error instanceof Error && /Invalid IPS/.test(error.message) && !error.message.includes('generated-secret'));
  }
  for (const key of Object.keys(policy)) {
    const input: Record<string, unknown> = { ...policy };
    delete input[key];
    assert.throws(() => parsePolicy(input), /Invalid IPS/);
  }
});

const invalidPolicies: [string, (policy: Policy) => void][] = [
  ['accountIds', (p) => { p.accountIds = []; }],
  ['categories', (p) => { p.categories = []; }],
  ['goals', (p) => { p.goals = []; }],
  ['accountIds', (p) => { p.accountIds.push(p.accountIds[0]); }],
  ['categories', (p) => { p.categories[1].id = p.categories[0].id; }],
  ['goals', (p) => { p.goals.push({ ...p.goals[0] }); }],
  ['holdings', (p) => { p.holdings.push({ ...p.holdings[0] }); }],
  ['accountId', (p) => { p.holdings[0].accountId = 'generated-unselected'; }],
  ['categoryId', (p) => { p.holdings[0].categoryId = 'generated-absent'; }],
  ['categoryId', (p) => { p.holdings[0].categoryId = null; }],
  ['categoryId', (p) => { p.holdings[2].categoryId = p.categories[0].id; }],
  ['categoryId', (p) => { p.holdings[3].categoryId = p.categories[0].id; }],
  ['treatment', (p) => { p.holdings[2].treatment = 'reserve'; }],
  ['treatment', (p) => { p.holdings[0].kind = 'real-estate'; }],
  ['targetBps', (p) => { p.categories[0].targetBps -= 1; }],
  ['baseCurrency', (p) => { p.baseCurrency = 'ZZZ'; }],
  ['baseCurrency', (p) => { p.baseCurrency = 'eur'; }],
  ['label', (p) => { p.categories[0].label = ''; }],
  ['id', (p) => { p.categories[0].id = ' generated '; }],
];

for (const [index, [field, mutate]] of invalidPolicies.entries()) {
  test(`rejects invalid policy ${field} (case ${index + 1})`, () => {
    const { policy } = generatedDomain();
    mutate(policy);
    assert.throws(() => parsePolicy(policy), new RegExp(field));
  });
}

test('all numerical bounds reject fractions, nonfinite numbers, and out-of-range values', () => {
  const fields: [string, (p: Policy, value: number) => void, number, number][] = [
    ['targetBps', (p, v) => { p.categories[0].targetBps = v; }, 0, 10000],
    ['minimumHorizonYears', (p, v) => { p.categories[0].minimumHorizonYears = v; }, 0, 100],
    ['absoluteBps', (p, v) => { p.bands.absoluteBps = v; }, 1, 10000],
    ['relativeBps', (p, v) => { p.bands.relativeBps = v; }, 1, 10000],
    ['costCeilingBps', (p, v) => { p.costCeilingBps = v; }, 0, 10000],
    ['terBps', (p, v) => { p.holdings[0].terBps = v; }, 0, 10000],
    ['maxQuoteAgeDays', (p, v) => { p.maxQuoteAgeDays = v; }, 1, 365],
  ];
  for (const [field, set, min, max] of fields) {
    for (const value of [min - 1, max + 1, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      const { policy } = generatedDomain();
      set(policy, value);
      assert.throws(() => parsePolicy(policy), new RegExp(field));
    }
  }
});

test('calendar validation rejects normalized impossible dates and accepts actual leap days', () => {
  for (const date of ['2027-02-29', '2026-02-30', '2026-04-31', '2026-13-01', '2026-00-01', '0000-01-01', '26-01-01', '2026-1-01', '2026-09-07T00:00:00Z']) {
    const { policy } = generatedDomain();
    policy.goals[0].targetDate = date;
    assert.throws(() => parsePolicy(policy), /targetDate/);
  }
  for (const date of ['2028-02-29', '2000-02-29', '0001-01-01', '9999-12-31']) {
    const { policy } = generatedDomain();
    policy.goals[0].targetDate = date;
    assert.equal(parsePolicy(policy).goals[0].targetDate, date);
  }
});

test('unknown TER remains null, explicit zero remains zero, and missing TER is not defaulted', () => {
  const { policy } = generatedDomain();
  policy.holdings[0].terBps = null;
  policy.holdings[1].terBps = 0;
  assert.equal(parsePolicy(policy).holdings[0].terBps, null);
  assert.equal(parsePolicy(policy).holdings[1].terBps, 0);
  const missing = { ...policy, holdings: [{ ...policy.holdings[0], terBps: undefined }] };
  assert.throws(() => parsePolicy(missing), /terBps/);
});

test('compound account/holding identity permits reused holding ids without delimiter collisions', () => {
  const { policy } = generatedDomain();
  policy.accountIds.push('generated-second');
  policy.holdings.push({ ...policy.holdings[0], accountId: 'generated-second' });
  assert.equal(parsePolicy(policy).holdings.length, policy.holdings.length);
  policy.accountIds = ['a:b', 'a'];
  policy.holdings = [
    { ...policy.holdings[0], accountId: 'a:b', holdingId: 'c' },
    { ...policy.holdings[0], accountId: 'a', holdingId: 'b:c' },
  ];
  assert.equal(parsePolicy(policy).holdings.length, 2);
});

test('wrong primitive kinds and unexpected nested fields fail runtime validation', () => {
  const { policy } = generatedDomain();
  for (const input of [
    { ...policy, accountIds: 'generated-account' },
    { ...policy, categories: [{ ...policy.categories[0], acceptsContributions: 1 }] },
    { ...policy, holdings: [{ ...policy.holdings[0], kind: 'auto-trade' }] },
    { ...policy, holdings: [{ ...policy.holdings[0], treatment: 'sell' }] },
    { ...policy, bands: { ...policy.bands, 'generated-secret': 1 } },
    { ...policy, goals: [{ ...policy.goals[0], label: '\ninvalid' }] },
  ]) assert.throws(() => parsePolicy(input), /Invalid IPS/);
});

test('sparse arrays cannot hide unvalidated entries', () => {
  const { policy } = generatedDomain();
  const sparse = new Array(1);
  for (const field of ['accountIds', 'categories', 'holdings', 'goals']) {
    assert.throws(() => parsePolicy({ ...policy, [field]: sparse }), /sparse arrays/);
  }
});
