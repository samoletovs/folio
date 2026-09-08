import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CSV_HEADER, importHoldingsCsv, MAX_CSV_BYTES } from '../src/lib/portfolio-csv.ts';

function generatedRow(index = 0) {
  return [`generated-${index}`, `"Generated, ""quoted"" holding ${index}"`, '', 'security', String(index + 1), 'EUR', '2026-09-01', ''].join(',');
}
test('CSV parsing is local, handles BOM/CRLF/quoted commas, and preserves stable IDs', () => {
  const rows = importHoldingsCsv('\uFEFF' + CSV_HEADER + generatedRow() + '\r\n', 'generated-account', 'EUR');
  assert.equal(rows[0].id, 'generated-0');
  assert.equal(rows[0].name, 'Generated, "quoted" holding 0');
  assert.equal(rows[0].valueMinor, 100);
  assert.equal(rows[0].units, null);
});
test('invalid columns, duplicate IDs, foreign currency and bad values fail before import', () => {
  for (const input of [
    '', CSV_HEADER, 'name,value\nGenerated,1', 'id,name,kind,value,currency,as_of,id\nx,y,cash,1,EUR,2026-09-01,x',
    CSV_HEADER + generatedRow() + '\n' + generatedRow(),
    CSV_HEADER + generatedRow().replace(',EUR,', ',USD,'),
    CSV_HEADER + generatedRow().replace(',1,EUR,', ',-1,EUR,'),
    CSV_HEADER + generatedRow().replace('2026-09-01', '2026-02-30'),
    CSV_HEADER + generatedRow().replace(',1,EUR,', ',1.001,EUR,'),
    CSV_HEADER + '"unterminated',
  ]) assert.throws(() => importHoldingsCsv(input, 'generated-account', 'EUR'));
});
test('CSV parsing never truncates oversized inputs into a successful partial import', () => {
  assert.throws(() => importHoldingsCsv('x'.repeat(MAX_CSV_BYTES + 1), 'generated', 'EUR'), /limit/);
  const oversized = CSV_HEADER + Array.from({ length: 5001 }, (_, index) => generatedRow(index)).join('\n');
  assert.throws(() => importHoldingsCsv(oversized, 'generated', 'EUR'), /5,000/);
});
test('errors describe rows without echoing any financial cell contents', () => {
  const marker = 'generated-private-marker';
  const input = CSV_HEADER + generatedRow().replace(',1,EUR,', `,${marker},EUR,`);
  assert.throws(() => importHoldingsCsv(input, 'generated', 'EUR'), (error: unknown) =>
    error instanceof Error && error.message.includes('row 2') && !error.message.includes(marker));
});
