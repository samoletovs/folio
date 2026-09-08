import type { HostAPI } from '@wealthfolio/addon-sdk';
import type { DataIssue, Snapshot, SnapshotAccount, SnapshotHolding } from '../types/index.ts';
import { currencyDigits, toMinor } from './money.ts';
import { valuationTime } from './policy.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isCurrency(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try { currencyDigits(value); return true; } catch { return false; }
}

function readHolding(input: unknown, accountId: string, index: number, currency: string): {
  holding: SnapshotHolding; issues: DataIssue[];
} {
  const data = isRecord(input) ? input : {};
  const holdingId = isText(data.id) ? data.id : `unavailable-holding-${index}`;
  const issues: DataIssue[] = [];
  const issue = (code: string, message: string) => issues.push({ code, message, accountId, holdingId });
  if (!isText(data.id)) issue('invalid-holding-id', 'A holding has no usable identifier. Refresh holdings in Wealthfolio.');
  if (data.accountId !== accountId) issue('holding-account-mismatch', 'A holding does not belong to the queried account. Refresh holdings in Wealthfolio.');
  const kind = data.holdingType === 'cash' ? 'cash' : 'security';
  if (data.holdingType !== 'cash' && data.holdingType !== 'security') issue('invalid-holding-kind', 'A holding has an unsupported type. Review it in Wealthfolio.');
  const baseCurrency = typeof data.baseCurrency === 'string' ? data.baseCurrency : '';
  if (!isCurrency(baseCurrency) || !isCurrency(data.localCurrency)) {
    issue('invalid-holding-currency', 'A holding has an invalid currency. Correct its currency in Wealthfolio.');
  } else if (baseCurrency !== currency) {
    issue('holding-currency-mismatch', 'A holding valuation uses a different base currency. Refresh the host portfolio.');
  }
  if (data.localCurrency !== baseCurrency && (typeof data.fxRate !== 'number' || !Number.isFinite(data.fxRate) || data.fxRate <= 0)) {
    issue('missing-fx-rate', 'A foreign-currency holding lacks a valid exchange rate. Refresh exchange rates in Wealthfolio.');
  } else if (data.fxRate !== undefined && data.fxRate !== null &&
      (typeof data.fxRate !== 'number' || !Number.isFinite(data.fxRate) || data.fxRate <= 0)) {
    issue('invalid-fx-rate', 'A holding has an invalid exchange rate. Refresh exchange rates in Wealthfolio.');
  }
  if (kind === 'security' && (typeof data.price !== 'number' || !Number.isFinite(data.price) || data.price <= 0)) {
    issue('missing-price', 'A security lacks a valid positive price. Update its quote or manual valuation in Wealthfolio.');
  }
  if (typeof data.quantity !== 'number' || !Number.isFinite(data.quantity) || data.quantity < 0 || data.quantity > Number.MAX_SAFE_INTEGER) {
    issue('invalid-quantity', 'A holding has a negative or unusable quantity. Review the host position.');
  }
  const asOfDate = typeof data.asOfDate === 'string' ? data.asOfDate : '';
  if (valuationTime(asOfDate) === null) issue('invalid-valuation-date', 'A holding lacks a valid valuation date. Refresh its host valuation.');
  const marketValue = isRecord(data.marketValue) ? data.marketValue : {};
  let valueMinor: number | null = null;
  if (typeof marketValue.base !== 'number' || !Number.isFinite(marketValue.base) || marketValue.base < 0 ||
      typeof marketValue.local !== 'number' || !Number.isFinite(marketValue.local) || marketValue.local < 0) {
    issue('invalid-valuation', 'A holding has a missing, negative, or invalid market value. Review its host valuation.');
  } else {
    try {
      valueMinor = toMinor(marketValue.base, baseCurrency);
      if (isCurrency(data.localCurrency)) toMinor(marketValue.local, data.localCurrency);
    } catch {
      issue('unsafe-valuation', 'A holding valuation cannot be represented safely in currency minor units. Review its value and currency.');
    }
  }
  const instrument = isRecord(data.instrument) ? data.instrument : {};
  const label = isText(instrument.name) ? instrument.name :
    isText(instrument.symbol) ? instrument.symbol : kind === 'cash' ? 'Cash holding' : 'Unnamed holding';
  return {
    holding: { accountId, holdingId, label, kind, valueMinor: issues.length === 0 ? valueMinor : null, baseCurrency, asOfDate },
    issues,
  };
}

export async function loadSnapshot(api: Pick<HostAPI, 'accounts' | 'settings' | 'portfolio'>): Promise<Snapshot> {
  const issues: DataIssue[] = [];
  const accounts: SnapshotAccount[] = [];
  const [settingsResult, accountResult] = await Promise.allSettled([
    (async (): Promise<unknown> => api.settings.get())(),
    (async (): Promise<unknown> => api.accounts.getAll())(),
  ]);
  let baseCurrency = '';
  if (settingsResult.status === 'rejected') {
    issues.push({ code: 'settings-unavailable', message: 'Cannot read Wealthfolio settings. Check addon read permissions and retry.' });
  } else if (!isRecord(settingsResult.value) || !isCurrency(settingsResult.value.baseCurrency)) {
    issues.push({ code: 'invalid-base-currency', message: 'The host base currency is invalid or unsupported. Correct Wealthfolio settings.' });
  } else {
    baseCurrency = settingsResult.value.baseCurrency;
  }
  if (accountResult.status === 'rejected') {
    issues.push({ code: 'accounts-unavailable', message: 'Cannot read Wealthfolio accounts. Check addon read permissions and retry.' });
  } else if (!Array.isArray(accountResult.value)) {
    issues.push({ code: 'invalid-accounts', message: 'The host returned an invalid account list. Refresh Wealthfolio and retry.' });
  } else {
    const rawAccounts: unknown[] = accountResult.value;
    for (const input of rawAccounts) {
      if (!isRecord(input) || !isText(input.id)) {
        issues.push({ code: 'invalid-account', message: 'A host account has no usable identifier. Review accounts in Wealthfolio.' });
        continue;
      }
      if (typeof input.isActive !== 'boolean') {
        issues.push({ code: 'invalid-account-state', message: 'An account has an invalid active state. Review accounts in Wealthfolio.', accountId: input.id });
        continue;
      }
      if (!input.isActive) continue;
      accounts.push({ id: input.id, name: isText(input.name) ? input.name : 'Unnamed account' });
    }
  }
  const ids = new Set<string>();
  for (const account of accounts) {
    if (ids.has(account.id)) issues.push({ code: 'duplicate-account', message: 'The host returned a duplicate account. Refresh its account list.', accountId: account.id });
    ids.add(account.id);
  }
  const results = await Promise.all([...ids].map(async (accountId) => {
    let raw: unknown;
    try { raw = await api.portfolio.getHoldings(accountId); } catch {
      return { holdings: [], issues: [{ code: 'holdings-unavailable', message: 'Cannot read holdings for an account. Check read permissions and refresh its portfolio.', accountId }] };
    }
    if (!Array.isArray(raw)) {
      return { holdings: [], issues: [{ code: 'invalid-holdings', message: 'The host returned an invalid holdings list. Refresh the affected account.', accountId }] };
    }
    const inputs: unknown[] = raw;
    const rows = Array.from(inputs, (input, index) => readHolding(input, accountId, index, baseCurrency));
    return { holdings: rows.map((row) => row.holding), issues: rows.flatMap((row) => row.issues) };
  }));
  return {
    baseCurrency, accounts, holdings: results.flatMap((result) => result.holdings),
    issues: [...issues, ...results.flatMap((result) => result.issues)], fetchedAt: new Date().toISOString(),
  };
}
