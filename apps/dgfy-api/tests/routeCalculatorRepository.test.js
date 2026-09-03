import { jest } from '@jest/globals';

const mockGet = jest.fn();

jest.unstable_mockModule('axios', () => ({
    default: { get: mockGet }
}));

let routeCalculatorRepository;
let RouteCalculatorError;

beforeAll(async () => {
    process.env.ROUTE_CALCULATOR_ENDPOINT = 'http://graphhopper.test';
    const mod = await import('../src/modules/routeCalculator/repositories/routeCalculatorRepository.js');
    routeCalculatorRepository = mod.routeCalculatorRepository;
    RouteCalculatorError = mod.RouteCalculatorError;
});

beforeEach(() => {
    mockGet.mockReset();
});

describe('routeCalculatorRepository.calculateRoute', () => {
    it('maps a successful GraphHopper response to the normalized shape', async () => {
        mockGet.mockResolvedValue({
            data: {
                paths: [{
                    distance: 3220.846,
                    time: 333252,
                    points: { type: 'LineString', coordinates: [[122.564367, 10.697997], [122.568404, 10.7018]] },
                    instructions: [{ text: 'Continue', distance: 195.461, time: 23455 }]
                }]
            }
        });

        const result = await routeCalculatorRepository.calculateRoute({
            originLat: 10.6980, originLng: 122.5645, destLat: 10.7202, destLng: 122.5621, profile: 'car'
        });

        expect(result).toEqual({
            distance_meters: 3220.846,
            duration_seconds: 333,
            geometry: { type: 'LineString', coordinates: [[122.564367, 10.697997], [122.568404, 10.7018]] },
            instructions: [{ text: 'Continue', distance_meters: 195.461, duration_seconds: 23 }]
        });

        expect(mockGet).toHaveBeenCalledWith('http://graphhopper.test/route', expect.objectContaining({
            params: expect.objectContaining({
                point: ['10.698,122.5645', '10.7202,122.5621'],
                profile: 'car',
                points_encoded: false
            })
        }));
    });

    it('throws ROUTE_NOT_FOUND when GraphHopper returns no paths', async () => {
        mockGet.mockResolvedValue({ data: { paths: [] } });

        await expect(routeCalculatorRepository.calculateRoute({
            originLat: 10, originLng: 122, destLat: 10.1, destLng: 122.1, profile: 'car'
        })).rejects.toMatchObject({ code: 'ROUTE_NOT_FOUND' });
    });

    it('throws ROUTE_TIMEOUT on an aborted request', async () => {
        const timeoutError = new Error('timeout of 6000ms exceeded');
        timeoutError.code = 'ECONNABORTED';
        mockGet.mockRejectedValue(timeoutError);

        await expect(routeCalculatorRepository.calculateRoute({
            originLat: 10, originLng: 122, destLat: 10.1, destLng: 122.1, profile: 'car'
        })).rejects.toMatchObject({ code: 'ROUTE_TIMEOUT' });
    });

    it('throws ROUTE_NOT_FOUND on a GraphHopper 4xx (e.g. point out of coverage)', async () => {
        const badRequestError = new Error('Request failed with status code 400');
        badRequestError.response = { status: 400, data: { message: 'Point out of bounds' } };
        mockGet.mockRejectedValue(badRequestError);

        await expect(routeCalculatorRepository.calculateRoute({
            originLat: 10, originLng: 122, destLat: 10.1, destLng: 122.1, profile: 'car'
        })).rejects.toMatchObject({ code: 'ROUTE_NOT_FOUND' });
    });

    it('throws ROUTE_UNREACHABLE on a network/5xx failure', async () => {
        mockGet.mockRejectedValue(new Error('connect ECONNREFUSED'));

        await expect(routeCalculatorRepository.calculateRoute({
            originLat: 10, originLng: 122, destLat: 10.1, destLng: 122.1, profile: 'car'
        })).rejects.toBeInstanceOf(RouteCalculatorError);
        await expect(routeCalculatorRepository.calculateRoute({
            originLat: 10, originLng: 122, destLat: 10.1, destLng: 122.1, profile: 'car'
        })).rejects.toMatchObject({ code: 'ROUTE_UNREACHABLE' });
    });

    // Phase 236 (#1328, epic #1321): additive `timeoutMs` param -- §3.1 Option A.
    it('uses the env-driven default timeout when timeoutMs is omitted (byte-identical to pre-#1328 behavior)', async () => {
        mockGet.mockResolvedValue({ data: { paths: [{ distance: 100, time: 1000 }] } });

        await routeCalculatorRepository.calculateRoute({
            originLat: 10, originLng: 122, destLat: 10.1, destLng: 122.1, profile: 'car'
        });

        expect(mockGet).toHaveBeenCalledWith('http://graphhopper.test/route', expect.objectContaining({
            timeout: 6000
        }));
    });

    it('uses the caller-supplied timeoutMs when present, overriding the env default', async () => {
        mockGet.mockResolvedValue({ data: { paths: [{ distance: 100, time: 1000 }] } });

        await routeCalculatorRepository.calculateRoute({
            originLat: 10, originLng: 122, destLat: 10.1, destLng: 122.1, profile: 'car', timeoutMs: 600
        });

        expect(mockGet).toHaveBeenCalledWith('http://graphhopper.test/route', expect.objectContaining({
            timeout: 600
        }));
    });
});
