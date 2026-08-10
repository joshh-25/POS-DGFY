import { createRequire } from 'module';
import { jest } from '@jest/globals';

const require = createRequire(import.meta.url);
const migration = require('../../dgfy-migration-runner/migrations/20260727000001-promote-legacy-pos-generated-barcodes.cjs');

const buildQueryInterface = ({
    currentDatabase = 'landlord',
    tenantDatabases = ['tenant_alpha', 'tenant_alpha', 'tenant_without_barcodes'],
    tables = new Set([
        'landlord.tenants',
        'landlord.item_barcodes',
        'tenant_alpha.item_barcodes'
    ])
} = {}) => {
    const query = jest.fn(async (sql, options = {}) => {
        if (sql.includes('SELECT DATABASE()')) {
            return [[{ dbName: currentDatabase }]];
        }

        if (sql.includes('FROM information_schema.tables')) {
            const [databaseName, tableName] = options.replacements;
            return [[{ count: tables.has(`${databaseName}.${tableName}`) ? 1 : 0 }]];
        }

        if (sql.includes('SELECT DISTINCT db_name')) {
            return [tenantDatabases.map((dbName) => ({ db_name: dbName }))];
        }

        if (sql.includes('UPDATE ')) {
            return [[], { affectedRows: 1 }];
        }

        throw new Error(`Unexpected SQL in migration test: ${sql}`);
    });

    return {
        query,
        queryInterface: {
            sequelize: { query }
        }
    };
};

const getUpdateCalls = (query) => query.mock.calls.filter(([sql]) => sql.includes('UPDATE '));

describe('Legacy generated POS barcode migration', () => {
    it('promotes matching barcodes once per database and skips schemas without the table', async () => {
        const { query, queryInterface } = buildQueryInterface();

        await migration.up(queryInterface);

        const updateCalls = getUpdateCalls(query);
        expect(updateCalls).toHaveLength(2);
        expect(updateCalls[0][0]).toContain('UPDATE `landlord`.`item_barcodes`');
        expect(updateCalls[1][0]).toContain('UPDATE `tenant_alpha`.`item_barcodes`');

        for (const [sql, options] of updateCalls) {
            expect(sql).toContain("source = 'tenant_generated'");
            expect(sql).toContain("code LIKE 'IMS-%-INVENTORY-%'");
            expect(options.replacements).toEqual({
                scope: 'pos',
                previousScope: 'inventory'
            });
        }
    });

    it('reverses only the scope transition during rollback', async () => {
        const { query, queryInterface } = buildQueryInterface({
            tenantDatabases: [],
            tables: new Set(['landlord.tenants', 'landlord.item_barcodes'])
        });

        await migration.down(queryInterface);

        const updateCalls = getUpdateCalls(query);
        expect(updateCalls).toHaveLength(1);
        expect(updateCalls[0][1].replacements).toEqual({
            scope: 'inventory',
            previousScope: 'pos'
        });
    });

    it('rejects an unsafe tenant database identifier before executing an update', async () => {
        const unsafeDatabase = 'tenant`; DROP DATABASE landlord; --';
        const { queryInterface } = buildQueryInterface({
            tenantDatabases: [unsafeDatabase],
            tables: new Set([
                'landlord.tenants',
                'landlord.item_barcodes',
                `${unsafeDatabase}.item_barcodes`
            ])
        });

        await expect(migration.up(queryInterface)).rejects.toThrow('Unsafe database identifier');
    });
});
