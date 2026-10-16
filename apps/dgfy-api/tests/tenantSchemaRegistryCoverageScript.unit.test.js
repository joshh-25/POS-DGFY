import {
    buildTableToModelMap,
    extractTableModelPairsFromSource,
    extractMigrationSchemaOperations,
    classifyTable,
    checkRegistryCoverage
} from '../scripts/check-tenant-schema-registry-coverage.js';

describe('tenant schema registry coverage script contracts', () => {
    describe('extractTableModelPairsFromSource', () => {
        it('resolves table names from a sequelize.define(...) model', () => {
            const source = `
                const Item = sequelize.define('Item', {
                    name: DataTypes.STRING
                }, { tableName: 'items', timestamps: true });
            `;
            expect(extractTableModelPairsFromSource(source)).toEqual([
                { table: 'items', model: 'Item' }
            ]);
        });

        it('resolves table names from a class-extends-Model + .init(...) model (Landlord style)', () => {
            const source = `
                class Tenant extends Model { }
                Tenant.init({
                    name: DataTypes.STRING
                }, {
                    tableName: 'tenants',
                    sequelize
                });
            `;
            expect(extractTableModelPairsFromSource(source)).toEqual([
                { table: 'tenants', model: 'Tenant' }
            ]);
        });

        it('resolves multiple define blocks in one file (HospitalityModels.js-style)', () => {
            const source = `
                export const HospitalityRoomType = sequelize.define('HospitalityRoomType', {
                    name: DataTypes.STRING
                }, { tableName: 'hospitality_room_types', timestamps: true });

                export const HospitalityRoom = sequelize.define('HospitalityRoom', {
                    number: DataTypes.STRING
                }, { tableName: 'hospitality_rooms', timestamps: true });
            `;
            expect(extractTableModelPairsFromSource(source)).toEqual([
                { table: 'hospitality_room_types', model: 'HospitalityRoomType' },
                { table: 'hospitality_rooms', model: 'HospitalityRoom' }
            ]);
        });
    });

    describe('buildTableToModelMap', () => {
        it('builds a table -> model map across multiple in-memory-equivalent sources via extractTableModelPairsFromSource', () => {
            // buildTableToModelMap reads real files; exercised end-to-end via
            // the integration test instead. Here we just confirm it composes
            // extractTableModelPairsFromSource output correctly for an empty
            // file list.
            expect(buildTableToModelMap([])).toEqual(new Map());
        });
    });

    describe('extractMigrationSchemaOperations', () => {
        it('extracts a literal createTable call', () => {
            const source = `await queryInterface.createTable('pos_discount_rules', { id: {} });`;
            const result = extractMigrationSchemaOperations(source);
            expect(result.createdTables).toEqual(['pos_discount_rules']);
            expect(result.addedColumns).toEqual([]);
            expect(result.nonLiteralCalls).toEqual([]);
        });

        it('extracts a literal addColumn call', () => {
            const source = `await queryInterface.addColumn('items', 'senior_pwd_discount_eligible', { type: Sequelize.BOOLEAN });`;
            const result = extractMigrationSchemaOperations(source);
            expect(result.addedColumns).toEqual([{ table: 'items', column: 'senior_pwd_discount_eligible' }]);
            expect(result.createdTables).toEqual([]);
            expect(result.nonLiteralCalls).toEqual([]);
        });

        it('captures a variable-driven addColumn call as a warning, not a violation candidate', () => {
            const source = `
                for (const { table, column } of COLUMNS) {
                    await queryInterface.addColumn(table, column, { type: Sequelize.STRING });
                }
            `;
            const result = extractMigrationSchemaOperations(source);
            expect(result.addedColumns).toEqual([]);
            expect(result.createdTables).toEqual([]);
            expect(result.nonLiteralCalls).toHaveLength(1);
            expect(result.nonLiteralCalls[0].fn).toBe('addColumn');
            expect(result.nonLiteralCalls[0].arg).toBe('table');
        });

        // #2335: a literal queryInterface.changeColumn(...) -- e.g. widening an ENUM --
        // was previously invisible to this parser entirely. PR #2322's migration used exactly
        // this call (changeColumn('stock_movements', 'reference_type', ...)) and shipped with
        // no registry entry and no CI failure, because changedColumns didn't exist yet.
        it('extracts a literal changeColumn call', () => {
            const source = `await queryInterface.changeColumn('stock_movements', 'reference_type', { type: Sequelize.ENUM('PO', 'POS_PARKED_SALE') });`;
            const result = extractMigrationSchemaOperations(source);
            expect(result.changedColumns).toEqual([{ table: 'stock_movements', column: 'reference_type' }]);
            expect(result.createdTables).toEqual([]);
            expect(result.addedColumns).toEqual([]);
            expect(result.nonLiteralCalls).toEqual([]);
        });

        it('captures a variable-driven changeColumn call as a warning, not a violation candidate', () => {
            const source = `
                for (const { table, column } of ENUM_COLUMNS) {
                    await queryInterface.changeColumn(table, column, { type: Sequelize.STRING });
                }
            `;
            const result = extractMigrationSchemaOperations(source);
            expect(result.changedColumns).toEqual([]);
            expect(result.nonLiteralCalls).toHaveLength(1);
            expect(result.nonLiteralCalls[0].fn).toBe('changeColumn');
            expect(result.nonLiteralCalls[0].arg).toBe('table');
        });
    });

    describe('classifyTable', () => {
        const tableToModel = new Map([
            ['items', 'Item'],
            ['tenants', 'Tenant']
        ]);
        const nonTenantModelExports = new Set(['Tenant']);

        it('classifies a mapped, non-excluded model as tenant-scoped', () => {
            expect(classifyTable('items', tableToModel, nonTenantModelExports)).toBe('tenant');
        });

        it('classifies a mapped, excluded model as landlord', () => {
            expect(classifyTable('tenants', tableToModel, nonTenantModelExports)).toBe('landlord');
        });

        it('classifies a table with no matching model as unmapped', () => {
            expect(classifyTable('unknown_table', tableToModel, nonTenantModelExports)).toBe('unmapped');
        });
    });

    describe('checkRegistryCoverage', () => {
        const tableToModel = new Map([
            ['items', 'Item'],
            ['tenants', 'Tenant'],
            ['pos_discount_rules', 'PosDiscountRule']
        ]);
        const nonTenantModelExports = new Set(['Tenant']);

        it('passes when a tenant-scoped column has a matching registry entry', () => {
            const { violations } = checkRegistryCoverage({
                migrations: [{
                    file: 'apps/dgfy-migration-runner/migrations/x.cjs',
                    createdTables: [],
                    addedColumns: [{ table: 'items', column: 'senior_pwd_discount_eligible' }],
                    nonLiteralCalls: []
                }],
                tableToModel,
                nonTenantModelExports,
                requiredColumns: { items: { senior_pwd_discount_eligible: { sql: '...' } } },
                requiredTables: {}
            });
            expect(violations).toEqual([]);
        });

        it('flags a tenant-scoped column with no matching registry entry', () => {
            const { violations } = checkRegistryCoverage({
                migrations: [{
                    file: 'apps/dgfy-migration-runner/migrations/x.cjs',
                    createdTables: [],
                    addedColumns: [{ table: 'items', column: 'unregistered_column' }],
                    nonLiteralCalls: []
                }],
                tableToModel,
                nonTenantModelExports,
                requiredColumns: {},
                requiredTables: {}
            });
            expect(violations).toHaveLength(1);
            expect(violations[0].table).toBe('items');
            expect(violations[0].column).toBe('unregistered_column');
        });

        it('does not flag a landlord-only table', () => {
            const { violations } = checkRegistryCoverage({
                migrations: [{
                    file: 'apps/dgfy-migration-runner/migrations/x.cjs',
                    createdTables: [],
                    addedColumns: [{ table: 'tenants', column: 'some_new_column' }],
                    nonLiteralCalls: []
                }],
                tableToModel,
                nonTenantModelExports,
                requiredColumns: {},
                requiredTables: {}
            });
            expect(violations).toEqual([]);
        });

        it('only flags the table-level violation when a table is created and column-added in the same migration', () => {
            const { violations } = checkRegistryCoverage({
                migrations: [{
                    file: 'apps/dgfy-migration-runner/migrations/x.cjs',
                    createdTables: ['pos_discount_rules'],
                    addedColumns: [{ table: 'pos_discount_rules', column: 'name' }],
                    nonLiteralCalls: []
                }],
                tableToModel,
                nonTenantModelExports,
                requiredColumns: {},
                requiredTables: {}
            });
            expect(violations).toHaveLength(1);
            expect(violations[0].table).toBe('pos_discount_rules');
            expect(violations[0].column).toBeNull();
        });

        it('suppresses a violation when the table.column is listed in exemptions', () => {
            const { violations } = checkRegistryCoverage({
                migrations: [{
                    file: 'apps/dgfy-migration-runner/migrations/x.cjs',
                    createdTables: [],
                    addedColumns: [{ table: 'items', column: 'unregistered_column' }],
                    nonLiteralCalls: []
                }],
                tableToModel,
                nonTenantModelExports,
                exemptions: new Set(['items.unregistered_column']),
                requiredColumns: {},
                requiredTables: {}
            });
            expect(violations).toEqual([]);
        });

        it('flags an unmapped table (no model found) fail-closed', () => {
            const { violations } = checkRegistryCoverage({
                migrations: [{
                    file: 'apps/dgfy-migration-runner/migrations/x.cjs',
                    createdTables: ['some_unmapped_table'],
                    addedColumns: [],
                    nonLiteralCalls: []
                }],
                tableToModel,
                nonTenantModelExports,
                requiredColumns: {},
                requiredTables: {}
            });
            expect(violations).toHaveLength(1);
            expect(violations[0].classification).toBe('unmapped');
        });

        // #2335 regression guard: this is the exact bug class PR #2322 shipped -- a changeColumn
        // ENUM-widening migration with no registry entry anywhere. Must fail without the
        // changeColumn detection added for #2335 and pass with it.
        it('flags a tenant-scoped changeColumn with no matching registry entry in either registry', () => {
            const { violations } = checkRegistryCoverage({
                migrations: [{
                    file: 'apps/dgfy-migration-runner/migrations/x.cjs',
                    createdTables: [],
                    addedColumns: [],
                    changedColumns: [{ table: 'items', column: 'unregistered_enum_column' }],
                    nonLiteralCalls: []
                }],
                tableToModel,
                nonTenantModelExports,
                requiredColumns: {},
                requiredTables: {},
                requiredEnumContracts: {}
            });
            expect(violations).toHaveLength(1);
            expect(violations[0].table).toBe('items');
            expect(violations[0].column).toBe('unregistered_enum_column');
            expect(violations[0].message).toContain('changeColumn');
        });

        it('passes a tenant-scoped changeColumn covered by REQUIRED_TENANT_SCHEMA_ENUM_CONTRACTS', () => {
            const { violations } = checkRegistryCoverage({
                migrations: [{
                    file: 'apps/dgfy-migration-runner/migrations/x.cjs',
                    createdTables: [],
                    addedColumns: [],
                    changedColumns: [{ table: 'stock_movements', column: 'reference_type' }],
                    nonLiteralCalls: []
                }],
                tableToModel: new Map([...tableToModel, ['stock_movements', 'StockMovement']]),
                nonTenantModelExports,
                requiredColumns: {},
                requiredTables: {},
                requiredEnumContracts: {
                    stock_movements: { reference_type: { enumValues: ['PO', 'POS_PARKED_SALE'], sql: '...' } }
                }
            });
            expect(violations).toEqual([]);
        });

        it('passes a tenant-scoped changeColumn covered by REQUIRED_TENANT_SCHEMA_COLUMNS', () => {
            const { violations } = checkRegistryCoverage({
                migrations: [{
                    file: 'apps/dgfy-migration-runner/migrations/x.cjs',
                    createdTables: [],
                    addedColumns: [],
                    changedColumns: [{ table: 'items', column: 'category' }],
                    nonLiteralCalls: []
                }],
                tableToModel,
                nonTenantModelExports,
                requiredColumns: { items: { category: { sql: '...' } } },
                requiredTables: {},
                requiredEnumContracts: {}
            });
            expect(violations).toEqual([]);
        });

        it('does not flag a changeColumn on a landlord-only table', () => {
            const { violations } = checkRegistryCoverage({
                migrations: [{
                    file: 'apps/dgfy-migration-runner/migrations/x.cjs',
                    createdTables: [],
                    addedColumns: [],
                    changedColumns: [{ table: 'tenants', column: 'some_existing_column' }],
                    nonLiteralCalls: []
                }],
                tableToModel,
                nonTenantModelExports,
                requiredColumns: {},
                requiredTables: {},
                requiredEnumContracts: {}
            });
            expect(violations).toEqual([]);
        });

        it('surfaces non-literal calls as warnings, not violations', () => {
            const { violations, warnings } = checkRegistryCoverage({
                migrations: [{
                    file: 'apps/dgfy-migration-runner/migrations/x.cjs',
                    createdTables: [],
                    addedColumns: [],
                    nonLiteralCalls: [{ fn: 'addColumn', arg: 'tableName', line: 5 }]
                }],
                tableToModel,
                nonTenantModelExports,
                requiredColumns: {},
                requiredTables: {}
            });
            expect(violations).toEqual([]);
            expect(warnings).toHaveLength(1);
            expect(warnings[0].message).toContain('addColumn(tableName, ...)');
        });
    });
});
