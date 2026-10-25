import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { buildStorefrontSupportContactUseCases } from '../src/modules/contactInquiries/usecases/storefrontSupportContactUseCases.js';

const requestEmailOtp = jest.fn();
const verifyEmailOtp = jest.fn();
const isEmailOtpEnforcementEnabled = jest.fn();
const getPublicStorefrontSupportContact = jest.fn();
const getStorefrontSupportContactAdminStatus = jest.fn();
const savePendingStorefrontSupportEmail = jest.fn();
const saveStorefrontSupportEmail = jest.fn();
const recordStorefrontSupportEmailVerification = jest.fn();

const repository = {
  getPublicStorefrontSupportContact,
  getStorefrontSupportContactAdminStatus,
  savePendingStorefrontSupportEmail,
  saveStorefrontSupportEmail,
  recordStorefrontSupportEmailVerification
};
const emailOtpService = {
  EMAIL_OTP_PURPOSES: { PLATFORM_SUPPORT_CONTACT: 'platform_support_contact' },
  requestEmailOtp,
  verifyEmailOtp
};

let useCases;

describe('Storefront support contact use cases', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isEmailOtpEnforcementEnabled.mockReturnValue(true);
    savePendingStorefrontSupportEmail.mockResolvedValue({ pendingEmail: 'support@dgfy.ph' });
    saveStorefrontSupportEmail.mockResolvedValue({
      activeEmail: 'support@dgfy.ph',
      activeEmailVerifiedAt: null,
      publicEmailConfigured: true
    });
    requestEmailOtp.mockResolvedValue({
      delivery_status: 'sent',
      expires_at: '2026-10-25T00:10:00.000Z'
    });
    getStorefrontSupportContactAdminStatus.mockResolvedValue({
      activeEmail: 'support@dgfy.ph',
      pendingEmail: 'support@dgfy.ph'
    });
    verifyEmailOtp.mockResolvedValue({ verified: true, enforcement_disabled: false });
    recordStorefrontSupportEmailVerification.mockResolvedValue({
      activeEmail: 'support@dgfy.ph',
      publicEmailConfigured: true
    });
    useCases = buildStorefrontSupportContactUseCases({
      repository,
      emailOtpService,
      isEmailOtpEnforcementEnabled
    });
  });

  it('publishes a valid configured address immediately without requiring verification', async () => {
    const result = await useCases.saveStorefrontSupportEmailConfiguration({
      email: 'Support@DGFY.PH ',
      admin: { id: 'admin-1' }
    });

    expect(saveStorefrontSupportEmail).toHaveBeenCalledWith({
      email: 'support@dgfy.ph',
      admin: { id: 'admin-1' }
    });
    expect(result).toEqual(expect.objectContaining({
      activeEmail: 'support@dgfy.ph',
      activeEmailVerifiedAt: null,
      publicEmailConfigured: true
    }));
  });

  it('normalizes the configured address and requires actual email delivery for optional verification', async () => {
    const result = await useCases.requestStorefrontSupportEmailVerification({
      email: ' Support@DGFY.PH ',
      admin: { id: 'admin-1' },
      metadata: { request_id: 'req-1' }
    });

    expect(requestEmailOtp).toHaveBeenCalledWith(expect.objectContaining({
      purpose: 'platform_support_contact',
      email: 'support@dgfy.ph',
      tenantId: null,
      metadata: expect.objectContaining({ requested_by_admin_id: 'admin-1', request_id: 'req-1' })
    }));
    expect(savePendingStorefrontSupportEmail).toHaveBeenCalledWith({
      email: 'support@dgfy.ph',
      admin: { id: 'admin-1' }
    });
    expect(result).toEqual(expect.objectContaining({
      pendingEmail: 'support@dgfy.ph',
      verificationExpiresAt: '2026-10-25T00:10:00.000Z'
    }));
  });

  it('rejects a recorded development fallback code without blocking public configuration', async () => {
    requestEmailOtp.mockResolvedValue({ delivery_status: 'recorded', dev_mode: true, dev_code: '123456' });

    await expect(useCases.requestStorefrontSupportEmailVerification({ email: 'support@dgfy.ph' }))
      .rejects.toMatchObject({ code: 'SUPPORT_EMAIL_DELIVERY_UNAVAILABLE', statusCode: 503 });
    expect(savePendingStorefrontSupportEmail).not.toHaveBeenCalled();
    expect(saveStorefrontSupportEmail).not.toHaveBeenCalled();
  });

  it('fails closed for optional verification when OTP enforcement is disabled', async () => {
    isEmailOtpEnforcementEnabled.mockReturnValue(false);

    await expect(useCases.requestStorefrontSupportEmailVerification({ email: 'support@dgfy.ph' }))
      .rejects.toMatchObject({ code: 'SUPPORT_EMAIL_VERIFICATION_UNAVAILABLE', statusCode: 503 });
    await expect(useCases.verifyStorefrontSupportEmail({
      email: 'support@dgfy.ph',
      code: '123456',
      monitoringConfirmed: true
    })).rejects.toMatchObject({ code: 'SUPPORT_EMAIL_VERIFICATION_UNAVAILABLE', statusCode: 503 });
    expect(requestEmailOtp).not.toHaveBeenCalled();
    expect(verifyEmailOtp).not.toHaveBeenCalled();
    expect(saveStorefrontSupportEmail).not.toHaveBeenCalled();
  });

  it('checks the current configured address but does not require a monitoring attestation', async () => {
    await expect(useCases.verifyStorefrontSupportEmail({
      email: 'other@dgfy.ph',
      code: '123456',
      monitoringConfirmed: true
    })).rejects.toMatchObject({ code: 'SUPPORT_EMAIL_CANDIDATE_CHANGED' });
    expect(verifyEmailOtp).not.toHaveBeenCalled();
    expect(recordStorefrontSupportEmailVerification).not.toHaveBeenCalled();

    await useCases.verifyStorefrontSupportEmail({
      email: 'support@dgfy.ph',
      code: '123456',
      monitoringConfirmed: false
    });
    expect(verifyEmailOtp).toHaveBeenCalledTimes(1);
    expect(recordStorefrontSupportEmailVerification).toHaveBeenCalledWith({
      email: 'support@dgfy.ph',
      admin: undefined,
      monitoringConfirmed: false
    });
  });

  it('consumes the OTP before recording verification', async () => {
    const admin = { id: 'admin-1', username: 'operator' };
    const result = await useCases.verifyStorefrontSupportEmail({
      email: 'support@dgfy.ph',
      code: '123456',
      monitoringConfirmed: true,
      admin
    });

    expect(verifyEmailOtp).toHaveBeenCalledWith({
      purpose: 'platform_support_contact',
      email: 'support@dgfy.ph',
      code: '123456',
      tenantId: null,
      consume: true
    });
    expect(recordStorefrontSupportEmailVerification).toHaveBeenCalledWith({
      email: 'support@dgfy.ph',
      admin,
      monitoringConfirmed: true
    });
    expect(result.publicEmailConfigured).toBe(true);
  });

  it('delegates public exposure to the repository response', async () => {
    getPublicStorefrontSupportContact.mockResolvedValue({ email: null });

    await expect(useCases.getPublicStorefrontSupportContactStatus()).resolves.toEqual({ email: null });
    expect(getPublicStorefrontSupportContact).toHaveBeenCalledTimes(1);
  });
});
