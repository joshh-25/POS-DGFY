/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, test, vi } from 'vitest';
import { parsePosCatalogEvent, subscribeToRemotePosCatalogUpdates } from '../posCatalogRefresh.js';

describe('parsePosCatalogEvent', () => {
    test('parses a POS catalog invalidation frame', () => {
        expect(parsePosCatalogEvent('event: pos.catalog.changed\ndata: {"reason":"item_created","emitted_at":"2026-08-08T00:00:00.000Z"}'))
            .toEqual({
                event: 'pos.catalog.changed',
                data: {
                    reason: 'item_created',
                    emitted_at: '2026-08-08T00:00:00.000Z'
                }
            });
    });

    test('does not throw for malformed payloads', () => {
        expect(parsePosCatalogEvent('event: pos.catalog.changed\ndata: invalid-json'))
            .toEqual({ event: 'pos.catalog.changed', data: null });
    });

    test('parses a POS settings invalidation frame', () => {
        expect(parsePosCatalogEvent('event: pos.settings.changed\ndata: {"reason":"business_name_updated"}'))
            .toEqual({
                event: 'pos.settings.changed',
                data: { reason: 'business_name_updated' }
            });
    });
});

describe('remote POS catalog stream recovery', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('reconnects immediately when the browser returns online or becomes visible', () => {
        const fetchMock = vi.fn(() => new Promise(() => {}));
        vi.stubGlobal('fetch', fetchMock);
        const unsubscribe = subscribeToRemotePosCatalogUpdates();

        expect(fetchMock).toHaveBeenCalledTimes(1);
        window.dispatchEvent(new Event('online'));
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);

        document.dispatchEvent(new Event('visibilitychange'));
        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(fetchMock.mock.calls[1][1].signal.aborted).toBe(true);

        unsubscribe();
        expect(fetchMock.mock.calls[2][1].signal.aborted).toBe(true);
    });
});
