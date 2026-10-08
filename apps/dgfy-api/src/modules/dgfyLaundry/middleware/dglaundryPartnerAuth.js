import crypto from 'crypto';
import fs from 'fs';
import { getRedisClient, isRedisConnected } from '../../../config/redis.js';
import { validateDglaundryMachineToken } from '../services/dgfyLaundryOidcProvider.js';

const REQUEST_NONCE_PREFIX = 'dgfy:dglaundry:partner-request-nonce:v1';
const MACHINE_CLIENT_ID = String(process.env.DGFY_DGLAUNDRY_MACHINE_CLIENT_ID || 'dglaundry-machine').trim();
// This is the one inbound DGLaundry machine scope used by the existing client.
// The dglaundry:* operation scopes belong to the opposite (DGFY -> DGLaundry) direction.
const MACHINE_PARTNER_SCOPE = 'dglaundry';
const EXPECTED_PARTNER_APP_ID = String(
    process.env.DGFY_DGLAUNDRY_PARTNER_APP_ID || (process.env.NODE_ENV === 'production' ? '' : 'dglaundry')
).trim();
// This memory cache is only for non-production local tests; production must use shared Redis.
const localRequestNonces = new Map();

const readSecret = () => {
    if (process.env.DGLAUNDRY_PARTNER_TOKEN_FILE) {
        try { return fs.readFileSync(process.env.DGLAUNDRY_PARTNER_TOKEN_FILE, 'utf8').trim(); } catch { return ''; }
    }
    return String(process.env.DGLAUNDRY_PARTNER_TOKEN || '').trim();
};

const readConfigured = (name) => {
    const direct = String(process.env[name] || '').trim();
    if (direct) return direct;
    const file = String(process.env[`${name}_FILE`] || '').trim();
    if (!file) return '';
    try { return fs.readFileSync(file, 'utf8').trim(); } catch { return ''; }
};

const parseSignature = (signatureValue, inputValue) => {
    const signatureMatch = String(signatureValue || '').trim().match(/^sig1=:([^:]+):$/);
    const inputMatch = String(inputValue || '').trim().match(/^sig1=(\([^)]*\));(.*)$/);
    if (!signatureMatch || !inputMatch) return null;
    const components = [...inputMatch[1].matchAll(/"([^"\\]+)"/g)].map((match) => match[1]);
    const params = Object.fromEntries(inputMatch[2].split(/;\s*/).filter(Boolean).map((part) => {
        const index = part.indexOf('=');
        return index < 0 ? [part, ''] : [part.slice(0, index), part.slice(index + 1).replace(/^"|"$/g, '')];
    }));
    const created = Number(params.created);
    const expires = Number(params.expires);
    if (!Number.isInteger(created) || !Number.isInteger(expires) || !params.keyid || !params.nonce || !params.alg || !params.tag) return null;
    return { signature: signatureMatch[1], components, signatureParams: `${inputMatch[1]};${inputMatch[2]}`, created, expires, keyId: params.keyid, nonce: params.nonce, algorithm: params.alg, tag: params.tag };
};

const claimRequestNonce = async ({ keyId, nonce, expiresAt, now }) => {
    const ttlSeconds = expiresAt - now;
    if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1) return 'DGLAUNDRY_REQUEST_TIMESTAMP_INVALID';

    let redis = null;
    try {
        if (isRedisConnected()) redis = getRedisClient();
    } catch {
        redis = null;
    }

    if (redis) {
        const nonceDigest = crypto.createHash('sha256').update(`${keyId}\0${nonce}`).digest('hex');
        try {
            const result = await redis.set(`${REQUEST_NONCE_PREFIX}:${nonceDigest}`, '1', { EX: ttlSeconds, NX: true });
            if (result === 'OK') return true;
            if (result === null) return false;
            return 'DGLAUNDRY_REQUEST_REPLAY_STORE_UNAVAILABLE';
        } catch {
            return 'DGLAUNDRY_REQUEST_REPLAY_STORE_UNAVAILABLE';
        }
    }

    if (process.env.NODE_ENV === 'production') return 'DGLAUNDRY_REQUEST_REPLAY_STORE_UNAVAILABLE';

    for (const [entry, expires] of localRequestNonces) if (expires <= now) localRequestNonces.delete(entry);
    const localKey = `${keyId}:${nonce}`;
    if (localRequestNonces.has(localKey)) return false;
    localRequestNonces.set(localKey, expiresAt);
    return true;
};

export const verifyAsymmetricRequest = async ({ req, rawBody }) => {
    rawBody = String(rawBody || '');
    const publicKey = readConfigured('DGLAUNDRY_PARTNER_REQUEST_PUBLIC_KEY');
    const expectedKeyId = readConfigured('DGLAUNDRY_PARTNER_REQUEST_KEY_ID');
    if (!publicKey || !expectedKeyId) return 'DGLAUNDRY_REQUEST_PUBLIC_KEY_NOT_CONFIGURED';
    const parsed = parseSignature(req.headers.signature, req.headers['signature-input']);
    if (!parsed || parsed.algorithm !== 'ecdsa-p256-sha256' || parsed.tag !== 'dgfy-external-runtime-v1' || parsed.keyId !== expectedKeyId) return 'DGLAUNDRY_REQUEST_SIGNATURE_REQUIRED';
    const hasBody = rawBody.length > 0;
    const expectedComponents = ['@method', '@target-uri', ...(hasBody ? ['content-digest', 'content-type'] : []), 'authorization', ...(req.headers['idempotency-key'] ? ['idempotency-key'] : []), 'x-dgfy-app-id', 'x-dgfy-contract-version', 'date'];
    if (JSON.stringify(parsed.components) !== JSON.stringify(expectedComponents)) return 'DGLAUNDRY_REQUEST_SIGNATURE_COMPONENTS_INVALID';
    const now = Math.floor(Date.now() / 1000);
    const maxSkew = Math.max(30, Number(process.env.DGLAUNDRY_INTEGRATION_MAX_SKEW_SECONDS || 300));
    if (parsed.created > now + maxSkew || parsed.expires < now || parsed.expires <= parsed.created || parsed.expires - parsed.created > maxSkew) return 'DGLAUNDRY_REQUEST_TIMESTAMP_INVALID';
    const headers = { authorization: req.headers.authorization, 'x-dgfy-app-id': req.headers['x-dgfy-app-id'], 'x-dgfy-contract-version': req.headers['x-dgfy-contract-version'], date: req.headers.date };
    if (req.headers['idempotency-key']) headers['idempotency-key'] = req.headers['idempotency-key'];
    if (hasBody) { headers['content-digest'] = req.headers['content-digest']; headers['content-type'] = req.headers['content-type']; const expectedDigest = `sha-256=:${crypto.createHash('sha256').update(rawBody).digest('base64')}:`; if (headers['content-digest'] !== expectedDigest || !headers['content-type']) return 'DGLAUNDRY_REQUEST_CONTENT_DIGEST_INVALID'; }
    if (!headers.authorization?.startsWith('Bearer ') || !headers['x-dgfy-app-id'] || !headers['x-dgfy-contract-version'] || !headers.date) return 'DGLAUNDRY_REQUEST_HEADERS_REQUIRED';
    const targetUri = `https://${req.headers.host || ''}${req.originalUrl || req.url || ''}`;
    const signatureBase = parsed.components.map((component) => component === '@method' ? `"@method": ${req.method.toUpperCase()}` : component === '@target-uri' ? `"@target-uri": ${targetUri}` : `"${component}": ${headers[component]}`).concat(`"@signature-params": ${parsed.signatureParams}`).join('\n');
    try { if (Buffer.from(parsed.signature, 'base64').length !== 64 || !crypto.verify('sha256', Buffer.from(signatureBase), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(parsed.signature, 'base64'))) return 'DGLAUNDRY_REQUEST_SIGNATURE_INVALID'; } catch { return 'DGLAUNDRY_REQUEST_SIGNATURE_INVALID'; }
    const nonceClaimed = await claimRequestNonce({ keyId: parsed.keyId, nonce: parsed.nonce, expiresAt: parsed.expires, now });
    if (nonceClaimed === 'DGLAUNDRY_REQUEST_REPLAY_STORE_UNAVAILABLE') return nonceClaimed;
    if (nonceClaimed === 'DGLAUNDRY_REQUEST_TIMESTAMP_INVALID') return nonceClaimed;
    if (!nonceClaimed) return 'DGLAUNDRY_REQUEST_REPLAY';
    return `${parsed.keyId}:${parsed.nonce}:${parsed.expires}`;
};

export const requireDglaundryPartner = async (req, res, next) => {
    try {
        const bearer = String(req.headers.authorization || '').trim();
        if (bearer.toLowerCase().startsWith('bearer ')) {
            const grant = await validateDglaundryMachineToken(bearer.replace(/^Bearer\s+/i, ''));
            if (grant) {
                if (grant.client_id !== MACHINE_CLIENT_ID || grant.scope !== MACHINE_PARTNER_SCOPE) {
                    return res.status(403).json({ success: false, message: 'DGLaundry machine token is not authorized for this partner API.', error_code: 'DGLAUNDRY_PARTNER_SCOPE_FORBIDDEN' });
                }
                if (!EXPECTED_PARTNER_APP_ID || String(req.headers['x-dgfy-app-id'] || '').trim() !== EXPECTED_PARTNER_APP_ID) {
                    return res.status(403).json({ success: false, message: 'DGLaundry application identity is not registered for this environment.', error_code: 'DGLAUNDRY_PARTNER_APP_FORBIDDEN' });
                }
                if (process.env.NODE_ENV === 'production' || process.env.DGLAUNDRY_SIGNATURE_PROFILE === 'http-message-signatures-v1') {
                    const replayKey = await verifyAsymmetricRequest({ req, rawBody: String(req.rawBody || '') });
                    if (replayKey === 'DGLAUNDRY_REQUEST_REPLAY_STORE_UNAVAILABLE') return res.status(503).json({ success: false, message: 'DGLaundry request replay protection is temporarily unavailable.', error_code: replayKey });
                    if (!replayKey || replayKey.startsWith('DGLAUNDRY_')) return res.status(401).json({ success: false, message: 'DGLaundry request signature is invalid.', error_code: replayKey || 'DGLAUNDRY_REQUEST_SIGNATURE_REQUIRED' });
                    req.dglaundryRequestReplayKey = replayKey;
                }
                req.partnerIdentity = grant.client_id;
                req.partnerScope = grant.scope;
                return next();
            }
            return res.status(401).json({ success: false, message: 'DGLaundry machine access token is invalid or expired.' });
        }
        // Hosted deployments must never downgrade to the retired shared-secret path, including
        // requests which omit Authorization entirely. Keep the fallback only for local tests.
        if (process.env.NODE_ENV === 'production') {
            return res.status(401).json({ success: false, message: 'DGLaundry machine authentication is required.', error_code: 'DGLAUNDRY_MACHINE_AUTHENTICATION_REQUIRED' });
        }
        const expected = readSecret();
        const supplied = String(req.headers['x-dglaundry-partner-token'] || '').trim();
        if (!expected || !supplied) return res.status(401).json({ success: false, message: 'DGLaundry partner authentication is required.' });
        const expectedBuffer = Buffer.from(expected);
        const suppliedBuffer = Buffer.from(supplied);
        if (expectedBuffer.length !== suppliedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, suppliedBuffer)) {
            return res.status(401).json({ success: false, message: 'Invalid DGLaundry partner authentication.' });
        }
        req.partnerIdentity = 'dglaundry';
        return next();
    } catch (error) {
        return next(error);
    }
};
