import crypto from 'node:crypto';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

const ENCRYPTION_KEY_ENV = 'CONTACT_INQUIRIES_CREDENTIAL_ENCRYPTION_KEY';
const ENVELOPE_VERSION = 'v1';
const ASSOCIATED_DATA = 'dgfy:contact-inquiries:pin4ms:v1';

const configuredKey = () => String(process.env[ENCRYPTION_KEY_ENV] || '').trim();

export const isPin4msCredentialEncryptionReady = () => /^[a-f0-9]{64}$/i.test(configuredKey());

const deriveEncryptionKey = () => {
  const rawKey = configuredKey();
  if (!/^[a-f0-9]{64}$/i.test(rawKey)) {
    throw new DomainError(
      DomainErrorCode.SERVICE_UNAVAILABLE,
      'Secure Pin4MS credential storage is not configured for this environment.',
      { observabilityReasonCode: 'CONTACT_INQUIRIES_SECRET_STORAGE_UNAVAILABLE' }
    );
  }

  return crypto.createHash('sha256')
    .update('dgfy:contact-inquiries:pin4ms:')
    .update(Buffer.from(rawKey, 'hex'))
    .digest();
};

export const encryptPin4msApiKey = (apiKey) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveEncryptionKey(), iv);
  cipher.setAAD(Buffer.from(ASSOCIATED_DATA, 'utf8'));
  const ciphertext = Buffer.concat([
    cipher.update(String(apiKey), 'utf8'),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();

  return [
    ENVELOPE_VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url')
  ].join('.');
};

export const decryptPin4msApiKey = (encryptedValue) => {
  const [version, encodedIv, encodedTag, encodedCiphertext, extra] = String(encryptedValue || '').split('.');
  if (version !== ENVELOPE_VERSION || !encodedIv || !encodedTag || !encodedCiphertext || extra) {
    throw new DomainError(DomainErrorCode.INTERNAL_ERROR, 'Stored Pin4MS credential could not be decrypted.');
  }

  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      deriveEncryptionKey(),
      Buffer.from(encodedIv, 'base64url')
    );
    decipher.setAAD(Buffer.from(ASSOCIATED_DATA, 'utf8'));
    decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encodedCiphertext, 'base64url')),
      decipher.final()
    ]).toString('utf8');
  } catch (cause) {
    throw new DomainError(
      DomainErrorCode.INTERNAL_ERROR,
      'Stored Pin4MS credential could not be decrypted.',
      { cause }
    );
  }
};
