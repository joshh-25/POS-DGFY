import crypto from 'node:crypto';

const EXPO_TOKEN_PATTERN = /^(?:ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_\-+.=:/]{8,236}\]$/;

export const isValidExpoPushToken = (value) => (
    typeof value === 'string' && EXPO_TOKEN_PATTERN.test(value.trim())
);

const resolveHashSecret = (secret) => {
    const fallbackSecret = process.env.NODE_ENV === 'production'
        ? ''
        : process.env.JWT_SECRET || 'local-push-token-hash-secret';
    const selectedSecret = String(secret || fallbackSecret).trim();
    if (!selectedSecret) {
        const error = new Error('Push token hash secret is not configured');
        error.code = 'push_token_hash_secret_required';
        throw error;
    }
    return selectedSecret;
};

export const hashExpoPushToken = (value, { secret = process.env.PUSH_TOKEN_HASH_SECRET } = {}) => {
    const token = String(value || '').trim();
    if (!isValidExpoPushToken(token)) {
        const error = new Error('Invalid Expo push token');
        error.code = 'invalid_push_token';
        throw error;
    }

    return crypto.createHmac('sha256', resolveHashSecret(secret)).update(token).digest('hex');
};

// Operator-facing pseudonymous registration reference: a short prefix of the same keyed hash the
// delivery log stores, so a registration row can be matched to its delivery attempts without
// exposing the token. Returns null when the hash secret is unavailable instead of throwing.
export const toPushRegistrationRef = (token, options) => {
    try {
        return hashExpoPushToken(token, options).slice(0, 12);
    } catch {
        return null;
    }
};

// Keyed, one-way correlation reference for an order. Operators can see that several attempts and
// dispatch decisions belong to the same order without being shown the tracking PIN (which grants
// order-tracking access) or the numeric order id. Null when the hash secret is unavailable.
export const toPushCorrelationRef = (tenantId, reference, options = {}) => {
    const value = String(reference || '').trim();
    if (!value) return null;
    try {
        const secret = resolveHashSecret(options.secret ?? process.env.PUSH_TOKEN_HASH_SECRET);
        return crypto.createHmac('sha256', secret)
            .update(`push-correlation:${String(tenantId || '').trim()}:${value}`)
            .digest('hex')
            .slice(0, 12);
    } catch {
        return null;
    }
};

export const generatePushDiagnosticEnrollmentCode = () => crypto.randomBytes(24).toString('base64url');

// Domain-separated from token hashes so an enrollment code can never collide with a token hash.
export const hashPushDiagnosticEnrollmentCode = (code, { secret = process.env.PUSH_TOKEN_HASH_SECRET } = {}) => (
    crypto.createHmac('sha256', resolveHashSecret(secret))
        .update(`push-diagnostic-enrollment:${String(code || '').trim()}`)
        .digest('hex')
);

export const toSafePushErrorCode = (value, fallback = 'push_provider_error') => {
    const normalized = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 80);
    return normalized || fallback;
};
