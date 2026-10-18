/** @vitest-environment jsdom */

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    fetchPosCatalog: vi.fn(),
    getFolders: vi.fn(),
    loadOfflinePosSnapshot: vi.fn(),
    saveOfflinePosSnapshot: vi.fn()
}));
const noop = () => {};
const offlineSnapshotScope = Object.freeze({
    tenantId: 'tenant-a',
    terminalId: 'POS-01',
    locationId: '10',
    userId: '100'
});

vi.mock('../../services/posService.js', () => ({
    fetchPosCatalog: mocks.fetchPosCatalog
}));
vi.mock('@/services/itemService.js', () => ({
    getFolders: mocks.getFolders
}));
vi.mock('../../services/offlinePosSnapshotStore.js', () => ({
    loadOfflinePosSnapshot: mocks.loadOfflinePosSnapshot,
    saveOfflinePosSnapshot: mocks.saveOfflinePosSnapshot
}));
vi.mock('../../utils/posCatalogRefresh.js', () => ({
    subscribeToPosCatalogUpdates: vi.fn(() => () => {}),
    subscribeToRemotePosCatalogUpdates: vi.fn(() => () => {})
}));
vi.mock('@/src/utils/iminRuntimeFeedback.js', () => ({
    isIminWrapperRuntime: vi.fn(() => false),
    posToast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() }
}));

import { usePosCatalogWorkflow } from '../usePosCatalogWorkflow.js';
import { isIminWrapperRuntime } from '@/src/utils/iminRuntimeFeedback.js';

class ResizeObserverStub {
    observe() {}

    disconnect() {}
}

describe('usePosCatalogWorkflow catalog capacity', () => {
    beforeEach(() => {
        mocks.fetchPosCatalog.mockReset();
        mocks.getFolders.mockReset().mockResolvedValue([]);
        mocks.loadOfflinePosSnapshot.mockReset().mockReturnValue(null);
        mocks.saveOfflinePosSnapshot.mockReset();
        isIminWrapperRuntime.mockReset().mockReturnValue(false);
        vi.stubGlobal('ResizeObserver', ResizeObserverStub);
        vi.stubGlobal('requestAnimationFrame', (callback) => {
            callback();
            return 1;
        });
        vi.stubGlobal('cancelAnimationFrame', vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it('measures the catalog when its lazy viewport attaches after the initial effect', async () => {
        const { result } = renderHook(() => usePosCatalogWorkflow({
            currentViewMode: 'checkout',
            sessionLocked: true
        }));

        expect(result.current.catalogPageSize).toBeGreaterThanOrEqual(4);

        const viewport = {
            clientHeight: 544,
            clientWidth: 760,
            scrollTo: vi.fn()
        };

        await act(async () => {
            result.current.catalogCapacityViewportRef(viewport);
        });

        await waitFor(() => {
            expect(result.current.catalogGridLayout.columns).toBeGreaterThan(1);
            expect(result.current.catalogGridLayout.rows).toBeGreaterThan(1);
            expect(result.current.catalogPageSize).toBeGreaterThan(2);
        });
        expect(viewport.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    });

    it('retains the last authorized catalog when a background refresh fails', async () => {
        const savedItem = {
            item_id: 22,
            name: 'Saved item',
            pos_image_url: '/uploads/saved.webp'
        };
        mocks.fetchPosCatalog.mockResolvedValueOnce([savedItem]);

        const { result } = renderHook(() => usePosCatalogWorkflow({
            canViewHistory: true,
            currentViewMode: 'checkout',
            setReceiptSettings: noop,
            setLowStockDisplayThreshold: noop,
            offlineSnapshotScope
        }));

        await waitFor(() => expect(mocks.fetchPosCatalog).toHaveBeenCalledTimes(1));
        expect(result.current.catalog).toEqual([savedItem]);

        mocks.fetchPosCatalog.mockRejectedValueOnce(new Error('catalog refresh unavailable'));
        await act(async () => {
            await result.current.loadCatalog();
        });

        expect(result.current.catalog).toEqual([savedItem]);
        expect(result.current.catalogError).toBe('Failed to load POS catalog');
    });

    it('uses the scoped catalog snapshot after a gateway failure', async () => {
        const cachedCatalog = [{ item_id: 31, name: 'Cached item' }];
        mocks.loadOfflinePosSnapshot.mockReturnValue({
            catalog: cachedCatalog,
            receipt_settings: {}
        });
        mocks.fetchPosCatalog.mockRejectedValueOnce({
            response: { status: 502, data: { message: 'Gateway unavailable' } }
        });

        const { result } = renderHook(() => usePosCatalogWorkflow({
            canViewHistory: true,
            currentViewMode: 'checkout',
            setReceiptSettings: noop,
            setLowStockDisplayThreshold: noop,
            offlineSnapshotScope
        }));

        await waitFor(() => expect(result.current.catalog).toEqual(cachedCatalog));
        expect(result.current.catalogError).toContain('Backend unavailable');
    });

    it('does not use the catalog snapshot after an aborted refresh', async () => {
        mocks.loadOfflinePosSnapshot.mockReturnValue({
            catalog: [{ item_id: 32, name: 'Cached item' }],
            receipt_settings: {}
        });
        const aborted = new Error('request cancelled');
        aborted.name = 'CanceledError';
        aborted.code = 'ERR_CANCELED';
        mocks.fetchPosCatalog.mockRejectedValueOnce(aborted);

        const { result } = renderHook(() => usePosCatalogWorkflow({
            canViewHistory: true,
            currentViewMode: 'checkout',
            setReceiptSettings: noop,
            setLowStockDisplayThreshold: noop,
            offlineSnapshotScope
        }));

        await waitFor(() => expect(mocks.fetchPosCatalog).toHaveBeenCalledTimes(1));
        expect(result.current.catalog).toEqual([]);
        expect(mocks.loadOfflinePosSnapshot).not.toHaveBeenCalled();
    });

    it('removes the iMin startup wait and coalesces search requests at 150ms', async () => {
        vi.useFakeTimers();
        isIminWrapperRuntime.mockReturnValue(true);
        mocks.fetchPosCatalog.mockResolvedValue([]);

        const { result } = renderHook(() => usePosCatalogWorkflow({
            canViewHistory: true,
            currentViewMode: 'checkout'
        }));

        await act(async () => {
            await vi.advanceTimersByTimeAsync(0);
        });
        expect(mocks.fetchPosCatalog).toHaveBeenCalledTimes(1);

        act(() => result.current.setSearch('coffee'));
        await act(async () => {
            await vi.advanceTimersByTimeAsync(149);
        });
        expect(mocks.fetchPosCatalog).toHaveBeenCalledTimes(1);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(1);
        });
        expect(mocks.fetchPosCatalog).toHaveBeenLastCalledWith(
            { search: 'coffee', limit: 200 },
            expect.objectContaining({ signal: expect.any(Object) })
        );
    });

    it('orders All Items by the saved category order after folders load', async () => {
        const folders = [
            { folder_id: 20, name: 'Shake', sort_order: 1 },
            { folder_id: 30, name: 'Meals', sort_order: 2 },
            { folder_id: 10, name: 'Main', sort_order: 0 }
        ];
        mocks.getFolders.mockResolvedValue(folders);
        mocks.fetchPosCatalog.mockResolvedValue([
            { item_id: 3, name: 'Meal item', folder_id: 30, current_stock: 1 },
            { item_id: 1, name: 'Main item', folder_id: 10, current_stock: 1 },
            { item_id: 4, name: 'Unassigned item', folder_id: null, current_stock: 1 },
            { item_id: 2, name: 'Shake item', folder_id: 20, current_stock: 1 }
        ]);
        const offlineSnapshotScope = {
            tenantId: 'tenant-a',
            terminalId: 'POS-01',
            locationId: '10',
            userId: '100'
        };

        const { result } = renderHook(() => usePosCatalogWorkflow({
            canViewHistory: true,
            currentViewMode: 'checkout',
            offlineSnapshotScope
        }));

        await waitFor(() => expect(mocks.fetchPosCatalog).toHaveBeenCalled());
        await waitFor(() => expect(result.current.catalog).toHaveLength(4));
        expect(result.current.catalogForDisplay.map((item) => item.item_id)).toEqual([1, 2, 3, 4]);
    });
});
