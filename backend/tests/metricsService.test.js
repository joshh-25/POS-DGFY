import {
    recordHttpRequestMetrics,
    renderPrometheusMetrics,
    resetMetricsForTests
} from '../src/services/metricsService.js';

describe('metricsService', () => {
    beforeEach(() => {
        resetMetricsForTests();
    });

    it('renders request counters and histogram metrics', () => {
        recordHttpRequestMetrics({
            method: 'GET',
            route: '/api/v1/items',
            statusCode: 200,
            durationMs: 123
        });
        recordHttpRequestMetrics({
            method: 'GET',
            route: '/api/v1/items',
            statusCode: 200,
            durationMs: 321
        });

        const text = renderPrometheusMetrics();
        expect(text).toContain('sku_http_requests_total');
        expect(text).toContain('method="GET"');
        expect(text).toContain('route="/api/v1/items"');
        expect(text).toContain('sku_http_request_duration_milliseconds_sum');
    });
});
