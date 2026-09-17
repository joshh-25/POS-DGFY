import { createCircuitBreaker } from '../src/modules/geoSearch/providers/geocodeCircuitBreaker.js';
import { buildForwardCacheKey, buildReverseCacheKey } from '../src/modules/geoSearch/providers/geocodeCache.js';

describe('createCircuitBreaker', () => {
    const breakerAt = (clock) => createCircuitBreaker({ failureThreshold: 5, openMs: 60000, now: () => clock.value });

    it('stays closed below the failure threshold', () => {
        const clock = { value: 0 };
        const breaker = breakerAt(clock);

        for (let index = 0; index < 4; index += 1) breaker.recordFailure();

        expect(breaker.isOpen()).toBe(false);
    });

    it('opens on the fifth consecutive failure', () => {
        const clock = { value: 0 };
        const breaker = breakerAt(clock);

        for (let index = 0; index < 5; index += 1) breaker.recordFailure();

        expect(breaker.isOpen()).toBe(true);
    });

    it('closes again once the open window elapses', () => {
        const clock = { value: 0 };
        const breaker = breakerAt(clock);

        for (let index = 0; index < 5; index += 1) breaker.recordFailure();
        expect(breaker.isOpen()).toBe(true);

        clock.value = 60001;
        expect(breaker.isOpen()).toBe(false);
    });

    it('resets the failure run on success, so intermittent failures never accumulate', () => {
        const clock = { value: 0 };
        const breaker = breakerAt(clock);

        for (let index = 0; index < 4; index += 1) breaker.recordFailure();
        breaker.recordSuccess();
        for (let index = 0; index < 4; index += 1) breaker.recordFailure();

        expect(breaker.isOpen()).toBe(false);
    });

    it('stays open until the exact open window boundary elapses', () => {
        const clock = { value: 0 };
        const breaker = breakerAt(clock);

        for (let index = 0; index < 5; index += 1) breaker.recordFailure();
        expect(breaker.isOpen()).toBe(true);

        clock.value = 59999;
        expect(breaker.isOpen()).toBe(true);

        clock.value = 60000;
        expect(breaker.isOpen()).toBe(false);
    });

    it('reset() closes the breaker and clears the failure count', () => {
        const clock = { value: 0 };
        const breaker = breakerAt(clock);

        for (let index = 0; index < 5; index += 1) breaker.recordFailure();
        expect(breaker.isOpen()).toBe(true);

        breaker.reset();
        expect(breaker.isOpen()).toBe(false);

        for (let index = 0; index < 4; index += 1) breaker.recordFailure();
        expect(breaker.isOpen()).toBe(false);
    });
});

describe('cache keys', () => {
    it('snaps reverse coordinates to five decimal places', () => {
        expect(buildReverseCacheKey('2026-09-12T23:03:36Z', 10.72021234, 122.56219876))
            .toBe('geo:rev:2026-09-12T23:03:36Z:10.72021:122.56220');
    });

    it('produces the same forward key for bias coordinates inside one 0.01 degree cell', () => {
        const first = buildForwardCacheKey('2026-09-12T23:03:36Z', 'Poblacion', 8, 10.7201, 122.5601);
        const second = buildForwardCacheKey('2026-09-12T23:03:36Z', 'Poblacion', 8, 10.7249, 122.5649);
        expect(first).toBe(second);
    });

    it('produces different keys for different queries and for a changed import date', () => {
        const base = buildForwardCacheKey('2026-09-12T23:03:36Z', 'Poblacion', 8, 10.72, 122.56);
        expect(base).not.toBe(buildForwardCacheKey('2026-09-12T23:03:36Z', 'Bakhaw', 8, 10.72, 122.56));
        expect(base).not.toBe(buildForwardCacheKey('2026-09-19T23:03:36Z', 'Poblacion', 8, 10.72, 122.56));
    });

    it('is case- and whitespace-insensitive on the query', () => {
        expect(buildForwardCacheKey('D', '  Poblacion  ', 8)).toBe(buildForwardCacheKey('D', 'poblacion', 8));
    });
});
