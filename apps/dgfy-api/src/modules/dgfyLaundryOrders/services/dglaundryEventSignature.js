import crypto from 'node:crypto';
import fs from 'node:fs';

const profile = () => String(process.env.DGLAUNDRY_SIGNATURE_PROFILE || (process.env.NODE_ENV === 'production' ? 'http-message-signatures-v1' : 'hmac-local-v1')).trim();
const keyId = () => String(process.env.DGLAUNDRY_INTEGRATION_KEY_ID || 'dglaundry').trim();
const eventKeyId = () => String(process.env.DGFY_DGLAUNDRY_EVENT_SIGNING_KEY_ID || 'dgfy-event-ed25519').trim();
const maxSkewSeconds = () => Math.max(30, Number(process.env.DGLAUNDRY_INTEGRATION_MAX_SKEW_SECONDS || 300));
const seenNonces = new Map();
const publicKey = () => {
  const direct = String(process.env.DGLAUNDRY_INTEGRATION_PUBLIC_KEY || '').trim();
  if (direct) return direct;
  const file = String(process.env.DGLAUNDRY_INTEGRATION_PUBLIC_KEY_FILE || '').trim();
  if (!file) return '';
  try { return fs.readFileSync(file, 'utf8').trim(); } catch { return ''; }
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

export const verifyDglaundryEventSignature = ({ headers = {}, method = 'POST', authority = '', path = '', rawBody = '' }) => {
  const activeProfile = profile();
  if (activeProfile === 'http-message-signatures-v1') {
    if (!publicKey()) return { ok: false, code: 'DGLAUNDRY_PUBLIC_KEY_REQUIRED' };
    const parsed = parseStandardSignature(headers.signature, headers['signature-input']);
    const digest = String(headers['content-digest'] || '').trim();
    if (!parsed || !digest || parsed.algorithm !== 'ed25519' || parsed.tag !== 'dglaundry-dgfy-v1') return { ok: false, code: 'DGLAUNDRY_SIGNATURE_REQUIRED' };
    if (JSON.stringify(parsed.components) !== JSON.stringify(['@method', '@authority', '@path', 'content-digest', 'content-type'])) return { ok: false, code: 'DGLAUNDRY_SIGNATURE_COMPONENTS_INVALID' };
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isInteger(parsed.created) || !Number.isInteger(parsed.expires) || parsed.created - maxSkewSeconds() > now || parsed.expires + maxSkewSeconds() < now) return { ok: false, code: 'DGLAUNDRY_TIMESTAMP_INVALID' };
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
      try { return crypto.verify(null, Buffer.from(signatureBase), publicKey(), Buffer.from(parsed.signature, 'base64')); } catch { return false; }
    })();
    if (!valid) return { ok: false, code: 'DGLAUNDRY_SIGNATURE_INVALID' };
    const nonceKey = `${parsed.keyId}:${parsed.nonce}`;
    for (const [entry, expiresAt] of seenNonces) if (expiresAt <= now) seenNonces.delete(entry);
    if (seenNonces.has(nonceKey)) return { ok: false, code: 'DGLAUNDRY_SIGNATURE_REPLAY' };
    // Keep the expiry in the same epoch-second unit used by the pruning clock.
    // Storing milliseconds here would prevent expired entries from ever being
    // evicted and would grow the in-memory replay cache without bound.
    seenNonces.set(nonceKey, parsed.expires);
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
