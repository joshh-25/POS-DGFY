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
  sendEmail
} = await import('../src/services/emailService.js');

const ORIGINAL_ENV = { ...process.env };

describe('email service delivery providers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_SECURE;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.EMAIL_FROM;
    delete process.env.EMAIL_FROM_NAME;
    delete process.env.EMAIL_DELIVERY_PROVIDER;
    delete process.env.EMAIL_DELIVERY_FALLBACK_TO_BREVO_API;
    delete process.env.BREVO_API_KEY;
    delete process.env.BREVO_API_URL;
    global.fetch = jest.fn();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('treats Brevo HTTPS API credentials as a configured email provider', () => {
    process.env.BREVO_API_KEY = 'xkeysib-test-key';
    process.env.EMAIL_FROM = 'sender@example.com';

    expect(isEmailConfigured()).toBe(true);
    expect(getEmailProviderMode()).toBe('brevo_api');
  });

  it('sends through Brevo API when explicitly selected', async () => {
    process.env.EMAIL_DELIVERY_PROVIDER = 'brevo_api';
    process.env.BREVO_API_KEY = 'xkeysib-test-key';
    process.env.EMAIL_FROM = 'sender@example.com';
    process.env.EMAIL_FROM_NAME = 'SKUpervisor';
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ messageId: '<brevo-message-id>' })
    });

    const result = await sendEmail({
      to: 'user@example.com',
      subject: 'Verify',
      html: '<p>Hello</p>'
    });

    expect(createTransportMock).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.brevo.com/v3/smtp/email',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'api-key': 'xkeysib-test-key',
          'content-type': 'application/json'
        }),
        body: expect.any(String)
      })
    );
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual(expect.objectContaining({
      sender: {
        name: 'SKUpervisor',
        email: 'sender@example.com'
      },
      to: [{ email: 'user@example.com' }],
      subject: 'Verify',
      htmlContent: '<p>Hello</p>',
      textContent: 'Hello'
    }));
    expect(result).toEqual(expect.objectContaining({
      provider: 'brevo_api',
      messageId: '<brevo-message-id>'
    }));
  });

  it('falls back to Brevo API when SMTP delivery fails', async () => {
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_USER = 'smtp-user';
    process.env.SMTP_PASS = 'smtp-pass';
    process.env.EMAIL_FROM = 'sender@example.com';
    process.env.BREVO_API_KEY = 'xkeysib-test-key';
    sendMailMock.mockRejectedValue(new Error('SMTP timeout'));
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ messageId: '<brevo-fallback-id>' })
    });

    const result = await sendEmail({
      to: 'user@example.com',
      subject: 'Verify',
      html: '<p>Hello</p>'
    });

    expect(createTransportMock).toHaveBeenCalledWith(expect.objectContaining({
      host: 'smtp.example.com',
      auth: {
        user: 'smtp-user',
        pass: 'smtp-pass'
      }
    }));
    expect(sendMailMock).toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({
      provider: 'brevo_api',
      messageId: '<brevo-fallback-id>'
    }));
  });
});
