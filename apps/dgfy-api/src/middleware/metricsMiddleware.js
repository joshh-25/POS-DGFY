import { getStatusClass, resolveSurface } from '../services/observabilityUtils.js';
import { recordHttpErrorMetrics, recordHttpRequestMetrics, metricsEnabled } from '../services/metricsService.js';
import { recordBillingRouteOutcome } from '../services/billingRouteAuditService.js';

const normalizeRouteForMetrics = (req) => {
    if (req.route?.path) {
        const base = req.baseUrl || '';
        return `${base}${req.route.path}` || req.path || 'unknown';
    }
    return req.path || 'unknown';
};

export const metricsMiddleware = (req, res, next) => {
    if (!metricsEnabled() || req.path === '/metrics') {
        return next();
    }

    const startAt = process.hrtime.bigint();
    res.on('finish', () => {
        const endAt = process.hrtime.bigint();
        const durationMs = Number(endAt - startAt) / 1_000_000;
        const normalizedRoute = normalizeRouteForMetrics(req);

        recordHttpRequestMetrics({
            method: req.method,
            route: normalizedRoute,
            statusCode: res.statusCode,
            durationMs
        });

        if (res.statusCode >= 400) {
            recordHttpErrorMetrics({
                surface: resolveSurface(req),
                statusClass: getStatusClass(res.statusCode),
                errorCode: res.locals?.errorCode || 'unknown'
            });
        }

        recordBillingRouteOutcome({
            method: req.method,
            route: normalizedRoute,
            statusCode: res.statusCode,
            requestId: req.requestId || null
        });
    });

    next();
};

export default metricsMiddleware;
