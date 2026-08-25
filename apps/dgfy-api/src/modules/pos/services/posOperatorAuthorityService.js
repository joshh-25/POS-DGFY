import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const TOKEN_TYPE = 'pos_operator_authority';
const ISSUER = 'skupervisor-pos';
const AUDIENCE = 'pos-operator';
const EXPIRES_IN = '12h';
const MAX_AGE_MS = 12 * 60 * 60 * 1000;
const TEST_SECRET = 'test_pos_operator_authority_secret_32_chars!';

const resolveSecret = () => {
    const configured = String(process.env.POS_OPERATOR_AUTHORITY_SECRET || process.env.JWT_SECRET || '').trim();
    if (configured.length >= 32) return configured;
    if (process.env.NODE_ENV === 'test') return TEST_SECRET;
    throw new Error('JWT_SECRET or POS_OPERATOR_AUTHORITY_SECRET must be configured with at least 32 characters');
};

const normalize = (value) => String(value ?? '').trim();

export const hashAuthorityToken = (token) => crypto
    .createHash('sha256')
    .update(normalize(token))
    .digest('hex');

export const issue = ({
    tenantId,
    locationId,
    terminalId,
    shiftId,
    userId,
    operatorSessionId,
    expiresAt = null
} = {}) => {
    const normalizedTenantId = normalize(tenantId);
    const normalizedTerminalId = normalize(terminalId).toUpperCase();
    const normalizedLocationId = Number.parseInt(locationId, 10);
    const normalizedShiftId = Number.parseInt(shiftId, 10);
    const normalizedUserId = Number.parseInt(userId, 10);
    const normalizedSessionId = Number.parseInt(operatorSessionId, 10);
    if (!normalizedTenantId || !normalizedTerminalId || normalizedLocationId <= 0
        || normalizedShiftId <= 0 || normalizedUserId <= 0 || normalizedSessionId <= 0) {
        throw new Error('Complete operator authority scope is required');
    }

    const claims = {
        token_type: TOKEN_TYPE,
        tenant_id: normalizedTenantId,
        location_id: normalizedLocationId,
        terminal_id: normalizedTerminalId,
        shift_id: normalizedShiftId,
        user_id: normalizedUserId,
        operator_session_id: normalizedSessionId
    };
    return jwt.sign(claims, resolveSecret(), {
        expiresIn: EXPIRES_IN,
        issuer: ISSUER,
        audience: AUDIENCE,
        subject: String(normalizedSessionId),
        ...(expiresAt ? { expiresIn: Math.max(1, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)) } : {})
    });
};

export const verify = (token) => {
    const claims = jwt.verify(normalize(token), resolveSecret(), { issuer: ISSUER, audience: AUDIENCE });
    if (claims?.token_type !== TOKEN_TYPE) throw new Error('Invalid POS operator authority token');
    return claims;
};

export const maxAgeMs = MAX_AGE_MS;
export const cookieName = 'sku_pos_operator_authority';

export default { issue, verify, hashAuthorityToken, maxAgeMs, cookieName };
