import crypto from 'node:crypto';

const normalizeIp = (value) => String(value || '').trim().replace(/^::ffff:/, '');
const configuredIps = () => new Set(
    String(process.env.STOREFRONT_DOMAIN_CONTROLLER_ALLOWED_IPS || '')
        .split(',')
        .map(normalizeIp)
        .filter(Boolean)
);

const safeEqual = (provided, expected) => {
    const providedBuffer = Buffer.from(String(provided || ''), 'utf8');
    const expectedBuffer = Buffer.from(String(expected || ''), 'utf8');
    return providedBuffer.length === expectedBuffer.length
        && crypto.timingSafeEqual(providedBuffer, expectedBuffer);
};

export const authenticateStorefrontDomainController = (req, res, next) => {
    const expected = String(process.env.STOREFRONT_DOMAIN_CONTROLLER_TOKEN || '').trim();
    const authorization = String(req.headers.authorization || '');
    const provided = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    const controllerId = String(req.headers['x-controller-id'] || '').trim().slice(0, 120);
    const allowedIps = configuredIps();
    const requestIp = normalizeIp(req.ip || req.socket?.remoteAddress);

    const productionPolicyReady = expected.length >= 32
        && (process.env.NODE_ENV !== 'production' || allowedIps.size > 0);
    const ipAllowed = process.env.NODE_ENV !== 'production' || allowedIps.has(requestIp);

    if (!productionPolicyReady || !ipAllowed || !controllerId || !safeEqual(provided, expected)) {
        return res.status(401).json({
            success: false,
            message: 'Controller authentication failed.',
            error_code: 'STOREFRONT_DOMAIN_CONTROLLER_UNAUTHORIZED',
            timestamp: new Date().toISOString()
        });
    }

    req.storefrontDomainController = { id: controllerId, ip: requestIp };
    return next();
};

export const storefrontDomainControllerAuthInternals = {
    normalizeIp,
    safeEqual
};
