import crypto from 'node:crypto';

const EXPO_TOKEN_PATTERN = /^(?:ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_\-+.=:/]{8,236}\]$/;

export const isValidExpoPushToken = (value) => (
    typeof value === 'string' && EXPO_TOKEN_PATTERN.test(value.trim())
);

export const hashExpoPushToken = (value, { secret = process.env.PUSH_TOKEN_HASH_SECRET } = {}) => {
    const token = String(value || '').trim();
    if (!isValidExpoPushToken(token)) {
        const error = new Error('Invalid Expo push token');
        error.code = 'invalid_push_token';
        throw error;
    }

    const fallbackSecret = process.env.NODE_ENV === 'production'
        ? ''
        : process.env.JWT_SECRET || 'local-push-token-hash-secret';
    const selectedSecret = String(secret || fallbackSecret).trim();
    if (!selectedSecret) {
        const error = new Error('Push token hash secret is not configured');
        error.code = 'push_token_hash_secret_required';
        throw error;
    }

    return crypto.createHmac('sha256', selectedSecret).update(token).digest('hex');
};

export const toSafePushErrorCode = (value, fallback = 'push_provider_error') => {
    const normalized = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 80);
    return normalized || fallback;
};
