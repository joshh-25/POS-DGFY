// Phase 285 (#1318, C1) -- storefront catalog projection of an item's secondary category
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
    folder_id: Object.hasOwn(overrides, 'folder_id') ? overrides.folder_id : 1,
    folder: Object.hasOwn(overrides, 'folder')
        ? overrides.folder
        : {
            folder_id: Object.hasOwn(overrides, 'folder_id') ? overrides.folder_id : 1,
            name: overrides.product_folder ?? 'Primary Folder',
            sort_order: overrides.folder_sort_order ?? 0,
            is_active: overrides.folder_is_active ?? true,
            deleted_at: overrides.folder_deleted_at ?? null
        },
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

describe('storeRepository.listStoreCatalog secondary category projection (#1318, Phase 285)', () => {
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
            { folder_id: 5, name: 'Seasonal', is_active: true, deleted_at: null },
            { folder_id: 6, name: 'Clearance', is_active: true, deleted_at: null }
        ]);

        const result = await storeRepository.listStoreCatalog({ search: '', limit: 60, location_id: null });

        expect(listItemFolderMembershipsMock).toHaveBeenCalledTimes(1);
        expect(listItemFolderMembershipsMock.mock.calls[0][0]).toEqual(expect.arrayContaining([100, 101]));

        const item100 = result.find((row) => row.item_id === 100);
        const item101 = result.find((row) => row.item_id === 101);
        expect(item100.secondary_categories).toEqual([
            { folder_id: 5, folder_name: 'Seasonal', sort_order: 0 },
            { folder_id: 6, folder_name: 'Clearance', sort_order: 0 }
        ]);
        expect(item101.secondary_categories).toEqual([
            { folder_id: 5, folder_name: 'Seasonal', sort_order: 0 }
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

    it('keeps an unassigned item public without turning legacy product_folder text into a category', async () => {
        itemFindAllMock.mockResolvedValue([buildCatalogRow({
            item_id: 201,
            folder_id: null,
            folder: null,
            product_folder: 'Masu Cafe'
        })]);
        listItemFolderMembershipsMock.mockResolvedValue([]);

        const result = await storeRepository.listStoreCatalog({ search: '', limit: 60, location_id: null });

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({ folder_id: null, folder_name: null, folder_sort_order: null });
    });

    it('keeps the stored primary ID and modifier source available while hiding an inactive primary category', async () => {
        itemFindAllMock.mockResolvedValue([buildCatalogRow({
            item_id: 202,
            folder_id: 22,
            folder_is_active: false,
            folder_deleted_at: '2026-09-09T00:00:00.000Z',
            product_folder: 'Retired Category'
        })]);
        listItemFolderMembershipsMock.mockResolvedValue([]);

        const result = await storeRepository.listStoreCatalog({ search: '', limit: 60, location_id: null });

        expect(result[0]).toMatchObject({ folder_id: 22, folder_name: null, folder_sort_order: null });
        expect(itemFindAllMock.mock.calls[0][0].include).toEqual(expect.arrayContaining([
            expect.objectContaining({
                as: 'folder',
                attributes: expect.arrayContaining(['is_active', 'deleted_at'])
            })
        ]));
    });

    it('hides a soft-deleted primary category even if its active flag is stale', async () => {
        itemFindAllMock.mockResolvedValue([buildCatalogRow({
            item_id: 203,
            folder_id: 23,
            folder_is_active: true,
            folder_deleted_at: '2026-09-09T00:00:00.000Z',
            product_folder: 'Deleted Category'
        })]);
        listItemFolderMembershipsMock.mockResolvedValue([]);

        const result = await storeRepository.listStoreCatalog({ search: '', limit: 60, location_id: null });

        expect(result[0]).toMatchObject({ folder_id: 23, folder_name: null, folder_sort_order: null });
    });

    it('keeps the stored primary ID for business rules when the folder association is missing', async () => {
        itemFindAllMock.mockResolvedValue([buildCatalogRow({
            item_id: 204,
            folder_id: 24,
            folder: undefined,
            product_folder: 'Missing Category'
        })]);
        listItemFolderMembershipsMock.mockResolvedValue([]);

        const result = await storeRepository.listStoreCatalog({ search: '', limit: 60, location_id: null });

        expect(result[0]).toMatchObject({ folder_id: 24, folder_name: null, folder_sort_order: null });
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

    it('drops a membership whose folder is simply unresolvable (never returned by the folder lookup) entirely, rather than leaking a null-named entry', async () => {
        itemFindAllMock.mockResolvedValue([buildCatalogRow({ item_id: 400 })]);
        listItemFolderMembershipsMock.mockResolvedValue([
            { item_id: 400, folder_id: 9, sort_order: 0 }
        ]);
        itemFolderFindAllMock.mockResolvedValue([]); // folder 9 no longer resolvable

        const result = await storeRepository.listStoreCatalog({ search: '', limit: 60, location_id: null });

        expect(result[0].secondary_categories).toEqual([]);
    });

    // RF-1 (PR #1579 review, Codex): the missing-row case above proves nothing about active/
    // soft-deleted folders specifically -- the folder-name lookup must actively exclude them, not
    // merely tolerate a row that never comes back. These two cases pin that the ItemFolder query
    // itself is scoped to is_active/deleted_at, and that a membership pointing at a folder outside
    // that scope never produces a public category entry, named or unnamed.
    it('never leaks an inactive folder\'s name into the public catalog -- the membership is dropped, not returned with a name', async () => {
        itemFindAllMock.mockResolvedValue([buildCatalogRow({ item_id: 401 })]);
        listItemFolderMembershipsMock.mockResolvedValue([
            { item_id: 401, folder_id: 15, sort_order: 0 }
        ]);
        // The mock only returns what a real active-scoped query would: folder 15 is inactive, so a
        // real `is_active: true` where clause would never return it -- simulate that by returning [].
        itemFolderFindAllMock.mockResolvedValue([]);

        const result = await storeRepository.listStoreCatalog({ search: '', limit: 60, location_id: null });

        expect(result[0].secondary_categories).toEqual([]);
        const folderQuery = itemFolderFindAllMock.mock.calls[0][0];
        expect(folderQuery.where.is_active).toBe(true);
        expect(folderQuery.where.deleted_at).toBeNull();
    });

    it('never leaks a soft-deleted folder\'s name into the public catalog -- the membership is dropped, not returned with a name', async () => {
        itemFindAllMock.mockResolvedValue([buildCatalogRow({ item_id: 402 })]);
        listItemFolderMembershipsMock.mockResolvedValue([
            { item_id: 402, folder_id: 16, sort_order: 0 }
        ]);
        // deleteFolder sets is_active: false + deleted_at, and leaves the membership row in place
        // (ADR 0080 Consequences item 4) -- a real active-scoped query would not return folder 16.
        itemFolderFindAllMock.mockResolvedValue([]);

        const result = await storeRepository.listStoreCatalog({ search: '', limit: 60, location_id: null });

        expect(result[0].secondary_categories).toEqual([]);
        const folderQuery = itemFolderFindAllMock.mock.calls[0][0];
        expect(folderQuery.where.is_active).toBe(true);
        expect(folderQuery.where.deleted_at).toBeNull();
    });

    it('keeps a membership whose folder resolves as active, and only that one, when a sibling membership points at an inactive folder', async () => {
        itemFindAllMock.mockResolvedValue([buildCatalogRow({ item_id: 403 })]);
        listItemFolderMembershipsMock.mockResolvedValue([
            { item_id: 403, folder_id: 20, sort_order: 0 }, // active
            { item_id: 403, folder_id: 21, sort_order: 1 }  // inactive/soft-deleted
        ]);
        // Simulates the real query: folder 21 is filtered out server-side by is_active/deleted_at,
        // so only folder 20 comes back even though both were requested.
        itemFolderFindAllMock.mockResolvedValue([
            { folder_id: 20, name: 'Still Active' }
        ]);

        const result = await storeRepository.listStoreCatalog({ search: '', limit: 60, location_id: null });

        expect(result[0].secondary_categories).toEqual([
            { folder_id: 20, folder_name: 'Still Active', sort_order: 0 }
        ]);
    });
});
