import crypto from 'crypto';

export const STRUCTURED_REQUEST_LOG_EVENT = 'request_outcome';

const HASH_SALT = process.env.OBSERVABILITY_HASH_SALT
    || process.env.JWT_SECRET
    || 'sku-observability-local-salt';

export const getStatusClass = (statusCode) => {
    const status = Number(statusCode) || 0;
    if (status >= 500) return '5xx';
    if (status >= 400) return '4xx';
    if (status >= 300) return '3xx';
    if (status >= 200) return '2xx';
    if (status >= 100) return '1xx';
    return 'unknown';
};

export const resolveSurface = (reqOrPath = {}) => {
    const path = typeof reqOrPath === 'string'
        ? reqOrPath
        : `${reqOrPath.baseUrl || ''}${reqOrPath.path || reqOrPath.originalUrl || ''}`;
    const normalized = String(path || '').toLowerCase();

    if (normalized.includes('/api/v1/pos')) return 'pos';
    if (normalized.includes('/api/v1/store') || normalized.includes('/tenant-store')) return 'storefront';
    if (normalized.includes('/api/v1/dgfy') || normalized.includes('/dgfy')) return 'dgfy';
    if (normalized.includes('/api/v1/admin') || normalized.includes('/admin')) return 'admin';
    if (normalized.includes('/api/v1/payments') || normalized.includes('/api/v1/payment')) return 'payments';
    if (normalized.includes('/api/v1/services')) return 'services';
    if (normalized.includes('/api/v1/hospitality')) return 'hospitality';
    if (normalized.includes('/api/v1/fnb')) return 'fnb';
    if (normalized.includes('/api/')) return 'ims';
    if (normalized === '/health' || normalized.endsWith('/health') || normalized === '/metrics') return 'ops';
    return 'web';
};

export const normalizeRouteForObservability = (req = {}) => {
    if (req.route?.path) {
        const base = req.baseUrl || '';
        return `${base}${req.route.path}` || req.path || 'unknown';
    }
    return req.path || req.originalUrl || 'unknown';
};

export const hashIp = (ip) => {
    const value = String(ip || '').trim();
    if (!value) return null;
    return crypto
        .createHash('sha256')
        .update(`${HASH_SALT}:${value}`)
        .digest('hex')
        .slice(0, 24);
};

export const resolveUserAgentFamily = (userAgent = '') => {
    const value = String(userAgent || '').toLowerCase();
    if (!value) return 'unknown';
    if (value.includes('edg/')) return 'edge';
    if (value.includes('chrome/') || value.includes('chromium/')) return 'chrome';
    if (value.includes('firefox/')) return 'firefox';
    if (value.includes('safari/') && !value.includes('chrome/')) return 'safari';
    if (value.includes('postman')) return 'postman';
    if (value.includes('curl/')) return 'curl';
    if (value.includes('node')) return 'node';
    return 'other';
};

export const isStructuredRequestLoggingEnabled = () => (
    String(process.env.STRUCTURED_REQUEST_LOGS || 'true').trim().toLowerCase() !== 'false'
);
