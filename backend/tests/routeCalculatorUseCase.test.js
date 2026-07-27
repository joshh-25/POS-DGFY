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
        ['ROUTE_TIMEOUT', DomainErrorCode.SERVICE_UNAVAILABLE],
        ['ROUTE_UNREACHABLE', DomainErrorCode.SERVICE_UNAVAILABLE],
        ['ROUTE_NOT_FOUND', DomainErrorCode.VALIDATION_FAILED]
    ])('maps repository error %s to domain code %s', async (repoCode, domainCode) => {
        process.env.ROUTE_CALCULATOR_ENDPOINT = 'http://graphhopper.test';
        const routeCalculatorRepository = {
            calculateRoute: jest.fn().mockRejectedValue(new RouteCalculatorError(repoCode, 'boom'))
        };
        const calculateRoute = buildCalculateRouteUseCase({ routeCalculatorRepository });

        const result = await calculateRoute({ originLat: 10, originLng: 122, destLat: 10.1, destLng: 122.1 });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(domainCode);
    });
});
