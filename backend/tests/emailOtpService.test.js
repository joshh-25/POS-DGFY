import { jest } from '@jest/globals';

const mockEmailOtp = {
  update: jest.fn(),
  create: jest.fn(),
  findOne: jest.fn()
};

jest.unstable_mockModule('../src/models/index.js', () => ({
  EmailOtp: mockEmailOtp
}));

jest.unstable_mockModule('../src/config/logger.js', () => ({
  default: {
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn()
  }
}));

const {
  EMAIL_OTP_PURPOSES,
  requestEmailOtp,
  verifyEmailOtp
} = await import('../src/services/emailOtpService.js');

describe('email OTP service', () => {
  let originalEmailOtpEnforcementEnabled;

  beforeAll(() => {
    originalEmailOtpEnforcementEnabled = process.env.EMAIL_OTP_ENFORCEMENT_ENABLED;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.EMAIL_OTP_SECRET = 'test_email_otp_secret_32_chars_min';
    process.env.EMAIL_OTP_TTL_MINUTES = '10';
    process.env.EMAIL_OTP_MAX_ATTEMPTS = '5';
    process.env.EMAIL_OTP_ENFORCEMENT_ENABLED = 'true';
  });

  afterAll(() => {
    if (originalEmailOtpEnforcementEnabled == null) {
      delete process.env.EMAIL_OTP_ENFORCEMENT_ENABLED;
    } else {
      process.env.EMAIL_OTP_ENFORCEMENT_ENABLED = originalEmailOtpEnforcementEnabled;
    }
  });

  it('creates a single-use OTP row and sends the code through email service', async () => {
    const otpRow = {
      otp_id: 'otp-1',
      purpose: EMAIL_OTP_PURPOSES.COMPANY_REGISTRATION,
      email: 'founder@example.com',
      expires_at: new Date('2026-05-17T04:20:00.000Z'),
      delivery_status: 'sent',
      update: jest.fn()
    };
    const sender = {
      isEmailConfigured: jest.fn().mockReturnValue(true),
      sendEmailOtpCode: jest.fn().mockResolvedValue({})
    };
    mockEmailOtp.update.mockResolvedValue([1]);
    mockEmailOtp.create.mockResolvedValue(otpRow);

    const result = await requestEmailOtp({
      purpose: EMAIL_OTP_PURPOSES.COMPANY_REGISTRATION,
      email: 'Founder@Example.com ',
      emailSender: sender
    });

    expect(mockEmailOtp.update).toHaveBeenCalledWith(
      { consumed_at: expect.any(Date) },
      expect.objectContaining({
        where: expect.objectContaining({
          purpose: EMAIL_OTP_PURPOSES.COMPANY_REGISTRATION,
          email: 'founder@example.com',
          tenant_id: null
        })
      })
    );
    expect(mockEmailOtp.create).toHaveBeenCalledWith(expect.objectContaining({
      purpose: EMAIL_OTP_PURPOSES.COMPANY_REGISTRATION,
      email: 'founder@example.com',
      tenant_id: null,
      code_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      max_attempts: 5
    }));
    expect(sender.sendEmailOtpCode).toHaveBeenCalledWith(expect.objectContaining({
      email: 'founder@example.com',
      code: expect.stringMatching(/^\d{6}$/),
      purposeLabel: 'company registration'
    }));
    expect(result).toEqual(expect.objectContaining({
      otp_id: 'otp-1',
      email: 'founder@example.com',
      delivery_status: 'sent'
    }));
  });

  it('rejects OTP requests when SMTP is unavailable', async () => {
    await expect(requestEmailOtp({
      purpose: EMAIL_OTP_PURPOSES.EMAIL_CHANGE,
      email: 'new@example.com',
      emailSender: {
        isEmailConfigured: jest.fn().mockReturnValue(false)
      }
    })).rejects.toMatchObject({
      statusCode: 503,
      code: 'EMAIL_OTP_DELIVERY_UNAVAILABLE'
    });

    expect(mockEmailOtp.create).not.toHaveBeenCalled();
  });

  it('consumes a matching OTP code', async () => {
    const code = '123456';
    let createdPayload;
    mockEmailOtp.create.mockImplementation(async (payload) => {
      createdPayload = payload;
      return {
        otp_id: 'otp-2',
        purpose: payload.purpose,
        email: payload.email,
        expires_at: payload.expires_at,
        delivery_status: 'sent',
        update: jest.fn()
      };
    });
    mockEmailOtp.update.mockResolvedValue([0]);

    await requestEmailOtp({
      purpose: EMAIL_OTP_PURPOSES.EMAIL_CHANGE,
      email: 'new@example.com',
      tenantId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      emailSender: {
        isEmailConfigured: jest.fn().mockReturnValue(true),
        sendEmailOtpCode: jest.fn().mockResolvedValue({})
      }
    });

    const matchingOtp = {
      otp_id: 'otp-2',
      purpose: EMAIL_OTP_PURPOSES.EMAIL_CHANGE,
      email: 'new@example.com',
      code_hash: createdPayload.code_hash,
      attempts: 0,
      max_attempts: 5,
      expires_at: createdPayload.expires_at,
      delivery_status: 'sent',
      update: jest.fn()
    };
    mockEmailOtp.findOne.mockResolvedValue(matchingOtp);
    mockEmailOtp.update.mockClear();
    mockEmailOtp.update.mockResolvedValue([1]);

    // Recompute through a fixed record by verifying the actual generated hash is not possible,
    // so create a controlled second row using a known code hash.
    const crypto = await import('crypto');
    matchingOtp.code_hash = crypto
      .createHash('sha256')
      .update(`${EMAIL_OTP_PURPOSES.EMAIL_CHANGE}:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee:new@example.com:${code}:${process.env.EMAIL_OTP_SECRET}`)
      .digest('hex');

    const result = await verifyEmailOtp({
      purpose: EMAIL_OTP_PURPOSES.EMAIL_CHANGE,
      email: 'new@example.com',
      code,
      tenantId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    });

    expect(mockEmailOtp.update).toHaveBeenCalledWith(
      { consumed_at: expect.any(Date) },
      expect.objectContaining({
        where: {
          otp_id: 'otp-2',
          consumed_at: null
        }
      })
    );
    expect(result).toEqual(expect.objectContaining({
      verified: true,
      purpose: EMAIL_OTP_PURPOSES.EMAIL_CHANGE
    }));
  });

  it('rejects a matching code when another request already consumed it', async () => {
    const matchingOtp = {
      otp_id: 'otp-race',
      purpose: EMAIL_OTP_PURPOSES.EMAIL_CHANGE,
      email: 'new@example.com',
      code_hash: '',
      attempts: 0,
      max_attempts: 5,
      expires_at: new Date(Date.now() + 60000),
      delivery_status: 'sent',
      update: jest.fn(),
      increment: jest.fn()
    };
    const crypto = await import('crypto');
    matchingOtp.code_hash = crypto
      .createHash('sha256')
      .update(`${EMAIL_OTP_PURPOSES.EMAIL_CHANGE}:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee:new@example.com:123456:${process.env.EMAIL_OTP_SECRET}`)
      .digest('hex');
    mockEmailOtp.findOne.mockResolvedValue(matchingOtp);
    mockEmailOtp.update.mockResolvedValue([0]);

    await expect(verifyEmailOtp({
      purpose: EMAIL_OTP_PURPOSES.EMAIL_CHANGE,
      email: 'new@example.com',
      code: '123456',
      tenantId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    })).rejects.toMatchObject({
      statusCode: 422,
      code: 'EMAIL_OTP_EXPIRED'
    });
  });

  it('allows invitation acceptance without a code when OTP enforcement is disabled', async () => {
    process.env.EMAIL_OTP_ENFORCEMENT_ENABLED = 'false';

    const result = await verifyEmailOtp({
      purpose: EMAIL_OTP_PURPOSES.INVITATION_ACCEPTANCE,
      email: 'invited@example.com',
      code: undefined,
      tenantId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    });

    expect(result).toEqual(expect.objectContaining({
      verified: true,
      enforcement_disabled: true
    }));
    expect(mockEmailOtp.findOne).not.toHaveBeenCalled();
  });
});
