import axios from 'axios';
import logger from '../../../config/logger.js';
import { routeCalculatorEndpoint, routeCalculatorTimeoutMs } from '../../../config/routeCalculatorFeature.js';

export class RouteCalculatorError extends Error {
    constructor(code, message, options = {}) {
        super(message);
        this.name = 'RouteCalculatorError';
        this.code = code;
        this.cause = options.cause || null;
    }
}

// GraphHopper's `points_encoded=false` returns `points` as a ready-to-use
// GeoJSON LineString, so no polyline decoding is needed here.
const mapGraphHopperPath = (path) => ({
    distance_meters: Number(path?.distance) || 0,
    duration_seconds: Number.isFinite(path?.time) ? Math.round(path.time / 1000) : 0,
    geometry: path?.points || null,
    instructions: Array.isArray(path?.instructions)
        ? path.instructions.map((step) => ({
            text: step?.text || '',
            distance_meters: Number(step?.distance) || 0,
            duration_seconds: Number.isFinite(step?.time) ? Math.round(step.time / 1000) : 0
        }))
        : []
});

export const routeCalculatorRepository = {
    calculateRoute: async ({ originLat, originLng, destLat, destLng, profile }) => {
        const endpoint = routeCalculatorEndpoint();
        if (!endpoint) {
            throw new RouteCalculatorError('ROUTE_CALCULATOR_DISABLED', 'Route calculator is not configured.');
        }

        let response;
        try {
            response = await axios.get(`${endpoint}/route`, {
                params: {
                    point: [`${originLat},${originLng}`, `${destLat},${destLng}`],
                    profile,
                    points_encoded: false,
                    locale: 'en'
                },
                paramsSerializer: { indexes: null },
                timeout: routeCalculatorTimeoutMs()
            });
        } catch (error) {
            if (error?.code === 'ECONNABORTED') {
                throw new RouteCalculatorError('ROUTE_TIMEOUT', 'Route calculator request timed out.', { cause: error });
            }
            if (error?.response?.status && error.response.status < 500) {
                // GraphHopper 4xx for points it genuinely cannot route (out of coverage,
                // water-locked, etc.) — not an infrastructure failure.
                throw new RouteCalculatorError(
                    'ROUTE_NOT_FOUND',
                    error?.response?.data?.message || 'No route could be found between these points.',
                    { cause: error }
                );
            }
            logger.warn('[routeCalculator] GraphHopper request failed', { message: error?.message });
            throw new RouteCalculatorError('ROUTE_UNREACHABLE', 'Route calculator is temporarily unavailable.', { cause: error });
        }

        const path = response?.data?.paths?.[0];
        if (!path) {
            throw new RouteCalculatorError('ROUTE_NOT_FOUND', 'No route could be found between these points.');
        }

        return mapGraphHopperPath(path);
    }
};
