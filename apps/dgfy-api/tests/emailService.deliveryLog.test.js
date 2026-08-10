import { jest } from '@jest/globals';

const sendMailMock = jest.fn();
const createTransportMock = jest.fn(() => ({ sendMail: sendMailMock, verify: jest.fn() }));

jest.unstable_mockModule('nodemailer', () => ({
  default: { createTransport: createTransportMock }
}));

jest.unstable_mockModule('../src/config/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));

const raiseOperationalAlertMock = jest.fn().mockResolvedValue(undefined);

jest.unstable_mockModule('../src/services/operationalAlertService.js', () => ({
  raiseOperationalAlert: raiseOperationalAlertMock
}));

const {
  sendEmail,
  setEmailDeliveryLogRepository,
  resetTransporter
} = await import('../src/services/emailService.js');

const ORIGINAL_ENV = { ...process.env };

describe('emailService.sendEmail delivery logging (issue #279)', () => {
  let deliveryLogRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_USER = 'noreply@dgfy.ph';
    process.env.SMTP_PASS = 'smtp-pass';
    delete process.env.EMAIL_DELIVERY_LOG_ENABLED;
    resetTransporter();

    deliveryLogRepository = { create: jest.fn().mockResolvedValue({ id: 'log-1' }) };
    setEmailDeliveryLogRepository(deliveryLogRepository);
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
    setEmailDeliveryLogRepository(null);
  });

  it('generates its own RFC 5322 Message-ID and a matching X-DGFY-Delivery-Id header', async () => {
    sendMailMock.mockResolvedValue({ accepted: ['user@example.com'], rejected: [], response: '250 OK' });

    await sendEmail({ to: 'user@example.com', subject: 'Hi', html: '<p>Hi</p>' });

    const [mailOptions] = sendMailMock.mock.calls[0];
    expect(mailOptions.messageId).toMatch(/^<[0-9a-f-]{36}@dgfy\.ph>$/);
    expect(mailOptions.headers['X-DGFY-Delivery-Id']).toBe(mailOptions.messageId.slice(1, -1).split('@')[0]);
  });

  it('records a sent row and returns the deliveryId on full success', async () => {
    sendMailMock.mockResolvedValue({ accepted: ['user@example.com'], rejected: [], response: '250 OK', messageId: '<ignored>' });

    const result = await sendEmail({ to: 'user@example.com', subject: 'Hi', html: '<p>Hi</p>', meta: { purpose: 'email_otp', tenantId: 'tenant-1' } });

    expect(result.provider).toBe('smtp');
    expect(result.deliveryId).toBeTruthy();
    expect(deliveryLogRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      id: result.deliveryId,
      status: 'sent',
      purpose: 'email_otp',
      tenant_id: 'tenant-1',
      recipient_domain: 'example.com',
      recipient_count: 1,
      accepted_recipients: ['user@example.com'],
      rejected_recipients: null
    }));
    expect(raiseOperationalAlertMock).not.toHaveBeenCalled();
  });

  it('records a partial row, alerts at warning level, and does not throw when some recipients are rejected', async () => {
    sendMailMock.mockResolvedValue({
      accepted: ['good@example.com'],
      rejected: ['bad@example.com'],
      response: '250 partial'
    });

    const result = await sendEmail({ to: 'good@example.com,bad@example.com', subject: 'Hi', html: '<p>Hi</p>' });

    expect(result.deliveryId).toBeTruthy();
    expect(deliveryLogRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      status: 'partial',
      recipient_count: 2,
      accepted_recipients: ['good@example.com'],
      rejected_recipients: ['bad@example.com']
    }));
    expect(raiseOperationalAlertMock).toHaveBeenCalledWith(expect.objectContaining({
      key: 'email.recipients_rejected',
      level: 'warning'
    }));
  });

  it('records a failed row, alerts, and throws when all recipients are rejected (nodemailer resolves, does not throw)', async () => {
    sendMailMock.mockResolvedValue({ accepted: [], rejected: ['bad@example.com'], response: '550 rejected' });

    await expect(sendEmail({ to: 'bad@example.com', subject: 'Hi', html: '<p>Hi</p>' }))
      .rejects.toMatchObject({ code: 'EMAIL_ALL_RECIPIENTS_REJECTED' });

    expect(deliveryLogRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failed',
      error_code: 'EMAIL_ALL_RECIPIENTS_REJECTED'
    }));
    expect(raiseOperationalAlertMock).toHaveBeenCalledWith(expect.objectContaining({ key: 'email.smtp_send_failed' }));
  });

  it('records a failed row, alerts, and rethrows the original error when sendMail itself rejects', async () => {
    const smtpError = new Error('Connection timed out');
    smtpError.code = 'ETIMEDOUT';
    sendMailMock.mockRejectedValue(smtpError);

    await expect(sendEmail({ to: 'user@example.com', subject: 'Hi', html: '<p>Hi</p>' }))
      .rejects.toBe(smtpError);

    expect(deliveryLogRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failed',
      error_code: 'ETIMEDOUT',
      error_message: 'Connection timed out'
    }));
    expect(raiseOperationalAlertMock).toHaveBeenCalledWith(expect.objectContaining({
      key: 'email.smtp_send_failed',
      error: smtpError
    }));
  });

  it('does not throw and does not break the send when the delivery log write itself fails', async () => {
    sendMailMock.mockResolvedValue({ accepted: ['user@example.com'], rejected: [], response: '250 OK' });
    deliveryLogRepository.create.mockRejectedValue(new Error('DB is down'));

    const result = await sendEmail({ to: 'user@example.com', subject: 'Hi', html: '<p>Hi</p>' });

    expect(result.provider).toBe('smtp');
    expect(raiseOperationalAlertMock).toHaveBeenCalledWith(expect.objectContaining({ key: 'email.delivery_log_write_failed' }));
  });

  it('skips the delivery log entirely when EMAIL_DELIVERY_LOG_ENABLED=false', async () => {
    process.env.EMAIL_DELIVERY_LOG_ENABLED = 'false';
    sendMailMock.mockResolvedValue({ accepted: ['user@example.com'], rejected: [], response: '250 OK' });

    await sendEmail({ to: 'user@example.com', subject: 'Hi', html: '<p>Hi</p>' });

    expect(deliveryLogRepository.create).not.toHaveBeenCalled();
  });

  it('never persists the email body -- only a truncated subject', async () => {
    sendMailMock.mockResolvedValue({ accepted: ['user@example.com'], rejected: [], response: '250 OK' });

    await sendEmail({
      to: 'user@example.com',
      subject: 'Your temporary password',
      html: '<p>Your temporary password is: hunter2</p>',
      text: 'Your temporary password is: hunter2'
    });

    const [payload] = deliveryLogRepository.create.mock.calls[0];
    expect(payload).not.toHaveProperty('html');
    expect(payload).not.toHaveProperty('text');
    expect(payload).not.toHaveProperty('body');
    expect(JSON.stringify(payload)).not.toContain('hunter2');
  });
});
