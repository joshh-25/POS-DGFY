const REQUEST_DURATION_BUCKETS_MS = [50, 100, 250, 500, 1000, 3000, 10000];

const metricState = {
    requestCountByMethodStatus: new Map(),
    errorCountBySurfaceStatusCode: new Map(),
    requestDurationBuckets: new Map(),
    requestDurationSumMs: 0,
    requestDurationCount: 0
};

const serializeLabels = (labels) => Object.entries(labels)
    .map(([key, value]) => `${key}="${String(value).replace(/"/g, '\\"')}"`)
    .join(',');

const makeMetricKey = (labels) => Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${value}`)
    .join('|');

const incrementMapValue = (map, key, delta = 1) => {
    map.set(key, (map.get(key) || 0) + delta);
};

const getDurationBucket = (durationMs) => {
    for (const bucket of REQUEST_DURATION_BUCKETS_MS) {
        if (durationMs <= bucket) return bucket;
    }
    return '+Inf';
};

export const recordHttpRequestMetrics = ({ method, route, statusCode, durationMs }) => {
    const safeMethod = method || 'UNKNOWN';
    const safeRoute = route || 'unknown';
    const safeStatus = statusCode || 0;
    const safeDuration = Number.isFinite(durationMs) ? Math.max(durationMs, 0) : 0;

    const countLabels = { method: safeMethod, route: safeRoute, status: safeStatus };
    incrementMapValue(metricState.requestCountByMethodStatus, makeMetricKey(countLabels));

    const durationLabels = { method: safeMethod, route: safeRoute, le: getDurationBucket(safeDuration) };
    incrementMapValue(metricState.requestDurationBuckets, makeMetricKey(durationLabels));

    metricState.requestDurationCount += 1;
    metricState.requestDurationSumMs += safeDuration;
};

export const recordHttpErrorMetrics = ({ surface, statusClass, errorCode }) => {
    const labels = {
        surface: surface || 'unknown',
        status_class: statusClass || 'unknown',
        error_code: errorCode || 'unknown'
    };
    incrementMapValue(metricState.errorCountBySurfaceStatusCode, makeMetricKey(labels));
};

const parseMetricKey = (key) => Object.fromEntries(
    key.split('|').map((pair) => {
        const index = pair.indexOf(':');
        return [pair.slice(0, index), pair.slice(index + 1)];
    })
);

export const renderPrometheusMetrics = () => {
    const lines = [];

    lines.push('# HELP sku_http_requests_total Total HTTP requests grouped by method, route, and status.');
    lines.push('# TYPE sku_http_requests_total counter');
    for (const [key, count] of metricState.requestCountByMethodStatus.entries()) {
        const labels = parseMetricKey(key);
        lines.push(`sku_http_requests_total{${serializeLabels(labels)}} ${count}`);
    }

    lines.push('# HELP sku_http_request_duration_milliseconds Request duration histogram buckets.');
    lines.push('# TYPE sku_http_request_duration_milliseconds histogram');
    for (const [key, count] of metricState.requestDurationBuckets.entries()) {
        const labels = parseMetricKey(key);
        lines.push(`sku_http_request_duration_milliseconds_bucket{${serializeLabels(labels)}} ${count}`);
    }
    lines.push(`sku_http_request_duration_milliseconds_sum ${metricState.requestDurationSumMs}`);
    lines.push(`sku_http_request_duration_milliseconds_count ${metricState.requestDurationCount}`);

    lines.push('# HELP sku_http_errors_total Total HTTP error responses grouped by surface, status class, and stable error code.');
    lines.push('# TYPE sku_http_errors_total counter');
    for (const [key, count] of metricState.errorCountBySurfaceStatusCode.entries()) {
        const labels = parseMetricKey(key);
        lines.push(`sku_http_errors_total{${serializeLabels(labels)}} ${count}`);
    }

    return `${lines.join('\n')}\n`;
};

export const resetMetricsForTests = () => {
    metricState.requestCountByMethodStatus.clear();
    metricState.errorCountBySurfaceStatusCode.clear();
    metricState.requestDurationBuckets.clear();
    metricState.requestDurationSumMs = 0;
    metricState.requestDurationCount = 0;
};

export const metricsEnabled = () => process.env.METRICS_ENABLED === 'true';
