import { normalizeTenantIdentifier } from '../src/modules/store/utils/storeJwtToken.js';

describe('normalizeTenantIdentifier', () => {
    it('preserves UUID tenant identifiers instead of truncating them as integers', () => {
        expect(normalizeTenantIdentifier('2193ed41-14b2-4f62-aece-16027130e9e2'))
            .toBe('2193ed41-14b2-4f62-aece-16027130e9e2');
    });

    it('preserves legacy numeric tenant identifiers', () => {
        expect(normalizeTenantIdentifier('2193')).toBe('2193');
    });
});
