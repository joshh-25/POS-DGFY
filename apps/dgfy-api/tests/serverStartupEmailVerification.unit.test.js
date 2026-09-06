import { describe, expect, it, jest } from '@jest/globals';
import { runStartupEmailVerification } from '../src/server.js';

// #1614 RF-6: regression coverage for the boot-time SMTP verification --
// covers the three paths a real startServer() run can't be unit-tested for
// directly (no isolated test harness exists for startServer() itself, since
// it does real DB connects and audits). See runStartupEmailVerification's
// own header comment in server.js.
describe('runStartupEmailVerification (#1614)', () => {
  it('skips verification and logs when SMTP is not configured', async () => {
    const logger = { info: jest.fn(), error: jest.fn() };
    const verifyEmailConnectionFn = jest.fn();
    const raiseOperationalAlertFn = jest.fn();

    await runStartupEmailVerification({
      isEmailConfiguredFn: () => false,
      verifyEmailConnectionFn,
      raiseOperationalAlertFn,
      loggerInstance: logger
    });

    expect(verifyEmailConnectionFn).not.toHaveBeenCalled();
    expect(raiseOperationalAlertFn).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('skipping startup connection verification')
    );
  });

  it('logs success and does not alert when SMTP is configured and verifies', async () => {
    const logger = { info: jest.fn(), error: jest.fn() };
    const raiseOperationalAlertFn = jest.fn();

    await runStartupEmailVerification({
      isEmailConfiguredFn: () => true,
      verifyEmailConnectionFn: jest.fn().mockResolvedValue({ success: true }),
      raiseOperationalAlertFn,
      loggerInstance: logger
    });

    expect(raiseOperationalAlertFn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('SMTP connection verified at startup')
    );
  });

  it('logs an error and raises the operational alert when SMTP is configured but verification fails', async () => {
    const logger = { info: jest.fn(), error: jest.fn() };
    const raiseOperationalAlertFn = jest.fn().mockResolvedValue(undefined);

    await runStartupEmailVerification({
      isEmailConfiguredFn: () => true,
      verifyEmailConnectionFn: jest.fn().mockResolvedValue({ success: false, error: 'EAUTH 535' }),
      raiseOperationalAlertFn,
      loggerInstance: logger
    });

    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('EAUTH 535'));
    expect(raiseOperationalAlertFn).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'email.smtp_send_failed',
        context: { stage: 'startup_verify' }
      })
    );
  });

  it('never throws even if the underlying verify call rejects unexpectedly', async () => {
    const logger = { info: jest.fn(), error: jest.fn() };

    await expect(runStartupEmailVerification({
      isEmailConfiguredFn: () => true,
      verifyEmailConnectionFn: jest.fn().mockRejectedValue(new Error('socket hang up')),
      raiseOperationalAlertFn: jest.fn(),
      loggerInstance: logger
    })).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('SMTP startup verification threw unexpectedly'),
      'socket hang up'
    );
  });
});
