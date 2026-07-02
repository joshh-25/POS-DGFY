import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const TOKEN_TYPE = 'pos_terminal_pairing';
const ISSUER = 'skupervisor-pos';
const AUDIENCE = 'pos-terminal';
const EXPIRES_IN = '30d';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const TEST_SECRET = 'test_pos_terminal_pairing_secret_32_chars!';

const invalidPairingError = () => {
    const error = new Error('This POS device pairing is missing, expired, or no longer valid.');
    error.statusCode = 401;
    error.code = 'POS_TERMINAL_PAIRING_INVALID';
    return error;
};

const resolvePairingSecret = () => {
    const configured = String(process.env.POS_TERMINAL_PAIRING_SECRET || '').trim();
    if (configured.length >= 32) return configured;
    if (process.env.NODE_ENV === 'test') return TEST_SECRET;
    throw new Error('POS_TERMINAL_PAIRING_SECRET must be configured with at least 32 characters');
};

const buildBindingFingerprint = ({ pairingVersion, locationId }) => (
    crypto
        .createHash('sha256')
        .update(`${String(pairingVersion || '').trim()}\u0000${Number(locationId) || 0}\u0000active`)
        .digest('hex')
);

export const issue = ({ tenantId, terminalId, pairingVersion, locationId }) => {
    const normalizedTenantId = String(tenantId || '').trim();
    const normalizedTerminalId = String(terminalId || '').trim().toUpperCase();
    const normalizedPairingVersion = String(pairingVersion || '').trim();
    const normalizedLocationId = Number.parseInt(locationId, 10);
    if (!normalizedTenantId || !normalizedTerminalId || !normalizedPairingVersion || normalizedLocationId <= 0) {
        throw new Error('Complete tenant, terminal, pairing version, and location context is required for POS pairing');
    }

    return jwt.sign({
        token_type: TOKEN_TYPE,
        tenant_id: normalizedTenantId,
        terminal_id: normalizedTerminalId,
        location_id: normalizedLocationId,
        binding_fingerprint: buildBindingFingerprint({ pairingVersion: normalizedPairingVersion, locationId: normalizedLocationId })
    }, resolvePairingSecret(), {
        expiresIn: EXPIRES_IN,
        issuer: ISSUER,
        audience: AUDIENCE,
        subject: normalizedTerminalId
    });
};

export const verify = (token) => {
    try {
        const claims = jwt.verify(String(token || ''), resolvePairingSecret(), { issuer: ISSUER, audience: AUDIENCE });
        if (claims?.token_type !== TOKEN_TYPE) throw invalidPairingError();
        return claims;
    } catch {
        throw invalidPairingError();
    }
};

export const assertBinding = ({ claims, tenantId, terminalId, pairingVersion, locationId }) => {
    const valid = String(claims?.tenant_id || '') === String(tenantId || '')
        && String(claims?.terminal_id || '') === String(terminalId || '').toUpperCase()
        && Number(claims?.location_id) === Number(locationId)
        && String(claims?.binding_fingerprint || '') === buildBindingFingerprint({ pairingVersion, locationId });
    if (!valid) throw invalidPairingError();
    return true;
};

export const maxAgeMs = MAX_AGE_MS;
export default { issue, verify, assertBinding, maxAgeMs };
