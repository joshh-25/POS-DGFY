import crypto from 'crypto';

// Pure, model-free helpers shared between emailService.js (which must not
// statically pull in the model layer -- it's imported by ~30 modules and a
// static models/index.js import would drag the whole model graph into all
// of their tests) and emailDeliveryLogRepository.js (which does own the
// model). Keep this file free of any import that isn't itself pure.

/**
 * sha256 of the lowercased, trimmed recipient address. Survives PII
 * redaction (recipient_email is nulled by the retention prune job, this
 * column is not), so per-address deliverability history stays queryable
 * without persisting the raw address indefinitely.
 */
export const hashRecipientEmail = (email) => crypto
  .createHash('sha256')
  .update(String(email || '').trim().toLowerCase())
  .digest('hex');

export const extractRecipientDomain = (email) => {
  const normalized = String(email || '').trim().toLowerCase();
  const atIndex = normalized.lastIndexOf('@');
  return atIndex >= 0 ? normalized.slice(atIndex + 1) : 'unknown';
};

/**
 * Split a nodemailer `to` value (string, comma-separated string, or array)
 * into normalized recipient addresses.
 */
export const splitRecipients = (to) => {
  const list = Array.isArray(to) ? to : String(to || '').split(',');
  return list.map((entry) => String(entry || '').trim()).filter(Boolean);
};
