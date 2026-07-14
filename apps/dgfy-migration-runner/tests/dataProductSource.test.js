import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { jest } from '@jest/globals';
import { readLegacyProductSnapshot } from '../src/data/legacySource.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PRODUCT_TABLES = [
    'items',
    'item_nutrition',
    'item_allergens',
    'item_physical_properties',
    'item_shelf_life',
    'item_packaging',
    'item_quality_control',
    'item_regulatory_compliance',
    'item_cost_breakdown',
    'item_barcodes',
    'product_composition',
    'item_folders',
    'stock_movements',
    'item_location_stocks',
    'item_embeddings'
];

function buildFakeTenantSequelize(tableRows = {}) {
    const calls = [];
    const query = jest.fn(async (sql, options = {}) => {
        calls.push({ sql, options });
        const table = PRODUCT_TABLES.find((name) => sql === `SELECT * FROM ${name}`);
        return [tableRows[table] || []];
    });

    return { query, __calls: calls };
}

describe('readLegacyProductSnapshot', () => {
    test('reads product-domain tables and stitches item satellites by item_id', async () => {
        const tenantSequelize = buildFakeTenantSequelize({
            items: [
                { item_id: 401, name: 'House Blend Coffee' },
                { item_id: 402, name: 'Plain Mug' }
            ],
            item_nutrition: [{ item_id: 401, calories: 5 }],
            item_allergens: [{ item_id: 401, allergen: 'none' }],
            item_physical_properties: [{ item_id: 401, color: 'brown' }],
            item_shelf_life: [{ item_id: 401, unopened_shelf_life_days: 180 }],
            item_packaging: [{ item_id: 401, package_type: 'bag' }],
            item_quality_control: [{ item_id: 401, inspection_required: true }],
            item_regulatory_compliance: [{ item_id: 401, fda_registration_number: 'FDA-123' }],
            item_cost_breakdown: [{ item_id: 401, beans: '90.00' }],
            item_barcodes: [
                { barcode_id: 1, item_id: 401, barcode: 'ABC' },
                { barcode_id: 2, item_id: 401, barcode: 'DEF' }
            ],
            product_composition: [
                { composition_id: 7001, product_id: 401, ingredient_id: 402, quantity: '1.25' },
                { composition_id: 7002, product_id: 402, ingredient_id: 401, quantity: '0.50' }
            ],
            item_folders: [{ folder_id: 301, name: 'Pantry' }],
            stock_movements: [{ movement_id: 8001, item_id: 401 }],
            item_location_stocks: [
                { item_id: 401, location_id: 1, quantity_on_hand: '2.5' },
                { item_id: 401, location_id: 2, quantity_on_hand: '3.5' }
            ],
            item_embeddings: [{ embedding_id: 9001, item_id: 401, vector: '[0.1,0.2]' }]
        });

        const snapshot = await readLegacyProductSnapshot(tenantSequelize);

        expect(snapshot.itemFolders).toEqual([{ folder_id: 301, name: 'Pantry' }]);
        expect(snapshot.stockMovements).toEqual([{ movement_id: 8001, item_id: 401 }]);
        expect(snapshot.itemEmbeddings).toEqual([{ embedding_id: 9001, item_id: 401, vector: '[0.1,0.2]' }]);

        expect(snapshot.items[0]).toMatchObject({
            item_id: 401,
            nutrition: { item_id: 401, calories: 5 },
            physicalProperties: { item_id: 401, color: 'brown' },
            shelfLife: { item_id: 401, unopened_shelf_life_days: 180 },
            packaging: { item_id: 401, package_type: 'bag' },
            qualityControl: { item_id: 401, inspection_required: true },
            regulatoryCompliance: { item_id: 401, fda_registration_number: 'FDA-123' },
            costBreakdown: { item_id: 401, beans: '90.00' }
        });
        expect(snapshot.items[0].allergens).toEqual([{ item_id: 401, allergen: 'none' }]);
        expect(snapshot.items[0].barcodes).toEqual([
            { barcode_id: 1, item_id: 401, barcode: 'ABC' },
            { barcode_id: 2, item_id: 401, barcode: 'DEF' }
        ]);
        expect(snapshot.items[0].itemLocationStocks).toEqual([
            { item_id: 401, location_id: 1, quantity_on_hand: '2.5' },
            { item_id: 401, location_id: 2, quantity_on_hand: '3.5' }
        ]);
        expect(snapshot.items[0].productCompositions).toEqual([
            { composition_id: 7001, product_id: 401, ingredient_id: 402, quantity: '1.25' }
        ]);

        expect(snapshot.items[1].nutrition).toBeUndefined();
        expect(snapshot.items[1].barcodes).toEqual([]);
        expect(snapshot.items[1].itemLocationStocks).toEqual([]);
        expect(snapshot.items[1].productCompositions).toEqual([
            { composition_id: 7002, product_id: 402, ingredient_id: 401, quantity: '0.50' }
        ]);
    });

    test('issues literal table SELECTs with no interpolated legacy values', async () => {
        const tenantSequelize = buildFakeTenantSequelize();

        await readLegacyProductSnapshot(tenantSequelize);

        expect(tenantSequelize.__calls.map((call) => call.sql)).toEqual(
            PRODUCT_TABLES.map((table) => `SELECT * FROM ${table}`)
        );
        expect(tenantSequelize.__calls).toHaveLength(PRODUCT_TABLES.length);
        ['item_location_stocks', 'item_embeddings', 'stock_movements', 'item_folders'].forEach((table) => {
            expect(tenantSequelize.__calls.some((call) => call.sql === `SELECT * FROM ${table}`)).toBe(true);
        });
        tenantSequelize.__calls.forEach((call) => {
            expect(call.sql).not.toContain('${');
            expect(call.options).toEqual({});
        });
    });

    test('legacySource keeps the migration runner isolated from backend runtime modules', () => {
        const source = readFileSync(join(__dirname, '..', 'src', 'data', 'legacySource.js'), 'utf8');

        expect(source.match(/from ['"][^'"]*backend\/src[^'"]*['"]/g) || []).toHaveLength(0);
        expect(source).not.toContain('backend/');
    });
});
