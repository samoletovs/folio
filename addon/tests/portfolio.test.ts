import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyPortfolio, parsePortfolio, portfolioSnapshot, replaceAccountHoldings, seedPortfolioPolicy, totalValue } from '../src/lib/portfolio.ts';
import { evaluatePolicy } from '../src/lib/evaluation.ts';
import { generatedPortfolio } from './portfolio-fixture.ts';

test('standalone portfolio works without SDK, accounts, credentials or a policy', () => {
  assert.deepEqual(emptyPortfolio('EUR'), { version: 1, baseCurrency: 'EUR', accounts: [], holdings: [], snapshots: [], policy: null });
  const document = generatedPortfolio();
  const snapshot = portfolioSnapshot(parsePortfolio(document));
  assert.equal(snapshot.holdings.length, document.holdings.length);
  assert.equal(snapshot.holdings[0].valueMinor, document.holdings[0].valueMinor);
  assert.equal(totalValue(document.holdings), 300);
  assert.deepEqual(snapshot.issues, []);
});

test('strict documents reject invalid accounts, duplicate identities, currencies and unsafe values', () => {
  const document = generatedPortfolio();
  for (const bad of [
    { ...document, version: 2 }, { ...document, baseCurrency: 'INVALID' },
    { ...document, unexpected: 'not printed' }, { ...document, accounts: [...document.accounts, document.accounts[0]] },
    { ...document, holdings: [{ ...document.holdings[0], accountId: 'absent' }] },
    { ...document, holdings: [document.holdings[0], document.holdings[0]] },
    { ...document, holdings: [{ ...document.holdings[0], valueMinor: -1 }] },
    { ...document, holdings: [{ ...document.holdings[0], valueMinor: Number.NaN }] },
    { ...document, holdings: [{ ...document.holdings[0], asOfDate: '2026-02-30' }] },
    { ...document, holdings: [{ ...document.holdings[1], units: '1' }] },
    { ...document, holdings: [{ ...document.holdings[0], units: '1e3' }] },
    { ...document, holdings: document.holdings.map((holding) => ({ ...holding, valueMinor: Number.MAX_SAFE_INTEGER })) },
    { ...document, holdings: new Array(1) },
  ]) assert.throws(() => parsePortfolio(bad));
});

test('recorded snapshots are independent of subsequent current-account changes', () => {
  const document = generatedPortfolio();
  document.snapshots.push({ id: 'generated-snapshot', label: 'Generated archive', recordedAt: new Date().toISOString(), accounts: document.accounts, holdings: document.holdings });
  const validated = parsePortfolio(document);
  validated.holdings[0].valueMinor += 100;
  validated.accounts[0].name = 'Changed current name';
  assert.equal(validated.snapshots[0].holdings[0].valueMinor, document.holdings[0].valueMinor);
  assert.equal(validated.snapshots[0].accounts[0].name, document.accounts[0].name);
  assert.equal(parsePortfolio({ ...validated, accounts: [], holdings: [] }).snapshots.length, 1);
});

test('repeated imports replace one account rather than doubling the portfolio', () => {
  const document = generatedPortfolio();
  const accountId = document.accounts[0].id;
  const replacement = [{ ...document.holdings[0], valueMinor: 500 }];
  const once = replaceAccountHoldings(document, accountId, replacement);
  const twice = replaceAccountHoldings(once, accountId, replacement);
  assert.deepEqual(once, twice);
  assert.deepEqual(twice.holdings.find((holding) => holding.accountId !== accountId), document.holdings[1]);
  assert.throws(() => replaceAccountHoldings(document, 'absent', []), /existing account/);
});

test('standalone adapter gates changed property classifications and preserves policy review', () => {
  const document = generatedPortfolio();
  const policy = seedPortfolioPolicy(document);
  policy.categories = [{ id: 'generated-category', label: 'Generated category', targetBps: 10_000, minimumHorizonYears: 0, acceptsContributions: true }];
  policy.goals = [{ id: 'generated-goal', label: 'Generated goal', targetDate: '2099-01-01' }];
  policy.holdings[0].categoryId = policy.categories[0].id;
  document.policy = policy;
  const valid = parsePortfolio(document);
  assert.equal(evaluatePolicy(portfolioSnapshot(valid), policy).complete, true);
  valid.holdings[0].kind = 'real-estate';
  const changed = portfolioSnapshot(valid);
  assert.equal(changed.issues[0].code, 'holding-kind-changed');
  assert.equal(evaluatePolicy(changed, policy).complete, false);
  assert.equal(seedPortfolioPolicy(valid).holdings[0].treatment, 'observe');
});
