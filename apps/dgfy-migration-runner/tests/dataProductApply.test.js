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

const { runApplyTransformations } = await import('../src/data/apply.js');
const { DEFAULT_RUN_SCOPE } = await import('../src/data/dryRun.js');

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
    const bulkInsertCalls = [];
    const updateCalls = [];

    function ensureTable(name) {
        if (!tables[name]) tables[name] = [];
        return tables[name];
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
            bulkInsertCalls.push({ tableName, row: { ...record } });
        });
    });

    const bulkUpdate = jest.fn(async (tableName, values, where) => {
        ensureTable(tableName).forEach((row) => {
            const matches = Object.keys(where).every((key) => String(row[key]) === String(where[key]));
            if (matches) Object.assign(row, values);
        });
    });

    const query = jest.fn(async (sql, options = {}) => {
        const replacements = Array.isArray(options.replacements)
            ? options.replacements
            : Object.values(options.replacements || {});

        if (/^SELECT LAST_INSERT_ID/.test(sql)) {
            return [[{ id: lastInsertId }]];
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

        if (sql === 'UPDATE products SET attributes = ?, updated_at = ? WHERE id = ?') {
            const [attributes, updatedAt, id] = replacements;
            updateCalls.push({ sql, replacements: [...replacements] });
            const product = ensureTable('products').find((row) => String(row.id) === String(id));
            if (product) {
                product.attributes = attributes;
                product.updated_at = updatedAt;
            }
            return [[], undefined];
        }

        return [[]];
    });

    const transaction = jest.fn(async (callback) => callback({ __fakeTransaction: true }));

    return {
        tables,
        bulkInsertCalls,
        updateCalls,
        query,
        transaction,
        getQueryInterface: () => ({ bulkInsert, bulkUpdate }),
        __bulkInsert: bulkInsert,
        __bulkUpdate: bulkUpdate
    };
}

function buildFakeLandlordSequelize({ tenants = [], accounts = [], memberships = [] } = {}) {
    return {
        query: jest.fn(async (sql, options = {}) => {
            if (sql.includes('FROM tenants')) {
                return [tenants.filter((tenant) => options.replacements.tenantIds.includes(tenant.id))];
            }
            if (sql.includes('FROM dgfy_account_tenant_memberships')) {
                return [memberships.filter((membership) => options.replacements.tenantIds.includes(membership.tenant_id))];
            }
            if (sql.includes('FROM dgfy_accounts')) {
                return [accounts.filter((account) => options.replacements.accountIds.includes(account.id))];
            }
            return [[]];
        })
    };
}

function buildFakeTenantSequelize(snapshot = {}) {
    const tableMap = {
        users: snapshot.users || [],
        tenant_locations: snapshot.locations || [],
        user_location_grants: [],
        system_settings: [],
        items: snapshot.items || [],
        item_nutrition: snapshot.itemNutrition || [],
        item_allergens: snapshot.itemAllergens || [],
        item_physical_properties: snapshot.itemPhysicalProperties || [],
        item_shelf_life: snapshot.itemShelfLife || [],
        item_packaging: snapshot.itemPackaging || [],
        item_quality_control: snapshot.itemQualityControl || [],
        item_regulatory_compliance: snapshot.itemRegulatoryCompliance || [],
        item_cost_breakdown: snapshot.itemCostBreakdown || [],
        item_barcodes: snapshot.itemBarcodes || [],
        product_composition: snapshot.productComposition || [],
        item_folders: snapshot.itemFolders || [],
        stock_movements: snapshot.stockMovements || [],
        item_location_stocks: snapshot.itemLocationStocks || [],
        item_embeddings: snapshot.itemEmbeddings || []
    };

    return {
        query: jest.fn(async (sql) => {
            if (sql.includes('FROM system_settings')) return [[]];
            const match = sql.match(/^SELECT \* FROM (\w+)$/);
            return [match ? tableMap[match[1]] || [] : []];
        })
    };
}

const target = {
    legacy_tenant_id: 'tenant-uuid-1',
    legacy_tenant_db_name: 'sku_tenant_1',
    target_business_db_name: 'dgfy_business_alpha',
    expected_business_id: 'biz-uuid-1',
    expected_owner_account_id: 'acct-uuid-1'
};

function buildProductSnapshot() {
    return {
        itemFolders: [{ folder_id: 10, name: 'Pantry', description: 'Stocked items' }],
        items: [
            {
                item_id: 100,
                folder_id: 10,
                name: 'Finished Kit',
                current_stock: '9.000000000000',
                sku_code: 'KIT-100',
                unit_of_measure: 'pc',
                cost_per_unit: '12.5000'
            },
            {
                item_id: 200,
                folder_id: null,
                name: 'Ingredient Later',
                current_stock: '5.000000000000',
                sku_code: 'ING-200',
                unit_of_measure: 'kg',
                cost_per_unit: '3.0000'
            }
        ],
        itemBarcodes: [
            { barcode_id: 1, item_id: 100, barcode: '111111' },
            { barcode_id: 2, item_id: 100, barcode: '222222' }
        ],
        productComposition: [
            { composition_id: 1, product_id: 100, ingredient_id: 200, composition_type: 'ingredient', quantity_required: '2.500000000000', unit_of_measure: 'kg' },
            { composition_id: 2, product_id: 100, ingredient_id: 999, composition_type: 'ingredient', quantity_required: '1.000000000000', unit_of_measure: 'pc' }
        ],
        stockMovements: [
            { movement_id: 500, item_id: 100, movement_type: 'purchase_receipt', quantity: '3.000000000000' },
            { movement_id: 501, item_id: 100, movement_type: 'transfer', quantity: '1.000000000000' }
        ],
        itemLocationStocks: [
            { item_id: 100, location_id: 1, quantity_on_hand: '4.000000000000' },
            { item_id: 100, location_id: 2, quantity_on_hand: '5.000000000000' }
        ],
        itemEmbeddings: [
            { embedding_id: 900, item_id: 100, vector: '[0.1,0.2,0.3]' }
        ]
    };
}

function setupProductApply() {
    const landlordSequelize = buildFakeLandlordSequelize({
        tenants: [{ id: 'tenant-uuid-1', name: 'Cafe Alpha', owner_dgfy_account_id: 'acct-uuid-1', status: 'active' }]
    });
    const tenantSequelize = buildFakeTenantSequelize(buildProductSnapshot());
    const coreSequelize = createFakeSqlSequelize();
    const businessSequelize = createFakeSqlSequelize();
    const metaSequelize = createFakeSqlSequelize();

    mockCreateSourceConnection.mockReset().mockReturnValue(landlordSequelize);
    mockCreateLegacyTenantSourceConnection.mockReset().mockReturnValue(tenantSequelize);
    mockCreateBusinessTargetConnection.mockReset().mockReturnValue(businessSequelize);

    return { coreSequelize, businessSequelize, metaSequelize };
}

describe('product-domain apply pipeline', () => {
    test('migrates product folders, products, movements, opening balances, embeddings, and BOM attributes in dependency order', async () => {
        const { coreSequelize, businessSequelize, metaSequelize } = setupProductApply();

        await runApplyTransformations({
            config: { sourceDb: {}, targetDb: {}, runtimeMode: 'development' },
            metaSequelize,
            coreSequelize,
            targets: [target],
            runScope: DEFAULT_RUN_SCOPE
        });

        expect(businessSequelize.tables.product_folders).toHaveLength(1);
        expect(businessSequelize.tables.products).toHaveLength(2);

        const folder = businessSequelize.tables.product_folders[0];
        const product = businessSequelize.tables.products.find((row) => row.name === 'Finished Kit');
        const ingredient = businessSequelize.tables.products.find((row) => row.name === 'Ingredient Later');

        expect(product.folder_id).toBe(folder.id);
        expect(product.folder_id).not.toBe(10);
        expect(product.stock_count).toBe('9.000000000000');
        expect(typeof product.attributes).toBe('string');
        expect(JSON.parse(product.attributes).barcodes).toEqual([
            { barcode_id: 1, item_id: 100, barcode: '111111' },
            { barcode_id: 2, item_id: 100, barcode: '222222' }
        ]);

        const insertOrder = businessSequelize.bulkInsertCalls.map((call) => call.tableName);
        expect(insertOrder.indexOf('product_folders')).toBeLessThan(insertOrder.indexOf('products'));

        const movementRows = businessSequelize.tables.inventory_movements || [];
        expect(movementRows).toEqual(expect.arrayContaining([
            expect.objectContaining({
                product_id: product.id,
                movement_type: 'restock',
                quantity: '3.000000000000',
                reference_type: 'legacy_stock_movement',
                reference_id: '500'
            }),
            expect.objectContaining({
                product_id: product.id,
                movement_type: 'adjustment',
                quantity: '9.000000000000',
                reference_type: 'legacy_opening_balance',
                reference_id: '100'
            }),
            expect.objectContaining({
                product_id: ingredient.id,
                movement_type: 'adjustment',
                quantity: '5.000000000000',
                reference_type: 'legacy_opening_balance',
                reference_id: '200'
            })
        ]));
        expect(movementRows.some((row) => row.reference_id === '501')).toBe(false);
        movementRows.forEach((movement) => {
            expect(movement.created_at).toBeInstanceOf(Date);
            expect(Object.hasOwn(movement, 'updated_at')).toBe(false);
        });

        expect(businessSequelize.tables.product_embeddings).toEqual([
            expect.objectContaining({
                product_id: product.id,
                vector: '[0.1,0.2,0.3]',
                legacy_embedding_id: 900
            })
        ]);

        const updatedAttributes = JSON.parse(product.attributes);
        expect(updatedAttributes.composition).toEqual([
            {
                ingredient_product_id: ingredient.id,
                composition_type: 'ingredient',
                quantity_required: '2.500000000000',
                unit_of_measure: 'kg'
            }
        ]);

        expect(metaSequelize.tables.data_quality_findings).toEqual(expect.arrayContaining([
            expect.objectContaining({
                entity_type: 'product',
                legacy_table: 'product_composition',
                legacy_id: '999',
                severity: 'orphan',
                reason_code: 'unresolved_ingredient'
            }),
            expect.objectContaining({
                entity_type: 'inventory_movement',
                legacy_table: 'stock_movements',
                legacy_id: '501',
                severity: 'skip',
                reason_code: 'lossy_category_collapse'
            })
        ]));

        expect(businessSequelize.updateCalls).toHaveLength(1);
        expect(businessSequelize.updateCalls[0].sql).toBe('UPDATE products SET attributes = ?, updated_at = ? WHERE id = ?');
        expect(businessSequelize.updateCalls[0].sql).not.toContain('ingredient_product_id');
        expect(businessSequelize.updateCalls[0].replacements[0]).toContain('"composition"');
    });

    test('re-running product apply inserts no duplicate inventory movements and rewrites byte-identical BOM attributes', async () => {
        const { coreSequelize, businessSequelize, metaSequelize } = setupProductApply();

        await runApplyTransformations({
            config: { sourceDb: {}, targetDb: {}, runtimeMode: 'development' },
            metaSequelize,
            coreSequelize,
            targets: [target],
            runScope: DEFAULT_RUN_SCOPE
        });
        const product = businessSequelize.tables.products.find((row) => row.name === 'Finished Kit');
        const firstComposition = product.attributes;
        const firstMovementCount = businessSequelize.tables.inventory_movements.length;

        await runApplyTransformations({
            config: { sourceDb: {}, targetDb: {}, runtimeMode: 'development' },
            metaSequelize,
            coreSequelize,
            targets: [target],
            runScope: DEFAULT_RUN_SCOPE
        });

        expect(businessSequelize.tables.inventory_movements).toHaveLength(firstMovementCount);
        expect(product.attributes).toBe(firstComposition);
        expect(businessSequelize.updateCalls).toHaveLength(2);
        expect(businessSequelize.updateCalls[1].replacements[0]).toBe(firstComposition);
    });
});
