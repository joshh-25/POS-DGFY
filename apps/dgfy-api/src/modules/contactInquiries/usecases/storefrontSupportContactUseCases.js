const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_BYTES = 254;

const createSupportEmailError = (message, statusCode, code) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
};

const normalizeAndValidateEmail = (email) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (
    !EMAIL_PATTERN.test(normalizedEmail)
    || Buffer.byteLength(normalizedEmail, 'utf8') > MAX_EMAIL_BYTES
  ) {
    throw createSupportEmailError('Enter a valid support email address.', 422, 'SUPPORT_EMAIL_INVALID');
  }
  return normalizedEmail;
};

export const buildStorefrontSupportContactUseCases = ({
  repository,
  emailOtpService,
  isEmailOtpEnforcementEnabled
}) => {
  const requireOtpEnforcement = () => {
    if (!isEmailOtpEnforcementEnabled()) {
      throw createSupportEmailError(
        'Optional email verification is disabled for this API environment.',
        503,
        'SUPPORT_EMAIL_VERIFICATION_UNAVAILABLE'
      );
    }
  };

  return {
    getStorefrontSupportContactStatus: repository.getStorefrontSupportContactAdminStatus,
    getPublicStorefrontSupportContactStatus: repository.getPublicStorefrontSupportContact,

    async saveStorefrontSupportEmailConfiguration({ email, admin }) {
      const normalizedEmail = normalizeAndValidateEmail(email);
      return repository.saveStorefrontSupportEmail({ email: normalizedEmail, admin });
    },

    async requestStorefrontSupportEmailVerification({ email, admin, metadata = {} }) {
      requireOtpEnforcement();
      const normalizedEmail = normalizeAndValidateEmail(email);
      const currentStatus = await repository.getStorefrontSupportContactAdminStatus();
      if (currentStatus.activeEmail !== normalizedEmail) {
        throw createSupportEmailError(
          'Save this support email before requesting its optional verification code.',
          409,
          'SUPPORT_EMAIL_CANDIDATE_CHANGED'
        );
      }

      const otp = await emailOtpService.requestEmailOtp({
        purpose: emailOtpService.EMAIL_OTP_PURPOSES.PLATFORM_SUPPORT_CONTACT,
        email: normalizedEmail,
        tenantId: null,
        metadata: {
          ...metadata,
          requested_by_admin_id: admin?.id || null
        }
      });

      if (otp.delivery_status !== 'sent' || otp.dev_mode === true) {
        throw createSupportEmailError(
          'The verification code was not sent by email. The configured support address remains public.',
          503,
          'SUPPORT_EMAIL_DELIVERY_UNAVAILABLE'
        );
      }

      const status = await repository.savePendingStorefrontSupportEmail({ email: normalizedEmail, admin });
      return {
        ...status,
        verificationExpiresAt: otp.expires_at
      };
    },

    async verifyStorefrontSupportEmail({ email, code, monitoringConfirmed, admin }) {
      requireOtpEnforcement();
      const normalizedEmail = normalizeAndValidateEmail(email);
      const status = await repository.getStorefrontSupportContactAdminStatus();
      if (status.activeEmail !== normalizedEmail || status.pendingEmail !== normalizedEmail) {
        throw createSupportEmailError(
          'This email is not the current configured address. Save it before requesting an optional code.',
          409,
          'SUPPORT_EMAIL_CANDIDATE_CHANGED'
        );
      }

      const verification = await emailOtpService.verifyEmailOtp({
        purpose: emailOtpService.EMAIL_OTP_PURPOSES.PLATFORM_SUPPORT_CONTACT,
        email: normalizedEmail,
        code,
        tenantId: null,
        consume: true
      });

      if (verification.verified !== true || verification.enforcement_disabled === true) {
        throw createSupportEmailError(
          'Optional email verification did not complete. The configured support address remains public.',
          503,
          'SUPPORT_EMAIL_VERIFICATION_UNAVAILABLE'
        );
      }

      return repository.recordStorefrontSupportEmailVerification({
        email: normalizedEmail,
        admin,
        monitoringConfirmed: monitoringConfirmed === true
      });
    }
  };
};
