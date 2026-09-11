/** @vitest-environment jsdom */

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    fetchPosCatalog: vi.fn(),
    getFolders: vi.fn(),
    loadOfflinePosSnapshot: vi.fn(),
    saveOfflinePosSnapshot: vi.fn()
}));

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
    posToast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() }
}));

import { usePosCatalogWorkflow } from '../usePosCatalogWorkflow.js';

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
        vi.stubGlobal('ResizeObserver', ResizeObserverStub);
        vi.stubGlobal('requestAnimationFrame', (callback) => {
            callback();
            return 1;
        });
        vi.stubGlobal('cancelAnimationFrame', vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('measures the catalog when its lazy viewport attaches after the initial effect', async () => {
        const { result } = renderHook(() => usePosCatalogWorkflow({
            currentViewMode: 'checkout',
            sessionLocked: true
        }));

        expect(result.current.catalogPageSize).toBe(2);

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
            offlineSnapshotScope: {
                tenantId: 'tenant-a',
                terminalId: 'POS-01',
                locationId: '10',
                userId: '100'
            }
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
});
