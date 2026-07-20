import {
    recordHttpErrorMetrics,
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

    it('renders low-cardinality error counters', () => {
        recordHttpErrorMetrics({
            surface: 'storefront',
            statusClass: '5xx',
            errorCode: 'STORE_CATALOG_RUNTIME_ERROR'
        });

        const text = renderPrometheusMetrics();
        expect(text).toContain('sku_http_errors_total');
        expect(text).toContain('surface="storefront"');
        expect(text).toContain('status_class="5xx"');
        expect(text).toContain('error_code="STORE_CATALOG_RUNTIME_ERROR"');
        expect(text).not.toContain('request_id=');
    });
});
