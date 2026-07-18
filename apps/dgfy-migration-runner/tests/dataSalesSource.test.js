import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { jest } from '@jest/globals';
import { readLegacySalesSnapshot } from '../src/data/legacySource.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SALES_TABLES = ['pos_transactions', 'pos_transaction_lines'];

function buildFakeTenantSequelize(tableRows = {}) {
    const calls = [];
    const query = jest.fn(async (sql, options = {}) => {
        calls.push({ sql, options });
        const table = SALES_TABLES.find((name) => sql === `SELECT * FROM ${name}`);
        return [tableRows[table] || []];
    });

    return { query, __calls: calls };
}

describe('readLegacySalesSnapshot', () => {
    test('reads the two sales tables verbatim, in order, with no interpolated values', async () => {
        const posTransactions = [
            { pos_transaction_id: 1, invoice_number: 'INV-1', status: 'completed' },
            { pos_transaction_id: 2, invoice_number: 'INV-2', status: 'voided' }
        ];
        const posTransactionLines = [
            { line_id: 10, pos_transaction_id: 1, item_id: 100 },
            { line_id: 11, pos_transaction_id: 1, item_id: 200 }
        ];
        const tenantSequelize = buildFakeTenantSequelize({
            pos_transactions: posTransactions,
            pos_transaction_lines: posTransactionLines
        });

        const snapshot = await readLegacySalesSnapshot(tenantSequelize);

        expect(snapshot).toEqual({ posTransactions, posTransactionLines });
        expect(tenantSequelize.__calls.map((call) => call.sql)).toEqual([
            'SELECT * FROM pos_transactions',
            'SELECT * FROM pos_transaction_lines'
        ]);
        tenantSequelize.__calls.forEach((call) => {
            expect(call.sql).not.toContain('${');
            expect(call.options).toEqual({});
        });
    });

    test('returns empty arrays for both tables and performs no target lookup or write when the tables are empty', async () => {
        const tenantSequelize = buildFakeTenantSequelize();

        const snapshot = await readLegacySalesSnapshot(tenantSequelize);

        expect(snapshot).toEqual({ posTransactions: [], posTransactionLines: [] });
        expect(tenantSequelize.__calls).toHaveLength(SALES_TABLES.length);
    });

    test('issues exactly one SELECT per table (no pagination/watermark cursor per D-14-06)', async () => {
        const tenantSequelize = buildFakeTenantSequelize();

        await readLegacySalesSnapshot(tenantSequelize);

        expect(tenantSequelize.query).toHaveBeenCalledTimes(SALES_TABLES.length);
        tenantSequelize.__calls.forEach((call) => {
            expect(call.sql).not.toMatch(/LIMIT|WHERE|OFFSET/i);
        });
    });

    test('source guard: readLegacySalesSnapshot only ever issues SELECT statements against the two sales tables', () => {
        const source = readFileSync(join(__dirname, '..', 'src', 'data', 'legacySource.js'), 'utf8');
        const functionBody = source.slice(
            source.indexOf('export async function readLegacySalesSnapshot'),
            source.indexOf('export async function readLegacySalesSnapshot') + 800
        );

        const mutationPattern = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE)\b/i;
        expect(functionBody).not.toMatch(mutationPattern);
        expect(functionBody).toContain('SELECT * FROM pos_transactions');
        expect(functionBody).toContain('SELECT * FROM pos_transaction_lines');
    });

    test('legacySource keeps the migration runner isolated from backend runtime modules', () => {
        const source = readFileSync(join(__dirname, '..', 'src', 'data', 'legacySource.js'), 'utf8');

        expect(source.match(/from ['"][^'"]*backend\/src[^'"]*['"]/g) || []).toHaveLength(0);
        expect(source).not.toContain('backend/');
    });
});
