import type { Policy } from '../src/types/index.ts';

export function generatedPolicy(): Policy {
  const id = 'generated-fixture';
  return {
    version: 1, baseCurrency: 'EUR', accountIds: [id],
    categories: [{ id, label: 'Generated category', targetBps: 10_000, minimumHorizonYears: 0, acceptsContributions: true }],
    holdings: [{ accountId: id, holdingId: id, categoryId: id, treatment: 'rebalance', kind: 'security', terBps: null }],
    goals: [{ id, label: 'Generated goal', targetDate: '2099-01-01' }],
    bands: { absoluteBps: 500, relativeBps: 2500 },
    costCeilingBps: 100, maxQuoteAgeDays: 7, emergencyFundReady: false,
  };
}
