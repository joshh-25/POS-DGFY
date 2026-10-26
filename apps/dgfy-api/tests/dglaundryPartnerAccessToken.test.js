import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import { issueDglaundryPartnerAccessToken } from '../src/modules/dgfyLaundryOrders/services/dglaundryPartnerAccessToken.js';

describe('issueDglaundryPartnerAccessToken OIDC key resolution', () => {
  const priorEnv = {};
  let directory;
  let keyFile;
  let publicKey;

  beforeAll(() => {
    for (const name of ['DGFY_OIDC_PRIVATE_KEY', 'DGFY_OIDC_PRIVATE_KEY_FILE', 'DGFY_OIDC_ISSUER', 'DGFY_OIDC_KEY_ID', 'DGLAUNDRY_INTEGRATION_ENVIRONMENT', 'DGLAUNDRY_PARTNER_AUDIENCE', 'DGLAUNDRY_PARTNER_BASE_URL', 'DGFY_DGLAUNDRY_SERVICE_CLIENT_ID']) {
      priorEnv[name] = process.env[name];
    }
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dglaundry-partner-token-'));
    keyFile = path.join(directory, 'private.pem');
    const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    fs.writeFileSync(keyFile, pair.privateKey.export({ type: 'pkcs8', format: 'pem' }));
    publicKey = pair.publicKey.export({ type: 'spki', format: 'pem' });
  });

  afterAll(() => {
    for (const [name, value] of Object.entries(priorEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    fs.rmSync(directory, { recursive: true, force: true });
  });

  beforeEach(() => {
    delete process.env.DGFY_OIDC_PRIVATE_KEY;
    process.env.DGFY_OIDC_PRIVATE_KEY_FILE = keyFile;
    process.env.DGFY_OIDC_ISSUER = 'https://api.stage.dgfy.ph/oidc';
    process.env.DGFY_OIDC_KEY_ID = 'dglaundry-oidc-1';
    process.env.DGLAUNDRY_INTEGRATION_ENVIRONMENT = 'staging';
    process.env.DGLAUNDRY_PARTNER_AUDIENCE = 'https://dglaundry.stage.dgfy.ph';
    process.env.DGLAUNDRY_PARTNER_BASE_URL = 'https://dglaundry.stage.dgfy.ph';
    process.env.DGFY_DGLAUNDRY_SERVICE_CLIENT_ID = 'dgfy-service-client';
  });

  test('signs from DGFY_OIDC_PRIVATE_KEY_FILE alone', async () => {
    const token = await issueDglaundryPartnerAccessToken({
      method: 'POST',
      target: 'https://dglaundry.stage.dgfy.ph/api/v1/integrations/dgfy/quotes',
      payload: { companyId: 'company-1', locationId: 'location-1' },
      nowSeconds: 1_800_000_000
    });

    expect(jwt.verify(token, publicKey, { algorithms: ['RS256'], audience: 'https://dglaundry.stage.dgfy.ph' })).toMatchObject({
      iss: 'https://api.stage.dgfy.ph/oidc',
      sub: 'dgfy-service-client',
      scope: 'dglaundry:quotes:create'
    });
  });

  test('issues the exact DEV service token for the separately hosted Surebiz origin', async () => {
    process.env.DGLAUNDRY_INTEGRATION_ENVIRONMENT = 'development';
    process.env.DGFY_OIDC_ISSUER = 'https://api.dev.dgfy.ph/oidc';
    process.env.DGLAUNDRY_PARTNER_AUDIENCE = 'https://laundry.surebizcorp.com';
    process.env.DGLAUNDRY_PARTNER_BASE_URL = 'https://laundry.surebizcorp.com';
    const token = await issueDglaundryPartnerAccessToken({
      method: 'POST',
      target: 'https://laundry.surebizcorp.com/api/v1/integrations/dgfy/quotes',
      payload: { companyId: 'synthetic-company', locationId: 'synthetic-location' },
      nowSeconds: 1_800_000_000
    });
    const claims = jwt.verify(token, publicKey, { algorithms: ['RS256'], audience: 'https://laundry.surebizcorp.com' });
    expect(claims).toMatchObject({
      iss: 'https://api.dev.dgfy.ph/oidc',
      sub: 'dgfy-service-client',
      aud: 'https://laundry.surebizcorp.com',
      scope: 'dglaundry:quotes:create',
      dgfy_company_id: 'synthetic-company',
      dgfy_location_id: 'synthetic-location',
      iat: 1_800_000_000,
      exp: 1_800_000_300
    });
    expect(claims.jti).toEqual(expect.any(String));
  });

  test('rejects a staging issuer or API origin for a DEV service token', async () => {
    process.env.DGLAUNDRY_INTEGRATION_ENVIRONMENT = 'development';
    process.env.DGFY_OIDC_ISSUER = 'https://api.stage.dgfy.ph/oidc';
    process.env.DGLAUNDRY_PARTNER_AUDIENCE = 'https://laundry.surebizcorp.com';
    process.env.DGLAUNDRY_PARTNER_BASE_URL = 'https://laundry.surebizcorp.com';
    await expect(issueDglaundryPartnerAccessToken({
      method: 'POST',
      target: 'https://laundry.surebizcorp.com/api/v1/integrations/dgfy/quotes',
      payload: { companyId: 'company-1', locationId: 'location-1' }
    })).rejects.toThrow('DGFY_OIDC_ISSUER_ENVIRONMENT_MISMATCH');

    process.env.DGFY_OIDC_ISSUER = 'https://api.dev.dgfy.ph/oidc';
    process.env.DGLAUNDRY_PARTNER_AUDIENCE = 'https://dglaundry.stage.dgfy.ph';
    process.env.DGLAUNDRY_PARTNER_BASE_URL = 'https://dglaundry.stage.dgfy.ph';
    await expect(issueDglaundryPartnerAccessToken({
      method: 'POST',
      target: 'https://dglaundry.stage.dgfy.ph/api/v1/integrations/dgfy/quotes',
      payload: { companyId: 'company-1', locationId: 'location-1' }
    })).rejects.toThrow('DGLAUNDRY_PARTNER_ORIGIN_ENVIRONMENT_MISMATCH');
  });

  test('preserves the required-key error when no source is configured', async () => {
    delete process.env.DGFY_OIDC_PRIVATE_KEY_FILE;
    await expect(issueDglaundryPartnerAccessToken({
      method: 'POST',
      target: 'https://laundry.surebizcorp.com/api/v1/integrations/dgfy/quotes',
      payload: { companyId: 'company-1', locationId: 'location-1' }
    })).rejects.toThrow('DGFY_OIDC_PRIVATE_KEY_FILE_REQUIRED');
  });
});
