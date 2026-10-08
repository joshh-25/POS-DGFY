import crypto from 'crypto';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import { getRedisClient, isRedisConnected } from '../../../config/redis.js';
import { dgfyAccountRepository } from '../../dgfy/repositories/dgfyAccountRepository.js';
import { getActiveSigningKey, listVerificationKeys } from './oidcSigningKeyRegistry.js';

const ISSUER = process.env.DGFY_OIDC_ISSUER || 'https://api.dgfy.ph/oidc';
const CLIENT_ID = process.env.DGFY_DGLAUNDRY_CLIENT_ID || 'dglaundry-web';
const REDIRECT_URI = process.env.DGFY_DGLAUNDRY_REDIRECT_URI || 'https://laundry.surebizcorp.com/api/v1/session/dgfy/callback';
const POST_LOGOUT_REDIRECT_URI = String(process.env.DGFY_DGLAUNDRY_POST_LOGOUT_REDIRECT_URI || '').trim();
const DEFAULT_SCOPE = 'openid profile email dglaundry.company_context';
const MACHINE_CLIENT_ID = String(process.env.DGFY_DGLAUNDRY_MACHINE_CLIENT_ID || 'dglaundry-machine').trim();
const MACHINE_ASSERTION_AUDIENCE = String(process.env.DGFY_DGLAUNDRY_MACHINE_ASSERTION_AUDIENCE || `${ISSUER}/token`).trim();
const TTL_SECONDS = 120;
const memoryTransactions = new Map();

const readFile = (path) => {
    if (!path) return '';
    try { return fs.readFileSync(path, 'utf8'); } catch { return ''; }
};
const configuredSecret = () => readFile(process.env.DGLAUNDRY_PARTNER_TOKEN_FILE) || String(process.env.DGLAUNDRY_PARTNER_TOKEN || '').trim();
const machineClientPublicKey = () => readFile(process.env.DGFY_DGLAUNDRY_MACHINE_CLIENT_PUBLIC_KEY_FILE) || String(process.env.DGFY_DGLAUNDRY_MACHINE_CLIENT_PUBLIC_KEY || '').trim();

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

const claimOnce = async (key, value, ttlSeconds = TTL_SECONDS) => {
    const redis = useRedis();
    if (redis) {
        const result = await redis.set(key, JSON.stringify(value), { EX: ttlSeconds, NX: true });
        return result === 'OK';
    }
    if (process.env.NODE_ENV === 'production') return false;
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
        req.partnerIdentity = MACHINE_CLIENT_ID;
        req.partnerScope = grant.scope || 'dglaundry';
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
    introspection_endpoint: `${ISSUER}/introspect`,
    end_session_endpoint: `${ISSUER}/logout`,
    jwks_uri: `${ISSUER}/jwks`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'client_credentials'],
    code_challenge_methods_supported: ['S256'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    scopes_supported: ['openid', 'profile', 'email', 'dglaundry.company_context'],
    token_endpoint_auth_methods_supported: ['client_secret_basic', 'private_key_jwt']
});

export const oidcJwks = async (_req, res) => {
    try {
        const keys = await listVerificationKeys();
        if (!keys.length) return res.status(503).json({ error: 'oidc_keys_not_configured' });
        return res.json({ keys: keys.map(({ kid, publicKeyPem }) => ({
            ...crypto.createPublicKey(publicKeyPem).export({ format: 'jwk' }),
            kid,
            use: 'sig',
            alg: 'RS256',
            kty: 'RSA'
        })) });
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
            scope: input.scope || DEFAULT_SCOPE,
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
            scope: params.scope || DEFAULT_SCOPE,
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
        const input = formOrJson(req);
        if (input.grant_type === 'client_credentials') {
            await requireMachineClient(input);
            const token = crypto.randomBytes(32).toString('base64url');
            const now = Date.now();
            await store(`dglaundry:oidc:access:${token}`, {
                account_id: null,
                issuer: ISSUER,
                subject: MACHINE_CLIENT_ID,
                client_id: MACHINE_CLIENT_ID,
                scope: input.scope || 'dglaundry',
                access_token: token,
                expires_at: now + 300_000
            }, 300);
            return res.json({ access_token: token, token_type: 'Bearer', expires_in: 300, scope: input.scope || 'dglaundry' });
        }
        const { clientId: basicClientId, clientSecret } = parseBasic(req);
        requireClient({ clientId: basicClientId || input.client_id, clientSecret: clientSecret || input.client_secret });
        if (input.grant_type !== 'authorization_code' || !input.code || !input.code_verifier) return res.status(400).json({ error: 'invalid_grant' });
        const grant = await consume(`dglaundry:oidc:code:${input.code}`);
        if (!grant || grant.client_id !== (input.client_id || basicClientId) || grant.redirect_uri !== input.redirect_uri || grant.code_challenge !== crypto.createHash('sha256').update(input.code_verifier).digest('base64url')) return res.status(400).json({ error: 'invalid_grant' });
        const signingKey = await getActiveSigningKey();
        if (!signingKey) return res.status(503).json({ error: 'oidc_keys_not_configured' });
        const now = Math.floor(Date.now() / 1000);
        const sid = crypto.randomUUID();
        const idToken = jwt.sign({ iss: ISSUER, sub: grant.subject, aud: CLIENT_ID, azp: CLIENT_ID, iat: now, exp: now + 300, nonce: grant.nonce, sid, name: grant.display_name, email: grant.email, dglaundry_company_context: { companyId: grant.company.company_id, membershipId: grant.company.membership_id, role: grant.company.role } }, signingKey.privateKeyPem, { algorithm: 'RS256', keyid: signingKey.kid });
        const accessToken = crypto.randomBytes(32).toString('base64url');
        const expiresAt = Date.now() + 300_000;
        const accessStored = await store(`dglaundry:oidc:access:${accessToken}`, { ...grant, access_token: accessToken, expires_at: expiresAt }, 300);
        if (!accessStored) return res.status(503).json({ error: 'temporarily_unavailable', error_description: 'Redis-backed OIDC state is required.' });
        const sessionStored = await store(`dglaundry:oidc:session:${sid}`, accessToken, 300);
        if (!sessionStored) {
            await consume(`dglaundry:oidc:access:${accessToken}`);
            return res.status(503).json({ error: 'temporarily_unavailable', error_description: 'Redis-backed OIDC state is required.' });
        }
        return res.json({ access_token: accessToken, token_type: 'Bearer', expires_in: 300, id_token: idToken, scope: grant.scope || DEFAULT_SCOPE });
    } catch (error) { return next(error); }
};

export const oidcIntrospect = async (req, res, next) => {
    try {
        const { clientId: basicClientId, clientSecret } = parseBasic(req);
        const input = formOrJson(req);
        requireClient({ clientId: basicClientId || input.client_id, clientSecret: clientSecret || input.client_secret });
        const token = String(input.token || '').trim();
        if (!token) return res.status(400).json({ error: 'invalid_request' });
        const grant = await load(`dglaundry:oidc:access:${token}`);
        if (!grant || !Number.isFinite(Number(grant.expires_at)) || Number(grant.expires_at) <= Date.now()) {
            return res.json({ active: false });
        }
        const exp = Math.floor(Number(grant.expires_at) / 1000);
        return res.json({
            active: true,
            scope: grant.scope || '',
            client_id: grant.client_id || CLIENT_ID,
            sub: grant.subject,
            token_type: 'Bearer',
            iat: exp - 300,
            exp
        });
    } catch (error) { return next(error); }
};

export const oidcLogout = async (req, res, next) => {
    try {
        const idTokenHint = String(req.query?.id_token_hint || '').trim();
        if (!idTokenHint) return res.status(400).json({ error: 'invalid_request' });
        const keys = await listVerificationKeys();
        let claims = null;
        for (const key of keys) {
            try {
                claims = jwt.verify(idTokenHint, key.publicKeyPem, {
                    algorithms: ['RS256'],
                    issuer: ISSUER,
                    audience: CLIENT_ID,
                    ignoreExpiration: true
                });
                if (claims && typeof claims === 'object' && claims.sid) break;
                claims = null;
            } catch { /* Try each active and retiring verification key. */ }
        }
        if (!claims?.sid) return res.status(400).json({ error: 'invalid_id_token_hint' });
        const redirectUri = String(req.query?.post_logout_redirect_uri || '').trim();
        let redirect = null;
        if (redirectUri) {
            if (!POST_LOGOUT_REDIRECT_URI || redirectUri !== POST_LOGOUT_REDIRECT_URI) {
                return res.status(400).json({ error: 'invalid_request', error_description: 'post_logout_redirect_uri is not registered.' });
            }
            redirect = new URL(redirectUri);
            if (req.query?.state !== undefined) redirect.searchParams.set('state', String(req.query.state));
        }
        const accessToken = await consume(`dglaundry:oidc:session:${claims.sid}`);
        if (accessToken) await consume(`dglaundry:oidc:access:${accessToken}`);
        if (redirect) return res.redirect(302, redirect.toString());
        return res.status(204).end();
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
