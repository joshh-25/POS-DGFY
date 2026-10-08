import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import { buildOidcAuthorizeHandler, oidcJwks, oidcPar, oidcToken } from '../src/modules/dgfyLaundry/services/dgfyLaundryOidcProvider.js';

const makeResponse = () => ({
  statusCode: 200,
  body: null,
  redirectUrl: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
  redirect(url) { this.redirectUrl = url; return this; }
});

describe('DGFY OIDC provider key resolution', () => {
  const priorEnv = {};
  let directory;
  let privatePath;
  let publicPath;
  let publicKey;

  beforeAll(() => {
    for (const name of ['DGFY_OIDC_PRIVATE_KEY', 'DGFY_OIDC_PRIVATE_KEY_FILE', 'DGFY_OIDC_PUBLIC_KEY', 'DGFY_OIDC_PUBLIC_KEY_FILE', 'DGFY_OIDC_ISSUER', 'DGFY_OIDC_KEY_ID', 'DGFY_DGLAUNDRY_SERVICE_CLIENT_ID', 'DGLAUNDRY_INTEGRATION_ENVIRONMENT', 'DGLAUNDRY_PARTNER_AUDIENCE', 'DGLAUNDRY_PARTNER_BASE_URL', 'DGLAUNDRY_PARTNER_TOKEN', 'NODE_ENV']) {
      priorEnv[name] = process.env[name];
    }
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dgfy-oidc-provider-'));
    privatePath = path.join(directory, 'private.pem');
    publicPath = path.join(directory, 'public.pem');
    const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    fs.writeFileSync(privatePath, pair.privateKey.export({ type: 'pkcs8', format: 'pem' }));
    publicKey = pair.publicKey.export({ type: 'spki', format: 'pem' });
    fs.writeFileSync(publicPath, publicKey);
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
    delete process.env.DGFY_OIDC_PRIVATE_KEY;
    delete process.env.DGFY_OIDC_PUBLIC_KEY;
    process.env.DGFY_OIDC_PRIVATE_KEY_FILE = privatePath;
    process.env.DGFY_OIDC_PUBLIC_KEY_FILE = publicPath;
    process.env.DGLAUNDRY_PARTNER_TOKEN = 'test-client-secret';
  });

  test('serves a valid JWKS from the configured public key file', () => {
    const response = makeResponse();
    oidcJwks({}, response);

    expect(response.statusCode).toBe(200);
    expect(response.body.keys).toHaveLength(1);
    expect(response.body.keys[0]).toMatchObject({ alg: 'RS256', use: 'sig', kty: 'RSA' });
  });

  test('OIDC token and partner tokens both sign from the same private key file setting', async () => {
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
    const authorize = buildOidcAuthorizeHandler({
      chooseCompany: async () => ({ company: { company_id: 'company-1', membership_id: 'membership-1', role: 'owner' } })
    });
    await authorize({
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

    process.env.DGFY_OIDC_ISSUER = 'https://api.stage.dgfy.ph/oidc';
    process.env.DGFY_OIDC_KEY_ID = 'dglaundry-oidc-1';
    process.env.DGLAUNDRY_INTEGRATION_ENVIRONMENT = 'staging';
    process.env.DGLAUNDRY_PARTNER_AUDIENCE = 'https://laundry.surebizcorp.com';
    process.env.DGLAUNDRY_PARTNER_BASE_URL = 'https://laundry.surebizcorp.com';
    process.env.DGFY_DGLAUNDRY_SERVICE_CLIENT_ID = 'dgfy-service-client';
    const { issueDglaundryPartnerAccessToken } = await import('../src/modules/dgfyLaundryOrders/services/dglaundryPartnerAccessToken.js');
    const partnerToken = issueDglaundryPartnerAccessToken({
      method: 'POST',
      target: 'https://laundry.surebizcorp.com/api/v1/integrations/dgfy/quotes',
      payload: { companyId: 'company-1', locationId: 'location-1' },
      nowSeconds: 1_800_000_000
    });
    expect(jwt.verify(partnerToken, publicKey, { algorithms: ['RS256'], audience: 'https://laundry.surebizcorp.com' })).toMatchObject({ scope: 'dglaundry:quotes:create' });
  });

  test('preserves the JWKS unconfigured response for an unreadable key path', () => {
    process.env.DGFY_OIDC_PUBLIC_KEY_FILE = path.join(directory, 'missing-public.pem');
    const response = makeResponse();
    oidcJwks({}, response);

    expect(response.statusCode).toBe(503);
    expect(response.body).toEqual({ error: 'oidc_keys_not_configured' });
  });
});
