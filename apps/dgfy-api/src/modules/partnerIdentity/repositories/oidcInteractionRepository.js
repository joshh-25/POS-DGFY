import crypto from 'node:crypto';
import { getRedisClient, isRedisConnected } from '../../../config/redis.js';

const unavailable = () => Object.assign(new Error('Redis-backed OIDC interaction state is required.'), { statusCode: 503 });
const interactionKey = (id) => `oidc:interaction:${String(id || '')}`;
const completionKey = (ticket) => `oidc:completion:${crypto.createHash('sha256').update(String(ticket || '')).digest('hex')}`;
const errorKey = (id) => `oidc:interaction-error:${String(id || '')}`;

const UPDATE_FRESH_AUTH = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local interaction = cjson.decode(raw)
local expiresAt = tonumber(interaction.expires_at or 0)
local now = tonumber(ARGV[1])
if expiresAt <= now then return 0 end
interaction.fresh_auth = cjson.decode(ARGV[2])
redis.call('SET', KEYS[1], cjson.encode(interaction), 'PX', expiresAt - now)
return 1
`;

const BIND_STOREFRONT_BROWSER = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 'missing' end
local interaction = cjson.decode(raw)
local now = tonumber(ARGV[1])
if tonumber(interaction.expires_at or 0) <= now then return 'expired' end
if interaction.storefront_binding_hash == ARGV[3] then return 'existing' end
if not interaction.storefront_handoff_hash or interaction.storefront_handoff_hash ~= ARGV[2] then return 'invalid' end
interaction.storefront_binding_hash = ARGV[3]
interaction.storefront_handoff_hash = nil
redis.call('SET', KEYS[1], cjson.encode(interaction), 'PX', tonumber(interaction.expires_at) - now)
return 'ok'
`;

const INSPECT_COMPLETION = `
local ticketRaw = redis.call('GET', KEYS[1])
if not ticketRaw then return { 'missing', '' } end
local ticket = cjson.decode(ticketRaw)
local now = tonumber(ARGV[1])
if tonumber(ticket.expires_at or 0) <= now then return { 'expired', '' } end
if ticket.binding_hash ~= ARGV[2] then return { 'wrong_browser', '' } end
local interactionKey = 'oidc:interaction:' .. tostring(ticket.interaction_id or '')
local interactionRaw = redis.call('GET', interactionKey)
if not interactionRaw then return { 'missing', '' } end
local interaction = cjson.decode(interactionRaw)
if tonumber(interaction.expires_at or 0) <= now then return { 'expired', '' } end
if interaction.id ~= ticket.interaction_id or interaction.browser_binding_hash ~= ARGV[2]
  or ticket.binding_hash ~= interaction.browser_binding_hash then return { 'wrong_browser', '' } end
return { 'ok', cjson.encode({ ticket = ticket, interaction = interaction }) }
`;

const CONSUME_AND_STORE_CODE = `
local ticketRaw = redis.call('GET', KEYS[1])
if not ticketRaw then return 'missing' end
local ticket = cjson.decode(ticketRaw)
local now = tonumber(ARGV[1])
if tonumber(ticket.expires_at or 0) <= now then return 'expired' end
if ticket.binding_hash ~= ARGV[2] then return 'wrong_browser' end
local interactionRaw = redis.call('GET', KEYS[2])
if not interactionRaw then return 'missing' end
local interaction = cjson.decode(interactionRaw)
if tonumber(interaction.expires_at or 0) <= now then return 'expired' end
if interaction.id ~= ticket.interaction_id or interaction.browser_binding_hash ~= ARGV[2]
  or ticket.binding_hash ~= interaction.browser_binding_hash then return 'wrong_browser' end
local stored = redis.call('SET', KEYS[3], ARGV[3], 'PX', ARGV[4], 'NX')
if not stored then return 'code_collision' end
redis.call('DEL', KEYS[1], KEYS[2])
return 'ok'
`;

export const createOidcInteractionRepository = ({ getRedis = null, now = () => Date.now() } = {}) => {
  const client = () => {
    const redis = getRedis ? getRedis() : (isRedisConnected() ? getRedisClient() : null);
    if (!redis) throw unavailable();
    return redis;
  };
  const readJson = async (key) => {
    let raw;
    try { raw = await client().get(key); } catch { throw unavailable(); }
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { throw unavailable(); }
  };
  const setJson = async (key, value, expiresAt, nx = false) => {
    const ttlMs = Math.floor(Number(expiresAt) - now());
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) return false;
    try {
      const result = await client().set(key, JSON.stringify(value), { PX: ttlMs, ...(nx ? { NX: true } : {}) });
      return result === 'OK';
    } catch { throw unavailable(); }
  };
  const evalScript = async (script, keys, args) => {
    try { return await client().eval(script, { keys, arguments: args.map(String) }); }
    catch { throw unavailable(); }
  };

  return {
    async createInteraction(id, interaction) {
      return setJson(interactionKey(id), interaction, interaction.expires_at, true);
    },

    async findInteraction(id) {
      const interaction = await readJson(interactionKey(id));
      if (interaction && Number(interaction.expires_at) <= now()) {
        try { await client().del(interactionKey(id)); } catch { throw unavailable(); }
        return null;
      }
      return interaction;
    },

    async recordFreshAuthentication(id, freshAuth) {
      const result = await evalScript(UPDATE_FRESH_AUTH, [interactionKey(id)], [now(), JSON.stringify(freshAuth)]);
      return Number(result) === 1;
    },

    async bindStorefrontBrowser(id, handoffHash, bindingHash) {
      const result = await evalScript(BIND_STOREFRONT_BROWSER, [interactionKey(id)], [now(), handoffHash, bindingHash]);
      return String(result || 'missing');
    },

    async createCompletionTicket(ticket, data) {
      return setJson(completionKey(ticket), data, data.expires_at, true);
    },

    async inspectCompletionForInteraction(ticket, interactionId, bindingHash) {
      const result = await evalScript(INSPECT_COMPLETION, [completionKey(ticket), interactionKey(interactionId)], [now(), bindingHash]);
      return decodeInspectResult(result);
    },

    async inspectCompletion(ticket, bindingHash) {
      const result = await evalScript(INSPECT_COMPLETION, [completionKey(ticket)], [now(), bindingHash]);
      return decodeInspectResult(result);
    },

    async consumeCompletionAndStoreCode({ ticket, interactionId, bindingHash, codeKey, grant, codeTtlMs }) {
      const result = await evalScript(CONSUME_AND_STORE_CODE,
        [completionKey(ticket), interactionKey(interactionId), codeKey],
        [now(), bindingHash, JSON.stringify(grant), codeTtlMs]);
      return String(result || 'missing');
    },

    async createError(id, record, expiresAt) {
      return setJson(errorKey(id), record, expiresAt, true);
    },

    async findError(id) {
      const record = await readJson(errorKey(id));
      if (record && Number(record.expires_at) <= now()) {
        try { await client().del(errorKey(id)); } catch { throw unavailable(); }
        return null;
      }
      return record;
    }
  };
};

const decodeInspectResult = (result) => {
  const status = Array.isArray(result) ? String(result[0] || 'missing') : 'missing';
  if (status !== 'ok') return { status, ticket: null, interaction: null };
  try {
    const data = JSON.parse(String(result[1] || '{}'));
    return { status, ticket: data.ticket || null, interaction: data.interaction || null };
  } catch { throw unavailable(); }
};

export const oidcInteractionRepository = createOidcInteractionRepository();
