/**
 * Phase 13 product/inventory legacy fixtures.
 *
 * Builders return fresh objects so mapper tests can mutate without leaking
 * state across cases, matching the Phase 03 fixture convention.
 */

export function phase13ContextFixture(overrides = {}) {
    return {
        legacyTenantDbName: 'sku_alpha',
        targetBusinessDbName: 'dgfy_business_alpha',
        expectedBusinessId: 'biz-uuid-1',
        resolvedFolderId: 77,
        resolvedProductId: 8801,
        itemLocationStocks: [],
        ...overrides
    };
}

export function legacyItemFolderFixture(overrides = {}) {
    return {
        folder_id: 301,
        name: 'Pantry Goods',
        description: 'Shelf-stable products',
        parent_id: null,
        ...overrides
    };
}

export function legacyItemFolderWithParentFixture(overrides = {}) {
    return legacyItemFolderFixture({
        folder_id: 302,
        name: 'Nested Pantry',
        parent_id: 301,
        ...overrides
    });
}

export function legacyItemFolderMissingNameFixture(overrides = {}) {
    return legacyItemFolderFixture({
        folder_id: 303,
        name: '   ',
        ...overrides
    });
}

export function legacyFullItemFixture(overrides = {}) {
    return {
        item_id: 401,
        name: 'House Blend Coffee',
        sku_code: 'HB-COFFEE-001',
        category: 'product',
        description: 'Signature retail coffee bag',
        unit_of_measure: 'bag',
        cost_per_unit: '125.5000',
        default_sale_price: '249.0000',
        current_stock: '9.000000000000',
        nutrition: {
            calories: 5,
            serving_size: '10g'
        },
        physicalProperties: {
            color: 'brown',
            texture: 'ground'
        },
        shelfLife: {
            unopened_shelf_life_days: 180
        },
        packaging: {
            package_type: 'bag',
            net_weight: '250g'
        },
        qualityControl: {
            inspection_required: true
        },
        regulatoryCompliance: {
            fda_registration_number: 'FDA-123'
        },
        costBreakdown: {
            beans: '90.00',
            packaging: '12.50'
        },
        allergens: [
            { allergen: 'none', severity: 'none' }
        ],
        barcodes: [
            { barcode: '4800000000011', barcode_type: 'ean13' },
            { barcode: '4800000000012', barcode_type: 'ean13' }
        ],
        productCompositions: [
            { composition_id: 7001, product_id: 401, ingredient_id: 402, quantity: '1.250000000000', unit: 'kg' }
        ],
        ...overrides
    };
}

export function legacyMinimalItemFixture(overrides = {}) {
    return {
        item_id: 402,
        name: 'Minimal Retail Item',
        sku_code: null,
        category: 'raw_material',
        description: null,
        unit_of_measure: null,
        cost_per_unit: null,
        default_sale_price: null,
        current_stock: null,
        ...overrides
    };
}

export function legacyItemMissingNameFixture(overrides = {}) {
    return legacyMinimalItemFixture({
        item_id: 403,
        name: '',
        ...overrides
    });
}
