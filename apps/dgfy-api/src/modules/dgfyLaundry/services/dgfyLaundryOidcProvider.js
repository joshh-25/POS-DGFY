import crypto from 'crypto';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import { getRedisClient, isRedisConnected } from '../../../config/redis.js';
import { dgfyAccountRepository } from '../../dgfy/repositories/dgfyAccountRepository.js';
import { resolveSigningKeyMaterial } from '../../shared/utils/oidcSigningKeyResolver.js';

const ISSUER = process.env.DGFY_OIDC_ISSUER || 'https://api.dgfy.ph/oidc';
const CLIENT_ID = process.env.DGFY_DGLAUNDRY_CLIENT_ID || 'dglaundry-web';
const REDIRECT_URI = process.env.DGFY_DGLAUNDRY_REDIRECT_URI || 'https://laundry.surebizcorp.com/api/v1/session/dgfy/callback';
const MACHINE_CLIENT_ID = String(process.env.DGFY_DGLAUNDRY_MACHINE_CLIENT_ID || 'dglaundry-machine').trim();
// The existing DGLaundry machine registration uses one inbound API scope.
// The dglaundry:* scopes are issued in the reverse DGFY -> DGLaundry direction.
const MACHINE_PARTNER_SCOPE = 'dglaundry';
const MACHINE_ASSERTION_AUDIENCE = String(process.env.DGFY_DGLAUNDRY_MACHINE_ASSERTION_AUDIENCE || `${ISSUER}/token`).trim();
const TTL_SECONDS = 120;
const memoryTransactions = new Map();

const readFile = (path) => {
    if (!path) return '';
    try { return fs.readFileSync(path, 'utf8'); } catch { return ''; }
};
// Browser OIDC client credentials are independent from the retired shared
// partner-token settings. Hosted deployments should deliver this through the
// secret manager as a file; the inline form is retained for local tooling.
const configuredSecret = () => readFile(process.env.DGFY_DGLAUNDRY_CLIENT_SECRET_FILE) || String(process.env.DGFY_DGLAUNDRY_CLIENT_SECRET || '').trim();
const privateKey = () => resolveSigningKeyMaterial({ inlineEnvVar: 'DGFY_OIDC_PRIVATE_KEY', fileEnvVar: 'DGFY_OIDC_PRIVATE_KEY_FILE', label: 'OIDC private signing key' }).pem;
const publicKey = () => resolveSigningKeyMaterial({ inlineEnvVar: 'DGFY_OIDC_PUBLIC_KEY', fileEnvVar: 'DGFY_OIDC_PUBLIC_KEY_FILE', label: 'OIDC public verification key' }).pem;
const machineClientPublicKey = () => readFile(process.env.DGFY_DGLAUNDRY_MACHINE_CLIENT_PUBLIC_KEY_FILE) || String(process.env.DGFY_DGLAUNDRY_MACHINE_CLIENT_PUBLIC_KEY || '').trim();
const keyId = () => String(process.env.DGFY_OIDC_KEY_ID || 'dglaundry-oidc-1').trim();

const useRedis = () => isRedisConnected() && getRedisClient();
const stateStoreUnavailable = () => Object.assign(new Error('Redis-backed OIDC state is required.'), { statusCode: 503 });
const store = async (key, value, ttlSeconds = TTL_SECONDS) => {
    const redis = useRedis();
    if (redis) {
        try { return await redis.set(key, JSON.stringify(value), { EX: ttlSeconds }); }
        catch { throw stateStoreUnavailable(); }
    }
    if (process.env.NODE_ENV === 'production') return false;
    memoryTransactions.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    return true;
};
const load = async (key) => {
    const redis = useRedis();
    if (redis) {
        try {
            const raw = await redis.get(key);
            return raw ? JSON.parse(raw) : null;
        } catch { throw stateStoreUnavailable(); }
    }
    if (process.env.NODE_ENV === 'production') throw stateStoreUnavailable();
    const entry = memoryTransactions.get(key);
    if (!entry || entry.expiresAt <= Date.now()) {
        memoryTransactions.delete(key);
        return null;
    }
    return entry.value;
};
const consume = async (key) => {
    const redis = useRedis();
    if (redis) {
        // Redis GETDEL makes authorization codes, PAR request URIs, and
        // access-token revocations single-use under concurrent requests. Do
        // not replace it with a racy GET+DEL fallback on hosted instances.
        if (typeof redis.getDel !== 'function') throw stateStoreUnavailable();
        try {
            const raw = await redis.getDel(key);
            return raw ? JSON.parse(raw) : null;
        } catch { throw stateStoreUnavailable(); }
    }
    if (process.env.NODE_ENV === 'production') throw stateStoreUnavailable();
    const entry = memoryTransactions.get(key);
    memoryTransactions.delete(key);
    if (!entry || entry.expiresAt <= Date.now()) return null;
    return entry.value;
};

const claimOnce = async (key, value, ttlSeconds = TTL_SECONDS) => {
    const redis = useRedis();
    if (redis) {
        try {
            const result = await redis.set(key, JSON.stringify(value), { EX: ttlSeconds, NX: true });
            return result === 'OK';
        } catch { throw stateStoreUnavailable(); }
    }
    if (process.env.NODE_ENV === 'production') throw stateStoreUnavailable();
    const entry = memoryTransactions.get(key);
    if (entry && entry.expiresAt > Date.now()) return false;
    memoryTransactions.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    return true;
};

export const authenticateDglaundryAccessToken = async (req, res, next) => {
    try {
        const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
        if (!token) return res.status(401).json({ success: false, message: 'DGLaundry access token is required.' });
        const grant = await load(`dglaundry:oidc:access:${token}`);
        if (!grant || grant.expires_at && grant.expires_at <= Date.now()) return res.status(401).json({ success: false, message: 'DGLaundry access token is invalid or expired.' });
        const account = await dgfyAccountRepository.findById(grant.account_id);
        if (!account || !account.is_active || account.deleted_at) return res.status(401).json({ success: false, message: 'DGFY account is unavailable.' });
        req.dgfyAccount = account;
        return next();
    } catch (error) { return next(error); }
};

export const validateDglaundryMachineToken = async (token) => {
    const normalized = String(token || '').trim();
    if (!normalized) return null;
    const grant = await load(`dglaundry:oidc:access:${normalized}`);
    if (!grant || grant.client_id !== MACHINE_CLIENT_ID || grant.expires_at <= Date.now()) return null;
    return grant;
};

export const authenticateDglaundryMachineToken = async (req, res, next) => {
    try {
        const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
        const grant = await validateDglaundryMachineToken(token);
        if (!grant) return res.status(401).json({ success: false, message: 'DGLaundry machine access token is invalid or expired.' });
        if (grant.scope !== MACHINE_PARTNER_SCOPE) return res.status(403).json({ success: false, message: 'DGLaundry machine token scope is not authorized.', error_code: 'DGLAUNDRY_PARTNER_SCOPE_FORBIDDEN' });
        req.partnerIdentity = MACHINE_CLIENT_ID;
        req.partnerScope = grant.scope;
        return next();
    } catch (error) { return next(error); }
};

const safeEqual = (left, right) => {
    const a = Buffer.from(String(left || ''));
    const b = Buffer.from(String(right || ''));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const requireClient = ({ clientId, clientSecret }) => {
    if (clientId !== CLIENT_ID || !configuredSecret() || !safeEqual(clientSecret, configuredSecret())) {
        const error = new Error('OIDC client authentication failed.');
        error.statusCode = 401;
        throw error;
    }
    return CLIENT_ID;
};

const requireMachineClient = async (input) => {
    if (input.client_id !== MACHINE_CLIENT_ID || input.client_assertion_type !== 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer' || !input.client_assertion) {
        const error = new Error('Machine client authentication failed.');
        error.statusCode = 401;
        throw error;
    }
    const key = machineClientPublicKey();
    if (!key) {
        const error = new Error('Machine client keys are not configured.');
        error.statusCode = 503;
        throw error;
    }
    let claims;
    try {
        claims = jwt.verify(input.client_assertion, key, {
            algorithms: ['RS256'],
            audience: MACHINE_ASSERTION_AUDIENCE,
            issuer: MACHINE_CLIENT_ID,
            subject: MACHINE_CLIENT_ID,
            clockTolerance: 5
        });
    } catch {
        const error = new Error('Machine client assertion is invalid or expired.');
        error.statusCode = 401;
        throw error;
    }
    if (!claims || typeof claims !== 'object' || !claims.jti || !Number.isInteger(claims.exp) || claims.exp - Math.floor(Date.now() / 1000) > 300) {
        const error = new Error('Machine client assertion claims are invalid.');
        error.statusCode = 401;
        throw error;
    }
    if (!(await claimOnce(`dglaundry:oidc:assertion:${claims.jti}`, { client_id: MACHINE_CLIENT_ID }, 300))) {
        const error = new Error('Machine client assertion was replayed.');
        error.statusCode = 401;
        throw error;
    }
    return MACHINE_CLIENT_ID;
};

const parseBasic = (req) => {
    const header = String(req.headers.authorization || '');
    if (!header.startsWith('Basic ')) return { clientId: '', clientSecret: '' };
    try {
        const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
        const separator = decoded.indexOf(':');
        return separator < 0 ? { clientId: '', clientSecret: '' } : { clientId: decoded.slice(0, separator), clientSecret: decoded.slice(separator + 1) };
    } catch { return { clientId: '', clientSecret: '' }; }
};

const formOrJson = (req) => ({ ...(req.body || {}), ...req.query });
const postBody = (req) => req.body && typeof req.body === 'object' ? req.body : {};

const authenticateOidcClient = async (req, input) => {
    const { clientId: basicClientId, clientSecret } = parseBasic(req);
    const clientId = String(input.client_id || basicClientId || '').trim();
    if (clientId === CLIENT_ID) {
        // Advertised browser authentication is client_secret_basic only.
        // Do not accept credentials in the request body or via the retired
        // DGLAUNDRY_PARTNER_TOKEN setting.
        if (!basicClientId || input.client_id && input.client_id !== basicClientId || input.client_secret !== undefined) {
            const error = new Error('OIDC browser client authentication must use client_secret_basic.');
            error.statusCode = 401;
            throw error;
        }
        requireClient({ clientId: basicClientId, clientSecret });
        return CLIENT_ID;
    }
    if (clientId === MACHINE_CLIENT_ID && !basicClientId) {
        return requireMachineClient({ ...input, client_id: clientId });
    }
    const error = new Error('OIDC client authentication failed.');
    error.statusCode = 401;
    throw error;
};

const readOidcPublicKeys = () => {
    const registryJson = String(process.env.DGFY_OIDC_JWKS_KEYS_JSON || '').trim();
    let entries;
    if (registryJson) {
        let parsed;
        try { parsed = JSON.parse(registryJson); }
        catch { throw new Error('OIDC public key registry is invalid.'); }
        if (!parsed || !Array.isArray(parsed.keys) || parsed.keys.length < 1) throw new Error('OIDC public key registry must contain a non-empty keys array.');
        entries = parsed.keys;
    } else {
        const pem = publicKey();
        if (!pem) return [];
        entries = [{ kid: keyId(), publicKeyPem: pem }];
    }

    const seen = new Set();
    const keys = entries.map((entry) => {
        const kid = String(entry?.kid || '').trim();
        const privateFields = ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth'];
        if (!/^[A-Za-z0-9._:-]{3,96}$/.test(kid) || seen.has(kid)) throw new Error('OIDC public key registry contains an invalid entry.');
        seen.add(kid);
        let parsed;
        if (registryJson) {
            if (entry?.kty !== 'RSA' || entry?.alg !== 'RS256' || entry?.use !== 'sig' || privateFields.some((field) => entry[field] !== undefined)) throw new Error('OIDC public key registry must contain public RSA signing keys only.');
            parsed = crypto.createPublicKey({ key: { kty: 'RSA', n: entry.n, e: entry.e }, format: 'jwk' });
        } else {
            const pem = String(entry?.publicKeyPem || '').trim();
            if (!pem.startsWith('-----BEGIN PUBLIC KEY-----')) throw new Error('OIDC public key registry contains an invalid entry.');
            parsed = crypto.createPublicKey(pem);
        }
        if (parsed.asymmetricKeyType !== 'rsa' || (parsed.asymmetricKeyDetails?.modulusLength || 0) < 2048) throw new Error('OIDC public key registry requires RSA keys of at least 2048 bits.');
        return { kid, key: parsed };
    });
    const active = keys.find((entry) => entry.kid === keyId());
    if (!active) throw new Error('The active OIDC key ID is absent from the public key registry.');
    const configuredActivePem = publicKey();
    if (configuredActivePem && !crypto.createPublicKey(configuredActivePem).equals(active.key)) throw new Error('The active OIDC public key does not match the registry.');
    return keys;
};

const assertActiveSigningKey = (signingPem) => {
    const active = readOidcPublicKeys().find((entry) => entry.kid === keyId());
    if (!active || !crypto.createPublicKey(signingPem).equals(active.key)) throw Object.assign(new Error('The active OIDC signing key does not match the published JWKS key.'), { statusCode: 503 });
};

export const oidcDiscovery = (_req, res) => res.json({
    issuer: ISSUER,
    authorization_endpoint: `${ISSUER}/authorize`,
    pushed_authorization_request_endpoint: `${ISSUER}/par`,
    token_endpoint: `${ISSUER}/token`,
    revocation_endpoint: `${ISSUER}/revoke`,
    end_session_endpoint: `${ISSUER}/logout`,
    introspection_endpoint: `${ISSUER}/introspect`,
    jwks_uri: `${ISSUER}/jwks`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'client_credentials'],
    code_challenge_methods_supported: ['S256'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    scopes_supported: ['openid', 'profile', 'email', 'dglaundry.company_context'],
    token_endpoint_auth_methods_supported: ['client_secret_basic', 'private_key_jwt']
});

export const oidcJwks = (_req, res) => {
    try {
        const keys = readOidcPublicKeys();
        if (!keys.length) return res.status(503).json({ error: 'oidc_keys_not_configured' });
        return res.json({ keys: keys.map(({ kid, key }) => ({ ...key.export({ format: 'jwk' }), kid, use: 'sig', alg: 'RS256', kty: 'RSA' })) });
    } catch {
        return res.status(503).json({ error: 'oidc_public_key_invalid' });
    }
};

// RP-initiated logout is intentionally limited to the registered DGLaundry
// browser client and the matching active DGFY browser session. No post-logout
// redirect is accepted until an exact URI is registered for this client.
export const oidcEndSession = (req, res, next) => {
    const input = formOrJson(req);
    if (input.client_id && input.client_id !== CLIENT_ID) return res.status(400).json({ error: 'invalid_request', error_description: 'The client is not registered for this logout endpoint.' });
    if (input.post_logout_redirect_uri) return res.status(400).json({ error: 'invalid_request', error_description: 'No post-logout redirect URI is registered.' });
    const idTokenHint = String(input.id_token_hint || '').trim();
    if (!idTokenHint) return res.status(400).json({ error: 'invalid_request', error_description: 'An ID token hint is required.' });
    const decoded = jwt.decode(idTokenHint, { complete: true });
    const hintKeyId = String(decoded?.header?.kid || '');
    let keys;
    try { keys = readOidcPublicKeys(); }
    catch { return res.status(503).json({ error: 'oidc_public_key_invalid' }); }
    if (!keys.length) return res.status(503).json({ error: 'oidc_keys_not_configured' });
    const hintKey = keys.find((entry) => entry.kid === hintKeyId)?.key;
    if (!hintKey) return res.status(400).json({ error: 'invalid_request', error_description: 'The ID token hint signing key is not registered.' });
    let claims;
    try { claims = jwt.verify(idTokenHint, hintKey, { algorithms: ['RS256'], issuer: ISSUER, audience: CLIENT_ID, clockTolerance: 5 }); }
    catch { return res.status(400).json({ error: 'invalid_request', error_description: 'The ID token hint is invalid.' }); }
    if (!Number.isInteger(claims.exp) || !Number.isInteger(claims.iat) || String(claims.sub || '') !== String(req.dgfyAccount?.id || '')) {
        return res.status(400).json({ error: 'invalid_request', error_description: 'The ID token hint does not match the active DGFY session.' });
    }
    req.oidcLogoutClientId = CLIENT_ID;
    return next();
};

export const oidcPar = async (req, res, next) => {
    try {
        const input = postBody(req);
        const clientId = await authenticateOidcClient(req, input);
        if (clientId !== CLIENT_ID) return res.status(400).json({ error: 'unauthorized_client', error_description: 'PAR is available only to the registered browser client.' });
        if (input.response_type !== 'code' || input.code_challenge_method !== 'S256' || !input.code_challenge || input.redirect_uri !== REDIRECT_URI) {
            return res.status(400).json({ error: 'invalid_request', error_description: 'Authorization Code with PKCE S256 and the registered redirect URI are required.' });
        }
        const requestUri = `urn:ietf:params:oauth:request_uri:${crypto.randomUUID()}`;
        const safeInput = { ...input };
        delete safeInput.client_secret;
        const stored = await store(`dglaundry:oidc:par:${requestUri}`, {
            ...safeInput,
            client_id: input.client_id || clientId,
            created_at: Date.now()
        });
        if (!stored) return res.status(503).json({ error: 'temporarily_unavailable', error_description: 'Redis-backed OIDC state is required.' });
        return res.status(201).json({ request_uri: requestUri, expires_in: TTL_SECONDS });
    } catch (error) { return next(error); }
};

export const buildOidcAuthorizeHandler = ({ chooseCompany }) => async (req, res, next) => {
    try {
        const input = formOrJson(req);
        let params = input;
        if (input.request_uri) {
            params = await consume(`dglaundry:oidc:par:${input.request_uri}`);
            if (!params) return res.status(400).json({ error: 'invalid_request_uri' });
        }
        if (params.client_id !== CLIENT_ID || params.redirect_uri !== REDIRECT_URI || params.response_type !== 'code' || params.code_challenge_method !== 'S256') {
            return res.status(400).json({ error: 'invalid_request' });
        }
        const selection = await chooseCompany({ dgfyAccount: req.dgfyAccount, companyId: params.dglaundry_company_id });
        if (!selection.company) return res.status(409).json({ error: 'company_selection_required', companies: selection.companies });
        const code = crypto.randomBytes(32).toString('base64url');
        const stored = await store(`dglaundry:oidc:code:${code}`, {
            account_id: req.dgfyAccount.id,
            issuer: ISSUER,
            subject: String(req.dgfyAccount.id),
            display_name: `${req.dgfyAccount.first_name || ''} ${req.dgfyAccount.last_name || ''}`.trim() || 'DGFY Account',
            email: req.dgfyAccount.email,
            company: selection.company,
            nonce: params.nonce,
            code_challenge: params.code_challenge,
            client_id: params.client_id,
            redirect_uri: params.redirect_uri
        });
        if (!stored) return res.status(503).json({ error: 'temporarily_unavailable', error_description: 'Redis-backed OIDC state is required.' });
        const callback = new URL(params.redirect_uri);
        callback.searchParams.set('code', code);
        if (params.state) callback.searchParams.set('state', params.state);
        return res.redirect(callback.toString());
    } catch (error) { return next(error); }
};

export const oidcToken = async (req, res, next) => {
    try {
        const input = postBody(req);
        if (input.grant_type === 'client_credentials') {
            await requireMachineClient(input);
            const requestedScope = String(input.scope || '').trim();
            if (requestedScope !== MACHINE_PARTNER_SCOPE) {
                return res.status(400).json({ error: 'invalid_scope', error_description: 'The registered DGLaundry machine client may request only the dglaundry scope.' });
            }
            const token = crypto.randomBytes(32).toString('base64url');
            const now = Date.now();
            let stored = false;
            try {
                stored = await store(`dglaundry:oidc:access:${token}`, {
                    account_id: null,
                    issuer: ISSUER,
                    subject: MACHINE_CLIENT_ID,
                    client_id: MACHINE_CLIENT_ID,
                    scope: requestedScope,
                    access_token: token,
                    expires_at: now + 300_000
                }, 300);
            } catch {
                stored = false;
            }
            if (!stored) return res.status(503).json({ error: 'temporarily_unavailable', error_description: 'Durable machine-token storage is required.' });
            return res.json({ access_token: token, token_type: 'Bearer', expires_in: 300, scope: requestedScope });
        }
        const authenticatedClientId = await authenticateOidcClient(req, input);
        if (authenticatedClientId !== CLIENT_ID) return res.status(400).json({ error: 'unauthorized_client' });
        if (input.grant_type !== 'authorization_code' || !input.code || !input.code_verifier) return res.status(400).json({ error: 'invalid_grant' });
        const grant = await consume(`dglaundry:oidc:code:${input.code}`);
        if (!grant || grant.client_id !== authenticatedClientId || grant.redirect_uri !== input.redirect_uri || grant.code_challenge !== crypto.createHash('sha256').update(input.code_verifier).digest('base64url')) return res.status(400).json({ error: 'invalid_grant' });
        const signingKey = privateKey();
        if (!signingKey) return res.status(503).json({ error: 'oidc_keys_not_configured' });
        try { assertActiveSigningKey(signingKey); }
        catch { return res.status(503).json({ error: 'oidc_signing_key_mismatch' }); }
        const now = Math.floor(Date.now() / 1000);
        const idToken = jwt.sign({ iss: ISSUER, sub: grant.subject, aud: CLIENT_ID, azp: CLIENT_ID, iat: now, exp: now + 300, nonce: grant.nonce, name: grant.display_name, email: grant.email, dglaundry_company_context: { companyId: grant.company.company_id, membershipId: grant.company.membership_id, role: grant.company.role } }, signingKey, { algorithm: 'RS256', keyid: keyId() });
        const accessToken = crypto.randomBytes(32).toString('base64url');
        const issuedAt = Date.now();
        const stored = await store(`dglaundry:oidc:access:${accessToken}`, { ...grant, access_token: accessToken, issued_at: issuedAt, expires_at: issuedAt + 300_000 }, 300);
        if (!stored) return res.status(503).json({ error: 'temporarily_unavailable', error_description: 'Redis-backed OIDC state is required.' });
        return res.json({ access_token: accessToken, token_type: 'Bearer', expires_in: 300, id_token: idToken, scope: input.scope || 'openid profile email dglaundry.company_context' });
    } catch (error) { return next(error); }
};

export const oidcRevoke = async (req, res, next) => {
    try {
        const input = postBody(req);
        const clientId = await authenticateOidcClient(req, input);
        if (input.token) {
            const token = String(input.token).trim();
            const grant = await load(`dglaundry:oidc:access:${token}`);
            if (grant?.client_id === clientId) await consume(`dglaundry:oidc:access:${token}`);
        }
        return res.status(200).end();
    } catch (error) { return next(error); }
};

export const oidcIntrospect = async (req, res, next) => {
    try {
        const input = postBody(req);
        const clientId = await authenticateOidcClient(req, input);
        const token = String(input.token || '').trim();
        if (!token) return res.status(400).json({ error: 'invalid_request', error_description: 'A token is required.' });
        const grant = await load(`dglaundry:oidc:access:${token}`);
        if (!grant || grant.client_id !== clientId || !Number.isFinite(grant.expires_at) || grant.expires_at <= Date.now()) return res.status(200).json({ active: false });
        return res.status(200).json({
            active: true,
            client_id: grant.client_id,
            token_type: 'Bearer',
            scope: String(grant.scope || 'openid profile email dglaundry.company_context'),
            iss: String(grant.issuer || ISSUER),
            sub: String(grant.subject || grant.account_id || ''),
            iat: Math.floor(Number(grant.issued_at || (grant.expires_at - 300_000)) / 1000),
            exp: Math.floor(grant.expires_at / 1000)
        });
    } catch (error) { return next(error); }
};
