import { jest } from '@jest/globals';
import { buildCalculateRouteUseCase } from '../src/modules/routeCalculator/usecases/routeCalculatorUseCases.js';
import { RouteCalculatorError } from '../src/modules/routeCalculator/repositories/routeCalculatorRepository.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';
import { resolveDomainFailure } from '../src/modules/shared/controllers/useCaseResponder.js';

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
        // #508 -- tags this as an expected precondition (not a fault) for the Sentry capture
        // boundary's allowlist, via the internal-only `observabilityReasonCode`, NOT `details`.
        expect(result.error.observabilityReasonCode).toBe('ROUTE_CALCULATOR_NOT_CONFIGURED');
        // Regression guard (PR #791 RF-1): `details` -- and therefore the handler's `errors`
        // field in the actual HTTP response -- must stay exactly as it was before #508.
        expect(result.error.details).toBeNull();
        expect(resolveDomainFailure(result).details).toBeNull();
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
        ['ROUTE_CALCULATOR_DISABLED', DomainErrorCode.SERVICE_UNAVAILABLE, 'ROUTE_CALCULATOR_NOT_CONFIGURED'],
        ['ROUTE_TIMEOUT', DomainErrorCode.SERVICE_UNAVAILABLE, null],
        ['ROUTE_UNREACHABLE', DomainErrorCode.SERVICE_UNAVAILABLE, null],
        ['ROUTE_NOT_FOUND', DomainErrorCode.VALIDATION_FAILED, null]
    ])('maps repository error %s to domain code %s', async (repoCode, domainCode, observabilityReasonCode) => {
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
        expect(result.error.observabilityReasonCode).toBe(observabilityReasonCode);
        // Regression guard (PR #791 RF-1): none of these cases may leak a new field into `details`
        // / the handler's `errors` response field.
        expect(result.error.details).toBeNull();
        expect(resolveDomainFailure(result).details).toBeNull();
    });

    // Phase 236 (#1328, epic #1321): additive `timeoutMs` param -- §3.1 Option A.
    it('forwards a caller-supplied timeoutMs through to the repository', async () => {
        process.env.ROUTE_CALCULATOR_ENDPOINT = 'http://graphhopper.test';
        const routeCalculatorRepository = { calculateRoute: jest.fn().mockResolvedValue({ distance_meters: 100 }) };
        const calculateRoute = buildCalculateRouteUseCase({ routeCalculatorRepository });

        await calculateRoute({ originLat: 10, originLng: 122, destLat: 10.1, destLng: 122.1, timeoutMs: 600 });

        expect(routeCalculatorRepository.calculateRoute).toHaveBeenCalledWith(expect.objectContaining({ timeoutMs: 600 }));
    });

    it('omitting timeoutMs (every pre-#1328 caller) forwards undefined, unchanged from before', async () => {
        process.env.ROUTE_CALCULATOR_ENDPOINT = 'http://graphhopper.test';
        const routeCalculatorRepository = { calculateRoute: jest.fn().mockResolvedValue({ distance_meters: 100 }) };
        const calculateRoute = buildCalculateRouteUseCase({ routeCalculatorRepository });

        await calculateRoute({ originLat: 10, originLng: 122, destLat: 10.1, destLng: 122.1 });

        expect(routeCalculatorRepository.calculateRoute).toHaveBeenCalledWith(expect.objectContaining({ timeoutMs: undefined }));
    });
});
