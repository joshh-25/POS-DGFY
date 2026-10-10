import { afterEach, describe, expect, it, jest } from '@jest/globals';

const acquireLock = jest.fn();
const releaseLock = jest.fn();
jest.unstable_mockModule('../src/services/cacheService.js', () => ({ acquireLock, releaseLock }));
const { runSmsDeliveryRetentionCycle } = await import('../src/schedulers/smsDeliveryRetentionScheduler.js');

describe('SMS delivery retention scheduler', () => {
  afterEach(() => { delete process.env.SMS_DELIVERY_LOG_RETENTION_ENABLED; jest.restoreAllMocks(); });

  it('is a no-op when disabled', async () => {
    process.env.SMS_DELIVERY_LOG_RETENTION_ENABLED = 'false';
    const redact = jest.fn();
    await expect(runSmsDeliveryRetentionCycle({ redact })).resolves.toEqual({ status: 'skipped', reason: 'disabled' });
    expect(redact).not.toHaveBeenCalled();
  });

  it('respects the distributed lock and runs redaction when acquired', async () => {
    delete process.env.SMS_DELIVERY_LOG_RETENTION_ENABLED;
    acquireLock.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    releaseLock.mockResolvedValue(undefined);
    const redact = jest.fn().mockResolvedValue(2);
    await expect(runSmsDeliveryRetentionCycle({ redact })).resolves.toEqual({ status: 'skipped', reason: 'distributed_lock' });
    await expect(runSmsDeliveryRetentionCycle({ redact })).resolves.toEqual({ status: 'completed', redacted: 2 });
    expect(releaseLock).toHaveBeenCalledTimes(1);
  });
});
