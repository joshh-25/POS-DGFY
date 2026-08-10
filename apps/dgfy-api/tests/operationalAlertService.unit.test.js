import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const captureExceptionMock = jest.fn();
const captureMessageMock = jest.fn();
const setLevelMock = jest.fn();
const setTagMock = jest.fn();
const setExtraMock = jest.fn();
const withScopeMock = jest.fn((callback) => callback({
  setLevel: setLevelMock,
  setTag: setTagMock,
  setExtra: setExtraMock
}));

jest.unstable_mockModule('@sentry/node', () => ({
  captureException: captureExceptionMock,
  captureMessage: captureMessageMock,
  withScope: withScopeMock
}));

const isAvailableMock = jest.fn();
const acquireLockMock = jest.fn();

jest.unstable_mockModule('../src/services/cacheService.js', () => ({
  default: {
    isAvailable: isAvailableMock,
    acquireLock: acquireLockMock
  }
}));

const loggerMock = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

jest.unstable_mockModule('../src/config/logger.js', () => ({
  default: loggerMock
}));

const isSentryInitializedMock = jest.fn();

jest.unstable_mockModule('../src/config/sentry.js', () => ({
  isSentryInitialized: isSentryInitializedMock
}));

const { raiseOperationalAlert } = await import('../src/services/operationalAlertService.js');

describe('operationalAlertService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isAvailableMock.mockReturnValue(true);
    acquireLockMock.mockResolvedValue(true);
    isSentryInitializedMock.mockReturnValue(true);
  });

  it('always logs, regardless of Sentry state', async () => {
    isSentryInitializedMock.mockReturnValue(false);

    await raiseOperationalAlert({ key: 'email.smtp_send_failed', error: new Error('boom') });

    expect(loggerMock.error).toHaveBeenCalledWith('boom', expect.objectContaining({ alert_key: 'email.smtp_send_failed' }));
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it('logs at warn level and does not attach a stack for level: warning', async () => {
    await raiseOperationalAlert({ key: 'email.bounce_unmatched', level: 'warning', message: 'unmatched bounce' });

    expect(loggerMock.warn).toHaveBeenCalledWith('unmatched bounce', expect.objectContaining({ alert_key: 'email.bounce_unmatched' }));
    expect(loggerMock.error).not.toHaveBeenCalled();
  });

  it('captures an exception through Sentry when initialized and permitted', async () => {
    const error = new Error('SMTP timeout');

    await raiseOperationalAlert({
      key: 'email.smtp_send_failed',
      error,
      context: { recipient_domain: 'yahoo.com' }
    });

    expect(withScopeMock).toHaveBeenCalled();
    expect(setTagMock).toHaveBeenCalledWith('alert_key', 'email.smtp_send_failed');
    expect(setExtraMock).toHaveBeenCalledWith('recipient_domain', 'yahoo.com');
    expect(captureExceptionMock).toHaveBeenCalledWith(error);
    expect(captureMessageMock).not.toHaveBeenCalled();
  });

  it('captures a message when no Error object is provided', async () => {
    await raiseOperationalAlert({ key: 'email.bounce_detected', message: 'hard bounce detected' });

    expect(captureMessageMock).toHaveBeenCalledWith('hard bounce detected');
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it('does not call Sentry when isSentryInitialized() is false', async () => {
    isSentryInitializedMock.mockReturnValue(false);

    await raiseOperationalAlert({ key: 'email.smtp_send_failed', error: new Error('boom') });

    expect(withScopeMock).not.toHaveBeenCalled();
  });

  it('throttles repeat alerts for the same key via cacheService.acquireLock', async () => {
    acquireLockMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await raiseOperationalAlert({ key: 'email.smtp_send_failed', error: new Error('first') });
    await raiseOperationalAlert({ key: 'email.smtp_send_failed', error: new Error('second') });

    expect(acquireLockMock).toHaveBeenNthCalledWith(1, 'alert:email.smtp_send_failed', 300);
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
    // Both attempts still log locally -- throttling only gates the Sentry call.
    expect(loggerMock.error).toHaveBeenCalledTimes(2);
  });

  it('falls back to an in-memory throttle when Redis is unavailable', async () => {
    isAvailableMock.mockReturnValue(false);

    await raiseOperationalAlert({ key: 'email.delivery_log_write_failed', error: new Error('first') });
    await raiseOperationalAlert({ key: 'email.delivery_log_write_failed', error: new Error('second') });

    expect(acquireLockMock).not.toHaveBeenCalled();
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
  });

  it('never throws even when the Sentry call itself throws', async () => {
    captureExceptionMock.mockImplementation(() => {
      throw new Error('sentry is down');
    });

    await expect(raiseOperationalAlert({ key: 'email.smtp_send_failed', error: new Error('boom') })).resolves.toBeUndefined();
  });

  it('never throws when cacheService.acquireLock rejects', async () => {
    acquireLockMock.mockRejectedValue(new Error('redis error'));

    await expect(raiseOperationalAlert({ key: 'email.smtp_send_failed', error: new Error('boom') })).resolves.toBeUndefined();
    // Fails open (permitted) rather than silently dropping the alert.
    expect(captureExceptionMock).toHaveBeenCalled();
  });
});
