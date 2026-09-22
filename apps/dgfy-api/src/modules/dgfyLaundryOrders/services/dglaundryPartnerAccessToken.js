import crypto from 'node:crypto';
import fs from 'node:fs';
import jwt from 'jsonwebtoken';

const operationScopes = new Map([
  ['/api/v1/integrations/dgfy/quotes', { method: 'POST', scope: 'dglaundry:quotes:create' }],
  ['/api/v1/integrations/dgfy/booking-groups/prepare', { method: 'POST', scope: 'dglaundry:bookings:prepare' }],
  ['/api/v1/integrations/dgfy/order-projections/resolve', { method: 'POST', scope: 'dglaundry:orders:read' }]
]);

const configured = (name) => {
  const direct = String(process.env[name] || '').trim();
  if (direct) return direct;
  const file = String(process.env[`${name}_FILE`] || '').trim();
  if (!file) return '';
  try { return fs.readFileSync(file, 'utf8').trim(); } catch { return ''; }
};

const required = (value, code) => {
  const normalized = String(value || '').trim();
  if (!normalized) throw new Error(code);
  return normalized;
};

export const issueDglaundryPartnerAccessToken = ({ method, target, payload = {}, nowSeconds = Math.floor(Date.now() / 1000) }) => {
  const targetUrl = target instanceof URL ? target : new URL(String(target));
  const operation = operationScopes.get(targetUrl.pathname);
  if (!operation) throw new Error('DGLAUNDRY_PARTNER_OPERATION_SCOPE_UNSUPPORTED');
  if (String(method || '').toUpperCase() !== operation.method) throw new Error('DGLAUNDRY_PARTNER_OPERATION_METHOD_UNSUPPORTED');

  const integrationEnvironment = required(process.env.DGLAUNDRY_INTEGRATION_ENVIRONMENT, 'DGLAUNDRY_INTEGRATION_ENVIRONMENT_REQUIRED');
  const expectedIssuer = integrationEnvironment === 'staging'
    ? 'https://api.stage.dgfy.ph/oidc'
    : integrationEnvironment === 'production'
      ? 'https://api.dgfy.ph/oidc'
      : '';
  if (!expectedIssuer) throw new Error('DGLAUNDRY_INTEGRATION_ENVIRONMENT_INVALID');

  const issuer = required(process.env.DGFY_OIDC_ISSUER, 'DGFY_OIDC_ISSUER_REQUIRED');
  if (issuer !== expectedIssuer) throw new Error('DGFY_OIDC_ISSUER_ENVIRONMENT_MISMATCH');
  const audience = required(process.env.DGLAUNDRY_PARTNER_AUDIENCE, 'DGLAUNDRY_PARTNER_AUDIENCE_REQUIRED');
  const configuredBaseUrl = required(process.env.DGLAUNDRY_PARTNER_BASE_URL, 'DGLAUNDRY_PARTNER_BASE_URL_REQUIRED');
  const baseUrl = new URL(configuredBaseUrl);
  if (baseUrl.protocol !== 'https:' || baseUrl.username || baseUrl.password || baseUrl.pathname !== '/' || baseUrl.search || baseUrl.hash || audience !== baseUrl.origin) {
    throw new Error('DGLAUNDRY_PARTNER_AUDIENCE_ORIGIN_MISMATCH');
  }
  if (targetUrl.origin !== baseUrl.origin) throw new Error('DGLAUNDRY_PARTNER_TARGET_ORIGIN_MISMATCH');

  const clientId = required(process.env.DGFY_DGLAUNDRY_SERVICE_CLIENT_ID, 'DGFY_DGLAUNDRY_SERVICE_CLIENT_ID_REQUIRED');
  const keyId = required(process.env.DGFY_OIDC_KEY_ID, 'DGFY_OIDC_KEY_ID_REQUIRED');
  if (!/^[a-z][a-z0-9._:-]{2,80}$/.test(clientId)) throw new Error('DGFY_DGLAUNDRY_SERVICE_CLIENT_ID_INVALID');
  if (!/^[A-Za-z0-9._:-]{3,128}$/.test(keyId)) throw new Error('DGFY_OIDC_KEY_ID_INVALID');
  const signingKey = required(configured('DGFY_OIDC_PRIVATE_KEY'), 'DGFY_OIDC_PRIVATE_KEY_FILE_REQUIRED');
  const companyId = required(payload.companyId || payload.company_id, 'DGLAUNDRY_PARTNER_COMPANY_ID_REQUIRED');
  const locationId = required(payload.locationId || payload.location_id, 'DGLAUNDRY_PARTNER_LOCATION_ID_REQUIRED');
  const issuedAt = Math.floor(Number(nowSeconds));
  if (!Number.isSafeInteger(issuedAt) || issuedAt <= 0) throw new Error('DGLAUNDRY_PARTNER_ISSUED_AT_INVALID');

  return jwt.sign({
    iss: issuer,
    sub: clientId,
    aud: audience,
    client_id: clientId,
    scope: operation.scope,
    iat: issuedAt,
    exp: issuedAt + 300,
    jti: crypto.randomUUID(),
    dgfy_company_id: companyId,
    dgfy_location_id: locationId
  }, signingKey, { algorithm: 'RS256', keyid: keyId });
};

export const dglaundryPartnerOperationScopes = operationScopes;
