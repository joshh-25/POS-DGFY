import { coarsePrefix, hashPhone, toE164 } from '../utils/phoneNumber.js';
import { smsConsentRepository } from '../repositories/smsConsentRepository.js';

const SOURCES = new Set(['storefront_checkout', 'account_settings', 'pos', 'manual_api', 'provider_stop']);
const normalizeInput = ({ phone, source, actorType = null, actorId = null, now = new Date() }) => {
  const normalized = toE164(phone);
  if (!normalized.ok) {
    const error = new Error('A valid phone number is required.');
    error.statusCode = 400;
    error.code = 'INVALID_PHONE';
    throw error;
  }
  if (!SOURCES.has(source)) {
    const error = new Error('A supported consent source is required.');
    error.statusCode = 400;
    error.code = 'INVALID_CONSENT_SOURCE';
    throw error;
  }
  return {
    recipientPhoneHash: hashPhone(normalized.e164),
    recipientPrefix: coarsePrefix(normalized.e164),
    source,
    actorType,
    actorId: actorId == null ? null : String(actorId).slice(0, 128),
    occurredAt: now
  };
};

export const recordSmsMarketingConsentUseCase = async ({
  tenantId, phone, source = 'manual_api', actorType = 'user', actorId = null,
  consentTextVersion, now = new Date()
} = {}, { repository = smsConsentRepository } = {}) => {
  if (!tenantId) throw Object.assign(new Error('Tenant context is required.'), { statusCode: 400, code: 'MISSING_TENANT' });
  if (typeof consentTextVersion !== 'string' || !consentTextVersion.trim() || consentTextVersion.trim().length > 40) {
    throw Object.assign(new Error('A valid consent text version is required.'), { statusCode: 400, code: 'INVALID_CONSENT_TEXT_VERSION' });
  }
  return repository.recordConsent({
    tenantId,
    ...normalizeInput({ phone, source, actorType, actorId, now }),
    consentTextVersion: consentTextVersion.trim()
  });
};

export const revokeSmsMarketingConsentUseCase = async ({
  tenantId, phone, source = 'manual_api', actorType = 'user', actorId = null, now = new Date()
} = {}, { repository = smsConsentRepository } = {}) => {
  if (!tenantId) throw Object.assign(new Error('Tenant context is required.'), { statusCode: 400, code: 'MISSING_TENANT' });
  return repository.revokeConsent({ tenantId, ...normalizeInput({ phone, source, actorType, actorId, now }) });
};

export const recordGlobalSmsOptOutUseCase = async ({
  phone, source = 'manual_api', actorType = 'user', actorId = null, reason = 'recipient_opt_out', now = new Date()
} = {}, { repository = smsConsentRepository } = {}) => {
  const input = normalizeInput({ phone, source, actorType, actorId, now });
  return repository.recordGlobalSuppression({
    recipientPhoneHash: input.recipientPhoneHash,
    reason: String(reason).slice(0, 80),
    source: input.source,
    actorType: input.actorType,
    actorId: input.actorId,
    occurredAt: input.occurredAt
  });
};
