import { jest } from '@jest/globals';
import { buildSyncMobilePosItemsUseCase } from '../src/modules/pos/usecases/mobilePosUseCases.js';

const MASTER_ADMIN_USER = { user_id: 1, is_master_admin: true, permissions: [] };
const MANAGER_USER = { user_id: 2, is_master_admin: false, permissions: ['items:create', 'items:edit', 'items:delete'] };
const STAFF_USER = { user_id: 3, is_master_admin: false, permissions: ['items:view'] };

const buildDeps = (overrides = {}) => ({
    createItemUseCase: jest.fn(),
    updateItemUseCase: jest.fn(),
    deleteItemUseCase: jest.fn(),
    itemRepository: { findItemsBySkuCodes: jest.fn().mockResolvedValue([]) },
    ...overrides
});

describe('buildSyncMobilePosItemsUseCase', () => {
    it('returns an empty accepted summary for an empty batch', async () => {
        const deps = buildDeps();
        const useCase = buildSyncMobilePosItemsUseCase(deps);

        const result = await useCase({ payload: { device_id: 'IMIN-01', entries: [] }, user: MASTER_ADMIN_USER });

        expect(result.success).toBe(true);
        expect(result.data.results).toEqual([]);
        expect(result.data.summary).toEqual(expect.objectContaining({ total_entries: 0, accepted_count: 0 }));
        expect(result.data.summary.sync_limit_policy).toBeUndefined();
    });

    it('creates an item and echoes the server-assigned id', async () => {
        const deps = buildDeps();
        deps.createItemUseCase.mockResolvedValue({ item_id: 42, sku_code: 'SKU-1' });
        const useCase = buildSyncMobilePosItemsUseCase(deps);

        const result = await useCase({
            payload: {
                device_id: 'IMIN-01',
                entries: [{ local_transaction_id: 'local-1', payload: { op: 'create', sku_code: 'SKU-1', name: 'Item 1' } }]
            },
            user: MANAGER_USER
        });

        expect(deps.createItemUseCase).toHaveBeenCalledWith(expect.objectContaining({
            itemData: expect.objectContaining({ sku_code: 'SKU-1' }),
            userId: MANAGER_USER.user_id
        }));
        // op must not leak into the itemData passed to createItemUseCase
        expect(deps.createItemUseCase.mock.calls[0][0].itemData.op).toBeUndefined();
        expect(result.data.results).toEqual([
            { local_transaction_id: 'local-1', status: 'accepted', server_item_id: 42 }
        ]);
        expect(result.data.summary).toEqual(expect.objectContaining({ accepted_count: 1, rejected_count: 0, replayed_count: 0 }));
    });

    it('treats a retried create (409 SKU conflict) as a replay of the existing item', async () => {
        const deps = buildDeps();
        const conflict = new Error('Item with this SKU code already exists');
        conflict.statusCode = 409;
        deps.createItemUseCase.mockRejectedValue(conflict);
        deps.itemRepository.findItemsBySkuCodes.mockResolvedValue([{ item_id: 42, sku_code: 'SKU-1' }]);
        const useCase = buildSyncMobilePosItemsUseCase(deps);

        const result = await useCase({
            payload: {
                device_id: 'IMIN-01',
                entries: [{ local_transaction_id: 'local-1', payload: { op: 'create', sku_code: 'SKU-1', name: 'Item 1' } }]
            },
            user: MANAGER_USER
        });

        expect(deps.itemRepository.findItemsBySkuCodes).toHaveBeenCalledWith(['SKU-1']);
        expect(result.data.results).toEqual([
            { local_transaction_id: 'local-1', status: 'replayed', server_item_id: 42 }
        ]);
        expect(result.data.summary).toEqual(expect.objectContaining({ accepted_count: 0, replayed_count: 1, rejected_count: 0 }));
    });

    it('rejects a create whose 409 conflict cannot be resolved to an existing item', async () => {
        const deps = buildDeps();
        const conflict = new Error('Item with this SKU code already exists');
        conflict.statusCode = 409;
        deps.createItemUseCase.mockRejectedValue(conflict);
        deps.itemRepository.findItemsBySkuCodes.mockResolvedValue([]);
        const useCase = buildSyncMobilePosItemsUseCase(deps);

        const result = await useCase({
            payload: {
                device_id: 'IMIN-01',
                entries: [{ local_transaction_id: 'local-1', payload: { op: 'create', sku_code: 'SKU-1', name: 'Item 1' } }]
            },
            user: MANAGER_USER
        });

        expect(result.data.results).toEqual([
            { local_transaction_id: 'local-1', status: 'rejected', error: expect.objectContaining({ status_code: 409 }) }
        ]);
    });

    it('updates an item using the server-assigned id from the payload', async () => {
        const deps = buildDeps();
        deps.updateItemUseCase.mockResolvedValue({ item_id: 42, sku_code: 'SKU-1' });
        const useCase = buildSyncMobilePosItemsUseCase(deps);

        const result = await useCase({
            payload: {
                device_id: 'IMIN-01',
                entries: [{ local_transaction_id: 'local-1', payload: { op: 'update', server_item_id: 42, name: 'Renamed' } }]
            },
            user: MANAGER_USER
        });

        expect(deps.updateItemUseCase).toHaveBeenCalledWith(expect.objectContaining({ itemId: 42 }));
        expect(result.data.results).toEqual([
            { local_transaction_id: 'local-1', status: 'accepted', server_item_id: 42 }
        ]);
    });

    it('rejects an update missing server_item_id without calling updateItemUseCase', async () => {
        const deps = buildDeps();
        const useCase = buildSyncMobilePosItemsUseCase(deps);

        const result = await useCase({
            payload: {
                device_id: 'IMIN-01',
                entries: [{ local_transaction_id: 'local-1', payload: { op: 'update', name: 'Renamed' } }]
            },
            user: MANAGER_USER
        });

        expect(deps.updateItemUseCase).not.toHaveBeenCalled();
        expect(result.data.results[0]).toEqual(expect.objectContaining({ status: 'rejected' }));
    });

    it('deletes an item using the server-assigned id', async () => {
        const deps = buildDeps();
        deps.deleteItemUseCase.mockResolvedValue(null);
        const useCase = buildSyncMobilePosItemsUseCase(deps);

        const result = await useCase({
            payload: {
                device_id: 'IMIN-01',
                entries: [{ local_transaction_id: 'local-1', payload: { op: 'delete', server_item_id: 42 } }]
            },
            user: MANAGER_USER
        });

        expect(deps.deleteItemUseCase).toHaveBeenCalledWith({ itemId: 42, userId: MANAGER_USER.user_id });
        expect(result.data.results).toEqual([
            { local_transaction_id: 'local-1', status: 'accepted', server_item_id: 42 }
        ]);
    });

    it('treats a retried delete (404 not found) as a replay, since the item is already gone', async () => {
        const deps = buildDeps();
        const notFound = new Error('Item not found');
        notFound.statusCode = 404;
        deps.deleteItemUseCase.mockRejectedValue(notFound);
        const useCase = buildSyncMobilePosItemsUseCase(deps);

        const result = await useCase({
            payload: {
                device_id: 'IMIN-01',
                entries: [{ local_transaction_id: 'local-1', payload: { op: 'delete', server_item_id: 42 } }]
            },
            user: MANAGER_USER
        });

        expect(result.data.results).toEqual([
            { local_transaction_id: 'local-1', status: 'replayed', server_item_id: 42 }
        ]);
        expect(result.data.summary).toEqual(expect.objectContaining({ replayed_count: 1, rejected_count: 0 }));
    });

    it('rejects an entry when the user lacks the required per-op permission, without failing the whole batch', async () => {
        const deps = buildDeps();
        deps.createItemUseCase.mockResolvedValue({ item_id: 99, sku_code: 'SKU-OK' });
        const useCase = buildSyncMobilePosItemsUseCase(deps);

        const result = await useCase({
            payload: {
                device_id: 'IMIN-01',
                entries: [
                    { local_transaction_id: 'local-1', payload: { op: 'delete', server_item_id: 42 } },
                    { local_transaction_id: 'local-2', payload: { op: 'create', sku_code: 'SKU-OK', name: 'Item OK' } }
                ]
            },
            user: STAFF_USER
        });

        expect(deps.deleteItemUseCase).not.toHaveBeenCalled();
        expect(result.data.results[0]).toEqual(expect.objectContaining({ local_transaction_id: 'local-1', status: 'rejected' }));
        expect(result.data.results[0].error.status_code).toBe(403);
        // staff also lacks items:create, so the second entry is rejected too -
        // one bad entry never blocks the rest of the batch from being evaluated
        expect(result.data.results[1]).toEqual(expect.objectContaining({ local_transaction_id: 'local-2', status: 'rejected' }));
        expect(deps.createItemUseCase).not.toHaveBeenCalled();
    });

    it('master admin bypasses per-entry permission checks', async () => {
        const deps = buildDeps();
        deps.deleteItemUseCase.mockResolvedValue(null);
        const useCase = buildSyncMobilePosItemsUseCase(deps);

        const result = await useCase({
            payload: {
                device_id: 'IMIN-01',
                entries: [{ local_transaction_id: 'local-1', payload: { op: 'delete', server_item_id: 42 } }]
            },
            user: MASTER_ADMIN_USER
        });

        expect(deps.deleteItemUseCase).toHaveBeenCalled();
        expect(result.data.results[0].status).toBe('accepted');
    });

    it('rejects an unsupported op without throwing', async () => {
        const deps = buildDeps();
        const useCase = buildSyncMobilePosItemsUseCase(deps);

        const result = await useCase({
            payload: {
                device_id: 'IMIN-01',
                entries: [{ local_transaction_id: 'local-1', payload: { op: 'archive' } }]
            },
            user: MASTER_ADMIN_USER
        });

        expect(result.data.results[0]).toEqual(expect.objectContaining({ status: 'rejected' }));
    });

    it('never mounts the free-tier sync_limit_policy on item sync summaries', async () => {
        const deps = buildDeps();
        deps.createItemUseCase.mockResolvedValue({ item_id: 1, sku_code: 'SKU-1' });
        const useCase = buildSyncMobilePosItemsUseCase(deps);

        const result = await useCase({
            payload: {
                device_id: 'IMIN-01',
                entries: [{ local_transaction_id: 'local-1', payload: { op: 'create', sku_code: 'SKU-1', name: 'Item 1' } }]
            },
            user: MASTER_ADMIN_USER
        });

        expect(result.data.summary.sync_limit_policy).toBeUndefined();
        expect(result.data.summary.checkpoint_token).toBeNull();
    });
});
