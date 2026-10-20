import { createHash } from 'node:crypto';

export const FEEDBACK_TYPES = ['bug', 'idea', 'question', 'other'];
export const FEEDBACK_SURFACES = ['storefront', 'pos', 'ims', 'opis', 'admin', 'unknown'];
export const FEEDBACK_PLATFORMS = ['web', 'android', 'ios', 'unknown'];

const bounded = (value, length) => typeof value === 'string' ? value.trim().slice(0, length) || null : null;
const allowed = (value, choices) => choices.includes(value) ? value : 'unknown';
const plain = (row) => row?.get ? row.get({ plain: true }) : row;

export const normalizeContext = (context, origin) => {
  const data = context && typeof context === 'object' && !Array.isArray(context) ? { ...context } : {};
  if (origin && typeof origin === 'object' && !Array.isArray(origin)) {
    const raw = {};
    if (origin.surface != null && !FEEDBACK_SURFACES.includes(origin.surface)) raw.surface = origin.surface;
    if (origin.platform != null && !FEEDBACK_PLATFORMS.includes(origin.platform)) raw.platform = origin.platform;
    if (Object.keys(raw).length) data.origin_raw = raw;
  }
  try {
    return Buffer.byteLength(JSON.stringify(data), 'utf8') <= 8192 ? data : { truncated: true };
  } catch {
    return { truncated: true };
  }
};

export const toSubmission = ({ type, description, url, context, origin, contact, tenant, identity, user, correlationId }) => {
  // The user fallback is exclusively for historical JSONL imports.
  const actor = identity || (user?.id != null && user.id !== 'Anonymous'
    ? { kind: 'tenant_user', id: user.id, name: user.username, email: user.email, verified: true }
    : null);
  const tenantId = tenant?.id && tenant.id !== 'default' ? tenant.id : null;
  const submitterType = actor?.kind === 'store_customer' && actor.dgfyAccountId
    ? 'dgfy_account' : actor?.kind || 'guest';
  return {
    type,
    description: description.trim(),
    page_url: bounded(url, 2048) === 'N/A' ? null : bounded(url, 2048),
    context_json: normalizeContext(context, origin),
    surface: allowed(origin?.surface, FEEDBACK_SURFACES),
    client_platform: allowed(origin?.platform, FEEDBACK_PLATFORMS),
    app_version: bounded(origin?.app_version, 64),
    tenant_id: tenantId,
    tenant_name: tenantId ? bounded(tenant?.name, 255) : null,
    submitter_type: submitterType,
    tenant_user_id: actor?.kind === 'tenant_user' ? actor.id : null,
    dgfy_account_id: submitterType === 'dgfy_account' ? (actor.dgfyAccountId || actor.id) : null,
    submitter_name: bounded(actor ? actor.name : contact?.name, 255),
    submitter_email: bounded(actor ? actor.email : contact?.email, 320),
    contact_verified: Boolean(actor?.verified),
    correlation_id: bounded(correlationId, 128),
    submitted_at: new Date()
  };
};

export const toAdminFeedback = (source) => {
  const row = plain(source);
  const userId = row.tenant_user_id ?? 'Anonymous';
  return {
    id: row.id,
    timestamp: row.submitted_at,
    type: row.type,
    description: row.description,
    url: row.page_url || 'N/A',
    context: row.context_json || {},
    tenant: row.tenant_id ? { id: row.tenant_id, name: row.tenant_name } : null,
    user: { id: userId, username: row.submitter_name || 'Anonymous', email: row.submitter_email || 'N/A' },
    user_id: row.tenant_user_id,
    status: row.status,
    surface: row.surface,
    client_platform: row.client_platform,
    app_version: row.app_version,
    submitter_type: row.submitter_type,
    contact_verified: row.contact_verified,
    correlation_id: row.correlation_id
  };
};

export const parseLegacyFeedbackLine = (line) => {
  const hash = createHash('sha256').update(line).digest('hex');
  const parsed = JSON.parse(line);
  if (!parsed || typeof parsed !== 'object' || typeof parsed.type !== 'string' || !parsed.type.trim() ||
      typeof parsed.description !== 'string' || !parsed.description.trim() ||
      !parsed.timestamp || !Number.isFinite(Date.parse(parsed.timestamp))) {
    throw new Error('Invalid legacy feedback entry');
  }
  const entry = toSubmission({
    type: FEEDBACK_TYPES.includes(parsed.type) ? parsed.type : 'other',
    description: parsed.description,
    url: parsed.url,
    context: parsed.context,
    tenant: parsed.tenant,
    user: parsed.user
  });
  return {
    ...entry,
    // Preserve historical import attribution even for the former default context.
    tenant_name: bounded(parsed.tenant?.name, 255),
    context_json: normalizeContext({
      ...entry.context_json,
      ...(FEEDBACK_TYPES.includes(parsed.type) ? {} : { legacy_type: parsed.type })
    }),
    submitter_type: 'legacy',
    contact_verified: false,
    surface: 'unknown',
    client_platform: 'web',
    submitted_at: new Date(parsed.timestamp),
    legacy_source_hash: hash
  };
};
