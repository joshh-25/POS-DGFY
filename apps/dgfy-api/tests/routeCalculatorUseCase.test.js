import { jest } from '@jest/globals';
import { buildCalculateRouteUseCase } from '../src/modules/routeCalculator/usecases/routeCalculatorUseCases.js';
import { RouteCalculatorError } from '../src/modules/routeCalculator/repositories/routeCalculatorRepository.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';

const ORIGIN_ENV = process.env.ROUTE_CALCULATOR_ENDPOINT;

describe('calculateRouteUseCase', () => {
    afterEach(() => {
        process.env.ROUTE_CALCULATOR_ENDPOINT = ORIGIN_ENV;
    });

    it('returns SERVICE_UNAVAILABLE when the feature is not configured', async () => {
        delete process.env.ROUTE_CALCULATOR_ENDPOINT;
        const routeCalculatorRepository = { calculateRoute: jest.fn() };
        const calculateRoute = buildCalculateRouteUseCase({ routeCalculatorRepository });

        const result = await calculateRoute({ originLat: 10, originLng: 122, destLat: 10.1, destLng: 122.1 });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.SERVICE_UNAVAILABLE);
        // #508 -- tags this as an expected precondition (not a fault) for the Sentry
        // capture boundary's allowlist, not just an HTTP-shape detail.
        expect(result.error.details).toEqual({ reason_code: 'ROUTE_CALCULATOR_NOT_CONFIGURED' });
        expect(routeCalculatorRepository.calculateRoute).not.toHaveBeenCalled();
    });

    it('resolves the configured route and defaults profile to car', async () => {
        process.env.ROUTE_CALCULATOR_ENDPOINT = 'http://graphhopper.test';
        const route = { distance_meters: 3220.8, duration_seconds: 333, geometry: { type: 'LineString', coordinates: [] }, instructions: [] };
        const routeCalculatorRepository = { calculateRoute: jest.fn().mockResolvedValue(route) };
        const calculateRoute = buildCalculateRouteUseCase({ routeCalculatorRepository });

        const result = await calculateRoute({ originLat: 10, originLng: 122, destLat: 10.1, destLng: 122.1 });

        expect(result.success).toBe(true);
        expect(result.data).toEqual(route);
        expect(routeCalculatorRepository.calculateRoute).toHaveBeenCalledWith(expect.objectContaining({ profile: 'car' }));
    });

    it.each([
        ['ROUTE_CALCULATOR_DISABLED', DomainErrorCode.SERVICE_UNAVAILABLE, { reason_code: 'ROUTE_CALCULATOR_NOT_CONFIGURED' }],
        ['ROUTE_TIMEOUT', DomainErrorCode.SERVICE_UNAVAILABLE, null],
        ['ROUTE_UNREACHABLE', DomainErrorCode.SERVICE_UNAVAILABLE, null],
        ['ROUTE_NOT_FOUND', DomainErrorCode.VALIDATION_FAILED, null]
    ])('maps repository error %s to domain code %s', async (repoCode, domainCode, details) => {
        process.env.ROUTE_CALCULATOR_ENDPOINT = 'http://graphhopper.test';
        const routeCalculatorRepository = {
            calculateRoute: jest.fn().mockRejectedValue(new RouteCalculatorError(repoCode, 'boom'))
        };
        const calculateRoute = buildCalculateRouteUseCase({ routeCalculatorRepository });

        const result = await calculateRoute({ originLat: 10, originLng: 122, destLat: 10.1, destLng: 122.1 });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(domainCode);
        // #508 -- ROUTE_CALCULATOR_DISABLED is the same "not configured" precondition as the
        // enabled-check above, just caught at the repository layer; ROUTE_TIMEOUT/ROUTE_UNREACHABLE
        // are genuine transient failures and must stay untagged so they keep reporting to Sentry.
        expect(result.error.details).toEqual(details);
    });
});
