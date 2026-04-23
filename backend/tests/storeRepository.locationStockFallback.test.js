import { jest } from '@jest/globals';

const itemFindAllMock = jest.fn();
const itemLocationStockFindAllMock = jest.fn();

jest.unstable_mockModule('../src/utils/dbStore.js', () => ({
    default: {
        get: (name) => {
            if (name === 'Item') return { findAll: itemFindAllMock };
            if (name === 'PosCatalogOverride') return {};
            if (name === 'ItemLocationStock') return { findAll: itemLocationStockFindAllMock };
            throw new Error(`Unexpected model lookup in test: ${name}`);
        },
        getStore: () => null
    }
}));

let storeRepository;

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

const buildCatalogRow = (overrides = {}) => ({
    item_id: overrides.item_id || 10,
    name: overrides.name || 'Test Item',
    category: 'product',
    product_type: 'finished_goods',
    unit_of_measure: 'pc',
    current_stock: overrides.current_stock ?? 7,
    default_sale_price: 25,
    cost_per_unit: 12,
    vat_type: 'vatable',
    posCatalogOverride: {
        pos_visible: true,
        pos_image_url: '/uploads/item-10.png'
    }
});

describe('storeRepository location-stock schema fallback', () => {
    beforeEach(async () => {
        jest.resetModules();
        jest.clearAllMocks();
        ({ storeRepository } = await import('../src/modules/store/repositories/storeRepository.js'));
    });

    it('listStoreCatalog falls back to global stock availability when item_location_stocks table is missing', async () => {
        itemFindAllMock.mockResolvedValue([buildCatalogRow({ item_id: 100, current_stock: 5 })]);
        itemLocationStockFindAllMock.mockRejectedValue(missingLocationStockTableError());

        const result = await storeRepository.listStoreCatalog({
            search: '',
            limit: 60,
            location_id: 1
        });

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual(expect.objectContaining({
            item_id: 100,
            current_stock: 5,
            is_available: true,
            availability_status: 'in_stock'
        }));
    });

    it('findSellableItemsByIds keeps global stock values when location stock table is missing', async () => {
        itemFindAllMock.mockResolvedValue([buildCatalogRow({ item_id: 200, current_stock: 3 })]);
        itemLocationStockFindAllMock.mockRejectedValue(missingLocationStockTableError());

        const result = await storeRepository.findSellableItemsByIds([200], { locationId: 9 });

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual(expect.objectContaining({
            item_id: 200,
            current_stock: 3
        }));
    });

    it('listStoreCatalog falls back when item_location_stocks schema is missing quantity_on_hand column', async () => {
        itemFindAllMock.mockResolvedValue([buildCatalogRow({ item_id: 300, current_stock: 2 })]);
        itemLocationStockFindAllMock.mockRejectedValue(missingLocationStockColumnError());

        const result = await storeRepository.listStoreCatalog({
            search: '',
            limit: 60,
            location_id: 2
        });

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual(expect.objectContaining({
            item_id: 300,
            current_stock: 2,
            is_available: true,
            availability_status: 'in_stock'
        }));
    });
});
