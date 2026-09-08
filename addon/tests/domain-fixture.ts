import type { Account, Holding, HostAPI, Settings } from '@wealthfolio/addon-sdk';
import type { Policy, Snapshot, SnapshotHolding } from '../src/types/index.ts';

// Constructed synthetic data only: no exported personal holdings, balances, or IPS.
export function generatedDomain(seed = 1): { policy: Policy; snapshot: Snapshot; now: Date } {
  const now = new Date(Date.UTC(2026, 8, 7, 12));
  const accountId = `generated-account-${seed}`;
  const target = ((seed % 7) + 2) * 1000;
  const categories = Array.from({ length: 2 }, (_, index) => ({
    id: `generated-category-${index}`, label: `Generated category ${index}`,
    targetBps: index === 0 ? target : 10_000 - target,
    minimumHorizonYears: 0, acceptsContributions: true,
  }));
  const holdings: SnapshotHolding[] = Array.from({ length: 4 }, (_, index) => ({
    accountId, holdingId: `generated-holding-${index}`, label: `Generated holding ${index}`,
    kind: index === 3 ? 'cash' : 'security', valueMinor: (seed + 2) ** (index + 1),
    baseCurrency: 'EUR', asOfDate: now.toISOString(),
  }));
  const targetDate = new Date(now);
  targetDate.setUTCFullYear(targetDate.getUTCFullYear() + 20);
  return {
    now,
    snapshot: {
      baseCurrency: 'EUR', accounts: [{ id: accountId, name: 'Generated account' }], holdings,
      issues: [], fetchedAt: now.toISOString(),
    },
    policy: {
      version: 1, baseCurrency: 'EUR', accountIds: [accountId], categories,
      holdings: holdings.map((holding, index) => ({
        accountId, holdingId: holding.holdingId, categoryId: index < 2 ? categories[index].id : null,
        kind: index === 2 ? 'real-estate' : index === 3 ? 'cash' : 'security',
        treatment: index < 2 ? 'rebalance' : index === 2 ? 'observe' : 'reserve',
        terBps: index < 2 ? (seed + 1) * (index + 1) : null,
      })),
      goals: [{ id: 'generated-goal', label: 'Generated goal', targetDate: targetDate.toISOString().slice(0, 10) }],
      bands: { absoluteBps: 500, relativeBps: 2500 },
      costCeilingBps: 100, maxQuoteAgeDays: 7, emergencyFundReady: true,
    },
  };
}

export function generatedHost(seed = 1) {
  const fixture = generatedDomain(seed);
  const settings: Settings = {
    baseCurrency: fixture.snapshot.baseCurrency, theme: 'light', font: 'system',
    onboardingCompleted: true, autoUpdateCheckEnabled: false,
  };
  const accounts: Account[] = fixture.snapshot.accounts.map((account) => ({
    ...account, accountType: 'SECURITIES', currency: 'EUR', balance: 0,
    isDefault: true, isActive: true, createdAt: fixture.now, updatedAt: fixture.now,
  }));
  const holdings = new Map<string, Holding[]>(accounts.map((account) => [account.id,
    fixture.snapshot.holdings.filter((holding) => holding.accountId === account.id).map((holding) => ({
      id: holding.holdingId, accountId: holding.accountId, holdingType: holding.kind,
      quantity: 1, instrument: { id: holding.holdingId, symbol: 'GENERATED', name: holding.label, currency: 'EUR' },
      localCurrency: 'EUR', baseCurrency: 'EUR', price: 1,
      marketValue: { local: (holding.valueMinor ?? 0) / 100, base: (holding.valueMinor ?? 0) / 100 },
      asOfDate: holding.asOfDate, weight: 0,
    })),
  ]));
  const calls: string[] = [];
  const failingAccounts = new Set<string>();
  const unavailable = (): never => { throw new Error('Unexpected host operation in a generated read-only fixture.'); };
  const api: Pick<HostAPI, 'accounts' | 'settings' | 'portfolio'> = {
    accounts: { getAll: async () => { calls.push('accounts.getAll'); return accounts; }, create: unavailable },
    settings: { get: async () => { calls.push('settings.get'); return settings; }, update: unavailable, backupDatabase: unavailable },
    portfolio: {
      getHoldings: async (accountId) => {
        calls.push(`portfolio.getHoldings:${accountId}`);
        if (failingAccounts.has(accountId)) throw new Error('synthetic-private-host-detail');
        return holdings.get(accountId) ?? [];
      },
      getHolding: unavailable, getHistoricalValuations: unavailable, getIncomeSummary: unavailable,
      getLatestValuations: unavailable, recalculate: unavailable, update: unavailable,
    },
  };
  return { ...fixture, api, settings, accounts, holdings, calls, failingAccounts };
}
