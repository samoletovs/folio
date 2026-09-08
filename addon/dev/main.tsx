import React, { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import type { Account, AddonContext, EventCallback, Holding, HostAPI } from '@wealthfolio/addon-sdk';
import enable from '../src/addon.tsx';

// Generated values are for local development only. This entry is never packaged.
const accounts: Account[] = Array.from({ length: 2 }, (_, index) => ({
  id: `synthetic-${index}`, name: `Generated account ${index + 1}`, accountType: 'SECURITIES',
  currency: 'EUR', balance: 0, isDefault: index === 0, isActive: true,
  createdAt: new Date(), updatedAt: new Date(),
}));
const holdings = (accountId: string): Holding[] => Array.from({ length: 2 }, (_, index) => {
  const quantity = (index + 1) ** 3;
  return {
    id: `synthetic-holding-${index}`, accountId, holdingType: 'security',
    instrument: { id: `synthetic-instrument-${index}`, symbol: `GENERATED-${index}`, name: `Generated asset ${index + 1}`, currency: 'EUR' },
    quantity, localCurrency: 'EUR', baseCurrency: 'EUR', price: 1,
    marketValue: { local: quantity, base: quantity }, weight: 0, asOfDate: new Date().toISOString(),
  };
});
const unavailable = (): never => { throw new Error('This operation is unavailable in the synthetic preview.'); };
const callbacks = new Set<() => void>();
const onUpdateComplete = <T,>(callback: EventCallback<T>) => {
  const notify = () => callback({ payload: undefined as T });
  callbacks.add(notify);
  return Promise.resolve(() => { callbacks.delete(notify); });
};
const noEvents = () => Promise.resolve(() => {});
const api: HostAPI = {
  accounts: { getAll: async () => accounts, create: unavailable },
  portfolio: { getHoldings: async (id) => holdings(id), getHolding: unavailable, update: unavailable, recalculate: unavailable, getIncomeSummary: unavailable, getHistoricalValuations: unavailable, getLatestValuations: unavailable },
  settings: { get: async () => ({ baseCurrency: 'EUR', theme: 'light', font: 'system', onboardingCompleted: true, autoUpdateCheckEnabled: false }), update: unavailable, backupDatabase: unavailable },
  events: {
    portfolio: { onUpdateStart: noEvents, onUpdateComplete, onUpdateError: noEvents },
    market: { onSyncStart: noEvents, onSyncComplete: noEvents },
    import: { onDropHover: noEvents, onDrop: noEvents, onDropCancelled: noEvents },
  },
  files: {
    openCsvDialog: unavailable,
    openSaveDialog: async (content, name) => {
      const blob = content instanceof Blob ? content : new Blob([typeof content === 'string' ? content : new Uint8Array(content)]);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = name; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return name;
    },
  },
  logger: { error: console.error, warn: console.warn, info: console.info, trace: console.debug, debug: console.debug },
  activities: { getAll: unavailable, search: unavailable, create: unavailable, update: unavailable, saveMany: unavailable, import: unavailable, checkImport: unavailable, getImportMapping: unavailable, saveImportMapping: unavailable },
  market: { searchTicker: unavailable, syncHistory: unavailable, sync: unavailable, getProviders: unavailable },
  assets: { getProfile: unavailable, updateProfile: unavailable, updateDataSource: unavailable },
  quotes: { update: unavailable, getHistory: unavailable },
  performance: { calculateHistory: unavailable, calculateSummary: unavailable, calculateAccountsSimple: unavailable },
  exchangeRates: { getAll: unavailable, update: unavailable, add: unavailable },
  contributionLimits: { getAll: unavailable, create: unavailable, update: unavailable, calculateDeposits: unavailable },
  goals: { getAll: unavailable, create: unavailable, update: unavailable, updateAllocations: unavailable, getAllocations: unavailable },
  secrets: { get: unavailable, set: unavailable, delete: unavailable },
  navigation: { navigate: unavailable },
  query: { getClient: unavailable, invalidateQueries: unavailable, refetchQueries: unavailable },
};
const container = document.getElementById('root');
if (!container) throw new Error('Preview root is missing.');
const root = createRoot(container);
let disable: (() => void) | undefined;
const ctx: AddonContext = {
  api,
  sidebar: { addItem: () => ({ remove: () => {} }) },
  router: { add: ({ component: Page }) => root.render(<React.StrictMode><Suspense fallback={<p>Loading preview...</p>}><Page /></Suspense></React.StrictMode>) },
  onDisable: (callback) => { disable = callback; },
};
enable(ctx);
document.getElementById('host-update')?.addEventListener('click', () => callbacks.forEach((callback) => callback()));
document.getElementById('host-toggle')?.addEventListener('click', (event) => {
  const button = event.currentTarget;
  if (!(button instanceof HTMLButtonElement)) return;
  if (disable) { disable(); disable = undefined; button.textContent = 'Enable addon'; }
  else { enable(ctx); button.textContent = 'Disable addon'; }
});
