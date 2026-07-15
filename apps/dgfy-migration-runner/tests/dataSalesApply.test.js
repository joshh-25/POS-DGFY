import { jest } from '@jest/globals';

const mockCreateSourceConnection = jest.fn();
const mockCreateLegacyTenantSourceConnection = jest.fn();
const mockCreateBusinessTargetConnection = jest.fn();

jest.unstable_mockModule('../src/config/db.js', () => ({
    createSourceConnection: mockCreateSourceConnection,
    createTargetConnection: jest.fn(),
    createMetaConnection: jest.fn(),
    createBusinessTargetConnection: mockCreateBusinessTargetConnection,
    createLegacyTenantSourceConnection: mockCreateLegacyTenantSourceConnection
}));

const { applyTenantEntityBatch, writeMappedTargetRow } = await import('../src/data/apply.js');
const { DEFAULT_RUN_SCOPE } = await import('../src/data/dryRun.js');
const {
    legacyFullPosTransactionFixture,
    phase14ContextFixture
} = await import('./fixtures/phase14/legacySalesRecords.js');
const { mapPosTransactionToAvailment } = await import('../src/data/mappings.js');

function createFakeSqlSequelize(initialTables = {}) {
    const tables = {};
    Object.entries(initialTables).forEach(([name, rows]) => {
        tables[name] = rows.map((row) => ({ ...row }));
    });
    const autoIncrementCounters = {};
    Object.entries(tables).forEach(([name, rows]) => {
        autoIncrementCounters[name] = rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0);
    });
    let lastInsertId = null;

    function ensureTable(name) {
        if (!tables[name]) tables[name] = [];
        return tables[name];
    }

    function matchesWhere(row, where = {}) {
        return Object.entries(where).every(([key, value]) => String(row[key]) === String(value));
    }

    const bulkInsert = jest.fn(async (tableName, rows) => {
        const table = ensureTable(tableName);
        rows.forEach((row) => {
            const record = { ...row };
            if (record.id === undefined || record.id === null) {
                autoIncrementCounters[tableName] = (autoIncrementCounters[tableName] || 0) + 1;
                record.id = autoIncrementCounters[tableName];
            }
            lastInsertId = record.id;
            table.push(record);
        });
    });

    const bulkUpdate = jest.fn(async (tableName, values, where) => {
        ensureTable(tableName).forEach((row) => {
            if (matchesWhere(row, where)) {
                Object.assign(row, values);
            }
        });
    });

    const query = jest.fn(async (sql, options = {}) => {
        const replacements = Array.isArray(options.replacements)
            ? options.replacements
            : Object.values(options.replacements || {});

        if (/^SELECT LAST_INSERT_ID/.test(sql)) {
            return [[{ id: lastInsertId }]];
        }

        if (sql.includes('FROM data_quality_findings') && sql.includes('legacy_table <=>')) {
            const [runScope, entityType, legacyTable, legacyId, legacyTenantId] = replacements;
            return [ensureTable('data_quality_findings').filter((row) => (
                String(row.run_scope) === String(runScope)
                && String(row.entity_type) === String(entityType)
                && String(row.legacy_table) === String(legacyTable)
                && String(row.legacy_id) === String(legacyId)
                && String(row.legacy_tenant_id) === String(legacyTenantId)
            ))];
        }

        const selectMatch = sql.match(/^SELECT .* FROM (\w+) WHERE (.+) LIMIT 1$/);
        if (selectMatch) {
            const [, tableName, whereClause] = selectMatch;
            const columns = whereClause.split(' AND ').map((clause) => clause.split(' = ')[0].trim());
            const found = ensureTable(tableName).find((row) => columns.every(
                (column, index) => String(row[column]) === String(replacements[index])
            ));
            return [found ? [{ ...found }] : []];
        }

        return [[]];
    });

    const transaction = jest.fn(async (callback) => callback({ __fakeTransaction: true }));

    return {
        tables,
        query,
        transaction,
        getQueryInterface: () => ({ bulkInsert, bulkUpdate }),
        __bulkInsert: bulkInsert,
        __bulkUpdate: bulkUpdate
    };
}

function buildAvailmentEntry(overrides = {}, contextOverrides = {}) {
    return {
        legacy_tenant_id: 'tenant-uuid-1',
        ...mapPosTransactionToAvailment(legacyFullPosTransactionFixture(overrides), phase14ContextFixture(contextOverrides))
    };
}

describe('sales-history apply timestamp preservation', () => {
    test('inserted sales headers preserve mapper-supplied historical timestamps instead of migration-time defaults', async () => {
        const metaSequelize = createFakeSqlSequelize();
        const targetSequelize = createFakeSqlSequelize();
        const entry = buildAvailmentEntry({
            created_at: '2026-07-10T08:00:00.000Z',
            updated_at: '2026-07-10T08:15:00.000Z'
        });

        await writeMappedTargetRow({ metaSequelize, targetSequelize, runScope: DEFAULT_RUN_SCOPE, entry });

        expect(targetSequelize.tables.availments).toHaveLength(1);
        expect(targetSequelize.tables.availments[0].created_at).toBe('2026-07-10T08:00:00.000Z');
        expect(targetSequelize.tables.availments[0].updated_at).toBe('2026-07-10T08:15:00.000Z');
        expect(targetSequelize.tables.availments[0].finalized_at).toBe('2026-07-10T08:00:00.000Z');
    });

    test('legacy mapper payloads without timestamps still receive created_at and updated_at defaults', async () => {
        const metaSequelize = createFakeSqlSequelize();
        const targetSequelize = createFakeSqlSequelize();
        const entry = {
            operation: 'insert',
            entity_type: 'staff_account',
            target_table: 'staff_accounts',
            target_database: 'dgfy_business_alpha',
            target_payload: { email: 'cashier@example.test', display_name: 'cashier', status: 'active', is_master_admin: false },
            legacy_id_map_key: { legacy_source: 'sku_tenant_1', legacy_table: 'users', legacy_id: '501' },
            findings: []
        };

        await writeMappedTargetRow({ metaSequelize, targetSequelize, runScope: DEFAULT_RUN_SCOPE, entry });

        expect(targetSequelize.tables.staff_accounts[0].created_at).toBeInstanceOf(Date);
        expect(targetSequelize.tables.staff_accounts[0].updated_at).toBeInstanceOf(Date);
    });
});

describe('sales-history apply current-state finding synchronization', () => {
    test('completed checkpoints still synchronize findings for newly scanned sales rows', async () => {
        const metaSequelize = createFakeSqlSequelize({
            data_checkpoints: [{
                run_scope: DEFAULT_RUN_SCOPE,
                legacy_tenant_id: 'tenant-uuid-1',
                entity_type: 'availment',
                status: 'completed'
            }]
        });
        const targetSequelize = createFakeSqlSequelize();
        const entry = buildAvailmentEntry({}, {
            resolvedTerminalId: null
        });

        await applyTenantEntityBatch({
            metaSequelize,
            targetSequelize,
            runScope: DEFAULT_RUN_SCOPE,
            legacyTenantId: 'tenant-uuid-1',
            entityType: 'availment',
            entries: [entry],
            dgfyDatabase: 'dgfy_business_alpha'
        });

        expect(metaSequelize.tables.data_quality_findings).toEqual(expect.arrayContaining([
            expect.objectContaining({
                run_scope: DEFAULT_RUN_SCOPE,
                legacy_tenant_id: 'tenant-uuid-1',
                entity_type: 'availment',
                legacy_table: 'pos_transactions',
                legacy_id: '9101',
                reason_code: 'sale_terminal_not_mapped',
                status: 'open'
            })
        ]));
    });

    test('retry over an existing mapped sale keeps persistent findings open and resolves only repaired reasons', async () => {
        const metaSequelize = createFakeSqlSequelize({
            legacy_id_map: [{
                run_scope: DEFAULT_RUN_SCOPE,
                legacy_source: 'sku_alpha',
                legacy_table: 'pos_transactions',
                legacy_id: '9101',
                dgfy_database: 'dgfy_business_alpha',
                dgfy_table: 'availments',
                dgfy_id: '7001'
            }],
            data_checkpoints: [{
                run_scope: DEFAULT_RUN_SCOPE,
                legacy_tenant_id: 'tenant-uuid-1',
                entity_type: 'availment',
                status: 'completed'
            }],
            data_quality_findings: [
                {
                    id: 1,
                    run_scope: DEFAULT_RUN_SCOPE,
                    legacy_tenant_id: 'tenant-uuid-1',
                    entity_type: 'availment',
                    legacy_table: 'pos_transactions',
                    legacy_id: '9101',
                    reason_code: 'sale_terminal_not_mapped',
                    status: 'open'
                },
                {
                    id: 2,
                    run_scope: DEFAULT_RUN_SCOPE,
                    legacy_tenant_id: 'tenant-uuid-1',
                    entity_type: 'availment',
                    legacy_table: 'pos_transactions',
                    legacy_id: '9101',
                    reason_code: 'sale_cashier_not_mapped',
                    status: 'open'
                }
            ]
        });
        const targetSequelize = createFakeSqlSequelize({
            availments: [{ id: 7001, source_reference: 'legacy_pos:INV-2026-0001' }]
        });
        const entry = buildAvailmentEntry({}, {
            resolvedTerminalId: null,
            resolvedCashierId: 77
        });

        await applyTenantEntityBatch({
            metaSequelize,
            targetSequelize,
            runScope: DEFAULT_RUN_SCOPE,
            legacyTenantId: 'tenant-uuid-1',
            entityType: 'availment',
            entries: [entry],
            dgfyDatabase: 'dgfy_business_alpha'
        });

        const terminalFinding = metaSequelize.tables.data_quality_findings.find((row) => row.reason_code === 'sale_terminal_not_mapped');
        const cashierFinding = metaSequelize.tables.data_quality_findings.find((row) => row.reason_code === 'sale_cashier_not_mapped');
        expect(terminalFinding.status).toBe('open');
        expect(cashierFinding.status).toBe('resolved');
        expect(targetSequelize.__bulkInsert).not.toHaveBeenCalled();
    });
});
