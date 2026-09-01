import { signDgfyRequest } from './dglaundryEventSignature.js';

const baseUrl = () => String(process.env.DGLAUNDRY_PARTNER_BASE_URL || 'http://127.0.0.1:4400').replace(/\/$/, '');

const request = async (path, body, { method = 'POST', idempotencyKey = null } = {}) => {
  const target = new URL(path, baseUrl());
  const signed = signDgfyRequest({ method, authority: target.host, path: `${target.pathname}${target.search}`, body });
  const headers = { ...signed.headers };
  if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
  if (process.env.DGLAUNDRY_PARTNER_TOKEN) headers['x-dglaundry-partner-token'] = String(process.env.DGLAUNDRY_PARTNER_TOKEN);
  const response = await fetch(target, { method, headers, body: method === 'GET' ? undefined : signed.rawBody });
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
  submitOrder: (envelope) => request('/api/v1/integrations/dgfy/events', envelope, { idempotencyKey: envelope?.id }),
  updateOrder: (envelope) => request('/api/v1/integrations/dgfy/events', envelope, { idempotencyKey: envelope?.id }),
  cancelOrder: (envelope) => request('/api/v1/integrations/dgfy/events', envelope, { idempotencyKey: envelope?.id }),
  resolveOrder: (payload) => request('/api/v1/integrations/dgfy/order-projections/resolve', payload, { method: 'POST' }),
  health: () => request('/api/v1/integrations/dgfy/health', {}, { method: 'GET' })
};

