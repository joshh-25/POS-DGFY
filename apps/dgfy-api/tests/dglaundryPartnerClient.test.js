import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { signDglaundryPartnerRequest } from '../src/modules/dgfyLaundryOrders/services/dglaundryPartnerClient.js';
import { issueDglaundryPartnerAccessToken } from '../src/modules/dgfyLaundryOrders/services/dglaundryPartnerAccessToken.js';

const originalEnvironment = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in originalEnvironment)) delete process.env[key];
  Object.assign(process.env, originalEnvironment);
});

describe('DGLaundry partner request profile', () => {
  it('emits a mapped, operation-scoped DGFY JWT and a separate P-256 signature', () => {
    process.env.DGLAUNDRY_INTEGRATION_ENVIRONMENT = 'staging';
    process.env.DGFY_OIDC_ISSUER = 'https://api.stage.dgfy.ph/oidc';
    process.env.DGFY_OIDC_KEY_ID = 'dgfy-oidc-stage-1';
    process.env.DGFY_DGLAUNDRY_SERVICE_CLIENT_ID = 'dgfy-laundry-partner-stage';
    process.env.DGLAUNDRY_PARTNER_BASE_URL = 'https://laundry.surebizcorp.com';
    process.env.DGLAUNDRY_PARTNER_AUDIENCE = 'https://laundry.surebizcorp.com';
    process.env.DGLAUNDRY_PARTNER_SIGNING_KEY_ID = 'dgfy-request-stage-1';
    process.env.DGLAUNDRY_PARTNER_ACCESS_TOKEN = 'must-not-be-used';
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    process.env.DGLAUNDRY_PARTNER_SIGNING_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' });
    const { privateKey: oidcPrivateKey, publicKey: oidcPublicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    process.env.DGFY_OIDC_PRIVATE_KEY = oidcPrivateKey.export({ type: 'pkcs8', format: 'pem' });
    const target = new URL('https://laundry.surebizcorp.com/api/v1/integrations/dgfy/quotes?location_id=branch-1');
    const rawBody = JSON.stringify({ companyId: 'company-1', locationId: 'branch-1', quoteId: 'quote-1' });
    const headers = signDglaundryPartnerRequest({ method: 'POST', target, rawBody, idempotencyKey: 'idem-1' });
    expect(headers.authorization).toMatch(/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    const accessToken = headers.authorization.slice('Bearer '.length);
    const claims = jwt.verify(accessToken, oidcPublicKey, { algorithms: ['RS256'], issuer: 'https://api.stage.dgfy.ph/oidc', audience: 'https://laundry.surebizcorp.com' });
    expect(claims).toEqual(expect.objectContaining({
      iss: 'https://api.stage.dgfy.ph/oidc',
      sub: 'dgfy-laundry-partner-stage',
      client_id: 'dgfy-laundry-partner-stage',
      scope: 'dglaundry:quotes:create',
      dgfy_company_id: 'company-1',
      dgfy_location_id: 'branch-1'
    }));
    expect(claims.exp - claims.iat).toBe(300);
    expect(claims.jti).toEqual(expect.any(String));
    expect(jwt.decode(accessToken, { complete: true }).header).toEqual(expect.objectContaining({ alg: 'RS256', kid: 'dgfy-oidc-stage-1' }));
    expect(headers['signature-input']).toMatch(/^sig1=\("@method" "@target-uri" "content-digest" "content-type" "authorization" "idempotency-key" "x-dgfy-app-id" "x-dgfy-contract-version" "date"\);/);
    expect(headers['x-dgfy-app-id']).toBe('dgfy-laundry-partner-stage');
    expect(headers.signature).toMatch(/^sig1=:[^:]+:$/);
    const signatureParams = headers['signature-input'].slice('sig1='.length);
    const signatureBase = [
      `"@method": POST`,
      `"@target-uri": ${target.toString()}`,
      `"content-digest": ${headers['content-digest']}`,
      `"content-type": ${headers['content-type']}`,
      `"authorization": ${headers.authorization}`,
      `"idempotency-key": ${headers['idempotency-key']}`,
      `"x-dgfy-app-id": ${headers['x-dgfy-app-id']}`,
      `"x-dgfy-contract-version": ${headers['x-dgfy-contract-version']}`,
      `"date": ${headers.date}`,
      `"@signature-params": ${signatureParams}`
    ].join('\n');
    const wireSignature = Buffer.from(headers.signature.slice(6, -1), 'base64');
    expect(wireSignature).toHaveLength(64);
    expect(crypto.verify('sha256', Buffer.from(signatureBase), { key: publicKey, dsaEncoding: 'ieee-p1363' }, wireSignature)).toBe(true);
    expect(crypto.verify('sha256', Buffer.from(signatureBase), publicKey, wireSignature)).toBe(false);
  });

  it.each([
    ['/api/v1/integrations/dgfy/booking-groups/prepare', 'dglaundry:bookings:prepare'],
    ['/api/v1/integrations/dgfy/order-projections/resolve', 'dglaundry:orders:read']
  ])('issues the exact scope for %s', (path, expectedScope) => {
    process.env.DGLAUNDRY_INTEGRATION_ENVIRONMENT = 'staging';
    process.env.DGFY_OIDC_ISSUER = 'https://api.stage.dgfy.ph/oidc';
    process.env.DGFY_OIDC_KEY_ID = 'dgfy-oidc-stage-1';
    process.env.DGFY_DGLAUNDRY_SERVICE_CLIENT_ID = 'dgfy-laundry-partner-stage';
    process.env.DGLAUNDRY_PARTNER_BASE_URL = 'https://laundry.surebizcorp.com';
    process.env.DGLAUNDRY_PARTNER_AUDIENCE = 'https://laundry.surebizcorp.com';
    process.env.DGLAUNDRY_PARTNER_SIGNING_KEY_ID = 'dgfy-request-stage-1';
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    process.env.DGFY_OIDC_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' });
    const token = issueDglaundryPartnerAccessToken({
      method: 'POST',
      target: new URL(`https://laundry.surebizcorp.com${path}`),
      payload: { company_id: 'company-1', location_id: 'branch-1' }
    });
    const claims = jwt.verify(token, publicKey, { algorithms: ['RS256'], issuer: 'https://api.stage.dgfy.ph/oidc', audience: 'https://laundry.surebizcorp.com' });
    expect(claims.scope).toBe(expectedScope);
    expect(claims.dgfy_company_id).toBe('company-1');
    expect(claims.dgfy_location_id).toBe('branch-1');
    expect(claims.exp - claims.iat).toBe(300);
  });

  it('fails closed for unscoped paths, incomplete branch context, and mismatched audiences', () => {
    process.env.DGLAUNDRY_INTEGRATION_ENVIRONMENT = 'staging';
    process.env.DGFY_OIDC_ISSUER = 'https://api.stage.dgfy.ph/oidc';
    process.env.DGFY_OIDC_KEY_ID = 'dgfy-oidc-stage-1';
    process.env.DGFY_DGLAUNDRY_SERVICE_CLIENT_ID = 'dgfy-laundry-partner-stage';
    process.env.DGLAUNDRY_PARTNER_BASE_URL = 'https://laundry.surebizcorp.com';
    process.env.DGLAUNDRY_PARTNER_AUDIENCE = 'https://laundry.surebizcorp.com';
    process.env.DGLAUNDRY_PARTNER_SIGNING_KEY_ID = 'dgfy-request-stage-1';
    const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    process.env.DGLAUNDRY_PARTNER_SIGNING_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' });
    const { privateKey: oidcPrivateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    process.env.DGFY_OIDC_PRIVATE_KEY = oidcPrivateKey.export({ type: 'pkcs8', format: 'pem' });

    expect(() => signDglaundryPartnerRequest({ method: 'GET', target: new URL('https://laundry.surebizcorp.com/api/v1/integrations/dgfy/health'), rawBody: '' })).toThrow('DGLAUNDRY_PARTNER_OPERATION_SCOPE_UNSUPPORTED');
    expect(() => signDglaundryPartnerRequest({ method: 'POST', target: new URL('https://laundry.surebizcorp.com/api/v1/integrations/dgfy/quotes'), rawBody: JSON.stringify({ companyId: 'company-1' }) })).toThrow('DGLAUNDRY_PARTNER_LOCATION_ID_REQUIRED');
    process.env.DGLAUNDRY_PARTNER_AUDIENCE = 'https://api.stage.dgfy.ph';
    expect(() => signDglaundryPartnerRequest({ method: 'POST', target: new URL('https://laundry.surebizcorp.com/api/v1/integrations/dgfy/quotes'), rawBody: JSON.stringify({ companyId: 'company-1', locationId: 'branch-1' }) })).toThrow('DGLAUNDRY_PARTNER_AUDIENCE_ORIGIN_MISMATCH');
  });

  it('does not mint a scoped token for a non-POST operation method', () => {
    process.env.DGLAUNDRY_INTEGRATION_ENVIRONMENT = 'staging';
    process.env.DGFY_OIDC_ISSUER = 'https://api.stage.dgfy.ph/oidc';
    process.env.DGFY_OIDC_KEY_ID = 'dgfy-oidc-stage-1';
    process.env.DGFY_DGLAUNDRY_SERVICE_CLIENT_ID = 'dgfy-laundry-partner-stage';
    process.env.DGLAUNDRY_PARTNER_BASE_URL = 'https://laundry.surebizcorp.com';
    process.env.DGLAUNDRY_PARTNER_AUDIENCE = 'https://laundry.surebizcorp.com';
    const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    process.env.DGFY_OIDC_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' });

    expect(() => issueDglaundryPartnerAccessToken({
      method: 'GET',
      target: new URL('https://laundry.surebizcorp.com/api/v1/integrations/dgfy/quotes'),
      payload: { companyId: 'company-1', locationId: 'branch-1' }
    })).toThrow('DGLAUNDRY_PARTNER_OPERATION_METHOD_UNSUPPORTED');
  });
});
