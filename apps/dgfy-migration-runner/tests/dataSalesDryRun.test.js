import { jest } from '@jest/globals';

const mockCreateSourceConnection = jest.fn();
const mockCreateLegacyTenantSourceConnection = jest.fn();

jest.unstable_mockModule('../src/config/db.js', () => ({
    createSourceConnection: mockCreateSourceConnection,
    createTargetConnection: jest.fn(),
    createMetaConnection: jest.fn(),
    createBusinessTargetConnection: jest.fn(),
    createLegacyTenantSourceConnection: mockCreateLegacyTenantSourceConnection
}));

const { buildDryRunPlan, runDryRunTransformations, DEFAULT_RUN_SCOPE, redactTargetPayload } = await import('../src/data/dryRun.js');
const {
    legacyFullPosTransactionFixture,
    legacyPosTransactionUnmappedAttributionFixture,
    legacyFullPosTransactionLineFixture,
    legacyPosTransactionLineMissingParentFixture,
    legacyPosTransactionLineMissingProductFixture
} = await import('./fixtures/phase14/legacySalesRecords.js');

const target = {
    legacy_tenant_id: 'tenant-uuid-1',
    legacy_tenant_db_name: 'sku_tenant_1',
    target_business_db_name: 'dgfy_business_alpha',
    expected_business_id: 'biz-uuid-1',
    expected_owner_account_id: 'acct-uuid-1'
};

function buildProductSnapshot() {
    return {
        itemFolders: [],
        items: [
            {
                item_id: 401,
                folder_id: null,
                name: 'House Blend Coffee',
                current_stock: '9.000000000000',
                sku_code: 'COFFEE-401',
                unit_of_measure: 'cup',
                cost_per_unit: '55.0000',
                itemLocationStocks: [],
                productCompositions: []
            }
        ],
        stockMovements: [],
        itemEmbeddings: []
    };
}

function buildSalesSnapshot(overrides = {}) {
    return {
        posTransactions: [legacyFullPosTransactionFixture()],
        posTransactionLines: [legacyFullPosTransactionLineFixture({ pos_transaction_id: 9101, item_id: 401 })],
        ...overrides
    };
}

function buildTenantSnapshot({ productSnapshot = buildProductSnapshot(), salesSnapshot = buildSalesSnapshot() } = {}) {
    return {
        users: [],
        locations: [],
        terminalRegistry: [],
        productSnapshot,
        salesSnapshot
    };
}

function indexOfEntry(entries, predicate) {
    return entries.findIndex(predicate);
}

describe('sales-history dry-run planning (buildDryRunPlan)', () => {
    test('orders the four Phase 13 product-domain entity types before availment, then availment_item', () => {
        const entries = buildDryRunPlan({
            targets: [target],
            landlordSnapshot: { tenants: [{ id: target.legacy_tenant_id, owner_dgfy_account_id: target.expected_owner_account_id }], accounts: [], memberships: [] },
            tenantSnapshots: new Map([[target.legacy_tenant_id, buildTenantSnapshot()]])
        });

        const productFolderIndex = indexOfEntry(entries, (entry) => entry.entity_type === 'product_folder');
        const productIndex = indexOfEntry(entries, (entry) => entry.entity_type === 'product');
        const inventoryMovementIndex = indexOfEntry(entries, (entry) => entry.entity_type === 'inventory_movement');
        const embeddingIndex = indexOfEntry(entries, (entry) => entry.entity_type === 'product_embedding');
        const availmentIndex = indexOfEntry(entries, (entry) => entry.entity_type === 'availment');
        const availmentItemIndex = indexOfEntry(entries, (entry) => entry.entity_type === 'availment_item');

        expect(productIndex).toBeGreaterThan(-1);
        expect(availmentIndex).toBeGreaterThan(-1);
        expect(availmentItemIndex).toBeGreaterThan(-1);

        [productFolderIndex, productIndex, inventoryMovementIndex, embeddingIndex].forEach((phase13Index) => {
            expect(phase13Index).toBeLessThan(availmentIndex);
        });
        expect(availmentIndex).toBeLessThan(availmentItemIndex);
    });

    test('clean target: a line whose header and product are both validly planned this pass is NOT falsely orphaned', () => {
        const entries = buildDryRunPlan({
            targets: [target],
            landlordSnapshot: { tenants: [{ id: target.legacy_tenant_id, owner_dgfy_account_id: target.expected_owner_account_id }], accounts: [], memberships: [] },
            tenantSnapshots: new Map([[target.legacy_tenant_id, buildTenantSnapshot()]]),
            resolvedIdMap: new Map() // clean target: nothing previously migrated
        });

        const availmentEntry = entries.find((entry) => entry.entity_type === 'availment');
        const lineEntry = entries.find((entry) => entry.entity_type === 'availment_item');

        expect(availmentEntry.operation).toBe('insert');
        expect(lineEntry.operation).toBe('insert');
        expect(lineEntry.findings).toEqual([]);
        // Pending dependency: the real dgfy id does not exist yet (dry-run
        // never writes), but the value is a distinguishable, non-blank
        // sentinel, never a fabricated real-looking id.
        expect(String(lineEntry.target_payload.availment_id)).toMatch(/^pending:/);
        expect(String(lineEntry.target_payload.product_id)).toMatch(/^pending:/);
    });

    test('retried dry-run: a line resolves real durable ids from legacy_id_map once header/product were already migrated', () => {
        const resolvedIdMap = new Map([
            ['sku_tenant_1|pos_transactions|9101', 'availment-uuid-resolved'],
            ['sku_tenant_1|items|401', 'product-uuid-resolved']
        ]);

        const entries = buildDryRunPlan({
            targets: [target],
            landlordSnapshot: { tenants: [{ id: target.legacy_tenant_id, owner_dgfy_account_id: target.expected_owner_account_id }], accounts: [], memberships: [] },
            tenantSnapshots: new Map([[target.legacy_tenant_id, buildTenantSnapshot()]]),
            resolvedIdMap
        });

        const availmentEntry = entries.find((entry) => entry.entity_type === 'availment');
        const lineEntry = entries.find((entry) => entry.entity_type === 'availment_item');

        expect(availmentEntry.operation).toBe('update');
        expect(lineEntry.operation).toBe('insert');
        expect(lineEntry.target_payload.availment_id).toBe('availment-uuid-resolved');
        expect(lineEntry.target_payload.product_id).toBe('product-uuid-resolved');
    });

    test('genuinely absent parent/product (not planned, not durable) remains a real blocking orphan', () => {
        const salesSnapshot = buildSalesSnapshot({
            posTransactionLines: [
                legacyPosTransactionLineMissingParentFixture({ item_id: 401 }),
                legacyPosTransactionLineMissingProductFixture({ pos_transaction_id: 9101 })
            ]
        });

        const entries = buildDryRunPlan({
            targets: [target],
            landlordSnapshot: { tenants: [{ id: target.legacy_tenant_id, owner_dgfy_account_id: target.expected_owner_account_id }], accounts: [], memberships: [] },
            tenantSnapshots: new Map([[target.legacy_tenant_id, buildTenantSnapshot({ salesSnapshot })]]),
            resolvedIdMap: new Map()
        });

        const lineEntries = entries.filter((entry) => entry.entity_type === 'availment_item');
        expect(lineEntries).toHaveLength(2);

        const missingParentEntry = lineEntries.find((entry) => entry.legacy_id_map_key.legacy_id === String(9202));
        expect(missingParentEntry.operation).toBe('skip');
        expect(missingParentEntry.findings[0].reason_code).toBe('availment_parent_not_mapped');

        const missingProductEntry = lineEntries.find((entry) => entry.legacy_id_map_key.legacy_id === String(9203));
        expect(missingProductEntry.operation).toBe('skip');
        expect(missingProductEntry.findings[0].reason_code).toBe('sale_product_not_mapped');
    });

    test('header attribution findings (location/terminal/cashier) stay non-blocking inserts, matching Phase 3 precedent', () => {
        const salesSnapshot = buildSalesSnapshot({ posTransactions: [legacyPosTransactionUnmappedAttributionFixture()] });

        const entries = buildDryRunPlan({
            targets: [target],
            landlordSnapshot: { tenants: [{ id: target.legacy_tenant_id, owner_dgfy_account_id: target.expected_owner_account_id }], accounts: [], memberships: [] },
            tenantSnapshots: new Map([[target.legacy_tenant_id, buildTenantSnapshot({ salesSnapshot })]])
        });

        const availmentEntry = entries.find((entry) => entry.entity_type === 'availment');
        expect(availmentEntry.operation).toBe('insert');
        const reasonCodes = availmentEntry.findings.map((finding) => finding.reason_code).sort();
        expect(reasonCodes).toEqual(['sale_cashier_not_mapped', 'sale_location_not_mapped', 'sale_terminal_not_mapped']);
    });
});

describe('sales-history dry-run report redaction (redactTargetPayload)', () => {
    test('replaces legacy_snapshot with presence + sorted key-name evidence only, never leaking seeded header values', () => {
        const entries = buildDryRunPlan({
            targets: [target],
            landlordSnapshot: { tenants: [{ id: target.legacy_tenant_id, owner_dgfy_account_id: target.expected_owner_account_id }], accounts: [], memberships: [] },
            tenantSnapshots: new Map([[target.legacy_tenant_id, buildTenantSnapshot()]])
        });

        const availmentEntry = entries.find((entry) => entry.entity_type === 'availment');
        const lineEntry = entries.find((entry) => entry.entity_type === 'availment_item');

        const redactedAvailment = redactTargetPayload(availmentEntry);
        const redactedLine = redactTargetPayload(lineEntry);
        const serialized = JSON.stringify([redactedAvailment, redactedLine]);

        // Seeded customer/payment/delivery/fiscal sentinel values from the
        // fixture — none of these literal values may survive serialization.
        [
            'Jane Buyer',
            '+639170000001',
            'jane.buyer@example.test',
            'PAYREF-9101',
            'https://pay.example.test/checkout/9101',
            '456 Delivery Ave, Quezon City',
            'fiscal-hash-9101',
            'No sugar'
        ].forEach((sentinelValue) => {
            expect(serialized).not.toContain(sentinelValue);
        });

        expect(redactedAvailment.target_payload.legacy_snapshot).toBeUndefined();
        expect(redactedAvailment.target_payload.has_legacy_snapshot).toBe(true);
        expect(redactedAvailment.target_payload.legacy_snapshot_keys).toEqual(
            [...redactedAvailment.target_payload.legacy_snapshot_keys].sort()
        );
        expect(redactedAvailment.target_payload.legacy_snapshot_keys).toEqual(
            expect.arrayContaining(['customer_name', 'payment_reference', 'delivery_address', 'fiscal_document_hash'])
        );

        expect(redactedLine.target_payload.legacy_snapshot).toBeUndefined();
        expect(redactedLine.target_payload.has_legacy_snapshot).toBe(true);
        expect(redactedLine.target_payload.legacy_snapshot_keys).toEqual(
            expect.arrayContaining(['fnb_special_instructions'])
        );
    });

    test('entries without a legacy_snapshot field are unaffected (no spurious redaction fields added)', () => {
        const redacted = redactTargetPayload({
            entity_type: 'location',
            target_table: 'locations',
            target_payload: { id: 'loc-1', name: 'Main Branch' }
        });

        expect(redacted.target_payload).toEqual({ id: 'loc-1', name: 'Main Branch' });
        expect(redacted.target_payload.has_legacy_snapshot).toBeUndefined();
        expect(redacted.target_payload.legacy_snapshot_keys).toBeUndefined();
    });
});

describe('runDryRunTransformations — sales snapshot wiring, current-state findings, and connection lifecycle', () => {
    function buildFakeLandlordSequelize({ close = jest.fn() } = {}) {
        return {
            query: jest.fn(async (sql) => {
                if (sql.includes('FROM tenants')) {
                    return [[{ id: target.legacy_tenant_id, owner_dgfy_account_id: target.expected_owner_account_id, status: 'active' }]];
                }
                return [[]];
            }),
            close
        };
    }

    function buildFakeTenantSequelize({
        productSnapshot = buildProductSnapshot(),
        salesSnapshot = buildSalesSnapshot(),
        tenantLocations = [],
        close = jest.fn(),
        throwOnQuery = null
    } = {}) {
        const tableMap = {
            users: [], tenant_locations: tenantLocations, user_location_grants: [], system_settings: [],
            items: productSnapshot.items,
            item_nutrition: [], item_allergens: [], item_physical_properties: [], item_shelf_life: [],
            item_packaging: [], item_quality_control: [], item_regulatory_compliance: [], item_cost_breakdown: [],
            item_barcodes: [], product_composition: [],
            item_folders: productSnapshot.itemFolders,
            stock_movements: productSnapshot.stockMovements,
            item_location_stocks: [],
            item_embeddings: productSnapshot.itemEmbeddings,
            pos_transactions: salesSnapshot.posTransactions,
            pos_transaction_lines: salesSnapshot.posTransactionLines
        };

        return {
            query: jest.fn(async (sql) => {
                if (throwOnQuery && sql.includes(throwOnQuery)) {
                    throw new Error(`injected failure for ${sql}`);
                }
                if (sql.includes('FROM system_settings')) return [[]];
                const match = sql.match(/^SELECT \* FROM (\w+)$/);
                return [match ? tableMap[match[1]] || [] : []];
            }),
            close
        };
    }

    function buildFakeMetaSequelize({ existingIdMapRows = [], existingFindingRows = [] } = {}) {
        let nextId = existingFindingRows.length + 1;
        const findingRows = existingFindingRows.map((row) => ({ status: 'open', ...row }));
        const insertedFindings = [];
        const updatedFindings = [];

        const query = jest.fn(async (sql, options = {}) => {
            if (sql.includes('FROM legacy_id_map')) {
                const [runScope] = options.replacements;
                return [existingIdMapRows.filter((row) => row.run_scope === runScope)];
            }
            if (sql.includes('FROM data_quality_findings')) {
                const [runScope, entityType, legacyTable, legacyId, legacyTenantId] = options.replacements;
                return [findingRows.filter((row) => row.run_scope === runScope
                    && row.entity_type === entityType
                    && (row.legacy_table ?? null) === (legacyTable ?? null)
                    && (row.legacy_id ?? null) === (legacyId ?? null)
                    && (row.legacy_tenant_id ?? null) === (legacyTenantId ?? null))];
            }
            return [[]];
        });

        const bulkInsert = jest.fn(async (tableName, rows) => {
            if (tableName !== 'data_quality_findings') return;
            rows.forEach((row) => {
                const stored = { id: nextId++, ...row };
                findingRows.push(stored);
                insertedFindings.push(stored);
            });
        });

        const bulkUpdate = jest.fn(async (tableName, values, where) => {
            if (tableName !== 'data_quality_findings') return;
            findingRows.forEach((row) => {
                const matches = Object.entries(where).every(([key, value]) => row[key] === value);
                if (matches) {
                    Object.assign(row, values);
                    updatedFindings.push({ where, values });
                }
            });
        });

        return {
            query,
            getQueryInterface: () => ({ bulkInsert, bulkUpdate }),
            __insertedFindings: insertedFindings,
            __updatedFindings: updatedFindings,
            __findingRows: findingRows
        };
    }

    test('reads pos_transactions/pos_transaction_lines via the tenant connection and plans both sales entity types', async () => {
        const landlordSequelize = buildFakeLandlordSequelize();
        const tenantSequelize = buildFakeTenantSequelize();
        mockCreateSourceConnection.mockReset().mockReturnValue(landlordSequelize);
        mockCreateLegacyTenantSourceConnection.mockReset().mockReturnValue(tenantSequelize);
        const metaSequelize = buildFakeMetaSequelize();

        const result = await runDryRunTransformations({
            config: { sourceDb: {}, targetDb: {}, runtimeMode: 'development' },
            metaSequelize,
            targets: [target],
            runScope: DEFAULT_RUN_SCOPE
        });

        expect(result.entries.some((entry) => entry.entity_type === 'availment')).toBe(true);
        expect(result.entries.some((entry) => entry.entity_type === 'availment_item')).toBe(true);
        expect(tenantSequelize.query.mock.calls.some((call) => call[0] === 'SELECT * FROM pos_transactions')).toBe(true);
        expect(tenantSequelize.query.mock.calls.some((call) => call[0] === 'SELECT * FROM pos_transaction_lines')).toBe(true);
    });

    test('never opens a dgfy_* target connection and never mutates target data (zero target mutations)', async () => {
        mockCreateSourceConnection.mockReset().mockReturnValue(buildFakeLandlordSequelize());
        mockCreateLegacyTenantSourceConnection.mockReset().mockReturnValue(buildFakeTenantSequelize());
        const metaSequelize = buildFakeMetaSequelize();

        await runDryRunTransformations({
            config: { sourceDb: {}, targetDb: {}, runtimeMode: 'development' },
            metaSequelize,
            targets: [target],
            runScope: DEFAULT_RUN_SCOPE
        });

        // No target/business connection factory is imported by dryRun.js at
        // all (structural contract test elsewhere); this test proves the
        // meta connection's own query interface is only ever asked to
        // bulkInsert/bulkUpdate data_quality_findings, never a dgfy_* table.
        const queryInterface = metaSequelize.getQueryInterface();
        queryInterface.bulkInsert.mock.calls.forEach((call) => {
            expect(call[0]).toBe('data_quality_findings');
        });
        queryInterface.bulkUpdate.mock.calls.forEach((call) => {
            expect(call[0]).toBe('data_quality_findings');
        });
    });

    test('current-state findings: a previously-open attribution finding resolves once this run resolves it, leaving a sibling still-open reason untouched', async () => {
        mockCreateSourceConnection.mockReset().mockReturnValue(buildFakeLandlordSequelize());
        // location_id 701 now has a real tenant_locations row in this run's
        // snapshot (a prior dry-run had none), so location attribution
        // resolves via the durable legacy_id_map seeded below — but
        // terminal_id "TERMINAL-01" still has no matching terminal registry
        // entry, so that finding must stay open.
        const productSnapshot = buildProductSnapshot();
        const salesSnapshot = buildSalesSnapshot();
        mockCreateLegacyTenantSourceConnection.mockReset().mockReturnValue(buildFakeTenantSequelize({
            productSnapshot,
            salesSnapshot,
            tenantLocations: [{ location_id: 701, name: 'Main Branch', address_line: '1 Main St' }]
        }));

        const metaSequelize = buildFakeMetaSequelize({
            existingIdMapRows: [{
                run_scope: DEFAULT_RUN_SCOPE,
                legacy_source: 'sku_tenant_1',
                legacy_table: 'tenant_locations',
                legacy_id: '701',
                dgfy_id: 'location-uuid-resolved'
            }],
            existingFindingRows: [
                {
                    run_scope: DEFAULT_RUN_SCOPE,
                    legacy_tenant_id: target.legacy_tenant_id,
                    entity_type: 'availment',
                    legacy_table: 'pos_transactions',
                    legacy_id: '9101',
                    reason_code: 'sale_location_not_mapped',
                    severity: 'orphan',
                    message: 'stale location finding'
                },
                {
                    run_scope: DEFAULT_RUN_SCOPE,
                    legacy_tenant_id: target.legacy_tenant_id,
                    entity_type: 'availment',
                    legacy_table: 'pos_transactions',
                    legacy_id: '9101',
                    reason_code: 'sale_terminal_not_mapped',
                    severity: 'orphan',
                    message: 'stale terminal finding'
                }
            ]
        });

        await runDryRunTransformations({
            config: { sourceDb: {}, targetDb: {}, runtimeMode: 'development' },
            metaSequelize,
            targets: [target],
            runScope: DEFAULT_RUN_SCOPE
        });

        const locationFinding = metaSequelize.__findingRows.find((row) => row.reason_code === 'sale_location_not_mapped');
        const terminalFinding = metaSequelize.__findingRows.find((row) => row.reason_code === 'sale_terminal_not_mapped');

        expect(locationFinding.status).toBe('resolved');
        expect(terminalFinding.status).toBe('open');
    });

    test('current-state findings: a reason no longer emitted this run is resolved via syncDataQualityFindings, not left stale forever', async () => {
        mockCreateSourceConnection.mockReset().mockReturnValue(buildFakeLandlordSequelize());
        // Header with no attribution at all -> mapper emits zero findings
        // this run for the availment entity.
        const cleanSalesSnapshot = buildSalesSnapshot({
            posTransactions: [legacyFullPosTransactionFixture({ location_id: null, terminal_id: null, cashier_id: null })]
        });
        mockCreateLegacyTenantSourceConnection.mockReset().mockReturnValue(buildFakeTenantSequelize({ salesSnapshot: cleanSalesSnapshot }));

        const metaSequelize = buildFakeMetaSequelize({
            existingFindingRows: [
                {
                    run_scope: DEFAULT_RUN_SCOPE,
                    legacy_tenant_id: target.legacy_tenant_id,
                    entity_type: 'availment',
                    legacy_table: 'pos_transactions',
                    legacy_id: '9101',
                    reason_code: 'sale_location_not_mapped',
                    severity: 'orphan',
                    message: 'stale, no longer applicable'
                }
            ]
        });

        await runDryRunTransformations({
            config: { sourceDb: {}, targetDb: {}, runtimeMode: 'development' },
            metaSequelize,
            targets: [target],
            runScope: DEFAULT_RUN_SCOPE
        });

        const resolvedRow = metaSequelize.__findingRows.find((row) => row.reason_code === 'sale_location_not_mapped');
        expect(resolvedRow.status).toBe('resolved');
    });

    test('closes the landlord and every tenant connection in finally on success', async () => {
        const landlordClose = jest.fn();
        const tenantClose = jest.fn();
        mockCreateSourceConnection.mockReset().mockReturnValue(buildFakeLandlordSequelize({ close: landlordClose }));
        mockCreateLegacyTenantSourceConnection.mockReset().mockReturnValue(buildFakeTenantSequelize({ close: tenantClose }));
        const metaSequelize = buildFakeMetaSequelize();

        await runDryRunTransformations({
            config: { sourceDb: {}, targetDb: {}, runtimeMode: 'development' },
            metaSequelize,
            targets: [target],
            runScope: DEFAULT_RUN_SCOPE
        });

        expect(landlordClose).toHaveBeenCalledTimes(1);
        expect(tenantClose).toHaveBeenCalledTimes(1);
    });

    test('closes the landlord and any already-opened tenant connection in finally even when a tenant read throws', async () => {
        const landlordClose = jest.fn();
        const tenantClose = jest.fn();
        mockCreateSourceConnection.mockReset().mockReturnValue(buildFakeLandlordSequelize({ close: landlordClose }));
        mockCreateLegacyTenantSourceConnection.mockReset().mockReturnValue(
            buildFakeTenantSequelize({ close: tenantClose, throwOnQuery: 'FROM pos_transactions' })
        );
        const metaSequelize = buildFakeMetaSequelize();

        await expect(runDryRunTransformations({
            config: { sourceDb: {}, targetDb: {}, runtimeMode: 'development' },
            metaSequelize,
            targets: [target],
            runScope: DEFAULT_RUN_SCOPE
        })).rejects.toThrow('injected failure');

        expect(landlordClose).toHaveBeenCalledTimes(1);
        expect(tenantClose).toHaveBeenCalledTimes(1);
    });

    test('closes the landlord connection in finally even when the landlord read itself throws (no tenant connection ever opened)', async () => {
        const landlordClose = jest.fn();
        const failingLandlordSequelize = {
            query: jest.fn(async () => {
                throw new Error('injected landlord failure');
            }),
            close: landlordClose
        };
        const tenantClose = jest.fn();
        mockCreateSourceConnection.mockReset().mockReturnValue(failingLandlordSequelize);
        mockCreateLegacyTenantSourceConnection.mockReset().mockReturnValue(buildFakeTenantSequelize({ close: tenantClose }));
        const metaSequelize = buildFakeMetaSequelize();

        await expect(runDryRunTransformations({
            config: { sourceDb: {}, targetDb: {}, runtimeMode: 'development' },
            metaSequelize,
            targets: [target],
            runScope: DEFAULT_RUN_SCOPE
        })).rejects.toThrow('injected landlord failure');

        expect(landlordClose).toHaveBeenCalledTimes(1);
        expect(tenantClose).not.toHaveBeenCalled();
    });
});
