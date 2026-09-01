// Phase 236 (#1328, epic #1321): unit tests for the observation-only road-distance provider.
// calculateRouteUseCase is injected as a fake in every test -- no real routeCalculator/GraphHopper
// I/O runs here (that boundary is already covered by routeCalculatorUseCase.test.js /
// routeCalculatorRepository.test.js).

import { jest } from '@jest/globals';
import { buildRoadDistanceProvider } from '../src/modules/deliveryPricing/repositories/roadDistanceProvider.js';

const ok = (data) => ({ success: true, data });
const fail = () => ({ success: false, error: { code: 'SERVICE_UNAVAILABLE' } });

const baseCall = {
    tenantId: 'tenant-1',
    locationId: 2,
    originLat: 10.7,
    originLng: 122.5,
    destLat: 10.75,
    destLng: 122.55
};

describe('buildRoadDistanceProvider', () => {
    it('returns {distanceMeters, source: "road"} on a successful route calculation', async () => {
        const calculateRouteUseCase = jest.fn().mockResolvedValue(ok({ distance_meters: 4200 }));
        const { resolveRoadDistance } = buildRoadDistanceProvider({ calculateRouteUseCase });

        const result = await resolveRoadDistance(baseCall);

        expect(result).toEqual({ distanceMeters: 4200, source: 'road' });
        expect(calculateRouteUseCase).toHaveBeenCalledWith(expect.objectContaining({
            originLat: baseCall.originLat,
            originLng: baseCall.originLng,
            destLat: baseCall.destLat,
            destLng: baseCall.destLng,
            timeoutMs: expect.any(Number)
        }));
    });

    it('returns {distanceMeters: null, source: "unavailable"} when the use case reports failure (never throws)', async () => {
        const calculateRouteUseCase = jest.fn().mockResolvedValue(fail());
        const { resolveRoadDistance } = buildRoadDistanceProvider({ calculateRouteUseCase });

        const result = await resolveRoadDistance(baseCall);

        expect(result).toEqual({ distanceMeters: null, source: 'unavailable' });
    });

    it('belt-and-suspenders: a use case that unexpectedly rejects is still caught and normalized, never thrown', async () => {
        const calculateRouteUseCase = jest.fn().mockRejectedValue(new Error('unexpected'));
        const { resolveRoadDistance } = buildRoadDistanceProvider({ calculateRouteUseCase });

        await expect(resolveRoadDistance(baseCall)).resolves.toEqual({ distanceMeters: null, source: 'unavailable' });
    });

    it('caches a successful result for the same tenant/location/destination cell -- the use case is invoked exactly once', async () => {
        const calculateRouteUseCase = jest.fn().mockResolvedValue(ok({ distance_meters: 1500 }));
        const { resolveRoadDistance } = buildRoadDistanceProvider({ calculateRouteUseCase });

        const first = await resolveRoadDistance(baseCall);
        // A tiny jitter inside the same ~111m grid cell must still hit the cache.
        const second = await resolveRoadDistance({ ...baseCall, destLat: baseCall.destLat + 0.00001 });

        expect(first).toEqual({ distanceMeters: 1500, source: 'road' });
        expect(second).toEqual({ distanceMeters: 1500, source: 'road' });
        expect(calculateRouteUseCase).toHaveBeenCalledTimes(1);
    });

    it('does NOT cache a failed/unavailable result -- a transient hiccup must not poison the address', async () => {
        const calculateRouteUseCase = jest.fn()
            .mockResolvedValueOnce(fail())
            .mockResolvedValueOnce(ok({ distance_meters: 900 }));
        const { resolveRoadDistance } = buildRoadDistanceProvider({ calculateRouteUseCase });

        const first = await resolveRoadDistance(baseCall);
        const second = await resolveRoadDistance(baseCall);

        expect(first).toEqual({ distanceMeters: null, source: 'unavailable' });
        expect(second).toEqual({ distanceMeters: 900, source: 'road' });
        expect(calculateRouteUseCase).toHaveBeenCalledTimes(2);
    });

    it('keys the cache on tenantId -- two tenants with the same numeric location_id/destination never share a cached distance', async () => {
        const calculateRouteUseCase = jest.fn()
            .mockResolvedValueOnce(ok({ distance_meters: 1000 }))
            .mockResolvedValueOnce(ok({ distance_meters: 2000 }));
        const { resolveRoadDistance } = buildRoadDistanceProvider({ calculateRouteUseCase });

        const tenantA = await resolveRoadDistance({ ...baseCall, tenantId: 'tenant-a' });
        const tenantB = await resolveRoadDistance({ ...baseCall, tenantId: 'tenant-b' });

        expect(tenantA.distanceMeters).toBe(1000);
        expect(tenantB.distanceMeters).toBe(2000);
        expect(calculateRouteUseCase).toHaveBeenCalledTimes(2);
    });

    it('passes the configured timeoutMs through to calculateRouteUseCase', async () => {
        const calculateRouteUseCase = jest.fn().mockResolvedValue(ok({ distance_meters: 100 }));
        const { resolveRoadDistance } = buildRoadDistanceProvider({ calculateRouteUseCase, timeoutMs: 250 });

        await resolveRoadDistance(baseCall);

        expect(calculateRouteUseCase).toHaveBeenCalledWith(expect.objectContaining({ timeoutMs: 250 }));
    });

    it('a slow-but-eventually-settling use case does not produce an unhandled rejection -- resolveRoadDistance still resolves', async () => {
        jest.useFakeTimers();
        let resolveLate;
        const latePromise = new Promise((resolve) => { resolveLate = resolve; });
        const calculateRouteUseCase = jest.fn().mockReturnValue(latePromise);
        const { resolveRoadDistance } = buildRoadDistanceProvider({ calculateRouteUseCase, timeoutMs: 50 });

        const pending = resolveRoadDistance(baseCall);
        // The mock never times out on its own here (it's a hand-rolled promise, not axios) -- this
        // test's point is that resolveRoadDistance awaits calculateRouteUseCase directly and settles
        // cleanly whenever that promise settles, with no dangling handler left over.
        resolveLate(ok({ distance_meters: 777 }));
        await expect(pending).resolves.toEqual({ distanceMeters: 777, source: 'road' });

        jest.useRealTimers();
    });
});
