import crypto from 'node:crypto';

const profile = () => String(process.env.DGLAUNDRY_SIGNATURE_PROFILE || (process.env.NODE_ENV === 'production' ? 'http-message-signatures-v1' : 'hmac-local-v1')).trim();
const keyId = () => String(process.env.DGLAUNDRY_INTEGRATION_KEY_ID || 'dglaundry').trim();
const maxSkewSeconds = () => Math.max(30, Number(process.env.DGLAUNDRY_INTEGRATION_MAX_SKEW_SECONDS || 300));

const timingSafeHexEqual = (left, right) => {
  try {
    const a = Buffer.from(String(left).replace(/^sha256=/i, ''), 'hex');
    const b = Buffer.from(String(right).replace(/^sha256=/i, ''), 'hex');
    return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch { return false; }
};

const parseSignature = (value) => {
  const input = String(value || '').trim();
  const match = input.match(/^sig1=:([^:]+):;created=(\d+);expires=(\d+);nonce="([^"]+)";keyid="([^"]+)";alg="([^"]+)";tag="([^"]+)"$/);
  return match ? { signature: match[1], created: Number(match[2]), expires: Number(match[3]), nonce: match[4], keyId: match[5], algorithm: match[6], tag: match[7] } : null;
};

export const verifyDglaundryEventSignature = ({ headers = {}, method = 'POST', authority = '', path = '', rawBody = '' }) => {
  const activeProfile = profile();
  if (activeProfile === 'http-message-signatures-v1') {
    if (process.env.NODE_ENV === 'production' && !String(process.env.DGLAUNDRY_INTEGRATION_PUBLIC_KEY || '').trim()) return { ok: false, code: 'DGLAUNDRY_PUBLIC_KEY_REQUIRED' };
    const parsed = parseSignature(headers.signature);
    const digest = String(headers['content-digest'] || '').trim();
    if (!parsed || !digest || parsed.algorithm !== 'ed25519' || parsed.tag !== 'dglaundry-dgfy-v1') return { ok: false, code: 'DGLAUNDRY_SIGNATURE_REQUIRED' };
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
      `"@signature-params": ("@method" "@authority" "@path" "content-digest" "content-type");created=${parsed.created};expires=${parsed.expires};nonce="${parsed.nonce}";keyid="${parsed.keyId}";alg="${parsed.algorithm}";tag="${parsed.tag}"`
    ].join('\n');
    const valid = crypto.verify(null, Buffer.from(signatureBase), String(process.env.DGLAUNDRY_INTEGRATION_PUBLIC_KEY || ''), Buffer.from(parsed.signature, 'base64'));
    return valid ? { ok: true, keyId: parsed.keyId } : { ok: false, code: 'DGLAUNDRY_SIGNATURE_INVALID' };
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
    headers.signature = `sig1=:${signature}:;created=${created};expires=${expires};nonce="${nonce}";keyid="${keyId()}";alg="ed25519";tag="dglaundry-dgfy-v1"`;
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

