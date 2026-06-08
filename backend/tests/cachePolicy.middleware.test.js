import { jest } from '@jest/globals';
import { setNoStoreCacheControl, setReadCacheControl } from '../src/middleware/cachePolicy.js';

const createResponseDouble = (initialHeaders = {}) => {
    const store = new Map(
        Object.entries(initialHeaders).map(([key, value]) => [String(key).toLowerCase(), value])
    );

    return {
        setHeader: jest.fn((key, value) => {
            store.set(String(key).toLowerCase(), value);
        }),
        getHeader: jest.fn((key) => store.get(String(key).toLowerCase())),
        readHeader: (key) => store.get(String(key).toLowerCase())
    };
};

describe('cachePolicy middleware contracts', () => {
    it('setReadCacheControl applies read caching headers on GET requests', () => {
        const middleware = setReadCacheControl({
            maxAgeSeconds: 45,
            sMaxAgeSeconds: 45,
            staleWhileRevalidateSeconds: 90,
            staleIfErrorSeconds: 180,
            scope: 'public'
        });
        const req = { method: 'GET' };
        const res = createResponseDouble();
        const next = jest.fn();

        middleware(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(res.readHeader('cache-control')).toBe(
            'public, max-age=45, s-maxage=45, stale-while-revalidate=90, stale-if-error=180'
        );
        expect(String(res.readHeader('vary') || '')).toContain('Accept-Encoding');
        expect(String(res.readHeader('vary') || '')).toContain('Origin');
    });

    it('setReadCacheControl preserves and merges existing Vary values', () => {
        const middleware = setReadCacheControl({ maxAgeSeconds: 10, sMaxAgeSeconds: 20 });
        const req = { method: 'HEAD' };
        const res = createResponseDouble({ Vary: 'Accept-Language, Origin' });
        const next = jest.fn();

        middleware(req, res, next);

        const vary = String(res.readHeader('vary') || '');
        expect(vary).toContain('Accept-Language');
        expect(vary).toContain('Accept-Encoding');
        expect(vary).toContain('Origin');
    });

    it('setReadCacheControl can vary cached reads by tenant context headers', () => {
        const middleware = setReadCacheControl({
            maxAgeSeconds: 30,
            sMaxAgeSeconds: 30,
            varyHeaders: ['X-Store-Slug']
        });
        const req = { method: 'GET' };
        const res = createResponseDouble();
        const next = jest.fn();

        middleware(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        const vary = String(res.readHeader('vary') || '');
        expect(vary).toContain('Accept-Encoding');
        expect(vary).toContain('Origin');
        expect(vary).toContain('X-Store-Slug');
    });

    it('setReadCacheControl skips non-read methods', () => {
        const middleware = setReadCacheControl();
        const req = { method: 'POST' };
        const res = createResponseDouble();
        const next = jest.fn();

        middleware(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(res.setHeader).not.toHaveBeenCalled();
    });

    it('setNoStoreCacheControl applies non-cacheable mutation headers', () => {
        const req = { method: 'POST' };
        const res = createResponseDouble({ Vary: 'Accept-Language' });
        const next = jest.fn();

        setNoStoreCacheControl(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(res.readHeader('cache-control')).toBe('no-store, no-cache, max-age=0, must-revalidate');
        expect(res.readHeader('pragma')).toBe('no-cache');
        expect(res.readHeader('expires')).toBe('0');
        const vary = String(res.readHeader('vary') || '');
        expect(vary).toContain('Accept-Language');
        expect(vary).toContain('Accept-Encoding');
        expect(vary).toContain('Origin');
    });
});
