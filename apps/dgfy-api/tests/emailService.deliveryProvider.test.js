import { jest } from '@jest/globals';

const sendMailMock = jest.fn();
const verifyMock = jest.fn();
const createTransportMock = jest.fn(() => ({
  sendMail: sendMailMock,
  verify: verifyMock
}));

jest.unstable_mockModule('nodemailer', () => ({
  default: {
    createTransport: createTransportMock
  }
}));

jest.unstable_mockModule('../src/config/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

const {
  getEmailProviderMode,
  isEmailConfigured,
  isSmtpConfigured,
  sendEmail,
  sendEmailOtpCode,
  verifyConnection
} = await import('../src/services/emailService.js');

const ORIGINAL_ENV = { ...process.env };

const clearSmtpEnv = () => {
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_PORT;
  delete process.env.SMTP_SECURE;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
  delete process.env.EMAIL_FROM;
  delete process.env.EMAIL_FROM_NAME;
};

// Brevo HTTPS API delivery was removed in issue #279 -- it exercised zero
// production traffic and, being unauthenticated for our sending domain,
// would have failed DMARC the same way SMTP could. sendEmail now has a
// single delivery path: SMTP or an EMAIL_NOT_CONFIGURED throw, with no
// fallback on failure.
//
// The "unconfigured" cases below MUST run before any test that configures
// SMTP: getTransporter()'s _transporter is a module-level singleton that is
// only reset by resetTransporter() (issue #279, a later phase), so once a
// transporter has been created it stays cached regardless of what the env
// vars say afterward. Splitting into two describe blocks keeps declaration
// order (and therefore execution order) enforcing that constraint instead
// of relying on it silently.
describe('email service delivery providers', () => {
  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  describe('when SMTP is not configured', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      process.env = { ...ORIGINAL_ENV };
      clearSmtpEnv();
    });

    it('reports unconfigured', () => {
      expect(isEmailConfigured()).toBe(false);
      expect(isSmtpConfigured()).toBe(false);
      expect(getEmailProviderMode()).toBe('unconfigured');
    });

    it('throws EMAIL_NOT_CONFIGURED and never attempts a transport', async () => {
      await expect(sendEmail({
        to: 'user@example.com',
        subject: 'Verify',
        html: '<p>Hello</p>'
      })).rejects.toMatchObject({ code: 'EMAIL_NOT_CONFIGURED' });

      expect(createTransportMock).not.toHaveBeenCalled();
    });

    it('verifyConnection reports failure with no fallback provider', async () => {
      const result = await verifyConnection();
      expect(result).toEqual(expect.objectContaining({ success: false, mode: 'unconfigured' }));
      expect(result.provider).toBeUndefined();
      expect(result.warning).toBeUndefined();
    });
  });

  describe('when SMTP is configured', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      process.env = { ...ORIGINAL_ENV };
      clearSmtpEnv();
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_USER = 'smtp-user@example.com';
      process.env.SMTP_PASS = 'smtp-pass';
    });

    it('reports smtp as both configured and the provider mode', () => {
      expect(isEmailConfigured()).toBe(true);
      expect(isSmtpConfigured()).toBe(true);
      expect(getEmailProviderMode()).toBe('smtp');
    });

    it('sends through SMTP and returns the nodemailer result with provider: smtp', async () => {
      sendMailMock.mockResolvedValue({ messageId: '<smtp-message-id>', accepted: ['user@example.com'], rejected: [] });

      const result = await sendEmail({
        to: 'user@example.com',
        subject: 'Verify',
        html: '<p>Hello</p>'
      });

      expect(createTransportMock).toHaveBeenCalledWith(expect.objectContaining({
        host: 'smtp.example.com',
        auth: {
          user: 'smtp-user@example.com',
          pass: 'smtp-pass'
        }
      }));
      expect(sendMailMock).toHaveBeenCalled();
      expect(result).toEqual(expect.objectContaining({
        provider: 'smtp',
        messageId: '<smtp-message-id>'
      }));
    });

    it('rethrows on SMTP failure with no fallback attempted', async () => {
      sendMailMock.mockRejectedValue(new Error('SMTP timeout'));

      await expect(sendEmail({
        to: 'user@example.com',
        subject: 'Verify',
        html: '<p>Hello</p>'
      })).rejects.toThrow('SMTP timeout');

      expect(sendMailMock).toHaveBeenCalled();
    });

    it('keeps SKUpervisor as the generic default sender display name', async () => {
      sendMailMock.mockResolvedValue({ messageId: '<smtp-message-id>' });

      await sendEmail({
        to: 'user@example.com',
        subject: 'Generic notification',
        html: '<p>Hello</p>'
      });

      expect(sendMailMock).toHaveBeenCalledWith(expect.objectContaining({
        from: '"SKUpervisor" <smtp-user@example.com>',
        subject: 'Generic notification'
      }));
    });

    it('uses DGFY as the default sender display name for verification emails', async () => {
      sendMailMock.mockResolvedValue({ messageId: '<smtp-message-id>' });

      await sendEmailOtpCode({
        email: 'user@example.com',
        code: '123456'
      });

      expect(sendMailMock).toHaveBeenCalledWith(expect.objectContaining({
        from: '"DGFY" <smtp-user@example.com>',
        subject: 'Your DGFY email verification code',
        text: expect.stringContaining('Your DGFY email verification code is 123456')
      }));
    });

    it('verifyConnection reports success when the transporter verifies', async () => {
      verifyMock.mockResolvedValue(true);

      const result = await verifyConnection();
      expect(result).toEqual(expect.objectContaining({ success: true, provider: 'smtp', mode: 'smtp' }));
    });

    it('verifyConnection reports failure with the SMTP error and no Brevo fallback offered', async () => {
      verifyMock.mockRejectedValue(new Error('connection refused'));

      const result = await verifyConnection();
      expect(result).toEqual(expect.objectContaining({ success: false, mode: 'smtp', error: 'connection refused' }));
      expect(result.warning).toBeUndefined();
    });
  });
});
