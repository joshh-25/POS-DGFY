import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    loadPosCatalogImageFailures,
    savePosCatalogImageFailures
} from '../services/posCatalogImageFailureStore.js';

const createStorage = () => {
    const values = new Map();
    return {
        getItem: (key) => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => values.set(key, String(value))
    };
};

const scope = {
    tenantId: 'company-a',
    terminalId: 'POS-01',
    locationId: '10',
    userId: '100'
};

describe('POS catalog image failure store', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('isolates failures by the complete POS scope and normalizes item IDs', () => {
        vi.stubGlobal('window', { sessionStorage: createStorage() });

        expect(savePosCatalogImageFailures(scope, new Set([26, '26', ' 54 ']))).toBe(true);
        expect(loadPosCatalogImageFailures(scope)).toEqual(new Set(['26', '54']));
        expect(loadPosCatalogImageFailures({ ...scope, tenantId: 'company-b' })).toEqual(new Set());
        expect(loadPosCatalogImageFailures({ ...scope, userId: '' })).toEqual(new Set());
    });

    it('keeps the current-tab quarantine in memory when session storage is unavailable', () => {
        vi.stubGlobal('window', { get sessionStorage() { throw new Error('blocked'); } });

        expect(savePosCatalogImageFailures(scope, ['71'])).toBe(true);
        expect(loadPosCatalogImageFailures(scope)).toEqual(new Set(['71']));
    });

    it('caps persisted failures to prevent unbounded session storage growth', () => {
        vi.stubGlobal('window', { sessionStorage: createStorage() });
        const failures = Array.from({ length: 501 }, (_, index) => String(index + 1));

        expect(savePosCatalogImageFailures({ ...scope, terminalId: 'POS-02' }, failures)).toBe(true);
        expect(loadPosCatalogImageFailures({ ...scope, terminalId: 'POS-02' }).size).toBe(500);
    });
});
