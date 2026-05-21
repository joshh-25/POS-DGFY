import crypto from 'crypto';
import { Op } from 'sequelize';
import { EmailOtp } from '../models/index.js';
import * as emailService from './emailService.js';
import logger from '../config/logger.js';
import { isEmailOtpEnforcementEnabled } from '../config/emailOtp.js';

export const EMAIL_OTP_PURPOSES = Object.freeze({
  COMPANY_REGISTRATION: 'company_registration',
  TENANT_USER_REGISTRATION: 'tenant_user_registration',
  INVITATION_ACCEPTANCE: 'invitation_acceptance',
  EMAIL_CHANGE: 'email_change',
  DGFY_ACCOUNT_VERIFICATION: 'dgfy_account_verification'
});

const PURPOSE_LABELS = Object.freeze({
  [EMAIL_OTP_PURPOSES.COMPANY_REGISTRATION]: 'company registration',
  [EMAIL_OTP_PURPOSES.TENANT_USER_REGISTRATION]: 'tenant user registration',
  [EMAIL_OTP_PURPOSES.INVITATION_ACCEPTANCE]: 'invitation acceptance',
  [EMAIL_OTP_PURPOSES.EMAIL_CHANGE]: 'email change',
  [EMAIL_OTP_PURPOSES.DGFY_ACCOUNT_VERIFICATION]: 'DGFY account verification'
});

const OTP_TTL_MINUTES = Number.parseInt(process.env.EMAIL_OTP_TTL_MINUTES || '10', 10);
const OTP_MAX_ATTEMPTS = Number.parseInt(process.env.EMAIL_OTP_MAX_ATTEMPTS || '5', 10);
const OTP_CODE_PATTERN = /^\d{6}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const normalizeOtpEmail = (email) => String(email || '').trim().toLowerCase();

const createError = (message, statusCode = 400, code = 'EMAIL_OTP_INVALID') => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
};

const normalizeTenantId = (tenantId) => {
  const value = String(tenantId || '').trim();
  return value && value !== 'default' ? value : null;
};

const isValidPurpose = (purpose) => Object.values(EMAIL_OTP_PURPOSES).includes(purpose);

const getHashSecret = () => (
  process.env.EMAIL_OTP_SECRET
  || process.env.JWT_SECRET
  || process.env.REFRESH_TOKEN_SECRET
  || 'email_otp_local_fallback_change_me'
);

const hashOtpCode = ({ purpose, email, tenantId, code }) => (
  crypto
    .createHash('sha256')
    .update(`${purpose}:${normalizeTenantId(tenantId) || 'global'}:${normalizeOtpEmail(email)}:${code}:${getHashSecret()}`)
    .digest('hex')
);

const generateOtpCode = () => {
  const value = crypto.randomInt(0, 1_000_000);
  return String(value).padStart(6, '0');
};

const buildPublicOtpPayload = (otp, extra = {}) => ({
  otp_id: otp.otp_id,
  purpose: otp.purpose,
  email: otp.email,
  expires_at: otp.expires_at,
  delivery_status: otp.delivery_status,
  ...extra
});

export const requestEmailOtp = async ({
  purpose,
  email,
  tenantId = null,
  metadata = {},
  emailSender = emailService
}) => {
  const normalizedPurpose = String(purpose || '').trim();
  const normalizedEmail = normalizeOtpEmail(email);
  const normalizedTenantId = normalizeTenantId(tenantId);

  if (!isValidPurpose(normalizedPurpose)) {
    throw createError('Invalid email OTP purpose', 422, 'EMAIL_OTP_PURPOSE_INVALID');
  }

  if (!EMAIL_PATTERN.test(normalizedEmail)) {
    throw createError('A valid email address is required for email verification', 422, 'EMAIL_OTP_EMAIL_INVALID');
  }

  if (!emailSender?.isEmailConfigured?.()) {
    throw createError('Email verification cannot be sent because SMTP is not configured', 503, 'EMAIL_OTP_DELIVERY_UNAVAILABLE');
  }

  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + Math.max(1, OTP_TTL_MINUTES) * 60 * 1000);
  const codeHash = hashOtpCode({
    purpose: normalizedPurpose,
    email: normalizedEmail,
    tenantId: normalizedTenantId,
    code
  });

  await EmailOtp.update(
    { consumed_at: new Date() },
    {
      where: {
        purpose: normalizedPurpose,
        email: normalizedEmail,
        tenant_id: normalizedTenantId,
        consumed_at: null
      }
    }
  );

  const otp = await EmailOtp.create({
    purpose: normalizedPurpose,
    email: normalizedEmail,
    tenant_id: normalizedTenantId,
    code_hash: codeHash,
    max_attempts: Math.max(1, OTP_MAX_ATTEMPTS),
    expires_at: expiresAt,
    metadata
  });

  try {
    await emailSender.sendEmailOtpCode({
      email: normalizedEmail,
      code,
      purposeLabel: PURPOSE_LABELS[normalizedPurpose] || 'email verification',
      expiresInMinutes: Math.max(1, OTP_TTL_MINUTES)
    });
    return buildPublicOtpPayload(otp);
  } catch (error) {
    await otp.update({
      delivery_status: 'failed',
      delivery_error: String(error?.message || 'Email OTP delivery failed').slice(0, 500)
    });
    logger.warn('[EmailOtp] Failed to send verification code', {
      purpose: normalizedPurpose,
      email: normalizedEmail,
      tenant_id: normalizedTenantId,
      error: error?.message
    });
    throw createError('Email verification code could not be sent', 503, 'EMAIL_OTP_DELIVERY_FAILED');
  }
};

export const verifyEmailOtp = async ({
  purpose,
  email,
  code,
  tenantId = null,
  consume = true
}) => {
  const normalizedPurpose = String(purpose || '').trim();
  const normalizedEmail = normalizeOtpEmail(email);
  const normalizedTenantId = normalizeTenantId(tenantId);
  const normalizedCode = String(code || '').trim();

  if (!isEmailOtpEnforcementEnabled()) {
    return {
      otp_id: null,
      purpose: normalizedPurpose,
      email: normalizedEmail,
      expires_at: null,
      delivery_status: 'sent',
      verified: true,
      enforcement_disabled: true
    };
  }

  if (!isValidPurpose(normalizedPurpose)) {
    throw createError('Invalid email OTP purpose', 422, 'EMAIL_OTP_PURPOSE_INVALID');
  }

  if (!EMAIL_PATTERN.test(normalizedEmail)) {
    throw createError('A valid email address is required for email verification', 422, 'EMAIL_OTP_EMAIL_INVALID');
  }

  if (!OTP_CODE_PATTERN.test(normalizedCode)) {
    throw createError('A valid 6-digit email verification code is required', 422, 'EMAIL_OTP_REQUIRED');
  }

  const otp = await EmailOtp.findOne({
    where: {
      purpose: normalizedPurpose,
      email: normalizedEmail,
      tenant_id: normalizedTenantId,
      consumed_at: null,
      expires_at: { [Op.gt]: new Date() }
    },
    order: [['created_at', 'DESC']]
  });

  if (!otp) {
    throw createError('Email verification code is missing or expired', 422, 'EMAIL_OTP_EXPIRED');
  }

  if (otp.attempts >= otp.max_attempts) {
    await otp.update({ consumed_at: new Date() });
    throw createError('Email verification code has too many failed attempts', 429, 'EMAIL_OTP_ATTEMPTS_EXCEEDED');
  }

  const expectedHash = hashOtpCode({
    purpose: normalizedPurpose,
    email: normalizedEmail,
    tenantId: normalizedTenantId,
    code: normalizedCode
  });

  if (otp.code_hash !== expectedHash) {
    await otp.increment('attempts');
    throw createError('Email verification code is invalid', 422, 'EMAIL_OTP_INVALID');
  }

  if (consume) {
    const [updatedCount] = await EmailOtp.update(
      { consumed_at: new Date() },
      {
        where: {
          otp_id: otp.otp_id,
          consumed_at: null
        }
      }
    );
    if (updatedCount !== 1) {
      throw createError('Email verification code is missing or expired', 422, 'EMAIL_OTP_EXPIRED');
    }
  }

  return buildPublicOtpPayload(otp, { verified: true });
};

export default {
  EMAIL_OTP_PURPOSES,
  requestEmailOtp,
  verifyEmailOtp
};
