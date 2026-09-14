import { signDgfyRequest } from './dglaundryEventSignature.js';
import crypto from 'node:crypto';
import fs from 'node:fs';

const baseUrl = () => String(process.env.DGLAUNDRY_PARTNER_BASE_URL || 'http://127.0.0.1:4400').replace(/\/$/, '');

const configured = (name) => {
  const direct = String(process.env[name] || '').trim();
  if (direct) return direct;
  const file = String(process.env[`${name}_FILE`] || '').trim();
  if (!file) return '';
  try { return fs.readFileSync(file, 'utf8').trim(); } catch { return ''; }
};

export const signDglaundryPartnerRequest = ({ method, target, rawBody, idempotencyKey }) => {
  const token = configured('DGLAUNDRY_PARTNER_ACCESS_TOKEN') || configured('DGLAUNDRY_PARTNER_TOKEN');
  const signingKey = configured('DGLAUNDRY_PARTNER_SIGNING_PRIVATE_KEY');
  const signingKeyId = configured('DGLAUNDRY_PARTNER_SIGNING_KEY_ID') || 'dgfy-partner-p256';
  const appId = configured('DGLAUNDRY_PARTNER_APP_ID') || 'dgfy';
  const contractVersion = configured('DGLAUNDRY_PARTNER_CONTRACT_VERSION') || 'external-runtime-v0.1';
  if (!token || !signingKey) throw new Error('DGLAUNDRY_PARTNER_ASYMMETRIC_CREDENTIALS_REQUIRED');
  const created = Math.floor(Date.now() / 1000);
  const expires = created + 300;
  const nonce = crypto.randomUUID();
  const headers = {
    authorization: `Bearer ${token}`,
    'x-dgfy-app-id': appId,
    'x-dgfy-contract-version': contractVersion,
    date: new Date(created * 1000).toUTCString()
  };
  const components = ['@method', '@target-uri'];
  if (rawBody) {
    headers['content-digest'] = `sha-256=:${crypto.createHash('sha256').update(rawBody).digest('base64')}:`;
    headers['content-type'] = 'application/json';
    components.push('content-digest', 'content-type');
  }
  components.push('authorization');
  if (idempotencyKey) { headers['idempotency-key'] = idempotencyKey; components.push('idempotency-key'); }
  components.push('x-dgfy-app-id', 'x-dgfy-contract-version', 'date');
  const params = `(${components.map((component) => `"${component}"`).join(' ')});created=${created};expires=${expires};nonce="${nonce}";keyid="${signingKeyId}";alg="ecdsa-p256-sha256";tag="dgfy-external-runtime-v1"`;
  const baseLines = components.map((component) => {
    if (component === '@method') return `"@method": ${method.toUpperCase()}`;
    if (component === '@target-uri') return `"@target-uri": ${target.toString()}`;
    return `"${component}": ${headers[component]}`;
  });
  baseLines.push(`"@signature-params": ${params}`);
  const signature = crypto.sign('sha256', Buffer.from(baseLines.join('\n')), { key: signingKey, dsaEncoding: 'ieee-p1363' }).toString('base64');
  return {
    ...headers,
    'signature-input': `sig1=${params}`,
    signature: `sig1=:${signature}:`
  };
};

const request = async (path, body, { method = 'POST', idempotencyKey = null } = {}) => {
  const target = new URL(path, baseUrl());
  const rawBody = method === 'GET' ? '' : JSON.stringify(body ?? {});
  const headers = process.env.DGLAUNDRY_SIGNATURE_PROFILE === 'http-message-signatures-v1'
    ? signDglaundryPartnerRequest({ method, target, rawBody, idempotencyKey })
    : signDgfyRequest({ method, authority: target.host, path: `${target.pathname}${target.search}`, body }).headers;
  if (idempotencyKey && !headers['idempotency-key']) headers['idempotency-key'] = idempotencyKey;
  if (process.env.DGLAUNDRY_PARTNER_TOKEN && !headers['x-dglaundry-partner-token']) headers['x-dglaundry-partner-token'] = String(process.env.DGLAUNDRY_PARTNER_TOKEN);
  const response = await fetch(target, { method, headers, body: rawBody || undefined });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    const error = new Error(payload.message || payload.error_code || `DGLaundry partner request failed (${response.status})`);
    error.statusCode = response.status;
    error.code = payload.error_code || null;
    throw error;
  }
  return payload.data ?? payload;
};

export const dglaundryPartnerClient = {
  prepareQuote: (payload) => request('/api/v1/integrations/dgfy/quotes', payload, { idempotencyKey: payload?.idempotencyKey || payload?.idempotency_key }),
  prepareBookingGroup: (payload) => request('/api/v1/integrations/dgfy/booking-groups/prepare', payload, { idempotencyKey: payload?.idempotencyKey || payload?.idempotency_key }),
  submitOrder: (envelope) => request('/api/v1/integrations/dgfy/events', envelope, { idempotencyKey: envelope?.id }),
  updateOrder: (envelope) => request('/api/v1/integrations/dgfy/events', envelope, { idempotencyKey: envelope?.id }),
  cancelOrder: (envelope) => request('/api/v1/integrations/dgfy/events', envelope, { idempotencyKey: envelope?.id }),
  resolveOrder: (payload) => request('/api/v1/integrations/dgfy/order-projections/resolve', payload, { method: 'POST' }),
  health: () => request('/api/v1/integrations/dgfy/health', {}, { method: 'GET' })
};
