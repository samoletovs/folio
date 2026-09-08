import test from 'node:test';
import assert from 'node:assert/strict';
import type { Holding } from '@wealthfolio/addon-sdk';
import { loadSnapshot } from '../src/lib/snapshot.ts';
import { evaluatePolicy } from '../src/lib/evaluation.ts';
import { generatedHost } from './domain-fixture.ts';

function firstHolding(host: ReturnType<typeof generatedHost>): Holding {
  const holding = host.holdings.get(host.accounts[0].id)?.[0];
  assert.ok(holding);
  return holding;
}

test('adapter uses only active account reads and preserves authoritative host base values and dates', async () => {
  const host = generatedHost();
  host.accounts.push({ ...host.accounts[0], id: 'generated-inactive', isActive: false });
  const holding = firstHolding(host);
  holding.quantity = 100;
  holding.price = 100;
  holding.marketValue = { local: 12.345, base: 3.456 };
  holding.localCurrency = 'USD';
  holding.fxRate = 0.8;
  holding.asOfDate = '2026-09-07';
  const snapshot = await loadSnapshot(host.api);
  assert.equal(snapshot.accounts.length, 1);
  assert.equal(snapshot.holdings.length, 4);
  assert.equal(snapshot.holdings[0].valueMinor, 346);
  assert.equal(snapshot.holdings[0].asOfDate, holding.asOfDate);
  assert.equal(snapshot.holdings[0].baseCurrency, 'EUR');
  assert.equal(snapshot.baseCurrency, host.settings.baseCurrency);
  assert.ok(Number.isFinite(Date.parse(snapshot.fetchedAt)));
  assert.deepEqual(snapshot.issues, []);
  assert.deepEqual(host.calls.sort(), ['accounts.getAll', `portfolio.getHoldings:${host.accounts[0].id}`, 'settings.get'].sort());
});

test('missing or invalid security prices invalidate the row without substituting zero', async () => {
  for (const value of [null, undefined, NaN, Infinity, -1, 0, '1']) {
    const host = generatedHost();
    Object.defineProperty(firstHolding(host), 'price', { value });
    const snapshot = await loadSnapshot(host.api);
    assert.equal(snapshot.holdings[0].valueMinor, null);
    assert.ok(snapshot.issues.some((issue) => issue.code === 'missing-price' && issue.accountId === host.accounts[0].id && issue.holdingId === firstHolding(host).id));
    assert.equal(snapshot.holdings.length, 4);
  }
  const host = generatedHost();
  const cash = firstHolding(host);
  cash.holdingType = 'cash';
  cash.price = undefined;
  assert.equal((await loadSnapshot(host.api)).issues.length, 0);
});

test('foreign-currency holdings need explicit usable FX, including foreign cash', async () => {
  for (const value of [undefined, null, NaN, Infinity, 0, -1, '1']) {
    for (const kind of ['security', 'cash'] as const) {
      const host = generatedHost();
      const holding = firstHolding(host);
      holding.localCurrency = 'USD';
      holding.holdingType = kind;
      Object.defineProperty(holding, 'fxRate', { value });
      const snapshot = await loadSnapshot(host.api);
      assert.equal(snapshot.holdings[0].valueMinor, null);
      assert.ok(snapshot.issues.some((issue) => issue.code === 'missing-fx-rate'));
    }
  }
});

test('negative, missing, nonfinite, and unsafe market values are explicit unusable rows', async () => {
  for (const field of ['base', 'local']) {
    for (const value of [-1, undefined, null, NaN, Infinity, Number.MAX_SAFE_INTEGER, '1']) {
      const host = generatedHost();
      Object.defineProperty(firstHolding(host).marketValue, field, { value });
      const snapshot = await loadSnapshot(host.api);
      assert.equal(snapshot.holdings[0].valueMinor, null);
      assert.ok(snapshot.issues.some((issue) => /valuation/.test(issue.code)));
    }
  }
  const host = generatedHost();
  firstHolding(host).marketValue = { base: 0, local: 0 };
  assert.equal((await loadSnapshot(host.api)).holdings[0].valueMinor, 0);
});

test('malformed holding metadata remains visible and cannot become a valid zero', async () => {
  for (const [field, value] of [
    ['id', null], ['accountId', 'generated-other-account'], ['holdingType', 'unknown'],
    ['quantity', -1], ['quantity', NaN], ['quantity', Number.MAX_SAFE_INTEGER + 1],
    ['baseCurrency', 'USD'], ['baseCurrency', 'ZZZ'], ['localCurrency', 'bad'],
    ['asOfDate', '2026-02-30'], ['asOfDate', null], ['marketValue', null],
  ]) {
    const host = generatedHost();
    assert.equal(typeof field, 'string');
    Object.defineProperty(firstHolding(host), String(field), { value });
    const snapshot = await loadSnapshot(host.api);
    assert.equal(snapshot.holdings.length, 4);
    assert.equal(snapshot.holdings[0].valueMinor, null);
    assert.ok(snapshot.issues.length > 0);
  }
});

test('partial account query failures are scoped, safe, and do not suppress successful accounts', async () => {
  const host = generatedHost();
  const secondId = 'generated-second';
  host.accounts.push({ ...host.accounts[0], id: secondId });
  host.failingAccounts.add(secondId);
  const snapshot = await loadSnapshot(host.api);
  assert.equal(snapshot.accounts.length, 2);
  assert.equal(snapshot.holdings.length, 4);
  assert.ok(snapshot.issues.some((issue) => issue.code === 'holdings-unavailable' && issue.accountId === secondId));
  assert.equal(JSON.stringify(snapshot).includes('synthetic-private-host-detail'), false);
  assert.equal(evaluatePolicy(snapshot, host.policy, host.now).complete, true);
  host.policy.accountIds.push(secondId);
  assert.equal(evaluatePolicy(snapshot, host.policy, host.now).complete, false);
});

test('settings and account failures never throw raw API error details', async () => {
  const host = generatedHost();
  host.api.settings.get = async () => { throw new Error('synthetic-private-host-detail'); };
  host.api.accounts.getAll = async () => { throw new Error('synthetic-private-host-detail'); };
  const snapshot = await loadSnapshot(host.api);
  assert.equal(snapshot.baseCurrency, '');
  assert.deepEqual(snapshot.accounts, []);
  assert.deepEqual(snapshot.issues.map((issue) => issue.code), ['settings-unavailable', 'accounts-unavailable']);
  assert.equal(JSON.stringify(snapshot).includes('synthetic-private-host-detail'), false);
});

test('invalid global settings and malformed account responses are actionable issues', async () => {
  for (const value of ['ZZZ', '', 'eur']) {
    const host = generatedHost();
    host.settings.baseCurrency = value;
    const snapshot = await loadSnapshot(host.api);
    assert.ok(snapshot.issues.some((issue) => issue.code === 'invalid-base-currency' && issue.accountId === undefined));
  }
  const host = generatedHost();
  Object.defineProperty(host.api.accounts, 'getAll', { value: async () => null });
  assert.ok((await loadSnapshot(host.api)).issues.some((issue) => issue.code === 'invalid-accounts'));
  Object.defineProperty(host.api.settings, 'get', { value: async () => null });
  assert.ok((await loadSnapshot(host.api)).issues.some((issue) => issue.code === 'invalid-base-currency'));
});

test('invalid holdings arrays and rows are explicit rather than silently skipped', async () => {
  const host = generatedHost();
  Object.defineProperty(host.api.portfolio, 'getHoldings', { value: async () => null, configurable: true });
  assert.ok((await loadSnapshot(host.api)).issues.some((issue) => issue.code === 'invalid-holdings'));
  Object.defineProperty(host.api.portfolio, 'getHoldings', { value: async () => [null] });
  const snapshot = await loadSnapshot(host.api);
  assert.equal(snapshot.holdings.length, 1);
  assert.equal(snapshot.holdings[0].valueMinor, null);
  assert.ok(snapshot.issues.some((issue) => issue.code === 'invalid-holding-id'));
});

test('sparse host holdings are retained as unusable rows rather than disappearing', async () => {
  const host = generatedHost();
  Object.defineProperty(host.api.portfolio, 'getHoldings', { value: async () => new Array<unknown>(1) });
  const snapshot = await loadSnapshot(host.api);
  assert.equal(snapshot.holdings.length, 1);
  assert.equal(snapshot.holdings[0].valueMinor, null);
  assert.ok(snapshot.issues.some((issue) => issue.code === 'invalid-holding-id'));
});

test('duplicate accounts are surfaced but are queried only once; empty accounts are valid', async () => {
  const host = generatedHost();
  host.accounts.push({ ...host.accounts[0] });
  const duplicate = await loadSnapshot(host.api);
  assert.ok(duplicate.issues.some((issue) => issue.code === 'duplicate-account'));
  assert.equal(host.calls.filter((call) => call.startsWith('portfolio')).length, 1);
  host.accounts.length = 0;
  const empty = await loadSnapshot(host.api);
  assert.deepEqual(empty.accounts, []);
  assert.deepEqual(empty.holdings, []);
  assert.deepEqual(empty.issues, []);
  assert.equal(evaluatePolicy(empty, host.policy, host.now).complete, false);
});
