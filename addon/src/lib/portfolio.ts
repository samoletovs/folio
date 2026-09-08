import { currencyDigits } from './money.ts';
import { calendarDate, parsePolicy, valuationTime } from './policy.ts';
import { holdingKey, type HoldingRule, type Policy, type Snapshot } from '../types/index.ts';

export interface LocalAccount { id: string; name: string }
export interface LocalHolding {
  id: string;
  accountId: string;
  name: string;
  symbol: string;
  kind: HoldingRule['kind'];
  valueMinor: number;
  asOfDate: string;
  units: string | null;
}
export interface RecordedSnapshot {
  id: string;
  recordedAt: string;
  label: string;
  accounts: LocalAccount[];
  holdings: LocalHolding[];
}
export interface PortfolioDocument {
  version: 1;
  baseCurrency: string;
  accounts: LocalAccount[];
  holdings: LocalHolding[];
  snapshots: RecordedSnapshot[];
  policy: Policy | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function object(value: unknown, keys: string[], field: string): Record<string, unknown> {
  if (!isRecord(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) ||
      Object.keys(value).some((key) => !keys.includes(key))) {
    throw new Error(`Invalid portfolio ${field}: use the supported object fields.`);
  }
  return value;
}
function text(value: unknown, field: string, empty = false): string {
  if (typeof value !== 'string' || value.length > 200 || (!empty && !value) ||
      value.trim() !== value || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`Invalid portfolio ${field}: use trimmed text of at most 200 characters.`);
  }
  return value;
}
function list(value: unknown, field: string, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum ||
      Array.from({ length: value.length }, (_, index) => index).some((index) => !Object.prototype.hasOwnProperty.call(value, index))) {
    throw new Error(`Invalid portfolio ${field}: use an array of at most ${maximum} entries.`);
  }
  return value;
}
function unique(ids: string[], field: string) {
  if (new Set(ids).size !== ids.length) throw new Error(`Invalid portfolio ${field}: duplicate identifiers are not allowed.`);
}
function accounts(input: unknown): LocalAccount[] {
  const result = list(input, 'accounts', 100).map((value) => {
    const account = object(value, ['id', 'name'], 'account');
    return { id: text(account.id, 'account.id'), name: text(account.name, 'account.name') };
  });
  unique(result.map((account) => account.id), 'accounts');
  return result;
}
export function parseLocalHolding(input: unknown): LocalHolding {
  const value = object(input, ['id', 'accountId', 'name', 'symbol', 'kind', 'valueMinor', 'asOfDate', 'units'], 'holding');
  if (value.kind !== 'security' && value.kind !== 'cash' && value.kind !== 'pension' && value.kind !== 'real-estate') {
    throw new Error('Invalid portfolio holding kind.');
  }
  if (typeof value.valueMinor !== 'number' || !Number.isSafeInteger(value.valueMinor) || value.valueMinor < 0) {
    throw new Error('Invalid portfolio holding value: use nonnegative safe currency minor units.');
  }
  const asOfDate = text(value.asOfDate, 'holding.asOfDate');
  if (calendarDate(asOfDate) === null) throw new Error('Invalid portfolio valuation date: use a genuine YYYY-MM-DD date.');
  const units = value.units === null ? null : text(value.units, 'holding.units');
  if (units !== null && (!/^(0|[1-9]\d*)(?:\.\d{1,12})?$/.test(units) || units.length > 40)) {
    throw new Error('Invalid portfolio units: use nonnegative decimal units with up to twelve decimal places.');
  }
  if (value.kind === 'cash' && units !== null) throw new Error('Cash has a value, not investment units.');
  return {
    id: text(value.id, 'holding.id'), accountId: text(value.accountId, 'holding.accountId'),
    name: text(value.name, 'holding.name'), symbol: text(value.symbol, 'holding.symbol', true),
    kind: value.kind, valueMinor: value.valueMinor, asOfDate, units,
  };
}
function holdings(input: unknown, accountList: LocalAccount[]): LocalHolding[] {
  const result = list(input, 'holdings', 5000).map(parseLocalHolding);
  const selected = new Set(accountList.map((account) => account.id));
  if (result.some((holding) => !selected.has(holding.accountId))) throw new Error('A portfolio holding references an absent account.');
  unique(result.map((holding) => holdingKey(holding.accountId, holding.id)), 'holdings');
  totalValue(result);
  return result;
}
export function totalValue(values: LocalHolding[]): number {
  const total = values.reduce((sum, holding) => sum + BigInt(holding.valueMinor), 0n);
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Combined portfolio values exceed the supported currency range.');
  return Number(total);
}
export function parsePortfolio(input: unknown): PortfolioDocument {
  const value = object(input, ['version', 'baseCurrency', 'accounts', 'holdings', 'snapshots', 'policy'], 'document');
  if (value.version !== 1) throw new Error('Unsupported portfolio version. Only version 1 can be opened.');
  const baseCurrency = text(value.baseCurrency, 'baseCurrency');
  currencyDigits(baseCurrency);
  const accountList = accounts(value.accounts);
  const current = holdings(value.holdings, accountList);
  const snapshots = list(value.snapshots, 'snapshots', 50).map((item): RecordedSnapshot => {
    const entry = object(item, ['id', 'recordedAt', 'label', 'accounts', 'holdings'], 'snapshot');
    const recordedAt = text(entry.recordedAt, 'snapshot.recordedAt');
    if (valuationTime(recordedAt) === null) throw new Error('Invalid portfolio snapshot timestamp.');
    const archivedAccounts = accounts(entry.accounts);
    return {
      id: text(entry.id, 'snapshot.id'), recordedAt, label: text(entry.label, 'snapshot.label'),
      accounts: archivedAccounts, holdings: holdings(entry.holdings, archivedAccounts),
    };
  });
  unique(snapshots.map((entry) => entry.id), 'snapshots');
  const policy = value.policy === null ? null : parsePolicy(value.policy);
  if (policy && policy.baseCurrency !== baseCurrency) throw new Error('The IPS and portfolio must use the same base currency.');
  return { version: 1, baseCurrency, accounts: accountList, holdings: current, snapshots, policy };
}
export function emptyPortfolio(baseCurrency: string): PortfolioDocument {
  return parsePortfolio({ version: 1, baseCurrency, accounts: [], holdings: [], snapshots: [], policy: null });
}
export function portfolioSnapshot(document: PortfolioDocument, now = new Date()): Snapshot {
  return {
    baseCurrency: document.baseCurrency,
    accounts: document.accounts.map((account) => ({ ...account })),
    holdings: document.holdings.map((holding) => ({
      accountId: holding.accountId, holdingId: holding.id, label: holding.name,
      kind: holding.kind === 'cash' ? 'cash' : 'security',
      valueMinor: holding.valueMinor, baseCurrency: document.baseCurrency, asOfDate: holding.asOfDate,
    })),
    issues: document.holdings.flatMap((holding) => {
      const rule = document.policy?.holdings.find((item) => item.accountId === holding.accountId && item.holdingId === holding.id);
      return rule && rule.kind !== holding.kind ? [{
        code: 'holding-kind-changed', accountId: holding.accountId, holdingId: holding.id,
        message: 'The holding kind differs from its IPS classification. Update the policy before relying on this assessment.',
      }] : [];
    }), fetchedAt: now.toISOString(),
  };
}
export function seedPortfolioPolicy(document: PortfolioDocument): Policy {
  return {
    version: 1, baseCurrency: document.baseCurrency, accountIds: document.accounts.map((account) => account.id),
    categories: [], goals: [],
    holdings: document.holdings.map((holding) => ({
      accountId: holding.accountId, holdingId: holding.id, kind: holding.kind,
      treatment: holding.kind === 'real-estate' ? 'observe' : holding.kind === 'cash' ? 'reserve' : 'rebalance',
      categoryId: null, terBps: null,
    })),
    bands: { absoluteBps: 500, relativeBps: 2500 }, costCeilingBps: 0,
    maxQuoteAgeDays: 7, emergencyFundReady: false,
  };
}
export function replaceAccountHoldings(document: PortfolioDocument, accountId: string, replacement: LocalHolding[]): PortfolioDocument {
  if (!document.accounts.some((account) => account.id === accountId) || replacement.some((holding) => holding.accountId !== accountId)) {
    throw new Error('Select an existing account for this snapshot import.');
  }
  // Keep IPS mappings so removed or newly imported holdings require an explicit policy review.
  return parsePortfolio({ ...document, holdings: [...document.holdings.filter((holding) => holding.accountId !== accountId), ...replacement] });
}
