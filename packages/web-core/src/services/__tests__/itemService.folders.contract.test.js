import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// #1318 Phase 268 — contract coverage for the two new item-scoped secondary
// category (folder) membership client functions. Mirrors
// menuImportService.contract.test.js's api-mock convention.

const apiMock = {
    get: vi.fn(),
    put: vi.fn()
};

vi.mock('../api.js', () => ({ default: apiMock }));

const loadService = async () => import('../itemService.js');

describe('itemService secondary category membership contract', () => {
    beforeEach(() => {
        apiMock.get.mockReset();
        apiMock.put.mockReset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('listItemFolders GETs /items/:item_id/folders and unwraps { item_id, memberships }', async () => {
        const { listItemFolders } = await loadService();
        const payload = { item_id: 5, memberships: [{ item_id: 5, folder_id: 20, sort_order: 0 }] };
        apiMock.get.mockResolvedValue({ data: { data: payload } });

        const result = await listItemFolders(5);

        expect(apiMock.get).toHaveBeenCalledWith('/items/5/folders');
        expect(result).toEqual(payload);
    });

    it('replaceItemFolders PUTs { folder_ids } to /items/:item_id/folders (itemService.replaceItemSuppliers shape)', async () => {
        const { replaceItemFolders } = await loadService();
        const payload = { item_id: 5, memberships: [{ item_id: 5, folder_id: 20, sort_order: 0 }] };
        apiMock.put.mockResolvedValue({ data: { data: payload } });

        const result = await replaceItemFolders(5, [20, 30]);

        expect(apiMock.put).toHaveBeenCalledWith('/items/5/folders', { folder_ids: [20, 30] });
        expect(result).toEqual(payload);
    });

    it('replaceItemFolders defaults to an empty folder_ids array', async () => {
        const { replaceItemFolders } = await loadService();
        apiMock.put.mockResolvedValue({ data: { data: { item_id: 5, memberships: [] } } });

        await replaceItemFolders(5);

        expect(apiMock.put).toHaveBeenCalledWith('/items/5/folders', { folder_ids: [] });
    });
});
