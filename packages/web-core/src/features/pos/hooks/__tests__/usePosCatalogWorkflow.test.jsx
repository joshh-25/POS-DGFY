/** @vitest-environment jsdom */

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePosCatalogWorkflow } from '../usePosCatalogWorkflow.js';

class ResizeObserverStub {
    observe() {}

    disconnect() {}
}

describe('usePosCatalogWorkflow catalog capacity', () => {
    beforeEach(() => {
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
});
