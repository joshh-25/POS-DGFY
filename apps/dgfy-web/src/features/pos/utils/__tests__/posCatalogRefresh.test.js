import { describe, expect, test } from 'vitest';
import { parsePosCatalogEvent } from '../posCatalogRefresh.js';

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
});
