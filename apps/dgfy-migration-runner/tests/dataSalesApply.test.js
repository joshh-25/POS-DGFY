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

const applyModule = await import('../src/data/apply.js');
const {
    applyTenantEntityBatch,
    runApplyTransformations,
    writeMappedTargetRow
} = applyModule;
const { DEFAULT_RUN_SCOPE } = await import('../src/data/dryRun.js');
const {
    legacyFullPosTransactionFixture,
    legacyVoidedPosTransactionFixture,
    legacyFullPosTransactionLineFixture,
    phase14ContextFixture
} = await import('./fixtures/phase14/legacySalesRecords.js');
const { mapPosTransactionLineToAvailmentItem, mapPosTransactionToAvailment } = await import('../src/data/mappings.js');

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

const target = {
    legacy_tenant_id: 'tenant-uuid-1',
    legacy_tenant_db_name: 'sku_tenant_1',
    target_business_db_name: 'dgfy_business_alpha',
    expected_business_id: 'biz-uuid-1',
    expected_owner_account_id: 'acct-uuid-1'
};

function buildFakeLandlordSequelize({ close = jest.fn() } = {}) {
    return {
        query: jest.fn(async (sql) => {
            if (sql.includes('FROM tenants')) {
                return [[{ id: target.legacy_tenant_id, name: 'Cafe Alpha', owner_dgfy_account_id: target.expected_owner_account_id, status: 'active' }]];
            }
            if (sql.includes('FROM dgfy_account_tenant_memberships')) return [[]];
            if (sql.includes('FROM dgfy_accounts')) return [[]];
            return [[]];
        }),
        close
    };
}

function buildFakeTenantSequelize({ salesSnapshot = buildSalesSnapshot(), throwOnSalesRead = false, close = jest.fn() } = {}) {
    const tableMap = {
        users: [{
            user_id: 501,
            email: 'cashier@example.test',
            username: 'cashier',
            password_hash: '$2b$12$abcdefghijklmnopqrstuu',
            is_active: true
        }],
        tenant_locations: [{ location_id: 701, name: 'Main Branch', address_line: '123 Main St', is_active: true }],
        user_location_grants: [],
        system_settings: [{
            setting_key: 'pos_terminal_registry',
            setting_value: JSON.stringify([{ terminal_id: 'TERMINAL-01', label: 'Front POS', location_id: 701, is_active: true }])
        }],
        items: [{
            item_id: 401,
            folder_id: null,
            name: 'House Blend Coffee',
            current_stock: '9.000000000000',
            sku_code: 'COFFEE-401',
            unit_of_measure: 'cup',
            cost_per_unit: '55.0000'
        }],
        item_nutrition: [],
        item_allergens: [],
        item_physical_properties: [],
        item_shelf_life: [],
        item_packaging: [],
        item_quality_control: [],
        item_regulatory_compliance: [],
        item_cost_breakdown: [],
        item_barcodes: [],
        product_composition: [],
        item_folders: [],
        stock_movements: [],
        item_location_stocks: [],
        item_embeddings: [],
        pos_transactions: salesSnapshot.posTransactions,
        pos_transaction_lines: salesSnapshot.posTransactionLines
    };

    return {
        query: jest.fn(async (sql) => {
            if (throwOnSalesRead && sql.includes('FROM pos_transactions')) {
                throw new Error('sales read failed');
            }
            if (sql.includes('FROM system_settings')) return [[tableMap.system_settings[0]]];
            const match = sql.match(/^SELECT \* FROM (\w+)$/);
            return [match ? tableMap[match[1]] || [] : []];
        }),
        close
    };
}

function buildSalesSnapshot() {
    return {
        posTransactions: [
            legacyFullPosTransactionFixture(),
            legacyVoidedPosTransactionFixture()
        ],
        posTransactionLines: [
            legacyFullPosTransactionLineFixture({ line_id: 9201, pos_transaction_id: 9101, item_id: 401 }),
            legacyFullPosTransactionLineFixture({ line_id: 9202, pos_transaction_id: 9102, item_id: 401, quantity: '2.000000000000' })
        ]
    };
}

function setupApplyRun({ metaSequelize = createFakeSqlSequelize(), businessSequelize = createFakeSqlSequelize(), tenantSequelize = buildFakeTenantSequelize(), landlordSequelize = buildFakeLandlordSequelize() } = {}) {
    const coreSequelize = createFakeSqlSequelize();

    mockCreateSourceConnection.mockReset().mockReturnValue(landlordSequelize);
    mockCreateLegacyTenantSourceConnection.mockReset().mockReturnValue(tenantSequelize);
    mockCreateBusinessTargetConnection.mockReset().mockReturnValue(businessSequelize);

    return { coreSequelize, metaSequelize, businessSequelize, tenantSequelize, landlordSequelize };
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

describe('sales-history apply orchestration', () => {
    test('refuses to apply sales until all four Phase 13 product-domain checkpoints are complete', async () => {
        const metaSequelize = createFakeSqlSequelize({
            data_checkpoints: [{
                run_scope: DEFAULT_RUN_SCOPE,
                legacy_tenant_id: target.legacy_tenant_id,
                entity_type: 'product_folder',
                status: 'completed'
            }]
        });

        expect(typeof applyModule.assertSalesPrerequisiteCheckpoints).toBe('function');
        await expect(applyModule.assertSalesPrerequisiteCheckpoints(metaSequelize, {
            runScope: DEFAULT_RUN_SCOPE,
            legacyTenantId: target.legacy_tenant_id
        })).rejects.toThrow(/product.*inventory_movement.*product_embedding/);
    });

    test('applies headers before lines with resolved parent and product ids, preserving normal and void payloads', async () => {
        const { coreSequelize, metaSequelize, businessSequelize } = setupApplyRun();

        const result = await runApplyTransformations({
            config: { sourceDb: {}, targetDb: {}, runtimeMode: 'development' },
            metaSequelize,
            coreSequelize,
            targets: [target],
            runScope: DEFAULT_RUN_SCOPE
        });

        expect(result.summary.rows_written).toBeGreaterThanOrEqual(2);
        expect(businessSequelize.tables.availments).toHaveLength(2);
        expect(businessSequelize.tables.availment_items).toHaveLength(2);

        const normalHeader = businessSequelize.tables.availments.find((row) => row.source_reference === 'legacy_pos:INV-2026-0001');
        const voidHeader = businessSequelize.tables.availments.find((row) => row.source_reference === 'legacy_pos:INV-2026-0002');
        expect(normalHeader).toEqual(expect.objectContaining({
            business_id: target.expected_business_id,
            branch_id: 1,
            terminal_id: 1,
            cashier_account_id: 1,
            status: 'finalized',
            source_system: 'legacy_migration',
            created_at: '2026-07-10T08:00:00.000Z'
        }));
        expect(voidHeader.status).toBe('voided');
        expect(JSON.parse(voidHeader.legacy_snapshot).legacy_pos.void_reason).toBe('Customer requested cancellation');

        const product = businessSequelize.tables.products[0];
        const normalLine = businessSequelize.tables.availment_items.find((row) => row.source_reference === 'legacy_pos_line:9201');
        expect(normalLine).toEqual(expect.objectContaining({
            availment_id: normalHeader.id,
            product_id: product.id,
            product_name: 'House Blend Coffee',
            source_system: 'legacy_migration',
            created_at: '2026-07-10T08:00:05.000Z'
        }));
        expect(normalLine.availment_id).not.toBe(9101);
        expect(normalLine.product_id).not.toBe(401);

        const insertOrder = businessSequelize.__bulkInsert.mock.calls.map(([tableName]) => tableName);
        expect(insertOrder.indexOf('availments')).toBeLessThan(insertOrder.indexOf('availment_items'));
    });

    test('sales natural keys recover target-first headers and lines without duplicate inserts', async () => {
        const metaSequelize = createFakeSqlSequelize();
        const targetSequelize = createFakeSqlSequelize({
            availments: [{ id: 3001, source_reference: 'legacy_pos:INV-2026-0001' }],
            availment_items: [{ id: 4001, source_reference: 'legacy_pos_line:9201' }]
        });
        const headerEntry = buildAvailmentEntry();
        const lineEntry = {
            legacy_tenant_id: 'tenant-uuid-1',
            ...mapPosTransactionLineToAvailmentItem(
                legacyFullPosTransactionLineFixture({ line_id: 9201, pos_transaction_id: 9101, item_id: 401 }),
                phase14ContextFixture({ resolvedAvailmentId: 3001, resolvedProductId: 2001 })
            )
        };

        const headerResult = await writeMappedTargetRow({ metaSequelize, targetSequelize, runScope: DEFAULT_RUN_SCOPE, entry: headerEntry });
        const lineResult = await writeMappedTargetRow({ metaSequelize, targetSequelize, runScope: DEFAULT_RUN_SCOPE, entry: lineEntry });

        expect(headerResult).toEqual({ status: 'reconciled', dgfyId: 3001 });
        expect(lineResult).toEqual({ status: 'reconciled', dgfyId: 4001 });
        expect(targetSequelize.tables.availments).toHaveLength(1);
        expect(targetSequelize.tables.availment_items).toHaveLength(1);
        expect(metaSequelize.tables.legacy_id_map).toEqual(expect.arrayContaining([
            expect.objectContaining({ legacy_table: 'pos_transactions', legacy_id: '9101', dgfy_id: '3001' }),
            expect.objectContaining({ legacy_table: 'pos_transaction_lines', legacy_id: '9201', dgfy_id: '4001' })
        ]));
    });

    test('completed sales checkpoints still discover a new row on retry without rewriting existing sales', async () => {
        const firstRun = setupApplyRun();
        await runApplyTransformations({
            config: { sourceDb: {}, targetDb: {}, runtimeMode: 'development' },
            metaSequelize: firstRun.metaSequelize,
            coreSequelize: firstRun.coreSequelize,
            targets: [target],
            runScope: DEFAULT_RUN_SCOPE
        });

        const retrySalesSnapshot = buildSalesSnapshot();
        retrySalesSnapshot.posTransactions.push(legacyFullPosTransactionFixture({
            pos_transaction_id: 9105,
            invoice_number: 'INV-2026-0005'
        }));
        retrySalesSnapshot.posTransactionLines.push(legacyFullPosTransactionLineFixture({
            line_id: 9205,
            pos_transaction_id: 9105,
            item_id: 401
        }));
        const retryTenantSequelize = buildFakeTenantSequelize({ salesSnapshot: retrySalesSnapshot });
        const retryCoreSequelize = firstRun.coreSequelize;
        mockCreateSourceConnection.mockReset().mockReturnValue(buildFakeLandlordSequelize());
        mockCreateLegacyTenantSourceConnection.mockReset().mockReturnValue(retryTenantSequelize);
        mockCreateBusinessTargetConnection.mockReset().mockReturnValue(firstRun.businessSequelize);
        firstRun.businessSequelize.__bulkInsert.mockClear();

        await runApplyTransformations({
            config: { sourceDb: {}, targetDb: {}, runtimeMode: 'development' },
            metaSequelize: firstRun.metaSequelize,
            coreSequelize: retryCoreSequelize,
            targets: [target],
            runScope: DEFAULT_RUN_SCOPE
        });

        expect(firstRun.businessSequelize.tables.availments).toHaveLength(3);
        expect(firstRun.businessSequelize.tables.availment_items).toHaveLength(3);
        expect(firstRun.businessSequelize.__bulkInsert.mock.calls.filter(([table]) => table === 'availments')).toHaveLength(1);
        expect(firstRun.businessSequelize.__bulkInsert.mock.calls.filter(([table]) => table === 'availment_items')).toHaveLength(1);
    });

    test('closes creator-owned landlord, tenant, and business connections on success and failure', async () => {
        const successLandlordClose = jest.fn();
        const successTenantClose = jest.fn();
        const successBusinessClose = jest.fn();
        const successRun = setupApplyRun({
            landlordSequelize: buildFakeLandlordSequelize({ close: successLandlordClose }),
            tenantSequelize: buildFakeTenantSequelize({ close: successTenantClose }),
            businessSequelize: createFakeSqlSequelize()
        });
        successRun.businessSequelize.close = successBusinessClose;

        await runApplyTransformations({
            config: { sourceDb: {}, targetDb: {}, runtimeMode: 'development' },
            metaSequelize: successRun.metaSequelize,
            coreSequelize: successRun.coreSequelize,
            targets: [target],
            runScope: DEFAULT_RUN_SCOPE
        });

        expect(successLandlordClose).toHaveBeenCalledTimes(1);
        expect(successTenantClose).toHaveBeenCalledTimes(1);
        expect(successBusinessClose).toHaveBeenCalledTimes(1);

        const failureLandlordClose = jest.fn();
        const failureTenantClose = jest.fn();
        const failureBusinessClose = jest.fn();
        const failureRun = setupApplyRun({
            landlordSequelize: buildFakeLandlordSequelize({ close: failureLandlordClose }),
            tenantSequelize: buildFakeTenantSequelize({ throwOnSalesRead: true, close: failureTenantClose }),
            businessSequelize: createFakeSqlSequelize()
        });
        failureRun.businessSequelize.close = failureBusinessClose;

        await expect(runApplyTransformations({
            config: { sourceDb: {}, targetDb: {}, runtimeMode: 'development' },
            metaSequelize: failureRun.metaSequelize,
            coreSequelize: failureRun.coreSequelize,
            targets: [target],
            runScope: DEFAULT_RUN_SCOPE
        })).rejects.toThrow('sales read failed');

        expect(failureLandlordClose).toHaveBeenCalledTimes(1);
        expect(failureTenantClose).toHaveBeenCalledTimes(1);
        expect(failureBusinessClose).toHaveBeenCalledTimes(1);
    });
});
