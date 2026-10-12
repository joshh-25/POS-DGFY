import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { getRedisClient, isRedisConnected } from '../../../config/redis.js';
import { dgfyAccountRepository } from '../../dgfy/repositories/dgfyAccountRepository.js';
import { partnerIdentityRegistryRepository } from '../repositories/partnerIdentityRegistryRepository.js';
import { buildPartnerIdentityUseCases } from '../usecases/partnerIdentityUseCases.js';
import { getActiveSigningKey, listVerificationKeys } from './oidcSigningKeyRegistry.js';
import { hashPartnerClientSecret } from '../domain/credentialSecrets.js';

const ISSUER = process.env.DGFY_OIDC_ISSUER || 'https://api.dgfy.ph/oidc';
const DEFAULT_SCOPE = 'openid profile email';
const TTL_SECONDS = 120;
const memoryTransactions = new Map();
let legacyClientSource = null;
let contextAdapters = {};
let legacyDglaundryBrowserClientId = '';
let legacyDglaundryMachineClientId = '';
let registryRepository = partnerIdentityRegistryRepository;
let partnerIdentityUseCases = buildPartnerIdentityUseCases({ registryRepository, legacyClientSource });

export const configurePartnerIdentityProvider = ({ legacyClientSource: source, contextAdapters: adapters = {}, dglaundryBrowserClientId = '', dglaundryMachineClientId = '', registryRepository: registry = partnerIdentityRegistryRepository } = {}) => {
    legacyClientSource = source;
    contextAdapters = adapters;
    legacyDglaundryBrowserClientId = dglaundryBrowserClientId;
    legacyDglaundryMachineClientId = dglaundryMachineClientId;
    registryRepository = registry;
    partnerIdentityUseCases = buildPartnerIdentityUseCases({ registryRepository, legacyClientSource });
};

export const oidcKey = (clientId, kind, id) => `oidc:${encodeURIComponent(String(clientId))}:${kind}:${id}`;

const unavailable = (message = 'Partner identity registry is unavailable.') => Object.assign(new Error(message), { statusCode: 503 });
const clientUnavailable = () => Object.assign(new Error('OIDC client is not active.'), { statusCode: 401 });
const resolveClient = (...args) => partnerIdentityUseCases.resolveClient(...args);
const splitScopes = (scope) => String(scope || '').trim().split(/\s+/).filter(Boolean);
const scopesAllowed = (client, scope, defaults = []) => {
    const requested = splitScopes(scope || defaults.join(' '));
    return requested.length > 0 && requested.every((item) => client.allowed_scopes?.includes(item)) ? requested : null;
};
const defaultBrowserScopes = (client, adapter) => adapter?.scopes
    || ['openid', 'profile', 'email'].filter((scope) => client.allowed_scopes?.includes(scope));
const exactRegistered = (registered, value) => Array.isArray(registered) && registered.includes(String(value || ''));
const accessTokenIndexKey = (token) => `oidc:atk:${crypto.createHash('sha256').update(String(token)).digest('hex')}`;

export const hashClientSecret = hashPartnerClientSecret;
const verifyClientSecret = (secret, hash) => {
    const [scheme, salt, expected] = String(hash || '').split('$');
    if (scheme !== 'scrypt' || !salt || !expected) return false;
    try {
        const actual = crypto.scryptSync(String(secret || ''), salt, 64);
        const wanted = Buffer.from(expected, 'base64url');
        return wanted.length === actual.length && crypto.timingSafeEqual(actual, wanted);
    } catch { return false; }
};

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
        const client = await resolveClient(legacyDglaundryBrowserClientId);
        const grant = await load(oidcKey(legacyDglaundryBrowserClientId, 'access', token));
        if (!client || client.client_type !== 'browser' || !grant || grant.client_id !== client.client_id || grant.expires_at && grant.expires_at <= Date.now()) return res.status(401).json({ success: false, message: 'DGLaundry access token is invalid or expired.' });
        const account = await dgfyAccountRepository.findById(grant.account_id);
        if (!account || !account.is_active || account.deleted_at) return res.status(401).json({ success: false, message: 'DGFY account is unavailable.' });
        req.dgfyAccount = account;
        return next();
    } catch (error) { return next(error); }
};

export const validateDglaundryMachineToken = async (token) => {
    const normalized = String(token || '').trim();
    if (!normalized) return null;
    const client = await resolveClient(legacyDglaundryMachineClientId);
    const grant = await load(oidcKey(legacyDglaundryMachineClientId, 'access', normalized));
    if (!client || !['machine', 'service'].includes(client.client_type) || !grant || grant.client_id !== client.client_id || grant.expires_at <= Date.now()) return null;
    return grant;
};

export const validatePartnerMachineToken = async (token) => {
    const normalized = String(token || '').trim();
    if (!normalized) return null;
    const indexed = await load(accessTokenIndexKey(normalized));
    if (!indexed?.client_id) return null;
    const client = await resolveClient(indexed.client_id, { allowLegacy: false });
    if (!client || !['machine', 'service'].includes(client.client_type)) return null;
    const grant = await load(oidcKey(client.client_id, 'access', normalized));
    if (!grant || grant.client_id !== client.client_id || !Number.isFinite(grant.expires_at) || grant.expires_at <= Date.now()) return null;
    if (grant.credential_version_id) {
        const credential = (client.credentials || []).find((item) => item.id === grant.credential_version_id);
        if (!credential || !['active', 'overlap'].includes(credential.status)
            || (credential.status === 'overlap' && (!credential.overlap_expires_at || new Date(credential.overlap_expires_at).getTime() <= Date.now()))) return null;
    } else if (client.has_credential_versions) return null;
    return { ...grant, app: client.app, client };
};

export const authenticateDglaundryMachineToken = async (req, res, next) => {
    try {
        const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
        const grant = await validateDglaundryMachineToken(token);
        if (!grant) return res.status(401).json({ success: false, message: 'DGLaundry machine access token is invalid or expired.' });
        if (grant.scope !== 'dglaundry') return res.status(403).json({ success: false, message: 'DGLaundry machine token scope is not authorized.', error_code: 'DGLAUNDRY_PARTNER_SCOPE_FORBIDDEN' });
        req.partnerIdentity = legacyDglaundryMachineClientId;
        req.partnerScope = grant.scope;
        return next();
    } catch (error) { return next(error); }
};

const safeEqual = (left, right) => {
    const a = Buffer.from(String(left || ''));
    const b = Buffer.from(String(right || ''));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const requireMachineClient = async (input, client) => {
    if (input.client_id !== client.client_id || input.client_assertion_type !== 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer' || !input.client_assertion) {
        const error = new Error('Machine client authentication failed.');
        error.statusCode = 401;
        throw error;
    }
    const credential = client.has_credential_versions
        ? (client.credentials || []).find((item) => item.kind === 'public_key' && item.key_id === (jwt.decode(input.client_assertion, { complete: true })?.header?.kid))
        : null;
    const key = credential?.public_key_pem || (!client.has_credential_versions ? client.public_key_pem : null);
    if (!key) {
        const error = new Error('Machine client keys are not configured.');
        error.statusCode = 503;
        throw error;
    }
    let claims;
    if (!client.legacy) {
        const decoded = jwt.decode(input.client_assertion, { complete: true });
        const activeKeyId = credential?.key_id || (!client.has_credential_versions ? client.key_id : null);
        if (!activeKeyId || decoded?.header?.kid !== activeKeyId) {
            const error = new Error('Machine client assertion key identifier is invalid.');
            error.statusCode = 401;
            throw error;
        }
    }
    try {
        claims = jwt.verify(input.client_assertion, key, {
            algorithms: ['RS256'],
            audience: client.audience,
            issuer: client.client_id,
            subject: client.client_id,
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
    if (!(await claimOnce(oidcKey(client.client_id, 'assertion', claims.jti), { client_id: client.client_id }, 300))) {
        const error = new Error('Machine client assertion was replayed.');
        error.statusCode = 401;
        throw error;
    }
    if (credential) client.authenticated_credential_id = credential.id;
    return client;
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
    const client = await resolveClient(clientId);
    if (!client) throw clientUnavailable();
    if (client.auth_method === 'client_secret_basic') {
        if (!basicClientId || (input.client_id && input.client_id !== basicClientId) || input.client_secret !== undefined) {
            const error = new Error('OIDC client authentication must use client_secret_basic.');
            error.statusCode = 401;
            throw error;
        }
        let matchedCredential = null;
        const valid = client.legacy
            ? safeEqual(clientSecret, client.legacy_secret)
            : client.has_credential_versions
                ? (matchedCredential = (client.credentials || []).filter((item) => item.kind === 'secret_hash').find((item) => verifyClientSecret(clientSecret, item.secret_hash)), Boolean(matchedCredential))
                : verifyClientSecret(clientSecret, client.secret_hash);
        if (!valid) throw clientUnavailable();
        if (matchedCredential) client.authenticated_credential_id = matchedCredential.id;
        return client;
    }
    if (basicClientId || input.client_secret !== undefined) throw clientUnavailable();
    return requireMachineClient({ ...input, client_id: clientId }, client);
};

export const oidcDiscovery = (_req, res) => {
        const scopes = new Set(['openid', 'profile', 'email']);
        for (const adapter of Object.values(contextAdapters)) for (const scope of adapter.scopes || []) scopes.add(scope);
        return res.json({
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
            scopes_supported: [...scopes],
            token_endpoint_auth_methods_supported: ['client_secret_basic', 'private_key_jwt']
        });
};

export const oidcJwks = async (_req, res) => {
    try {
        const keys = await listVerificationKeys();
        if (!keys.length) return res.status(503).json({ error: 'oidc_keys_not_configured' });
        return res.json({ keys: keys.map(({ kid, publicKeyPem }) => ({ ...crypto.createPublicKey(publicKeyPem).export({ format: 'jwk' }), kid, use: 'sig', alg: 'RS256', kty: 'RSA' })) });
    } catch {
        return res.status(503).json({ error: 'oidc_public_key_invalid' });
    }
};

// RP-initiated logout is intentionally limited to the registered DGLaundry
// browser client and the matching active DGFY browser session. No post-logout
// redirect is accepted until an exact URI is registered for this client.
export const oidcEndSession = async (req, res, next) => {
    const input = formOrJson(req);
    let client;
    try { client = await resolveClient(input.client_id || legacyDglaundryBrowserClientId); } catch (error) { return next(error); }
    if (!client || client.client_type !== 'browser') return res.status(400).json({ error: 'invalid_request', error_description: 'The client is not registered for this logout endpoint.' });
    const redirectUri = String(input.post_logout_redirect_uri || '').trim();
    if (redirectUri && !exactRegistered(client.post_logout_redirect_uris, redirectUri)) return res.status(400).json({ error: 'invalid_request', error_description: 'post_logout_redirect_uri is not registered.' });
    const idTokenHint = String(input.id_token_hint || '').trim();
    if (!idTokenHint) return res.status(400).json({ error: 'invalid_request', error_description: 'An ID token hint is required.' });
    let keys;
    try { keys = await listVerificationKeys(); }
    catch { return res.status(503).json({ error: 'oidc_public_key_invalid' }); }
    if (!keys.length) return res.status(503).json({ error: 'oidc_keys_not_configured' });
    let claims;
    for (const key of keys) {
        try {
            claims = jwt.verify(idTokenHint, key.publicKeyPem, { algorithms: ['RS256'], issuer: ISSUER, audience: client.client_id, clockTolerance: 5, ignoreExpiration: true });
            break;
        } catch { /* Try every active and retiring verification key. */ }
    }
    if (!claims || !Number.isInteger(claims.exp) || !Number.isInteger(claims.iat) || String(claims.sub || '') !== String(req.dgfyAccount?.id || '')) {
        return res.status(400).json({ error: 'invalid_request', error_description: 'The ID token hint does not match the active DGFY session.' });
    }
    req.oidcLogoutClientId = client.client_id;
    req.oidcLogoutClaims = claims;
    req.oidcPostLogoutRedirectUri = redirectUri;
    req.oidcPostLogoutState = input.state === undefined ? undefined : String(input.state);
    return next();
};

export const oidcLogout = async (req, res, next) => {
    try {
        const clientId = req.oidcLogoutClientId || String(req.oidcLogoutClaims?.aud || '');
        const sid = String(req.oidcLogoutClaims?.sid || '').trim();
        if (sid) {
            const session = await consume(oidcKey(clientId, 'session', sid));
            if (session?.client_id === clientId && session.access_token) await consume(oidcKey(clientId, 'access', session.access_token));
        }
        return next();
    } catch (error) { return next(error); }
};

export const oidcPar = async (req, res, next) => {
    try {
        const input = postBody(req);
        const client = await authenticateOidcClient(req, input);
        if (client.client_type !== 'browser') return res.status(400).json({ error: 'unauthorized_client', error_description: 'PAR is available only to a registered browser client.' });
        const adapter = client.context_adapter ? contextAdapters[client.context_adapter] : null;
        if (client.context_adapter && !adapter) throw unavailable('Configured OIDC context adapter is unavailable.');
        const requestedScopes = scopesAllowed(client, input.scope, defaultBrowserScopes(client, adapter));
        if (input.response_type !== 'code' || input.code_challenge_method !== 'S256' || !input.code_challenge || !exactRegistered(client.redirect_uris, input.redirect_uri) || !requestedScopes?.includes('openid')) {
            return res.status(400).json({ error: 'invalid_request', error_description: 'Authorization Code with PKCE S256 and the registered redirect URI are required.' });
        }
        const requestUri = `urn:ietf:params:oauth:request_uri:${Buffer.from(client.client_id).toString('base64url')}:${crypto.randomUUID()}`;
        const safeInput = { ...input };
        delete safeInput.client_secret;
        const stored = await store(oidcKey(client.client_id, 'par', requestUri), {
            ...safeInput,
            scope: requestedScopes.join(' '),
            client_id: client.client_id,
            created_at: Date.now()
        });
        if (!stored) return res.status(503).json({ error: 'temporarily_unavailable', error_description: 'Redis-backed OIDC state is required.' });
        return res.status(201).json({ request_uri: requestUri, expires_in: TTL_SECONDS });
    } catch (error) { return next(error); }
};

export const buildOidcAuthorizeHandler = ({ chooseCompany } = {}) => async (req, res, next) => {
    try {
        const input = formOrJson(req);
        let params = input;
        let requestClientId = String(input.client_id || '').trim();
        if (input.request_uri) {
            const encodedClientId = String(input.request_uri).split(':').at(-2);
            try { requestClientId = Buffer.from(encodedClientId || '', 'base64url').toString('utf8'); } catch { requestClientId = ''; }
            if (!requestClientId || (input.client_id && input.client_id !== requestClientId)) return res.status(400).json({ error: 'invalid_request_uri' });
            params = await consume(oidcKey(requestClientId, 'par', input.request_uri));
            if (!params) return res.status(400).json({ error: 'invalid_request_uri' });
        }
        const client = await resolveClient(params.client_id || requestClientId);
        const adapter = client?.context_adapter ? contextAdapters[client.context_adapter] : null;
        if (!client || client.client_type !== 'browser' || (client.context_adapter && !adapter) || (requestClientId && client.client_id !== requestClientId) || !exactRegistered(client.redirect_uris, params.redirect_uri) || params.response_type !== 'code' || params.code_challenge_method !== 'S256' || !scopesAllowed(client, params.scope, defaultBrowserScopes(client, adapter))?.includes('openid')) {
            return res.status(400).json({ error: 'invalid_request' });
        }
        let context = null;
        if (client.context_adapter) {
            const adapter = contextAdapters[client.context_adapter];
            if (!adapter) throw unavailable('Configured OIDC context adapter is unavailable.');
            if (chooseCompany) {
                const selection = await chooseCompany({ dgfyAccount: req.dgfyAccount, companyId: params.dglaundry_company_id });
                context = selection;
            } else context = await adapter.resolveContext({ account: req.dgfyAccount, params });
            if (!context?.company) return res.status(409).json({ error: 'company_selection_required', companies: context?.companies || [] });
        } else if (chooseCompany) {
            const selection = await chooseCompany({ dgfyAccount: req.dgfyAccount, companyId: params.dglaundry_company_id });
            if (!selection.company) return res.status(409).json({ error: 'company_selection_required', companies: selection.companies });
            context = { company: selection.company };
        }
        const code = crypto.randomBytes(32).toString('base64url');
        const stored = await store(oidcKey(client.client_id, 'code', code), {
            account_id: req.dgfyAccount.id,
            issuer: ISSUER,
            subject: String(req.dgfyAccount.id),
            display_name: `${req.dgfyAccount.first_name || ''} ${req.dgfyAccount.last_name || ''}`.trim() || 'DGFY Account',
            email: req.dgfyAccount.email,
            context,
            scope: params.scope || DEFAULT_SCOPE,
            nonce: params.nonce,
            code_challenge: params.code_challenge,
            client_id: client.client_id,
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
            const client = await authenticateOidcClient(req, input);
            if (!['machine', 'service'].includes(client.client_type) || client.auth_method !== 'private_key_jwt') return res.status(400).json({ error: 'unauthorized_client' });
            const requestedScopes = scopesAllowed(client, input.scope);
            if (!requestedScopes) return res.status(400).json({ error: 'invalid_scope' });
            const requestedScope = requestedScopes.join(' ');
            const token = crypto.randomBytes(32).toString('base64url');
            const now = Date.now();
            let stored = false;
            try {
                stored = await store(oidcKey(client.client_id, 'access', token), {
                    account_id: null,
                    issuer: ISSUER,
                    subject: client.client_id,
                    client_id: client.client_id,
                    scope: requestedScope,
                    access_token: token,
                    credential_version_id: client.authenticated_credential_id || null,
                    expires_at: now + 300_000
                }, 300);
                if (stored) {
                    const indexed = await store(accessTokenIndexKey(token), { client_id: client.client_id }, 300);
                    if (!indexed) {
                        await consume(oidcKey(client.client_id, 'access', token));
                        stored = false;
                    }
                }
            } catch {
                stored = false;
            }
            if (!stored) return res.status(503).json({ error: 'temporarily_unavailable', error_description: 'Durable machine-token storage is required.' });
            return res.json({ access_token: token, token_type: 'Bearer', expires_in: 300, scope: requestedScope });
        }
        const client = await authenticateOidcClient(req, input);
        if (client.client_type !== 'browser') return res.status(400).json({ error: 'unauthorized_client' });
        if (input.grant_type !== 'authorization_code' || !input.code || !input.code_verifier) return res.status(400).json({ error: 'invalid_grant' });
        const grant = await consume(oidcKey(client.client_id, 'code', input.code));
        if (!grant || grant.client_id !== client.client_id || !scopesAllowed(client, grant.scope) || !exactRegistered(client.redirect_uris, input.redirect_uri) || grant.redirect_uri !== input.redirect_uri || grant.code_challenge !== crypto.createHash('sha256').update(input.code_verifier).digest('base64url')) return res.status(400).json({ error: 'invalid_grant' });
        const signingKey = await getActiveSigningKey();
        if (!signingKey?.privateKeyPem || !signingKey?.kid) return res.status(503).json({ error: 'oidc_keys_not_configured' });
        const now = Math.floor(Date.now() / 1000);
        const sid = crypto.randomUUID();
        const adapter = client.context_adapter ? contextAdapters[client.context_adapter] : null;
        if (client.context_adapter && !adapter) throw unavailable('Configured OIDC context adapter is unavailable.');
        const adapterClaims = adapter?.buildIdTokenClaims(grant.context) || {};
        const idToken = jwt.sign({ iss: ISSUER, sub: grant.subject, aud: client.client_id, azp: client.client_id, iat: now, exp: now + 300, nonce: grant.nonce, sid, name: grant.display_name, email: grant.email, ...adapterClaims }, signingKey.privateKeyPem, { algorithm: 'RS256', keyid: signingKey.kid });
        const accessToken = crypto.randomBytes(32).toString('base64url');
        const issuedAt = Date.now();
        const stored = await store(oidcKey(client.client_id, 'access', accessToken), { ...grant, access_token: accessToken, issued_at: issuedAt, expires_at: issuedAt + 300_000 }, 300);
        if (!stored) return res.status(503).json({ error: 'temporarily_unavailable', error_description: 'Redis-backed OIDC state is required.' });
        const sessionStored = await store(oidcKey(client.client_id, 'session', sid), { access_token: accessToken, client_id: client.client_id }, 300);
        if (!sessionStored) {
            await consume(oidcKey(client.client_id, 'access', accessToken));
            return res.status(503).json({ error: 'temporarily_unavailable', error_description: 'Redis-backed OIDC state is required.' });
        }
        return res.json({ access_token: accessToken, token_type: 'Bearer', expires_in: 300, id_token: idToken, scope: grant.scope || DEFAULT_SCOPE });
    } catch (error) { return next(error); }
};

export const oidcRevoke = async (req, res, next) => {
    try {
        const input = postBody(req);
        const client = await authenticateOidcClient(req, input);
        if (input.token) {
            const token = String(input.token).trim();
            const grant = await load(oidcKey(client.client_id, 'access', token));
            if (grant?.client_id === client.client_id) {
                await consume(oidcKey(client.client_id, 'access', token));
                await consume(accessTokenIndexKey(token));
            }
        }
        return res.status(200).end();
    } catch (error) { return next(error); }
};

export const oidcIntrospect = async (req, res, next) => {
    try {
        const input = postBody(req);
        const client = await authenticateOidcClient(req, input);
        const token = String(input.token || '').trim();
        if (!token) return res.status(400).json({ error: 'invalid_request', error_description: 'A token is required.' });
        const grant = await load(oidcKey(client.client_id, 'access', token));
        if (!grant || grant.client_id !== client.client_id || !Number.isFinite(grant.expires_at) || grant.expires_at <= Date.now()) return res.status(200).json({ active: false });
        return res.status(200).json({
            active: true,
            client_id: grant.client_id,
            token_type: 'Bearer',
            scope: String(grant.scope || DEFAULT_SCOPE),
            iss: String(grant.issuer || ISSUER),
            sub: String(grant.subject || grant.account_id || ''),
            iat: Math.floor(Number(grant.issued_at || (grant.expires_at - 300_000)) / 1000),
            exp: Math.floor(grant.expires_at / 1000)
        });
    } catch (error) { return next(error); }
};
