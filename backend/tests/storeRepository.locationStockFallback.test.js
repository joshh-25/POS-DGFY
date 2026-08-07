import { jest } from '@jest/globals';

const itemFindAllMock = jest.fn();
const itemLocationStockFindAllMock = jest.fn();

jest.unstable_mockModule('../src/utils/dbStore.js', () => ({
    default: {
        get: (name) => {
            if (name === 'Item') return { findAll: itemFindAllMock };
            if (name === 'PosCatalogOverride') return {};
            if (name === 'StorefrontCatalogOverride') return {};
            if (name === 'ServiceItemDetail') return {};
            if (name === 'ItemNutrition') return null;
            if (name === 'ItemAllergen') return null;
            if (name === 'ItemFolder') return {};
            if (name === 'FnbModifierGroup') return null;
            if (name === 'FnbModifierOption') return null;
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

const missingStorefrontCatalogOverrideTableError = () => ({
    name: 'SequelizeDatabaseError',
    original: {
        code: 'ER_NO_SUCH_TABLE',
        sqlMessage: "Table 'tenant_db.storefront_catalog_overrides' doesn't exist"
    }
});

const missingStorefrontCatalogGalleryColumnError = () => ({
    name: 'SequelizeDatabaseError',
    original: {
        code: 'ER_BAD_FIELD_ERROR',
        sqlMessage: "Unknown column 'storefrontCatalogOverride.storefront_image_gallery' in 'field list'"
    }
});

const missingServiceItemDetailsTableError = () => ({
    name: 'SequelizeDatabaseError',
    original: {
        code: 'ER_NO_SUCH_TABLE',
        sqlMessage: "Table 'tenant_db.service_item_details' doesn't exist"
    }
});

const buildCatalogRow = (overrides = {}) => ({
    item_id: overrides.item_id || 10,
    name: overrides.name || 'Test Item',
    description: overrides.description || 'Test item description',
    category: 'product',
    product_type: 'finished_goods',
    product_folder: overrides.product_folder || 'Rocket Fuel',
    unit_of_measure: 'pc',
    current_stock: overrides.current_stock ?? 7,
    default_sale_price: 25,
    cost_per_unit: 12,
    vat_type: 'vatable',
    mode_item_preset: overrides.mode_item_preset ?? null,
    tracking_mode: overrides.tracking_mode ?? null,
    tracking_toggle_available: overrides.tracking_toggle_available ?? true,
    posCatalogOverride: overrides.posCatalogOverride ?? {
        pos_visible: true,
        pos_image_url: '/uploads/item-10.png'
    },
    storefrontCatalogOverride: Object.prototype.hasOwnProperty.call(overrides, 'storefrontCatalogOverride')
        ? overrides.storefrontCatalogOverride
        : {
            storefront_visible: true,
            storefront_image_url: '/uploads/storefront/item-10.png'
    }
});

const imageVariantsFor = (url) => ({
    thumbnail_url: url,
    medium_url: url,
    large_url: url
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
            description: 'Test item description',
            folder_name: 'Rocket Fuel',
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

    it('listStoreCatalog honors storefront override visibility and image before POS fallback', async () => {
        itemFindAllMock.mockResolvedValue([
            buildCatalogRow({
                item_id: 400,
                storefrontCatalogOverride: {
                    storefront_visible: false,
                    storefront_image_url: '/uploads/storefront/hidden.png'
                }
            }),
            buildCatalogRow({
                item_id: 401,
                storefrontCatalogOverride: {
                    storefront_visible: true,
                    storefront_image_url: '/uploads/storefront/visible.png'
                }
            })
        ]);
        itemLocationStockFindAllMock.mockResolvedValue([]);

        const result = await storeRepository.listStoreCatalog({
            search: '',
            limit: 60,
            location_id: null
        });

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual(expect.objectContaining({
            item_id: 401,
            image_url: '/uploads/storefront/visible.png'
        }));
    });

    it('listStoreCatalog does not inherit POS visibility or image when the storefront table exists but the row is missing', async () => {
        itemFindAllMock.mockResolvedValue([
            buildCatalogRow({
                item_id: 500,
                posCatalogOverride: {
                    pos_visible: false,
                    pos_image_url: '/uploads/pos/hidden.png'
                },
                storefrontCatalogOverride: null
            })
        ]);
        itemLocationStockFindAllMock.mockResolvedValue([]);

        const result = await storeRepository.listStoreCatalog({
            search: '',
            limit: 60,
            location_id: null
        });

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual(expect.objectContaining({
            item_id: 500,
            image_url: null
        }));
    });

    it('listStoreCatalog only uses POS-derived visibility when the storefront override table is unavailable', async () => {
        itemFindAllMock
            .mockRejectedValueOnce(missingStorefrontCatalogOverrideTableError())
            .mockResolvedValueOnce([
                buildCatalogRow({
                    item_id: 600,
                    posCatalogOverride: {
                        pos_visible: false,
                        pos_image_url: '/uploads/pos/hidden.png'
                    },
                    storefrontCatalogOverride: null
                })
            ]);
        itemLocationStockFindAllMock.mockResolvedValue([]);

        const result = await storeRepository.listStoreCatalog({
            search: '',
            limit: 60,
            location_id: null
        });

        expect(result).toEqual([]);
    });

    it('listStoreCatalog retries without gallery when storefront override gallery column is missing', async () => {
        itemFindAllMock
            .mockRejectedValueOnce(missingStorefrontCatalogGalleryColumnError())
            .mockResolvedValueOnce([
                buildCatalogRow({
                    item_id: 650,
                    storefrontCatalogOverride: {
                        storefront_visible: true,
                        storefront_image_url: '/uploads/storefront/visible.png'
                    }
                })
            ]);
        itemLocationStockFindAllMock.mockResolvedValue([]);

        const result = await storeRepository.listStoreCatalog({
            search: '',
            limit: 60,
            location_id: null
        });

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual(expect.objectContaining({
            item_id: 650,
            image_url: '/uploads/storefront/visible.png',
            image_variants: imageVariantsFor('/uploads/storefront/visible.png'),
            image_gallery: [{
                url: '/uploads/storefront/visible.png',
                variants: imageVariantsFor('/uploads/storefront/visible.png'),
                is_primary: true,
                sort_order: 0
            }]
        }));
        const retryQuery = itemFindAllMock.mock.calls[1][0];
        const storefrontInclude = retryQuery.include.find((entry) => entry.as === 'storefrontCatalogOverride');
        expect(storefrontInclude.attributes).toEqual(['storefront_visible', 'storefront_image_url']);
    });

    it('listStoreCatalog exposes full item gallery when the JSON column is returned as text', async () => {
        itemFindAllMock.mockResolvedValue([
            buildCatalogRow({
                item_id: 660,
                storefrontCatalogOverride: {
                    storefront_visible: true,
                    storefront_image_url: '/uploads/storefront/primary.png',
                    storefront_image_gallery: JSON.stringify([
                        { url: '/uploads/storefront/primary.png', is_primary: true, sort_order: 0 },
                        { url: '/uploads/storefront/second.png', is_primary: false, sort_order: 1 },
                        { url: '/uploads/storefront/third.png', is_primary: false, sort_order: 2 }
                    ])
                }
            })
        ]);
        itemLocationStockFindAllMock.mockResolvedValue([]);

        const result = await storeRepository.listStoreCatalog({
            search: '',
            limit: 60,
            location_id: null
        });

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual(expect.objectContaining({
            item_id: 660,
            image_url: '/uploads/storefront/primary.png',
            image_variants: imageVariantsFor('/uploads/storefront/primary.png'),
            image_gallery: [
                {
                    url: '/uploads/storefront/primary.png',
                    variants: imageVariantsFor('/uploads/storefront/primary.png'),
                    is_primary: true,
                    sort_order: 0
                },
                {
                    url: '/uploads/storefront/second.png',
                    variants: imageVariantsFor('/uploads/storefront/second.png'),
                    is_primary: false,
                    sort_order: 1
                },
                {
                    url: '/uploads/storefront/third.png',
                    variants: imageVariantsFor('/uploads/storefront/third.png'),
                    is_primary: false,
                    sort_order: 2
                }
            ]
        }));
    });

    it('findSellableItemsByIds keeps an untracked item available even with no per-location stock row (bug 5)', async () => {
        // Before this fix, a missing item_location_stocks row collapsed to
        // current_stock=0 for every item alike, wrongly reading as "out of
        // stock" even for an item whose whole point is that it isn't counted.
        itemFindAllMock.mockResolvedValue([buildCatalogRow({
            item_id: 800,
            current_stock: 0,
            tracking_mode: 'untracked'
        })]);
        itemLocationStockFindAllMock.mockResolvedValue([]);

        const result = await storeRepository.findSellableItemsByIds([800], { locationId: 1 });

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual(expect.objectContaining({
            item_id: 800,
            is_available: true,
            availability_status: 'in_stock'
        }));
    });

    it('findSellableItemsByIds marks a toggle-off item unavailable regardless of stock rows', async () => {
        itemFindAllMock.mockResolvedValue([buildCatalogRow({
            item_id: 801,
            current_stock: 10,
            tracking_mode: 'toggle',
            tracking_toggle_available: false
        })]);
        itemLocationStockFindAllMock.mockResolvedValue([]);

        const result = await storeRepository.findSellableItemsByIds([801], { locationId: 1 });

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual(expect.objectContaining({
            item_id: 801,
            is_available: false,
            availability_status: 'out_of_stock'
        }));
    });

    it('listStoreCatalog retries without service details when that optional table is unavailable', async () => {
        itemFindAllMock
            .mockRejectedValueOnce(missingServiceItemDetailsTableError())
            .mockResolvedValueOnce([buildCatalogRow({ item_id: 700, current_stock: 4 })]);
        itemLocationStockFindAllMock.mockResolvedValue([]);

        const result = await storeRepository.listStoreCatalog({
            search: '',
            limit: 60,
            location_id: null
        });

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual(expect.objectContaining({
            item_id: 700,
            is_available: true,
            availability_status: 'in_stock'
        }));
        const retryQuery = itemFindAllMock.mock.calls[1][0];
        expect(retryQuery.include.some((entry) => entry.as === 'serviceDetail')).toBe(false);
    });
});
