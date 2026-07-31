import crypto from 'crypto';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

const getEncryptionKey = () => {
  const configured = String(process.env.TENANT_PAYOUT_ENCRYPTION_KEY || '').trim();
  if (configured.length < 32) {
    throw new DomainError(
      DomainErrorCode.SERVICE_UNAVAILABLE,
      'Payout destination encryption is not configured.',
      { statusCode: 503 }
    );
  }
  return crypto.createHash('sha256').update(configured, 'utf8').digest();
};

const maskValue = (value) => {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (normalized.length <= 4) return '*'.repeat(normalized.length);
  return `${'*'.repeat(Math.min(12, normalized.length - 4))}${normalized.slice(-4)}`;
};

export const maskPayoutDestination = (destination = {}) => {
  const provider = String(destination.provider || destination.bank_name || destination.type || 'Payout account').trim();
  const account = destination.account_number || destination.wallet_number || destination.account_id || '';
  return `${provider} ${maskValue(account)}`.trim().slice(0, 160);
};

export const encryptPayoutDestination = (destination) => {
  if (!destination || typeof destination !== 'object' || Array.isArray(destination)) {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'A valid payout destination is required.');
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(destination), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64');
};

