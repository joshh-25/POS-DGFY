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

const { buildDryRunPlan, runDryRunTransformations, DEFAULT_RUN_SCOPE } = await import('../src/data/dryRun.js');

const target = {
    legacy_tenant_id: 'tenant-uuid-1',
    legacy_tenant_db_name: 'sku_tenant_1',
    target_business_db_name: 'dgfy_business_alpha',
    expected_business_id: 'biz-uuid-1',
    expected_owner_account_id: 'acct-uuid-1'
};

function buildProductSnapshot() {
    return {
        itemFolders: [
            { folder_id: 10, name: 'Pantry', description: 'Stocked items', parent_id: null }
        ],
        items: [
            {
                item_id: 100,
                folder_id: 10,
                name: 'Folder Product',
                current_stock: '9.000000000000',
                sku_code: 'FOLDER-100',
                unit_of_measure: 'pc',
                cost_per_unit: '12.5000',
                itemLocationStocks: [
                    { item_id: 100, location_id: 1, quantity_on_hand: '4.000000000000' },
                    { item_id: 100, location_id: 2, quantity_on_hand: '5.000000000000' }
                ],
                productCompositions: []
            },
            {
                item_id: 200,
                folder_id: null,
                name: 'Loose Product',
                current_stock: '5.000000000000',
                sku_code: 'LOOSE-200',
                unit_of_measure: 'pc',
                cost_per_unit: '3.0000',
                itemLocationStocks: [],
                productCompositions: []
            }
        ],
        stockMovements: [
            { movement_id: 500, item_id: 100, movement_type: 'purchase_receipt', quantity: '3.000000000000' },
            { movement_id: 501, item_id: 100, movement_type: 'transfer', quantity: '1.000000000000' }
        ],
        itemEmbeddings: [
            { embedding_id: 900, item_id: 100, vector: '[0.1,0.2,0.3]' }
        ]
    };
}

function buildFakeLandlordSequelize() {
    return {
        query: jest.fn(async (sql) => {
            if (sql.includes('FROM tenants')) {
                return [[{
                    id: target.legacy_tenant_id,
                    name: 'Cafe Alpha',
                    owner_dgfy_account_id: target.expected_owner_account_id,
                    status: 'active'
                }]];
            }
            if (sql.includes('FROM dgfy_account_tenant_memberships')) return [[]];
            if (sql.includes('FROM dgfy_accounts')) return [[]];
            return [[]];
        })
    };
}

function buildFakeTenantSequelize(snapshot = buildProductSnapshot()) {
    const tableMap = {
        users: [],
        tenant_locations: [],
        user_location_grants: [],
        system_settings: [],
        items: snapshot.items,
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
        item_folders: snapshot.itemFolders,
        stock_movements: snapshot.stockMovements,
        item_location_stocks: snapshot.items.flatMap((item) => item.itemLocationStocks || []),
        item_embeddings: snapshot.itemEmbeddings
    };

    return {
        query: jest.fn(async (sql) => {
            if (sql.includes('FROM system_settings')) return [[]];
            const match = sql.match(/^SELECT \* FROM (\w+)$/);
            return [match ? tableMap[match[1]] || [] : []];
        })
    };
}

function buildFakeMetaSequelize({ existingIdMapRows = [] } = {}) {
    const insertedFindings = [];
    return {
        query: jest.fn(async (sql, options = {}) => {
            if (sql.includes('FROM legacy_id_map')) {
                const [runScope] = options.replacements;
                return [existingIdMapRows.filter((row) => row.run_scope === runScope)];
            }
            return [[]];
        }),
        getQueryInterface: () => ({
            bulkInsert: jest.fn(async (tableName, rows) => {
                if (tableName === 'data_quality_findings') {
                    insertedFindings.push(...rows);
                }
            }),
            bulkUpdate: jest.fn()
        }),
        __insertedFindings: insertedFindings
    };
}

function indexOfEntry(entries, predicate) {
    return entries.findIndex(predicate);
}

describe('product-domain dry-run planning', () => {
    test('plans folders before products, products before movements/embeddings, and reclassifies mapped product-domain rows', () => {
        const productSnapshot = buildProductSnapshot();
        const entries = buildDryRunPlan({
            targets: [target],
            landlordSnapshot: {
                tenants: [{ id: target.legacy_tenant_id, name: 'Cafe Alpha', owner_dgfy_account_id: target.expected_owner_account_id }],
                accounts: [],
                memberships: []
            },
            tenantSnapshots: new Map([[target.legacy_tenant_id, {
                users: [],
                locations: [],
                terminalRegistry: [],
                productSnapshot
            }]]),
            resolvedIdMap: new Map([
                ['sku_tenant_1|item_folders|10', '77'],
                ['sku_tenant_1|items|100', '8801']
            ])
        });

        const folderIndex = indexOfEntry(entries, (entry) => entry.entity_type === 'product_folder');
        const productIndex = indexOfEntry(entries, (entry) => entry.entity_type === 'product' && entry.legacy_id_map_key?.legacy_id === '100');
        const movementIndex = indexOfEntry(entries, (entry) => entry.entity_type === 'inventory_movement' && entry.legacy_id_map_key?.legacy_table === 'stock_movements');
        const openingBalanceIndex = indexOfEntry(entries, (entry) => entry.entity_type === 'inventory_movement' && entry.legacy_id_map_key?.legacy_table === 'item_location_stocks');
        const embeddingIndex = indexOfEntry(entries, (entry) => entry.entity_type === 'product_embedding');

        expect(folderIndex).toBeGreaterThanOrEqual(0);
        expect(folderIndex).toBeLessThan(productIndex);
        expect(productIndex).toBeLessThan(movementIndex);
        expect(productIndex).toBeLessThan(openingBalanceIndex);
        expect(productIndex).toBeLessThan(embeddingIndex);

        const productEntry = entries[productIndex];
        expect(productEntry.operation).toBe('update');
        expect(productEntry.target_payload.folder_id).toBe('77');

        const folderEntry = entries[folderIndex];
        expect(folderEntry.operation).toBe('update');

        const movementEntry = entries[movementIndex];
        expect(movementEntry.target_payload.product_id).toBe('8801');

        const transferEntry = entries.find((entry) => entry.legacy_id_map_key?.legacy_table === 'stock_movements' && entry.legacy_id_map_key.legacy_id === '501');
        expect(transferEntry.operation).toBe('skip');
        expect(transferEntry.findings[0].reason_code).toBe('lossy_category_collapse');
    });

    test('runDryRunTransformations reads product snapshots and persists product-domain findings before returning', async () => {
        mockCreateSourceConnection.mockReset().mockReturnValue(buildFakeLandlordSequelize());
        mockCreateLegacyTenantSourceConnection.mockReset().mockReturnValue(buildFakeTenantSequelize());
        const metaSequelize = buildFakeMetaSequelize();

        const result = await runDryRunTransformations({
            config: { sourceDb: {}, targetDb: {}, runtimeMode: 'development' },
            metaSequelize,
            targets: [target],
            runScope: DEFAULT_RUN_SCOPE
        });

        expect(result.entries.some((entry) => entry.entity_type === 'product_folder')).toBe(true);
        expect(result.entries.some((entry) => entry.entity_type === 'product')).toBe(true);
        expect(result.entries.some((entry) => entry.entity_type === 'product_embedding')).toBe(true);
        expect(result.entries.some((entry) => entry.entity_type === 'inventory_movement')).toBe(true);
        expect(metaSequelize.__insertedFindings).toEqual(expect.arrayContaining([
            expect.objectContaining({
                entity_type: 'inventory_movement',
                legacy_table: 'stock_movements',
                legacy_id: '501',
                reason_code: 'lossy_category_collapse'
            })
        ]));
    });
});
