import { parse, CsvError } from 'csv-parse/browser/esm/sync';
import { parseAmount } from './money.ts';
import { parseLocalHolding, totalValue, type LocalHolding } from './portfolio.ts';

export const MAX_CSV_BYTES = 2_097_152;
export const CSV_HEADER = 'id,name,symbol,kind,value,currency,as_of,units\r\n';
const REQUIRED = ['id', 'name', 'kind', 'value', 'currency', 'as_of'];
const ALLOWED = [...REQUIRED, 'symbol', 'units'];

export function importHoldingsCsv(text: string, accountId: string, baseCurrency: string): LocalHolding[] {
  if (new TextEncoder().encode(text).length > MAX_CSV_BYTES) throw new Error('The CSV exceeds the 2 MiB import limit.');
  let rows: unknown;
  try {
    rows = parse(text, {
      bom: true, skip_empty_lines: true, relax_column_count: false, record_delimiter: ['\r\n', '\n', '\r'],
      max_record_size: 8192, to: 5002,
    });
  } catch (error) {
    if (error instanceof CsvError) throw new Error('Invalid CSV structure. Use comma-separated fields, matching columns and correctly quoted text. No rows were imported.');
    throw error;
  }
  if (!Array.isArray(rows) || rows.length < 2 || rows.length > 5001 ||
      !rows.every((row: unknown) => Array.isArray(row) && row.every((cell: unknown) => typeof cell === 'string'))) {
    throw new Error('The CSV must contain a header and between one and 5,000 holdings.');
  }
  const table: string[][] = rows;
  const headers = table[0].map((header) => header.trim());
  if (new Set(headers).size !== headers.length || headers.some((header) => !ALLOWED.includes(header)) ||
      REQUIRED.some((header) => !headers.includes(header))) {
    throw new Error('CSV columns must include id,name,kind,value,currency,as_of; only symbol and units are optional.');
  }
  const results = table.slice(1).map((cells, index) => {
    const read = (field: string) => {
      const column = headers.indexOf(field);
      return column === -1 ? '' : cells[column].trim();
    };
    if (read('currency') !== baseCurrency) throw new Error(`CSV row ${index + 2} uses a different currency. Supply values in the portfolio base currency; no FX conversion is performed.`);
    try {
      return parseLocalHolding({
        id: read('id'), accountId, name: read('name'), symbol: read('symbol'),
        kind: read('kind'), valueMinor: parseAmount(read('value'), baseCurrency),
        asOfDate: read('as_of'), units: read('units') || null,
      });
    } catch {
      throw new Error(`CSV row ${index + 2} is invalid. Check its ID, name, kind, nonnegative value, date and optional units. No rows were imported.`);
    }
  });
  if (new Set(results.map((holding) => holding.id)).size !== results.length) throw new Error('The CSV contains duplicate holding IDs. No rows were imported.');
  totalValue(results);
  return results;
}
