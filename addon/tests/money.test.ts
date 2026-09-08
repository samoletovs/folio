import test from 'node:test';
import assert from 'node:assert/strict';
import { currencyDigits, formatBps, formatMoney, parseAmount, toMinor } from '../src/lib/money.ts';

test('currency precision includes zero, two, three, and four minor-unit digits', () => {
  for (const [currency, digits] of [['JPY', 0], ['EUR', 2], ['KWD', 3], ['CLF', 4]] as const) {
    assert.equal(currencyDigits(currency), digits);
    const units = 10 ** digits;
    assert.equal(parseAmount('1', currency), units);
    assert.equal(toMinor(1, currency), units);
  }
  assert.equal(currencyDigits('MGA'), 2);
  assert.equal(formatMoney(101, 'MGA'), 'MGA\u00a01.01');
});

test('unknown currencies, lowercase, and pseudo-currencies fail without echoing input', () => {
  for (const value of ['ZZZ', 'eur', '', 'EURO', 'XXX', 'generated-secret']) {
    for (const operation of [
      () => currencyDigits(value), () => toMinor(1, value),
      () => parseAmount('1', value), () => formatMoney(1, value),
    ]) assert.throws(operation, (error: unknown) => error instanceof Error && !error.message.includes(value || '__not-present__'));
  }
});

test('host decimal rounding is symmetric and avoids binary half-cent scaling errors', () => {
  for (const [amount, expected] of [[1.005, 101], [2.675, 268], [0.145, 15], [1.0049, 100], [-1.005, -101], [0.1 + 0.2, 30]]) {
    assert.equal(toMinor(amount, 'EUR'), expected);
  }
  assert.equal(toMinor(1.2345, 'KWD'), 1235);
  assert.equal(toMinor(1.5, 'JPY'), 2);
  assert.equal(toMinor(1e-20, 'EUR'), 0);
  assert.equal(toMinor(-0, 'EUR'), 0);
});

test('user amounts are strict and never silently rounded', () => {
  for (const input of ['', ' ', ' 1', '1 ', '+1', '-0', '-1', '.5', '1.', '01', '00.1', '1,00', '1_000', '1e2', 'NaN', 'Infinity', '1.001', '0.000']) {
    assert.throws(() => parseAmount(input, 'EUR'), /Invalid amount/);
  }
  assert.throws(() => parseAmount('1.0', 'JPY'), /decimal places/);
  assert.equal(parseAmount('0', 'EUR'), 0);
  assert.equal(parseAmount('12.3', 'EUR'), 1230);
  assert.equal(parseAmount('12.34', 'EUR'), 1234);
  assert.equal(parseAmount('0.001', 'KWD'), 1);
});

test('unsafe and nonfinite amounts fail while maximum safe minor units round-trip exactly', () => {
  for (const amount of [NaN, Infinity, -Infinity, Number.MAX_VALUE, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => toMinor(amount, 'EUR'), /Invalid amount/);
  }
  assert.throws(() => parseAmount('90071992547409.92', 'EUR'), /safe integer/);
  assert.equal(parseAmount('90071992547409.91', 'EUR'), Number.MAX_SAFE_INTEGER);
  assert.equal(formatMoney(Number.MAX_SAFE_INTEGER, 'EUR'), '€90,071,992,547,409.91');
  assert.equal(formatMoney(-Number.MAX_SAFE_INTEGER, 'EUR'), '-€90,071,992,547,409.91');
  assert.equal(formatMoney(-1, 'EUR'), '-€0.01');
  assert.equal(formatMoney(1, 'KWD'), 'KWD\u00a00.001');
  assert.throws(() => formatMoney(1.1, 'EUR'), /safe integer/);
  assert.throws(() => formatMoney(NaN, 'EUR'), /safe integer/);
});

test('generated decimal amounts conserve exact minor units across supported precisions', () => {
  for (const currency of ['EUR', 'JPY', 'KWD', 'CLF']) {
    const digits = currencyDigits(currency);
    const scale = 10 ** digits;
    for (let seed = 1; seed <= 120; seed++) {
      const minor = seed ** 3;
      const amount = `${Math.floor(minor / scale)}${digits ? `.${String(minor % scale).padStart(digits, '0')}` : ''}`;
      assert.equal(parseAmount(amount, currency), minor);
      assert.equal(toMinor(Number(amount), currency), minor);
    }
  }
});

test('basis points format percentage units and reject unavailable values', () => {
  assert.equal(formatBps(500), '5%');
  assert.equal(formatBps(-125), '-1.25%');
  assert.equal(formatBps(12.345), '0.12%');
  assert.throws(() => formatBps(NaN), /Invalid basis points/);
  assert.throws(() => formatBps(Infinity), /Invalid basis points/);
});
