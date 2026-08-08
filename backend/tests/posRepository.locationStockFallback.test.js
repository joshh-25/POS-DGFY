import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const itemFindAllMock = jest.fn();
const itemLocationStockFindAllMock = jest.fn();

jest.unstable_mockModule('../src/utils/dbStore.js', () => ({
    default: {
        get: (name) => {
            if (name === 'Item') return { findAll: itemFindAllMock };
            if (name === 'PosCatalogOverride') return null;
            if (name === 'ServiceItemDetail') return null;
            if (name === 'ItemLocationStock') return { findAll: itemLocationStockFindAllMock };
            throw new Error(`Unexpected model lookup in test: ${name}`);
        },
        getStore: () => null
    }
}));

let posRepository;

const missingLocationStockTableError = () => ({
    name: 'SequelizeDatabaseError',
    original: {
        code: 'ER_NO_SUCH_TABLE',
        sqlMessage: "Table 'tenant_db.item_location_stocks' doesn't exist"
    }
});

const missingLocationStockColumnError = () => ({
    name: 'SequelizeDatabaseError',
    original: {
        code: 'ER_BAD_FIELD_ERROR',
        sqlMessage: "Unknown column 'quantity_on_hand' in 'field list'"
    }
});

const qualifiedMissingLocationStockColumnError = () => ({
    name: 'SequelizeDatabaseError',
    original: {
        code: 'ER_BAD_FIELD_ERROR',
        sqlMessage: "Unknown column 'ItemLocationStock.location_id' in 'field list'"
    }
});

const buildCatalogRow = (overrides = {}) => ({
    item_id: overrides.item_id || 10,
    name: overrides.name || 'POS Test Item',
    sku_code: overrides.sku_code || 'SKU-TEST-10',
    category: overrides.category || 'product',
    product_type: overrides.product_type || 'finished_goods',
    unit_of_measure: 'pc',
    current_stock: overrides.current_stock ?? 7,
    cost_per_unit: 12,
    default_sale_price: 25,
    status: 'active',
    vat_type: 'vatable'
});

describe('posRepository location-stock schema fallback', () => {
    beforeEach(async () => {
        jest.resetModules();
        jest.clearAllMocks();
        ({ posRepository } = await import('../src/modules/pos/repositories/posRepository.js'));
    });

    it('listCatalog falls back to global stock when location stock table is missing', async () => {
        itemFindAllMock.mockResolvedValue([buildCatalogRow({ item_id: 501, current_stock: 4 })]);
        itemLocationStockFindAllMock.mockRejectedValue(missingLocationStockTableError());

        const result = await posRepository.listCatalog({ limit: 100, location_id: 3 });

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual(expect.objectContaining({
            item_id: 501,
            current_stock: 4
        }));
    });

    it('findSellableItemsByIds falls back when location stock column is missing', async () => {
        itemFindAllMock.mockResolvedValue([buildCatalogRow({ item_id: 502, current_stock: 6 })]);
        itemLocationStockFindAllMock.mockRejectedValue(missingLocationStockColumnError());

        const result = await posRepository.findSellableItemsByIds([502], { locationId: 8 });

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual(expect.objectContaining({
            item_id: 502,
            current_stock: 6
        }));
    });

    it('requests mode_item_preset, min_threshold, and fifo_enabled so downstream service/threshold checks are not blind on this catalog path', async () => {
        itemFindAllMock.mockResolvedValue([buildCatalogRow({ item_id: 503 })]);
        itemLocationStockFindAllMock.mockResolvedValue([]);

        await posRepository.findSellableItemsByIds([503], { locationId: 8 });

        expect(itemFindAllMock.mock.calls[0][0].attributes).toEqual(expect.arrayContaining([
            'mode_item_preset',
            'min_threshold',
            'fifo_enabled'
        ]));
        });
    });

    it('falls back when MySQL qualifies the missing location column with the model name', async () => {
        itemFindAllMock.mockResolvedValue([buildCatalogRow({ item_id: 504, current_stock: 8 })]);
        itemLocationStockFindAllMock.mockRejectedValue(qualifiedMissingLocationStockColumnError());

        const result = await posRepository.listCatalog({ limit: 100, location_id: 3 });

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual(expect.objectContaining({
            item_id: 504,
            current_stock: 8
        }));
    });
