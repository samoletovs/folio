import { holdingKey, type HoldingRule, type Policy, type PolicyCategory, type PolicyGoal } from '../types/index.ts';
import { currencyDigits } from './money.ts';

function fail(field: string, requirement: string): never {
  throw new Error(`Invalid IPS ${field}: ${requirement}.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function record(value: unknown, field: string, keys: string[]): Record<string, unknown> {
  if (!isRecord(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    return fail(field, 'an object is required');
  }
  if (Object.keys(value).some((key) => !keys.includes(key))) fail(field, 'unsupported fields are present');
  return value;
}

function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 200 ||
      value.trim() !== value || /[\u0000-\u001f\u007f]/.test(value)) {
    return fail(field, 'a nonempty trimmed string of at most 200 characters is required');
  }
  return value;
}

function integer(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    return fail(field, `an integer from ${min} through ${max} is required`);
  }
  return value;
}

function bool(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') return fail(field, 'a boolean is required');
  return value;
}

function list(value: unknown, field: string, minimum: number): unknown[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > 100_000) {
    return fail(field, `an array with ${minimum} through 100000 entries is required`);
  }
  for (let index = 0; index < value.length; index++) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) fail(field, 'sparse arrays are not supported');
  }
  return value;
}

function unique(values: string[], field: string): void {
  if (new Set(values).size !== values.length) fail(field, 'entries must have unique identifiers');
}

export function calendarDate(value: string): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  return date.getTime();
}

export function valuationTime(value: string): number | null {
  if (typeof value !== 'string') return null;
  if (value.length === 10) return calendarDate(value);
  const match = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d{1,9})?(Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.exec(value);
  if (!match || calendarDate(match[1]) === null || /[+-]14:(?!00)/.test(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

export function parsePolicy(input: unknown): Policy {
  const data = record(input, 'document', [
    'version', 'baseCurrency', 'accountIds', 'categories', 'holdings', 'goals',
    'bands', 'costCeilingBps', 'maxQuoteAgeDays', 'emergencyFundReady',
  ]);
  if (data.version !== 1) fail('version', 'only schema version 1 is supported');
  const baseCurrency = text(data.baseCurrency, 'baseCurrency');
  try { currencyDigits(baseCurrency); } catch { fail('baseCurrency', 'a supported uppercase ISO currency code is required'); }
  const accountIds = list(data.accountIds, 'accountIds', 1).map((value, index) => text(value, `accountIds[${index}]`));
  unique(accountIds, 'accountIds');
  const categories: PolicyCategory[] = list(data.categories, 'categories', 1).map((value, index) => {
    const field = `categories[${index}]`;
    const category = record(value, field, ['id', 'label', 'targetBps', 'minimumHorizonYears', 'acceptsContributions']);
    return {
      id: text(category.id, `${field}.id`), label: text(category.label, `${field}.label`),
      targetBps: integer(category.targetBps, `${field}.targetBps`, 0, 10_000),
      minimumHorizonYears: integer(category.minimumHorizonYears, `${field}.minimumHorizonYears`, 0, 100),
      acceptsContributions: bool(category.acceptsContributions, `${field}.acceptsContributions`),
    };
  });
  unique(categories.map((category) => category.id), 'categories');
  if (categories.reduce((sum, category) => sum + category.targetBps, 0) !== 10_000) fail('categories.targetBps', 'targets must total 10000 basis points');
  const categoryIds = new Set(categories.map((category) => category.id));
  const accounts = new Set(accountIds);
  const holdings: HoldingRule[] = list(data.holdings, 'holdings', 0).map((value, index) => {
    const field = `holdings[${index}]`;
    const rule = record(value, field, ['accountId', 'holdingId', 'categoryId', 'treatment', 'kind', 'terBps']);
    const accountId = text(rule.accountId, `${field}.accountId`);
    if (!accounts.has(accountId)) fail(`${field}.accountId`, 'the account must be selected in accountIds');
    const treatment = rule.treatment;
    if (treatment !== 'rebalance' && treatment !== 'observe' && treatment !== 'reserve') fail(`${field}.treatment`, 'choose rebalance, observe, or reserve');
    const kind = rule.kind;
    if (kind !== 'security' && kind !== 'cash' && kind !== 'pension' && kind !== 'real-estate') fail(`${field}.kind`, 'choose a supported holding kind');
    if (kind === 'real-estate' && treatment !== 'observe') fail(`${field}.treatment`, 'real estate must be observation-only');
    let categoryId: string | null = null;
    if (treatment === 'rebalance') {
      categoryId = text(rule.categoryId, `${field}.categoryId`);
      if (!categoryIds.has(categoryId)) fail(`${field}.categoryId`, 'the category must exist');
    } else if (rule.categoryId !== null) fail(`${field}.categoryId`, 'observation and reserve categories must be null');
    return {
      accountId, holdingId: text(rule.holdingId, `${field}.holdingId`), categoryId, treatment, kind,
      terBps: rule.terBps === null ? null : integer(rule.terBps, `${field}.terBps`, 0, 10_000),
    };
  });
  unique(holdings.map((rule) => holdingKey(rule.accountId, rule.holdingId)), 'holdings');
  const goals: PolicyGoal[] = list(data.goals, 'goals', 1).map((value, index) => {
    const field = `goals[${index}]`;
    const goal = record(value, field, ['id', 'label', 'targetDate']);
    const targetDate = text(goal.targetDate, `${field}.targetDate`);
    if (calendarDate(targetDate) === null) fail(`${field}.targetDate`, 'a valid YYYY-MM-DD calendar date is required');
    return { id: text(goal.id, `${field}.id`), label: text(goal.label, `${field}.label`), targetDate };
  });
  unique(goals.map((goal) => goal.id), 'goals');
  const bands = record(data.bands, 'bands', ['absoluteBps', 'relativeBps']);
  return {
    version: 1, baseCurrency, accountIds, categories, holdings, goals,
    bands: {
      absoluteBps: integer(bands.absoluteBps, 'bands.absoluteBps', 1, 10_000),
      relativeBps: integer(bands.relativeBps, 'bands.relativeBps', 1, 10_000),
    },
    costCeilingBps: integer(data.costCeilingBps, 'costCeilingBps', 0, 10_000),
    maxQuoteAgeDays: integer(data.maxQuoteAgeDays, 'maxQuoteAgeDays', 1, 365),
    emergencyFundReady: bool(data.emergencyFundReady, 'emergencyFundReady'),
  };
}
