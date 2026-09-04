// Phase 284 (#1318, C1) -- storefront catalog projection of an item's secondary category
// memberships (ADR 0080 Decision 4's opt-in for exactly this one surface). Mocking convention
// mirrors tests/storeRepository.locationStockFallback.test.js: dbStore is mocked model-by-model,
// with an explicit throw for anything unlisted so a new, unexpected model lookup fails loudly
// rather than silently. itemRepository is mocked separately because storeRepository.js now
// imports it (from ../../inventory/index.js) to reuse listItemFolderMemberships (Phase 257)
// rather than re-querying item_folder_memberships directly.

import { jest } from '@jest/globals';

const itemFindAllMock = jest.fn();
const itemFolderFindAllMock = jest.fn();
const itemLocationStockFindAllMock = jest.fn();
const listItemFolderMembershipsMock = jest.fn();

jest.unstable_mockModule('../src/utils/dbStore.js', () => ({
    default: {
        get: (name) => {
            if (name === 'Item') return { findAll: itemFindAllMock };
            if (name === 'PosCatalogOverride') return {};
            if (name === 'StorefrontCatalogOverride') return {};
            if (name === 'ServiceItemDetail') return {};
            if (name === 'ItemNutrition') return null;
            if (name === 'ItemAllergen') return null;
            if (name === 'ItemFolder') return { findAll: itemFolderFindAllMock };
            if (name === 'FnbModifierGroup') return null;
            if (name === 'FnbModifierOption') return null;
            if (name === 'ItemLocationStock') return { findAll: itemLocationStockFindAllMock };
            throw new Error(`Unexpected model lookup in test: ${name}`);
        },
        getStore: () => null
    }
}));

jest.unstable_mockModule('../src/modules/inventory/index.js', () => ({
    itemRepository: {
        listItemFolderMemberships: listItemFolderMembershipsMock
    }
}));

let storeRepository;

const buildCatalogRow = (overrides = {}) => ({
    item_id: overrides.item_id || 10,
    name: overrides.name || 'Test Item',
    description: 'Test item description',
    category: 'product',
    product_type: 'finished_goods',
    product_folder: overrides.product_folder ?? 'Primary Folder',
    folder_id: overrides.folder_id ?? 1,
    unit_of_measure: 'pc',
    current_stock: overrides.current_stock ?? 7,
    default_sale_price: 25,
    cost_per_unit: 12,
    vat_type: 'vatable',
    mode_item_preset: null,
    tracking_mode: null,
    tracking_toggle_available: true,
    posCatalogOverride: { pos_visible: true, pos_image_url: null },
    storefrontCatalogOverride: { storefront_visible: true, storefront_image_url: null }
});

describe('storeRepository.listStoreCatalog secondary category projection (#1318, Phase 284)', () => {
    beforeEach(async () => {
        jest.resetModules();
        jest.clearAllMocks();
        itemLocationStockFindAllMock.mockResolvedValue([]);
        ({ storeRepository } = await import('../src/modules/store/repositories/storeRepository.js'));
    });

    it('attaches secondary_categories ({folder_id, folder_name}, ordered by sort_order) without disturbing the primary folder_id/folder_name projection', async () => {
        itemFindAllMock.mockResolvedValue([
            buildCatalogRow({ item_id: 100, folder_id: 1 }),
            buildCatalogRow({ item_id: 101, folder_id: 2 })
        ]);
        listItemFolderMembershipsMock.mockResolvedValue([
            { item_id: 100, folder_id: 5, sort_order: 0 },
            { item_id: 100, folder_id: 6, sort_order: 1 },
            { item_id: 101, folder_id: 5, sort_order: 0 }
        ]);
        itemFolderFindAllMock.mockResolvedValue([
            { folder_id: 5, name: 'Seasonal' },
            { folder_id: 6, name: 'Clearance' }
        ]);

        const result = await storeRepository.listStoreCatalog({ search: '', limit: 60, location_id: null });

        expect(listItemFolderMembershipsMock).toHaveBeenCalledTimes(1);
        expect(listItemFolderMembershipsMock.mock.calls[0][0]).toEqual(expect.arrayContaining([100, 101]));

        const item100 = result.find((row) => row.item_id === 100);
        const item101 = result.find((row) => row.item_id === 101);
        expect(item100.secondary_categories).toEqual([
            { folder_id: 5, folder_name: 'Seasonal' },
            { folder_id: 6, folder_name: 'Clearance' }
        ]);
        expect(item101.secondary_categories).toEqual([
            { folder_id: 5, folder_name: 'Seasonal' }
        ]);
        // Primary projection (ADR 0080 Decision 1) stays exactly what it was before this phase.
        expect(item100.folder_id).toBe(1);
        expect(item100.folder_name).toBe('Primary Folder');
    });

    it('defaults to an empty array when an item has no secondary memberships', async () => {
        itemFindAllMock.mockResolvedValue([buildCatalogRow({ item_id: 200 })]);
        listItemFolderMembershipsMock.mockResolvedValue([]);

        const result = await storeRepository.listStoreCatalog({ search: '', limit: 60, location_id: null });

        expect(result).toHaveLength(1);
        expect(result[0].secondary_categories).toEqual([]);
        expect(itemFolderFindAllMock).not.toHaveBeenCalled();
    });

    it('fails open (empty array, no throw) when the membership lookup errors -- an additive projection must never break the public catalog', async () => {
        itemFindAllMock.mockResolvedValue([buildCatalogRow({ item_id: 300 })]);
        listItemFolderMembershipsMock.mockRejectedValue(new Error('tenant lacks item_folder_memberships table'));

        const result = await storeRepository.listStoreCatalog({ search: '', limit: 60, location_id: null });

        expect(result).toHaveLength(1);
        expect(result[0].secondary_categories).toEqual([]);
    });

    it('never queries membership data for an empty catalog result', async () => {
        itemFindAllMock.mockResolvedValue([]);

        const result = await storeRepository.listStoreCatalog({ search: '', limit: 60, location_id: null });

        expect(result).toEqual([]);
        expect(listItemFolderMembershipsMock).not.toHaveBeenCalled();
    });

    it('drops a membership whose folder was deleted/renamed out from under it to folder_name: null rather than throwing', async () => {
        itemFindAllMock.mockResolvedValue([buildCatalogRow({ item_id: 400 })]);
        listItemFolderMembershipsMock.mockResolvedValue([
            { item_id: 400, folder_id: 9, sort_order: 0 }
        ]);
        itemFolderFindAllMock.mockResolvedValue([]); // folder 9 no longer resolvable

        const result = await storeRepository.listStoreCatalog({ search: '', limit: 60, location_id: null });

        expect(result[0].secondary_categories).toEqual([
            { folder_id: 9, folder_name: null }
        ]);
    });
});
