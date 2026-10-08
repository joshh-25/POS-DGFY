import crypto from 'node:crypto';
import fs from 'node:fs';
import { getRedisClient, isRedisConnected } from '../../../config/redis.js';

const profile = () => String(process.env.DGLAUNDRY_SIGNATURE_PROFILE || (process.env.NODE_ENV === 'production' ? 'http-message-signatures-v1' : 'hmac-local-v1')).trim();
const keyId = () => String(process.env.DGLAUNDRY_INTEGRATION_KEY_ID || 'dglaundry').trim();
const eventKeyId = () => String(process.env.DGFY_DGLAUNDRY_EVENT_SIGNING_KEY_ID || 'dgfy-event-ed25519').trim();
const maxSkewSeconds = () => {
  const configuredSkew = Number(process.env.DGLAUNDRY_INTEGRATION_MAX_SKEW_SECONDS || 300);
  return Number.isFinite(configuredSkew) ? Math.max(30, Math.min(600, configuredSkew)) : 300;
};
const publicKey = () => {
  const direct = String(process.env.DGLAUNDRY_INTEGRATION_PUBLIC_KEY || '').trim();
  if (direct) return direct;
  const file = String(process.env.DGLAUNDRY_INTEGRATION_PUBLIC_KEY_FILE || '').trim();
  if (!file) return '';
  try { return fs.readFileSync(file, 'utf8').trim(); } catch { return ''; }
};
const publicEventKeys = () => {
  const registryText = String(process.env.DGLAUNDRY_INTEGRATION_PUBLIC_KEYS_JSON || '').trim();
  const source = new Map();
  if (registryText) {
    let registry;
    try { registry = JSON.parse(registryText); }
    catch { return { keys: source, error: 'DGLAUNDRY_PUBLIC_KEY_REGISTRY_INVALID' }; }
    if (!registry || typeof registry !== 'object' || Array.isArray(registry) || !Object.keys(registry).length) return { keys: source, error: 'DGLAUNDRY_PUBLIC_KEY_REGISTRY_INVALID' };
    for (const [kid, pem] of Object.entries(registry)) {
      if (!/^[A-Za-z0-9._:-]{3,96}$/.test(kid) || typeof pem !== 'string' || !pem.startsWith('-----BEGIN PUBLIC KEY-----')) return { keys: new Map(), error: 'DGLAUNDRY_PUBLIC_KEY_REGISTRY_INVALID' };
      try {
        const parsed = crypto.createPublicKey(pem);
        if (parsed.asymmetricKeyType !== 'ed25519') return { keys: new Map(), error: 'DGLAUNDRY_PUBLIC_KEY_REGISTRY_INVALID' };
        source.set(kid, parsed);
      } catch { return { keys: new Map(), error: 'DGLAUNDRY_PUBLIC_KEY_REGISTRY_INVALID' }; }
    }
    return { keys: source, error: null };
  }
  const configuredKid = keyId();
  const pem = publicKey();
  if (!pem || !configuredKid) return { keys: source, error: 'DGLAUNDRY_PUBLIC_KEY_REQUIRED' };
  try {
    const parsed = crypto.createPublicKey(pem);
    if (parsed.asymmetricKeyType !== 'ed25519') return { keys: source, error: 'DGLAUNDRY_PUBLIC_KEY_INVALID' };
    source.set(configuredKid, parsed);
    return { keys: source, error: null };
  } catch { return { keys: source, error: 'DGLAUNDRY_PUBLIC_KEY_INVALID' }; }
};
const configured = (name) => {
  const direct = String(process.env[name] || '').trim();
  if (direct) return direct;
  const file = String(process.env[`${name}_FILE`] || '').trim();
  if (!file) return '';
  try { return fs.readFileSync(file, 'utf8').trim(); } catch { return ''; }
};

const timingSafeHexEqual = (left, right) => {
  try {
    const a = Buffer.from(String(left).replace(/^sha256=/i, ''), 'hex');
    const b = Buffer.from(String(right).replace(/^sha256=/i, ''), 'hex');
    return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch { return false; }
};

const parseStandardSignature = (signatureValue, inputValue) => {
    const signatureMatch = String(signatureValue || '').trim().match(/^sig1=:([^:]+):$/);
    const inputMatch = String(inputValue || '').trim().match(/^sig1=(\([^)]*\));(.*)$/);
    if (!signatureMatch || !inputMatch) return null;
    const components = [...inputMatch[1].matchAll(/"([^"\\]+)"/g)].map((match) => match[1]);
    const parameters = Object.fromEntries(inputMatch[2].split(/;\s*/).filter(Boolean).map((part) => {
        const separator = part.indexOf('=');
        return separator < 0 ? [part, ''] : [part.slice(0, separator), part.slice(separator + 1).replace(/^"|"$/g, '')];
    }));
    const created = Number(parameters.created);
    const expires = Number(parameters.expires);
    if (!Number.isInteger(created) || !Number.isInteger(expires) || !parameters.nonce || !parameters.keyid || !parameters.alg || !parameters.tag) return null;
    return { signature: signatureMatch[1], created, expires, nonce: parameters.nonce, keyId: parameters.keyid, algorithm: parameters.alg, tag: parameters.tag, components, signatureParams: `${inputMatch[1]};${inputMatch[2]}` };
};

export const buildDglaundryEventSignatureVerifier = ({ redisProvider = getRedisClient, redisConnected = isRedisConnected, now = () => Date.now() } = {}) => async ({ headers = {}, method = 'POST', authority = '', path = '', rawBody = '' }) => {
  const activeProfile = profile();
  if (activeProfile === 'http-message-signatures-v1') {
    const publicKeys = publicEventKeys();
    if (publicKeys.error) return { ok: false, code: publicKeys.error };
    const parsed = parseStandardSignature(headers.signature, headers['signature-input']);
    const digest = String(headers['content-digest'] || '').trim();
    if (!parsed || !digest || parsed.algorithm !== 'ed25519' || parsed.tag !== 'dglaundry-dgfy-v1') return { ok: false, code: 'DGLAUNDRY_SIGNATURE_REQUIRED' };
    const verificationKey = publicKeys.keys.get(parsed.keyId);
    if (!verificationKey) return { ok: false, code: 'DGLAUNDRY_KEY_ID_UNKNOWN' };
    if (JSON.stringify(parsed.components) !== JSON.stringify(['@method', '@authority', '@path', 'content-digest', 'content-type'])) return { ok: false, code: 'DGLAUNDRY_SIGNATURE_COMPONENTS_INVALID' };
    const nowSeconds = Math.floor(now() / 1000);
    if (!Number.isInteger(parsed.created) || !Number.isInteger(parsed.expires)
      || parsed.expires <= parsed.created || parsed.expires - parsed.created > 300
      || parsed.created > nowSeconds + maxSkewSeconds() || parsed.expires < nowSeconds) return { ok: false, code: 'DGLAUNDRY_TIMESTAMP_INVALID' };
    const expectedDigest = `sha-256=:${crypto.createHash('sha256').update(rawBody).digest('base64')}:`;
    if (digest !== expectedDigest) return { ok: false, code: 'DGLAUNDRY_CONTENT_DIGEST_INVALID' };
    const signatureBase = [
      `"@method": ${String(method).toUpperCase()}`,
      `"@authority": ${authority}`,
      `"@path": ${path}`,
      `"content-digest": ${digest}`,
      `"content-type": ${headers['content-type'] || 'application/json'}`,
      `"@signature-params": ${parsed.signatureParams}`
    ].join('\n');
    const valid = (() => {
      try { return crypto.verify(null, Buffer.from(signatureBase), verificationKey, Buffer.from(parsed.signature, 'base64')); } catch { return false; }
    })();
    if (!valid) return { ok: false, code: 'DGLAUNDRY_SIGNATURE_INVALID' };
    let redis;
    try {
      if (!redisConnected()) return { ok: false, code: 'DGLAUNDRY_EVENT_REPLAY_STORE_UNAVAILABLE' };
      redis = redisProvider();
      if (!redis?.set) return { ok: false, code: 'DGLAUNDRY_EVENT_REPLAY_STORE_UNAVAILABLE' };
      const nonceKey = crypto.createHash('sha256').update(`${parsed.keyId}\0${parsed.nonce}`).digest('hex');
      const ttl = Math.max(1, parsed.expires - nowSeconds + 1);
      const claimed = await redis.set(`dglaundry:event:nonce:${nonceKey}`, '1', { NX: true, EX: ttl });
      if (claimed === null) return { ok: false, code: 'DGLAUNDRY_SIGNATURE_REPLAY' };
      if (claimed !== 'OK') return { ok: false, code: 'DGLAUNDRY_EVENT_REPLAY_STORE_UNAVAILABLE' };
    } catch {
      return { ok: false, code: 'DGLAUNDRY_EVENT_REPLAY_STORE_UNAVAILABLE' };
    }
    return { ok: true, keyId: parsed.keyId };
  }

  if (process.env.NODE_ENV === 'production') return { ok: false, code: 'DGLAUNDRY_ASYMMETRIC_SIGNATURE_REQUIRED' };
  const suppliedKeyId = String(headers['x-dglaundry-key-id'] || '').trim();
  const timestamp = String(headers['x-dglaundry-timestamp'] || '').trim();
  const signature = String(headers['x-dglaundry-signature'] || '').trim();
  const secret = String(process.env.DGLAUNDRY_INTEGRATION_SECRET || '').trim();
  if (!secret || !suppliedKeyId || suppliedKeyId !== keyId() || !timestamp || !signature) return { ok: false, code: 'DGLAUNDRY_SIGNATURE_REQUIRED' };
  const timestampSeconds = Number(timestamp);
  if (!Number.isInteger(timestampSeconds) || Math.abs(Date.now() / 1000 - timestampSeconds) > maxSkewSeconds()) return { ok: false, code: 'DGLAUNDRY_TIMESTAMP_INVALID' };
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  return timingSafeHexEqual(signature, expected) ? { ok: true, keyId: suppliedKeyId } : { ok: false, code: 'DGLAUNDRY_SIGNATURE_INVALID' };
};

export const verifyDglaundryEventSignature = buildDglaundryEventSignatureVerifier();

export const signDgfyRequest = ({ method = 'POST', authority, path, body }) => {
  const rawBody = JSON.stringify(body ?? {});
  const activeProfile = profile();
  const headers = { 'content-type': 'application/json' };
  if (activeProfile === 'http-message-signatures-v1') {
    const privateKey = String(process.env.DGLAUNDRY_INTEGRATION_PRIVATE_KEY || '').trim();
    if (!privateKey) throw new Error('DGLAUNDRY_INTEGRATION_PRIVATE_KEY_REQUIRED');
    const created = Math.floor(Date.now() / 1000);
    const expires = created + 300;
    const nonce = crypto.randomUUID();
    const digest = `sha-256=:${crypto.createHash('sha256').update(rawBody).digest('base64')}:`;
    const signatureBase = [
      `"@method": ${String(method).toUpperCase()}`,
      `"@authority": ${authority}`,
      `"@path": ${path}`,
      `"content-digest": ${digest}`,
      `"content-type": application/json`,
      `"@signature-params": ("@method" "@authority" "@path" "content-digest" "content-type");created=${created};expires=${expires};nonce="${nonce}";keyid="${keyId()}";alg="ed25519";tag="dglaundry-dgfy-v1"`
    ].join('\n');
    const signature = crypto.sign(null, Buffer.from(signatureBase), privateKey).toString('base64');
    headers['content-digest'] = digest;
    headers['signature-input'] = `sig1=("@method" "@authority" "@path" "content-digest" "content-type");created=${created};expires=${expires};nonce="${nonce}";keyid="${keyId()}";alg="ed25519";tag="dglaundry-dgfy-v1"`;
    headers.signature = `sig1=:${signature}:`;
  } else {
    const secret = String(process.env.DGLAUNDRY_INTEGRATION_SECRET || '').trim();
    if (!secret) throw new Error('DGLAUNDRY_INTEGRATION_SECRET_REQUIRED');
    const timestamp = String(Math.floor(Date.now() / 1000));
    headers['x-dgfy-key-id'] = keyId();
    headers['x-dgfy-timestamp'] = timestamp;
    headers['x-dgfy-signature'] = `sha256=${crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')}`;
  }
  return { rawBody, headers };
};

/** Sign provider-origin events sent to DGLaundry using the event profile.
 * This is deliberately separate from P-256 partner requests: the receiver
 * selects the registry by the event algorithm and key ID, not by route name.
 */
export const signDgfyEvent = ({ method = 'POST', authority, path, body }) => {
  const rawBody = JSON.stringify(body ?? {});
  const privateKey = configured('DGFY_DGLAUNDRY_EVENT_SIGNING_PRIVATE_KEY');
  if (!privateKey) throw new Error('DGFY_EVENT_SIGNING_PRIVATE_KEY_REQUIRED');
  const created = Math.floor(Date.now() / 1000);
  const expires = created + 300;
  const nonce = crypto.randomUUID();
  const digest = `sha-256=:${crypto.createHash('sha256').update(rawBody).digest('base64')}:`;
  const signatureParams = `("@method" "@authority" "@path" "content-digest" "content-type");created=${created};expires=${expires};nonce="${nonce}";keyid="${eventKeyId()}";alg="ed25519";tag="dglaundry-dgfy-v1"`;
  const signatureBase = [
    `"@method": ${String(method).toUpperCase()}`,
    `"@authority": ${authority}`,
    `"@path": ${path}`,
    `"content-digest": ${digest}`,
    `"content-type": application/json`,
    `"@signature-params": ${signatureParams}`
  ].join('\n');
  const signature = crypto.sign(null, Buffer.from(signatureBase), privateKey).toString('base64');
  return {
    'content-type': 'application/json',
    'content-digest': digest,
    'signature-input': `sig1=${signatureParams}`,
    signature: `sig1=:${signature}:`
  };
};
