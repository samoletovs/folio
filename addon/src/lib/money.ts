const MAX_MINOR = BigInt(Number.MAX_SAFE_INTEGER);
const digitCache = new Map<string, number>();
const fundCurrencies = new Set(['BOV', 'CHE', 'CHW', 'CLF', 'COU', 'MXV', 'USN', 'UYI', 'UYW']);
const zeroDigitCurrencies = new Set(['BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW', 'PYG', 'RWF', 'UGX', 'UYI', 'VND', 'VUV', 'XAF', 'XOF', 'XPF']);
const threeDigitCurrencies = new Set(['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND']);

export function currencyDigits(currency: string): number {
  if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) {
    throw new Error('Invalid currency: choose a supported uppercase ISO currency code.');
  }
  const cached = digitCache.get(currency);
  if (cached !== undefined) return cached;
  const runtime: object = Intl;
  if (!('supportedValuesOf' in runtime) || typeof runtime.supportedValuesOf !== 'function') {
    throw new Error('Currency validation is unavailable. Update the desktop runtime.');
  }
  const supported: unknown = runtime.supportedValuesOf('currency');
  if (!Array.isArray(supported) || (!supported.includes(currency) && !fundCurrencies.has(currency))) {
    throw new Error('Invalid currency: choose a supported ISO currency code.');
  }
  // ISO minor units, not CLDR's locale-dependent cash/display rounding (e.g. MGA).
  const digits = currency === 'CLF' || currency === 'UYW' ? 4 :
    zeroDigitCurrencies.has(currency) ? 0 : threeDigitCurrencies.has(currency) ? 3 : 2;
  digitCache.set(currency, digits);
  return digits;
}

function safeMinor(value: bigint): number {
  if (value > MAX_MINOR || value < -MAX_MINOR) {
    throw new Error('Invalid amount: currency minor units exceed the safe integer range.');
  }
  return Number(value);
}

export function toMinor(value: number, currency: string): number {
  const digits = currencyDigits(currency);
  if (!Number.isFinite(value)) throw new Error('Invalid amount: a finite number is required.');
  const [coefficient, exponentText = '0'] = Math.abs(value).toString().split('e');
  const [whole, fraction = ''] = coefficient.split('.');
  const units = BigInt(whole + fraction);
  const exponent = Number(exponentText) + digits - fraction.length;
  let rounded: bigint;
  if (exponent >= 0) {
    rounded = units * 10n ** BigInt(exponent);
  } else {
    const divisor = 10n ** BigInt(-exponent);
    // Round the host's decimal representation, including halves, without binary scaling errors.
    rounded = (units + divisor / 2n) / divisor;
  }
  return safeMinor(value < 0 ? -rounded : rounded);
}

export function parseAmount(text: string, currency: string): number {
  const digits = currencyDigits(currency);
  if (typeof text !== 'string' || text.length > 400 || !/^(0|[1-9]\d*)(\.\d+)?$/.test(text)) {
    throw new Error('Invalid amount: enter nonnegative decimal digits without spaces or separators.');
  }
  const [whole, fraction = ''] = text.split('.');
  if (fraction.length > digits) {
    throw new Error('Invalid amount: too many decimal places for this currency.');
  }
  return safeMinor(BigInt(whole) * 10n ** BigInt(digits) + BigInt(fraction.padEnd(digits, '0') || '0'));
}

export function formatMoney(valueMinor: number, currency: string): string {
  const digits = currencyDigits(currency);
  if (!Number.isSafeInteger(valueMinor)) throw new Error('Invalid amount: safe integer minor units are required.');
  const value = BigInt(valueMinor);
  const magnitude = value < 0n ? -value : value;
  const scale = 10n ** BigInt(digits);
  const whole = magnitude / scale;
  const signedWhole = value < 0n ? (whole === 0n ? -0 : -whole) : whole;
  const fraction = (magnitude % scale).toString().padStart(digits, '0');
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).formatToParts(signedWhole)
    .map((part) => part.type === 'fraction' ? fraction : part.value).join('');
}

export function formatBps(bps: number): string {
  if (!Number.isFinite(bps) || Math.abs(bps) > Number.MAX_SAFE_INTEGER) {
    throw new Error('Invalid basis points: a finite value in the safe range is required.');
  }
  return new Intl.NumberFormat('en-GB', { style: 'percent', maximumFractionDigits: 2 }).format(bps / 10_000);
}
