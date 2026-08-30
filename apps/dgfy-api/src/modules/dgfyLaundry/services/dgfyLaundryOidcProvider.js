import crypto from 'crypto';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import { getRedisClient, isRedisConnected } from '../../../config/redis.js';
import { dgfyAccountRepository } from '../../dgfy/repositories/dgfyAccountRepository.js';

const ISSUER = process.env.DGFY_OIDC_ISSUER || 'https://api.dgfy.ph/oidc';
const CLIENT_ID = process.env.DGFY_DGLAUNDRY_CLIENT_ID || 'dglaundry-web';
const REDIRECT_URI = process.env.DGFY_DGLAUNDRY_REDIRECT_URI || 'https://laundry.dgfy.ph/api/v1/session/dgfy/callback';
const TTL_SECONDS = 120;
const memoryTransactions = new Map();

const readFile = (path) => {
    if (!path) return '';
    try { return fs.readFileSync(path, 'utf8'); } catch { return ''; }
};
const configuredSecret = () => readFile(process.env.DGLAUNDRY_PARTNER_TOKEN_FILE) || String(process.env.DGLAUNDRY_PARTNER_TOKEN || '').trim();
const privateKey = () => readFile(process.env.DGFY_OIDC_PRIVATE_KEY_FILE);
const publicKey = () => readFile(process.env.DGFY_OIDC_PUBLIC_KEY_FILE);
const keyId = () => String(process.env.DGFY_OIDC_KEY_ID || 'dglaundry-oidc-1').trim();

const useRedis = () => isRedisConnected() && getRedisClient();
const store = async (key, value, ttlSeconds = TTL_SECONDS) => {
    const redis = useRedis();
    if (redis) return redis.set(key, JSON.stringify(value), { EX: ttlSeconds });
    if (process.env.NODE_ENV === 'production') return false;
    memoryTransactions.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    return true;
};
const load = async (key) => {
    const redis = useRedis();
    if (redis) {
        const raw = await redis.get(key);
        return raw ? JSON.parse(raw) : null;
    }
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
        // access-token revocations single-use under concurrent requests.
        if (typeof redis.getDel === 'function') {
            const raw = await redis.getDel(key);
            return raw ? JSON.parse(raw) : null;
        }
        const value = await load(key);
        if (value) await redis.del(key);
        return value;
    }
    const entry = memoryTransactions.get(key);
    memoryTransactions.delete(key);
    if (!entry || entry.expiresAt <= Date.now()) return null;
    return entry.value;
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

export const oidcDiscovery = (_req, res) => res.json({
    issuer: ISSUER,
    authorization_endpoint: `${ISSUER}/authorize`,
    pushed_authorization_request_endpoint: `${ISSUER}/par`,
    token_endpoint: `${ISSUER}/token`,
    revocation_endpoint: `${ISSUER}/revoke`,
    jwks_uri: `${ISSUER}/jwks`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    scopes_supported: ['openid', 'profile', 'email', 'dglaundry.company_context'],
    token_endpoint_auth_methods_supported: ['client_secret_basic']
});

export const oidcJwks = (_req, res) => {
    const pem = publicKey();
    if (!pem) return res.status(503).json({ error: 'oidc_keys_not_configured' });
    try {
        const jwk = crypto.createPublicKey(pem).export({ format: 'jwk' });
        return res.json({ keys: [{ ...jwk, kid: keyId(), use: 'sig', alg: 'RS256', kty: 'RSA' }] });
    } catch {
        return res.status(503).json({ error: 'oidc_public_key_invalid' });
    }
};

export const oidcPar = async (req, res, next) => {
    try {
        const { clientId: basicClientId, clientSecret } = parseBasic(req);
        const input = formOrJson(req);
        requireClient({ clientId: basicClientId || input.client_id, clientSecret: clientSecret || input.client_secret });
        if (input.response_type !== 'code' || input.code_challenge_method !== 'S256' || !input.code_challenge || input.redirect_uri !== REDIRECT_URI) {
            return res.status(400).json({ error: 'invalid_request', error_description: 'Authorization Code with PKCE S256 and the registered redirect URI are required.' });
        }
        const requestUri = `urn:ietf:params:oauth:request_uri:${crypto.randomUUID()}`;
        const safeInput = { ...input };
        delete safeInput.client_secret;
        const stored = await store(`dglaundry:oidc:par:${requestUri}`, {
            ...safeInput,
            client_id: input.client_id || basicClientId,
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
        const { clientId: basicClientId, clientSecret } = parseBasic(req);
        const input = formOrJson(req);
        requireClient({ clientId: basicClientId || input.client_id, clientSecret: clientSecret || input.client_secret });
        if (input.grant_type !== 'authorization_code' || !input.code || !input.code_verifier) return res.status(400).json({ error: 'invalid_grant' });
        const grant = await consume(`dglaundry:oidc:code:${input.code}`);
        if (!grant || grant.client_id !== (input.client_id || basicClientId) || grant.redirect_uri !== input.redirect_uri || grant.code_challenge !== crypto.createHash('sha256').update(input.code_verifier).digest('base64url')) return res.status(400).json({ error: 'invalid_grant' });
        const signingKey = privateKey();
        if (!signingKey) return res.status(503).json({ error: 'oidc_keys_not_configured' });
        const now = Math.floor(Date.now() / 1000);
        const idToken = jwt.sign({ iss: ISSUER, sub: grant.subject, aud: CLIENT_ID, azp: CLIENT_ID, iat: now, exp: now + 300, nonce: grant.nonce, name: grant.display_name, email: grant.email, dglaundry_company_context: { companyId: grant.company.company_id, membershipId: grant.company.membership_id, role: grant.company.role } }, signingKey, { algorithm: 'RS256', keyid: keyId() });
        const accessToken = crypto.randomBytes(32).toString('base64url');
        await store(`dglaundry:oidc:access:${accessToken}`, { ...grant, access_token: accessToken, expires_at: Date.now() + 300_000 }, 300);
        return res.json({ access_token: accessToken, token_type: 'Bearer', expires_in: 300, id_token: idToken, scope: input.scope || 'openid profile email dglaundry.company_context' });
    } catch (error) { return next(error); }
};

export const oidcRevoke = async (req, res, next) => {
    try {
        const { clientId: basicClientId, clientSecret } = parseBasic(req);
        const input = formOrJson(req);
        requireClient({ clientId: basicClientId || input.client_id, clientSecret: clientSecret || input.client_secret });
        if (input.token) await consume(`dglaundry:oidc:access:${input.token}`);
        return res.status(200).end();
    } catch (error) { return next(error); }
};
