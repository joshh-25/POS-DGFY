import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const PAIRING_TOKEN_TYPE = 'pos_terminal_pairing';
const PAIRING_TOKEN_ISSUER = 'skupervisor-pos';
const PAIRING_TOKEN_AUDIENCE = 'pos-terminal';
const PAIRING_EXPIRES_IN = '30d';

const resolvePairingSecret = () => {
    const configured = String(
        process.env.POS_TERMINAL_PAIRING_SECRET
        || process.env.REFRESH_TOKEN_SECRET
        || ''
    ).trim();
    if (configured) return configured;
    if (process.env.NODE_ENV === 'test') {
        return 'test_pos_terminal_pairing_secret_32_chars!';
    }
    throw new Error('POS terminal pairing secret is not configured');
};

const buildBindingFingerprint = ({ terminalPasswordHash, locationId }) => (
    crypto
        .createHash('sha256')
        .update(`${String(terminalPasswordHash || '').trim()}\u0000${Number(locationId) || 0}`)
        .digest('hex')
);

const invalidPairingError = () => {
    const error = new Error('This POS device pairing is missing, expired, or no longer valid.');
    error.statusCode = 401;
    return error;
};

export const issue = ({ tenantId, terminalId, terminalPasswordHash, locationId }) => {
    const normalizedTenantId = String(tenantId || '').trim();
    const normalizedTerminalId = String(terminalId || '').trim();
    const normalizedPasswordHash = String(terminalPasswordHash || '').trim();
    const normalizedLocationId = Number.parseInt(locationId, 10);
    if (!normalizedTenantId || !normalizedTerminalId || !normalizedPasswordHash || normalizedLocationId <= 0) {
        throw new Error('Complete tenant, terminal, password, and location context is required for POS pairing');
    }

    return jwt.sign({
        token_type: PAIRING_TOKEN_TYPE,
        tenant_id: normalizedTenantId,
        terminal_id: normalizedTerminalId,
        location_id: normalizedLocationId,
        binding_fingerprint: buildBindingFingerprint({
            terminalPasswordHash: normalizedPasswordHash,
            locationId: normalizedLocationId
        })
    }, resolvePairingSecret(), {
        expiresIn: PAIRING_EXPIRES_IN,
        issuer: PAIRING_TOKEN_ISSUER,
        audience: PAIRING_TOKEN_AUDIENCE,
        subject: normalizedTerminalId
    });
};

export const verify = (token) => {
    try {
        const claims = jwt.verify(String(token || ''), resolvePairingSecret(), {
            issuer: PAIRING_TOKEN_ISSUER,
            audience: PAIRING_TOKEN_AUDIENCE
        });
        if (claims?.token_type !== PAIRING_TOKEN_TYPE) throw invalidPairingError();
        return claims;
    } catch {
        throw invalidPairingError();
    }
};

export const assertBinding = ({ claims, tenantId, terminalId, terminalPasswordHash, locationId }) => {
    const expectedFingerprint = buildBindingFingerprint({ terminalPasswordHash, locationId });
    const valid = String(claims?.tenant_id || '') === String(tenantId || '')
        && String(claims?.terminal_id || '') === String(terminalId || '')
        && Number(claims?.location_id) === Number(locationId)
        && String(claims?.binding_fingerprint || '') === expectedFingerprint;
    if (!valid) throw invalidPairingError();
    return true;
};

export const maxAgeMs = 30 * 24 * 60 * 60 * 1000;

export default { issue, verify, assertBinding, maxAgeMs };
