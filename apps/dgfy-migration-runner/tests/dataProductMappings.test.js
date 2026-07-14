import {
    MAPPING_REASON_CODES,
    mapItemFolderToProductFolder,
    mapItemToProduct
} from '../src/data/mappings.js';
import {
    phase13ContextFixture,
    legacyFullItemFixture,
    legacyMinimalItemFixture,
    legacyItemMissingNameFixture,
    legacyItemFolderFixture,
    legacyItemFolderWithParentFixture,
    legacyItemFolderMissingNameFixture
} from './fixtures/phase13/legacyProductRecords.js';

describe('Phase 13 product folder mappings', () => {
    test('maps a legacy folder to a flat active product_folder insert', () => {
        const result = mapItemFolderToProductFolder(
            legacyItemFolderFixture(),
            phase13ContextFixture()
        );

        expect(result.operation).toBe('insert');
        expect(result.entity_type).toBe('product_folder');
        expect(result.target_table).toBe('product_folders');
        expect(result.target_database).toBe('dgfy_business_alpha');
        expect(result.target_payload).toEqual({
            business_id: 'biz-uuid-1',
            name: 'Pantry Goods',
            description: 'Shelf-stable products',
            show_in_pos_filter: true,
            is_active: true
        });
        expect(result.legacy_id_map_key).toEqual({
            legacy_source: 'sku_alpha',
            legacy_table: 'item_folders',
            legacy_id: '301'
        });
        expect(result.findings).toEqual([]);
    });

    test('flattens nested folders with an informational finding while still inserting the row', () => {
        const result = mapItemFolderToProductFolder(
            legacyItemFolderWithParentFixture(),
            phase13ContextFixture()
        );

        expect(result.operation).toBe('insert');
        expect(result.target_payload.name).toBe('Nested Pantry');
        expect(result.findings).toHaveLength(1);
        expect(result.findings[0].reason_code).toBe(MAPPING_REASON_CODES.FOLDER_NESTING_FLATTENED);
        expect(result.findings[0].severity).toBe('skip');
    });

    test('skips a folder with a blank name', () => {
        const result = mapItemFolderToProductFolder(
            legacyItemFolderMissingNameFixture(),
            phase13ContextFixture()
        );

        expect(result.operation).toBe('skip');
        expect(result.target_payload).toBeNull();
        expect(result.findings[0].reason_code).toBe(MAPPING_REASON_CODES.MISSING_REQUIRED_FIELD);
    });
});

describe('Phase 13 item to product mappings', () => {
    test.each(['raw_material', 'packaging', 'product', 'supplies', 'service'])(
        'maps legacy category %s to flat retail category',
        (category) => {
            const result = mapItemToProduct(
                legacyMinimalItemFixture({ category }),
                phase13ContextFixture()
            );

            expect(result.operation).toBe('insert');
            expect(result.target_payload.category).toBe('retail');
        }
    );

    test('promotes product columns and folds all present satellites into attributes', () => {
        const result = mapItemToProduct(
            legacyFullItemFixture(),
            phase13ContextFixture({
                itemLocationStocks: [
                    { item_id: 401, location_id: 1, quantity_on_hand: '2.500000000000' },
                    { item_id: 401, location_id: 2, quantity_on_hand: '3.500000000000' }
                ]
            })
        );

        expect(result.operation).toBe('insert');
        expect(result.entity_type).toBe('product');
        expect(result.target_table).toBe('products');
        expect(result.target_payload).toMatchObject({
            business_id: 'biz-uuid-1',
            folder_id: 77,
            name: 'House Blend Coffee',
            category: 'retail',
            inventory_mode: 'basic_inventory',
            sku_code: 'HB-COFFEE-001',
            description: 'Signature retail coffee bag',
            unit_of_measure: 'bag',
            cost_per_unit: '125.5000',
            vat_type: 'vatable',
            senior_pwd_discount_eligible: false,
            stock_count: '6.000000000000'
        });

        expect(result.target_payload.attributes).toMatchObject({
            nutrition: { calories: 5, serving_size: '10g' },
            physicalProperties: { color: 'brown', texture: 'ground' },
            shelfLife: { unopened_shelf_life_days: 180 },
            packaging: { package_type: 'bag', net_weight: '250g' },
            qualityControl: { inspection_required: true },
            compliance: { fda_registration_number: 'FDA-123' },
            costBreakdown: { beans: '90.00', packaging: '12.50' },
            allergens: [{ allergen: 'none', severity: 'none' }],
            composition: [
                { composition_id: 7001, product_id: 401, ingredient_id: 402, quantity: '1.250000000000', unit: 'kg' }
            ]
        });
        expect(Array.isArray(result.target_payload.attributes.barcodes)).toBe(true);
        expect(result.target_payload.attributes.barcodes).toHaveLength(2);
    });

    test('omits absent satellite keys instead of writing null or empty objects', () => {
        const result = mapItemToProduct(
            legacyMinimalItemFixture(),
            phase13ContextFixture()
        );

        expect(Object.hasOwn(result.target_payload.attributes, 'nutrition')).toBe(false);
        expect(Object.hasOwn(result.target_payload.attributes, 'barcodes')).toBe(false);
    });

    test('skips an item with a blank name', () => {
        const result = mapItemToProduct(
            legacyItemMissingNameFixture(),
            phase13ContextFixture()
        );

        expect(result.operation).toBe('skip');
        expect(result.target_payload).toBeNull();
        expect(result.findings[0].reason_code).toBe(MAPPING_REASON_CODES.MISSING_REQUIRED_FIELD);
    });
});

describe('Phase 13 mapping reason codes', () => {
    test('declares the product/inventory-specific finding reason codes', () => {
        expect(MAPPING_REASON_CODES.LOSSY_CATEGORY_COLLAPSE).toBe('lossy_category_collapse');
        expect(MAPPING_REASON_CODES.FOLDER_NESTING_FLATTENED).toBe('folder_nesting_flattened');
        expect(MAPPING_REASON_CODES.UNRESOLVED_INGREDIENT).toBe('unresolved_ingredient');
    });
});
