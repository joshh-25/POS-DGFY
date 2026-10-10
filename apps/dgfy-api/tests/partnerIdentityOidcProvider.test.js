import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

const signingPair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const machineA = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const machineB = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const signingPrivateKey = signingPair.privateKey.export({ type: 'pkcs8', format: 'pem' });
const signingPublicKey = signingPair.publicKey.export({ type: 'spki', format: 'pem' });
const publicPem = (key) => key.publicKey.export({ type: 'spki', format: 'pem' });
const privatePem = (key) => key.privateKey.export({ type: 'pkcs8', format: 'pem' });
let redisValues;
let redisConnected;
let provider;
let registry;
let hashClientSecret;
let configurePartnerIdentityProvider;
let oidcKey;

const response = () => ({
  statusCode: 200,
  body: null,
  redirectUrl: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
  end() { this.ended = true; return this; },
  redirect(url) { this.redirectUrl = url; return this; }
});
const browser = (clientId, secret, body) => ({
  headers: { authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}` }, body, query: {}
});
const requestError = (callback) => (error) => { if (error) callback(error); };
const registryClient = ({ clientId, type, secret, key, redirect = `https://${clientId}.example.test/callback`, scopes = ['openid', 'profile', 'email'] }) => ({
  id: `id-${clientId}`, app_id: `app-${clientId}`, client_id: clientId, client_type: type,
  environment: 'test', status: 'active', auth_method: type === 'browser' ? 'client_secret_basic' : 'private_key_jwt',
  secret_hash: secret ? hashClientSecret(secret) : null, public_key_pem: key ? publicPem(key) : null,
  key_id: key ? `kid-${clientId}` : null, audience: `https://issuer.test/oidc/token`, redirect_uris: type === 'browser' ? [redirect] : [],
  post_logout_redirect_uris: [], allowed_scopes: scopes, context_adapter: null,
  app: { app_slug: clientId, status: 'approved' }
});

beforeEach(async () => {
  jest.resetModules();
  process.env.NODE_ENV = 'test';
  process.env.DGFY_OIDC_ISSUER = 'https://api.dgfy.ph/oidc';
  redisValues = new Map();
  redisConnected = true;
  jest.unstable_mockModule('../src/config/redis.js', () => ({
    getRedisClient: () => ({
      set: async (key, value, options = {}) => {
        if (options.NX && redisValues.has(key)) return null;
        redisValues.set(key, value);
        return 'OK';
      },
      get: async (key) => redisValues.get(key) || null,
      getDel: async (key) => { const value = redisValues.get(key) || null; redisValues.delete(key); return value; }
    }),
    isRedisConnected: () => redisConnected
  }));
  jest.unstable_mockModule('../src/modules/dgfy/repositories/dgfyAccountRepository.js', () => ({ dgfyAccountRepository: { findById: async () => null } }));
  jest.unstable_mockModule('../src/modules/partnerIdentity/repositories/partnerIdentityRegistryRepository.js', () => ({
    partnerIdentityRegistryRepository: { findClientByClientId: async () => null, findAppBySlug: async () => null, listClientsForApp: async () => [], listActiveClients: async () => [] }
  }));
  jest.unstable_mockModule('../src/modules/partnerIdentity/services/oidcSigningKeyRegistry.js', () => ({
    getActiveSigningKey: async () => ({ kid: 'issuer-key', privateKeyPem: signingPrivateKey }),
    listVerificationKeys: async () => [{ kid: 'issuer-key', publicKeyPem: signingPublicKey }]
  }));
  provider = await import('../src/modules/partnerIdentity/services/oidcProvider.js');
  ({ hashClientSecret, configurePartnerIdentityProvider, oidcKey } = provider);
  const rows = [
    registryClient({ clientId: 'synthetic-browser', type: 'browser', secret: 'browser-secret', redirect: 'https://synthetic.example.test/callback', scopes: ['openid', 'profile', 'email', 'custom:read'] }),
    registryClient({ clientId: 'synthetic-browser-b', type: 'browser', secret: 'browser-secret-b', redirect: 'https://synthetic-b.example.test/callback' }),
    registryClient({ clientId: 'synthetic-machine-a', type: 'machine', key: machineA, scopes: ['orders:read'] }),
    registryClient({ clientId: 'synthetic-machine-b', type: 'service', key: machineB, scopes: ['orders:read'] })
  ];
  registry = {
    findClientByClientId: async (clientId) => rows.find((row) => row.client_id === clientId) || null,
    findAppBySlug: async () => null,
    listClientsForApp: async () => [],
    listActiveClients: async () => rows
  };
  configurePartnerIdentityProvider({ registryRepository: registry });
});

afterEach(() => jest.restoreAllMocks());

describe('platform partner OIDC provider', () => {
  test('a registry-only browser client completes PAR, authorize, and PKCE token exchange with standard claims only', async () => {
    const verifier = 'a-synthetic-browser-code-verifier-with-entropy';
    const redirect = 'https://synthetic.example.test/callback';
    const par = response();
    await provider.oidcPar(browser('synthetic-browser', 'browser-secret', {
      client_id: 'synthetic-browser', response_type: 'code', redirect_uri: redirect,
      code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256', scope: 'openid profile email custom:read', nonce: 'n-1'
    }), par, requestError((error) => { throw error; }));
    expect(par.statusCode).toBe(201);

    const authorized = response();
    await provider.buildOidcAuthorizeHandler()({ headers: {}, body: { request_uri: par.body.request_uri }, query: {}, dgfyAccount: { id: 'account-1', first_name: 'Synthetic', last_name: 'User', email: 'user@example.test' } }, authorized, requestError((error) => { throw error; }));
    const code = new URL(authorized.redirectUrl).searchParams.get('code');
    const crossClientGrant = response();
    await provider.oidcToken(browser('synthetic-browser-b', 'browser-secret-b', { grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: 'https://synthetic-b.example.test/callback' }), crossClientGrant, requestError((error) => { throw error; }));
    expect(crossClientGrant.body).toEqual({ error: 'invalid_grant' });
    const token = response();
    await provider.oidcToken(browser('synthetic-browser', 'browser-secret', { grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirect }), token, requestError((error) => { throw error; }));
    const claims = jwt.verify(token.body.id_token, signingPublicKey, { algorithms: ['RS256'], audience: 'synthetic-browser', issuer: 'https://api.dgfy.ph/oidc' });
    expect(claims).toMatchObject({ aud: 'synthetic-browser', azp: 'synthetic-browser', sub: 'account-1', name: 'Synthetic User', email: 'user@example.test', nonce: 'n-1' });
    expect(claims).not.toHaveProperty('dglaundry_company_context');
    expect(token.body.scope).toBe('openid profile email custom:read');

    const crossClient = response();
    await provider.oidcIntrospect(browser('synthetic-browser-b', 'browser-secret-b', { token: token.body.access_token }), crossClient, requestError((error) => { throw error; }));
    expect(crossClient.body).toEqual({ active: false });
    const crossClientRevoke = response();
    await provider.oidcRevoke(browser('synthetic-browser-b', 'browser-secret-b', { token: token.body.access_token }), crossClientRevoke, requestError((error) => { throw error; }));
    const ownerIntrospection = response();
    await provider.oidcIntrospect(browser('synthetic-browser', 'browser-secret', { token: token.body.access_token }), ownerIntrospection, requestError((error) => { throw error; }));
    expect(ownerIntrospection.body.active).toBe(true);
  });

  test('a registry-only machine client uses its registered key, audience, scopes, and isolated replay namespace', async () => {
    const jti = 'same-jti-for-two-clients';
    for (const [clientId, pair] of [['synthetic-machine-a', machineA], ['synthetic-machine-b', machineB]]) {
      const wrongAudience = jwt.sign({}, privatePem(pair), { algorithm: 'RS256', issuer: clientId, subject: clientId, audience: 'https://wrong.example.test/token', expiresIn: 60, jwtid: `wrong-${jti}`, keyid: `kid-${clientId}` });
      const rejectedAudience = response();
      let audienceError;
      await provider.oidcToken({ headers: {}, query: {}, body: {
        grant_type: 'client_credentials', client_id: clientId,
        client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer', client_assertion: wrongAudience, scope: 'orders:read'
      } }, rejectedAudience, (error) => { audienceError = error; });
      expect(audienceError.statusCode).toBe(401);
      const assertion = jwt.sign({}, privatePem(pair), { algorithm: 'RS256', issuer: clientId, subject: clientId, audience: 'https://issuer.test/oidc/token', expiresIn: 60, jwtid: jti, keyid: `kid-${clientId}` });
      const request = { headers: {}, query: {}, body: {
        grant_type: 'client_credentials', client_id: clientId,
        client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer', client_assertion: assertion, scope: 'orders:read'
      } };
      const result = response();
      await provider.oidcToken(request, result, requestError((error) => { throw error; }));
      expect(result.statusCode).toBe(200);
      expect(result.body.scope).toBe('orders:read');
      expect(redisValues.has(oidcKey(clientId, 'access', result.body.access_token))).toBe(true);
      if (clientId === 'synthetic-machine-a') {
        const replay = response();
        let replayError;
        await provider.oidcToken(request, replay, (error) => { replayError = error; });
        expect(replayError.statusCode).toBe(401);
      }
    }
  });

  test('cross-client grants, redirects, scopes, and inactive apps fail closed', async () => {
    const verifier = 'a-synthetic-browser-code-verifier-with-entropy';
    const par = response();
    await provider.oidcPar(browser('synthetic-browser', 'browser-secret', {
      client_id: 'synthetic-browser', response_type: 'code', redirect_uri: 'https://synthetic.example.test/callback',
      code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256'
    }), par, requestError((error) => { throw error; }));
    const authorized = response();
    await provider.buildOidcAuthorizeHandler()({ headers: {}, body: { client_id: 'synthetic-machine-a', request_uri: par.body.request_uri }, query: {}, dgfyAccount: { id: 'account-1' } }, authorized, () => {});
    expect(authorized.statusCode).toBe(400);

    const invalidRedirect = response();
    await provider.oidcPar(browser('synthetic-browser', 'browser-secret', {
      client_id: 'synthetic-browser', response_type: 'code', redirect_uri: 'https://synthetic.example.test.evil/callback',
      code_challenge: 'challenge', code_challenge_method: 'S256'
    }), invalidRedirect, requestError((error) => { throw error; }));
    expect(invalidRedirect.statusCode).toBe(400);

    const client = await registry.findClientByClientId('synthetic-browser');
    client.allowed_scopes = ['openid'];
    const invalidScope = response();
    await provider.oidcPar(browser('synthetic-browser', 'browser-secret', {
      client_id: 'synthetic-browser', response_type: 'code', redirect_uri: 'https://synthetic.example.test/callback',
      code_challenge: 'challenge', code_challenge_method: 'S256', scope: 'openid admin'
    }), invalidScope, requestError((error) => { throw error; }));
    expect(invalidScope.statusCode).toBe(400);
    client.app.status = 'suspended';
    const inactive = response();
    let inactiveError;
    await provider.oidcPar(browser('synthetic-browser', 'browser-secret', {
      client_id: 'synthetic-browser', response_type: 'code', redirect_uri: 'https://synthetic.example.test/callback',
      code_challenge: 'challenge', code_challenge_method: 'S256'
    }), inactive, (error) => { inactiveError = error; });
    expect(inactiveError.statusCode).toBe(401);
  });

  test('hashed client secrets are verified without plaintext registry fields', () => {
    const digest = hashClientSecret('correct horse battery staple', 'stable-salt');
    expect(digest).not.toContain('correct horse battery staple');
    expect(digest).toMatch(/^scrypt\$/);
  });

  test('registry errors and missing production Redis return 503 without using a fallback', async () => {
    const originalFind = registry.findClientByClientId;
    registry.findClientByClientId = async () => { throw new Error('database unavailable'); };
    const failedRegistry = response();
    let registryError;
    await provider.oidcPar(browser('synthetic-browser', 'browser-secret', { client_id: 'synthetic-browser' }), failedRegistry, (error) => { registryError = error; });
    expect(registryError.statusCode).toBe(503);
    registry.findClientByClientId = originalFind;

    process.env.NODE_ENV = 'production';
    redisConnected = false;
    const noRedis = response();
    await provider.oidcPar(browser('synthetic-browser', 'browser-secret', {
      client_id: 'synthetic-browser', response_type: 'code', redirect_uri: 'https://synthetic.example.test/callback',
      code_challenge: 'challenge', code_challenge_method: 'S256'
    }), noRedis, requestError((error) => { throw error; }));
    expect(noRedis.statusCode).toBe(503);
    expect(noRedis.body.error).toBe('temporarily_unavailable');
  });

  test('production Redis loss returns 503 on PAR, authorize, token, and introspection', async () => {
    const verifier = 'a-synthetic-browser-code-verifier-with-entropy';
    const redirect = 'https://synthetic.example.test/callback';
    const makePar = async () => {
      const result = response();
      await provider.oidcPar(browser('synthetic-browser', 'browser-secret', {
        client_id: 'synthetic-browser', response_type: 'code', redirect_uri: redirect,
        code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256'
      }), result, requestError((error) => { throw error; }));
      return result;
    };
    const pendingPar = await makePar();
    process.env.NODE_ENV = 'production';
    redisConnected = false;

    const parFailure = response();
    await provider.oidcPar(browser('synthetic-browser', 'browser-secret', {
      client_id: 'synthetic-browser', response_type: 'code', redirect_uri: redirect,
      code_challenge: 'challenge', code_challenge_method: 'S256'
    }), parFailure, requestError((error) => { throw error; }));
    expect(parFailure.statusCode).toBe(503);

    const authorizeFailure = response();
    let authorizeError;
    await provider.buildOidcAuthorizeHandler()({ headers: {}, body: { request_uri: pendingPar.body.request_uri }, query: {}, dgfyAccount: { id: 'account-1' } }, authorizeFailure, (error) => { authorizeError = error; });
    expect(authorizeError.statusCode).toBe(503);

    process.env.NODE_ENV = 'test';
    redisConnected = true;
    const tokenPar = await makePar();
    const authorizeSuccess = response();
    await provider.buildOidcAuthorizeHandler()({ headers: {}, body: { request_uri: tokenPar.body.request_uri }, query: {}, dgfyAccount: { id: 'account-1' } }, authorizeSuccess, requestError((error) => { throw error; }));
    const code = new URL(authorizeSuccess.redirectUrl).searchParams.get('code');
    process.env.NODE_ENV = 'production';
    redisConnected = false;

    const tokenFailure = response();
    let tokenError;
    await provider.oidcToken(browser('synthetic-browser', 'browser-secret', { grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirect }), tokenFailure, (error) => { tokenError = error; });
    expect(tokenError.statusCode).toBe(503);
    const introspectionFailure = response();
    let introspectionError;
    await provider.oidcIntrospect(browser('synthetic-browser', 'browser-secret', { token: 'unknown-token' }), introspectionFailure, (error) => { introspectionError = error; });
    expect(introspectionError.statusCode).toBe(503);
  });
});
