import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import { jest } from '@jest/globals';

const registryRows = [];
jest.unstable_mockModule('../src/modules/partnerIdentity/repositories/oidcSigningKeyRepository.js', () => ({
  oidcSigningKeyRepository: {
    count: async () => registryRows.length,
    findActive: async () => registryRows.find((row) => row.status === 'active') || null,
    findVerificationKeys: async () => registryRows.filter((row) => ['active', 'retiring'].includes(row.status)),
    findByKid: async (kid) => registryRows.find((row) => row.kid === kid) || null,
    promote: async (kid) => {
      for (const row of registryRows) if (row.status === 'active') row.status = 'retiring';
      const row = registryRows.find((candidate) => candidate.kid === kid);
      if (row) row.status = 'active';
      return row || null;
    },
    transition: async (kid, status) => {
      const row = registryRows.find((candidate) => candidate.kid === kid);
      if (row) row.status = status;
      return row || null;
    }
  }
}));
jest.unstable_mockModule('../src/modules/partnerIdentity/repositories/partnerIdentityRegistryRepository.js', () => ({
  partnerIdentityRegistryRepository: {
    findClientByClientId: async () => null,
    findAppBySlug: async () => null,
    listClientsForApp: async () => [],
    listActiveClients: async () => []
  }
}));

let buildOidcAuthorizeHandler;
let oidcDiscovery;
let oidcEndSession;
let oidcIntrospect;
let oidcJwks;
let oidcLogout;
let oidcPar;
let oidcRevoke;
let oidcToken;

const makeResponse = () => ({
  statusCode: 200,
  body: null,
  redirectUrl: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
  end() { this.ended = true; return this; },
  redirect(url) { this.redirectUrl = url; return this; }
});

describe('DGFY OIDC provider key resolution', () => {
  const priorEnv = {};
  let directory;
  let privatePath;
  let publicPath;
  let clientSecretPath;
  let publicKey;

  beforeAll(async () => {
    for (const name of ['DGFY_OIDC_PRIVATE_KEY', 'DGFY_OIDC_PRIVATE_KEY_FILE', 'DGFY_OIDC_PUBLIC_KEY', 'DGFY_OIDC_PUBLIC_KEY_FILE', 'DGFY_OIDC_SIGNING_KEY_2_PRIVATE_FILE', 'DGFY_OIDC_JWKS_KEYS_JSON', 'DGFY_OIDC_SIGNING_KEY_REGISTRY_TEST_MODE', 'DGFY_OIDC_ISSUER', 'DGFY_OIDC_KEY_ID', 'DGFY_DGLAUNDRY_CLIENT_ID', 'DGFY_DGLAUNDRY_REDIRECT_URI', 'DGFY_DGLAUNDRY_POST_LOGOUT_REDIRECT_URI', 'DGFY_DGLAUNDRY_CLIENT_SECRET', 'DGFY_DGLAUNDRY_CLIENT_SECRET_FILE', 'DGFY_DGLAUNDRY_MACHINE_CLIENT_ID', 'DGFY_DGLAUNDRY_MACHINE_ASSERTION_AUDIENCE', 'DGFY_DGLAUNDRY_MACHINE_CLIENT_PUBLIC_KEY', 'DGFY_DGLAUNDRY_MACHINE_CLIENT_PUBLIC_KEY_FILE', 'DGFY_DGLAUNDRY_SERVICE_CLIENT_ID', 'DGLAUNDRY_INTEGRATION_ENVIRONMENT', 'DGLAUNDRY_PARTNER_AUDIENCE', 'DGLAUNDRY_PARTNER_BASE_URL', 'DGLAUNDRY_PARTNER_TOKEN', 'DGLAUNDRY_PARTNER_TOKEN_FILE', 'NODE_ENV']) {
      priorEnv[name] = process.env[name];
    }
    process.env.DGFY_OIDC_ISSUER = 'https://api.dgfy.ph/oidc';
    process.env.DGFY_DGLAUNDRY_CLIENT_ID = 'dglaundry-web';
    process.env.DGFY_DGLAUNDRY_REDIRECT_URI = 'https://laundry.surebizcorp.com/api/v1/session/dgfy/callback';
    process.env.DGFY_DGLAUNDRY_POST_LOGOUT_REDIRECT_URI = 'https://laundry.surebizcorp.com/logout/callback';
    process.env.DGFY_DGLAUNDRY_MACHINE_CLIENT_ID = 'dglaundry-machine';
    process.env.DGFY_DGLAUNDRY_MACHINE_ASSERTION_AUDIENCE = 'https://api.dgfy.ph/oidc/token';
    ({ buildOidcAuthorizeHandler, oidcDiscovery, oidcEndSession, oidcIntrospect, oidcJwks, oidcLogout, oidcPar, oidcRevoke, oidcToken } = await import('../src/modules/dgfyLaundry/services/dgfyLaundryOidcProvider.js'));
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dgfy-oidc-provider-'));
    privatePath = path.join(directory, 'private.pem');
    publicPath = path.join(directory, 'public.pem');
    clientSecretPath = path.join(directory, 'dglaundry-client-secret');
    const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    fs.writeFileSync(privatePath, pair.privateKey.export({ type: 'pkcs8', format: 'pem' }));
    publicKey = pair.publicKey.export({ type: 'spki', format: 'pem' });
    fs.writeFileSync(publicPath, publicKey);
    fs.writeFileSync(clientSecretPath, 'test-client-secret');
  });

  afterAll(() => {
    for (const [name, value] of Object.entries(priorEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    fs.rmSync(directory, { recursive: true, force: true });
  });

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.DGFY_OIDC_ISSUER = 'https://api.dgfy.ph/oidc';
    process.env.DGFY_DGLAUNDRY_CLIENT_ID = 'dglaundry-web';
    process.env.DGFY_DGLAUNDRY_REDIRECT_URI = 'https://laundry.surebizcorp.com/api/v1/session/dgfy/callback';
    process.env.DGFY_DGLAUNDRY_POST_LOGOUT_REDIRECT_URI = 'https://laundry.surebizcorp.com/logout/callback';
    process.env.DGFY_DGLAUNDRY_MACHINE_CLIENT_ID = 'dglaundry-machine';
    process.env.DGFY_DGLAUNDRY_MACHINE_ASSERTION_AUDIENCE = 'https://api.dgfy.ph/oidc/token';
    delete process.env.DGFY_OIDC_PRIVATE_KEY;
    delete process.env.DGFY_OIDC_PUBLIC_KEY;
    process.env.DGFY_OIDC_PRIVATE_KEY_FILE = privatePath;
    process.env.DGFY_OIDC_PUBLIC_KEY_FILE = publicPath;
    process.env.DGFY_DGLAUNDRY_CLIENT_SECRET_FILE = clientSecretPath;
    delete process.env.DGFY_DGLAUNDRY_MACHINE_CLIENT_ID;
    delete process.env.DGFY_DGLAUNDRY_MACHINE_ASSERTION_AUDIENCE;
    delete process.env.DGFY_DGLAUNDRY_MACHINE_CLIENT_PUBLIC_KEY;
    delete process.env.DGFY_DGLAUNDRY_MACHINE_CLIENT_PUBLIC_KEY_FILE;
    process.env.DGFY_OIDC_KEY_ID = 'dglaundry-oidc-1';
    registryRows.length = 0;
    delete process.env.OIDC_SIGNING_KEY_REGISTRY_TEST_MODE;
    delete process.env.DGFY_OIDC_JWKS_KEYS_JSON;
    process.env.DGLAUNDRY_PARTNER_TOKEN = 'legacy-partner-token';
    delete process.env.DGLAUNDRY_PARTNER_TOKEN_FILE;
  });

  test('serves a valid JWKS from the configured public key file', async () => {
    const response = makeResponse();
    await oidcJwks({}, response);

    expect(response.statusCode).toBe(200);
    expect(response.body.keys).toHaveLength(1);
    expect(response.body.keys[0]).toMatchObject({ alg: 'RS256', use: 'sig', kty: 'RSA' });
  });

  test('publishes active and retiring keys from the signing-key registry', async () => {
    const activePair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const retiringPair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const activePrivatePath = path.join(directory, 'active-private.pem');
    fs.writeFileSync(activePrivatePath, activePair.privateKey.export({ type: 'pkcs8', format: 'pem' }));
    process.env.DGFY_OIDC_PRIVATE_KEY_FILE = activePrivatePath;
    process.env.OIDC_SIGNING_KEY_REGISTRY_TEST_MODE = 'true';
    registryRows.push(
      { kid: 'dgfy-active-1', status: 'active', public_key_pem: activePair.publicKey.export({ type: 'spki', format: 'pem' }), private_key_env_ref: 'DGFY_OIDC_PRIVATE_KEY_FILE' },
      { kid: 'dgfy-previous-1', status: 'retiring', public_key_pem: retiringPair.publicKey.export({ type: 'spki', format: 'pem' }), private_key_env_ref: 'DGFY_OIDC_SIGNING_KEY_2_PRIVATE_FILE' },
      { kid: 'dgfy-revoked-1', status: 'revoked', public_key_pem: retiringPair.publicKey.export({ type: 'spki', format: 'pem' }), private_key_env_ref: 'DGFY_OIDC_SIGNING_KEY_2_PRIVATE_FILE' }
    );
    process.env.DGFY_OIDC_SIGNING_KEY_2_PRIVATE_FILE = activePrivatePath;
    const response = makeResponse();
    await oidcJwks({}, response);
    expect(response.statusCode).toBe(200);
    expect(response.body.keys.map(({ kid }) => kid)).toEqual(['dgfy-active-1', 'dgfy-previous-1']);
    expect(response.body.keys.every((key) => !('d' in key))).toBe(true);
    delete process.env.OIDC_SIGNING_KEY_REGISTRY_TEST_MODE;
  });

  test('OIDC token and partner tokens both sign from the same private key file setting', async () => {
    process.env.OIDC_SIGNING_KEY_REGISTRY_TEST_MODE = 'true';
    registryRows.push({
      kid: 'dglaundry-oidc-1',
      status: 'active',
      public_key_pem: publicKey,
      private_key_env_ref: 'DGFY_OIDC_PRIVATE_KEY_FILE'
    });
    const codeVerifier = 'a-code-verifier-with-enough-entropy';
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    const authorization = `Basic ${Buffer.from('dglaundry-web:test-client-secret').toString('base64')}`;
    const parResponse = makeResponse();
    await oidcPar({
      headers: { authorization },
      body: {
        client_id: 'dglaundry-web',
        response_type: 'code',
        redirect_uri: 'https://laundry.surebizcorp.com/api/v1/session/dgfy/callback',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        nonce: 'test-nonce'
      },
      query: {}
    }, parResponse, (error) => { throw error; });
    expect(parResponse.statusCode).toBe(201);

    const authorizeResponse = makeResponse();
    const authorizeHandler = buildOidcAuthorizeHandler({
      chooseCompany: async () => ({ company: { company_id: 'company-1', membership_id: 'membership-1', role: 'owner' } })
    });
    await authorizeHandler({
      headers: {},
      body: { request_uri: parResponse.body.request_uri },
      query: {},
      dgfyAccount: { id: 'account-1', first_name: 'Test', last_name: 'User', email: 'test@example.invalid' }
    }, authorizeResponse, (error) => { throw error; });
    const code = new URL(authorizeResponse.redirectUrl).searchParams.get('code');

    const tokenResponse = makeResponse();
    await oidcToken({
      headers: { authorization },
      body: { grant_type: 'authorization_code', code, code_verifier: codeVerifier, redirect_uri: 'https://laundry.surebizcorp.com/api/v1/session/dgfy/callback', client_id: 'dglaundry-web' },
      query: {}
    }, tokenResponse, (error) => { throw error; });
    expect(tokenResponse.statusCode).toBe(200);
    expect(jwt.verify(tokenResponse.body.id_token, publicKey, { algorithms: ['RS256'], audience: 'dglaundry-web' })).toMatchObject({ sub: 'account-1' });

    const introspectionResponse = makeResponse();
    await oidcIntrospect({ headers: { authorization }, body: { token: tokenResponse.body.access_token }, query: {} }, introspectionResponse, (error) => { throw error; });
    expect(introspectionResponse.body).toMatchObject({ active: true, client_id: 'dglaundry-web', sub: 'account-1' });
    const queryTokenResponse = makeResponse();
    await oidcIntrospect({ headers: { authorization }, body: {}, query: { token: tokenResponse.body.access_token } }, queryTokenResponse, (error) => { throw error; });
    expect(queryTokenResponse.statusCode).toBe(400);
    expect(queryTokenResponse.body.error).toBe('invalid_request');

    const tokenClaims = jwt.decode(tokenResponse.body.id_token);
    const expiredHint = jwt.sign({
      ...tokenClaims,
      iat: Math.floor(Date.now() / 1000) - 600,
      exp: Math.floor(Date.now() / 1000) - 300
    }, fs.readFileSync(privatePath, 'utf8'), { algorithm: 'RS256', keyid: 'dglaundry-oidc-1' });
    let logoutPassed = false;
    const logoutResponse = makeResponse();
    await oidcEndSession({
      headers: {},
      body: {},
      query: { id_token_hint: expiredHint, post_logout_redirect_uri: 'https://laundry.surebizcorp.com/logout/callback', state: 'logout-state' },
      dgfyAccount: { id: 'account-1' }
    }, logoutResponse, () => { logoutPassed = true; });
    expect(logoutPassed).toBe(true);
    let logoutContinued = false;
    await oidcLogout({ oidcLogoutClaims: jwt.decode(expiredHint) }, logoutResponse, () => { logoutContinued = true; });
    expect(logoutContinued).toBe(true);
    const logoutIntrospection = makeResponse();
    await oidcIntrospect({ headers: { authorization }, body: { token: tokenResponse.body.access_token }, query: {} }, logoutIntrospection, (error) => { throw error; });
    expect(logoutIntrospection.body).toEqual({ active: false });

    const mismatchedLogout = makeResponse();
    await oidcEndSession({
      headers: {},
      body: {},
      query: { id_token_hint: tokenResponse.body.id_token, post_logout_redirect_uri: 'https://attacker.invalid/' },
      dgfyAccount: { id: 'account-1' }
    }, mismatchedLogout, () => {});
    expect(mismatchedLogout.statusCode).toBe(400);

    const revokeResponse = makeResponse();
    await oidcRevoke({ headers: { authorization }, body: { token: tokenResponse.body.access_token }, query: {} }, revokeResponse, (error) => { throw error; });
    expect(revokeResponse.statusCode).toBe(200);
    const revokedIntrospection = makeResponse();
    await oidcIntrospect({ headers: { authorization }, body: { token: tokenResponse.body.access_token }, query: {} }, revokedIntrospection, (error) => { throw error; });
    expect(revokedIntrospection.body).toEqual({ active: false });

    process.env.DGFY_OIDC_ISSUER = 'https://api.stage.dgfy.ph/oidc';
    process.env.DGFY_OIDC_KEY_ID = 'dglaundry-oidc-1';
    process.env.DGLAUNDRY_INTEGRATION_ENVIRONMENT = 'staging';
    process.env.DGLAUNDRY_PARTNER_AUDIENCE = 'https://laundry.surebizcorp.com';
    process.env.DGLAUNDRY_PARTNER_BASE_URL = 'https://laundry.surebizcorp.com';
    process.env.DGFY_DGLAUNDRY_SERVICE_CLIENT_ID = 'dgfy-service-client';
    const { issueDglaundryPartnerAccessToken } = await import('../src/modules/dgfyLaundryOrders/services/dglaundryPartnerAccessToken.js');
    const partnerToken = await issueDglaundryPartnerAccessToken({
      method: 'POST',
      target: 'https://laundry.surebizcorp.com/api/v1/integrations/dgfy/quotes',
      payload: { companyId: 'company-1', locationId: 'location-1' },
      nowSeconds: 1_800_000_000
    });
    expect(jwt.verify(partnerToken, publicKey, { algorithms: ['RS256'], audience: 'https://laundry.surebizcorp.com' })).toMatchObject({ scope: 'dglaundry:quotes:create' });
  });

  test('preserves the JWKS unconfigured response for an unreadable key path', async () => {
    process.env.DGFY_OIDC_PUBLIC_KEY_FILE = path.join(directory, 'missing-public.pem');
    const response = makeResponse();
    await oidcJwks({}, response);

    expect(response.statusCode).toBe(503);
    expect(response.body).toEqual({ error: 'oidc_keys_not_configured' });
  });

  test('does not reuse the legacy shared partner token as the browser client secret', async () => {
    const response = makeResponse();
    let capturedError;
    await oidcPar({
      headers: { authorization: `Basic ${Buffer.from('dglaundry-web:legacy-partner-token').toString('base64')}` },
      body: {
        client_id: 'dglaundry-web',
        response_type: 'code',
        redirect_uri: 'https://laundry.surebizcorp.com/api/v1/session/dgfy/callback',
        code_challenge: 'challenge',
        code_challenge_method: 'S256'
      },
      query: {}
    }, response, (error) => { capturedError = error; });
    expect(capturedError?.statusCode).toBe(401);
    expect(response.statusCode).toBe(200);

    let bodyCredentialError;
    await oidcPar({
      headers: { authorization: `Basic ${Buffer.from('dglaundry-web:test-client-secret').toString('base64')}` },
      body: {
        client_id: 'dglaundry-web',
        client_secret: 'test-client-secret',
        response_type: 'code',
        redirect_uri: 'https://laundry.surebizcorp.com/api/v1/session/dgfy/callback',
        code_challenge: 'challenge',
        code_challenge_method: 'S256'
      },
      query: {}
    }, makeResponse(), (error) => { bodyCredentialError = error; });
    expect(bodyCredentialError?.statusCode).toBe(401);
  });

  test('does not allow the machine client to create browser authorization requests', async () => {
    const machinePair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const machineClientId = 'dglaundry-machine';
    const issuer = process.env.DGFY_OIDC_ISSUER || 'https://api.dgfy.ph/oidc';
    process.env.DGFY_DGLAUNDRY_MACHINE_CLIENT_ID = machineClientId;
    process.env.DGFY_DGLAUNDRY_MACHINE_ASSERTION_AUDIENCE = `${issuer}/token`;
    process.env.DGFY_DGLAUNDRY_MACHINE_CLIENT_PUBLIC_KEY = machinePair.publicKey.export({ type: 'spki', format: 'pem' });
    const assertion = jwt.sign({}, machinePair.privateKey, {
      algorithm: 'RS256',
      issuer: machineClientId,
      subject: machineClientId,
      audience: `${issuer}/token`,
      expiresIn: 60,
      jwtid: crypto.randomUUID()
    });
    const response = makeResponse();
    await oidcPar({
      headers: {},
      body: {
        client_id: machineClientId,
        client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        client_assertion: assertion,
        response_type: 'code',
        redirect_uri: 'https://laundry.surebizcorp.com/api/v1/session/dgfy/callback',
        code_challenge: 'challenge',
        code_challenge_method: 'S256'
      },
      query: {}
    }, response, (error) => { throw error; });

    expect(response.statusCode).toBe(400);
    expect(response.body).toMatchObject({ error: 'unauthorized_client' });
  });

  test('advertises the implemented end-session and introspection endpoints', () => {
    const response = makeResponse();
    oidcDiscovery({}, response);
    expect(response.body.end_session_endpoint).toBe(`${response.body.issuer}/logout`);
    expect(response.body.introspection_endpoint).toBe(`${response.body.issuer}/introspect`);
  });
});
