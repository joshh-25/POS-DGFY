import { describe, expect, it, jest } from '@jest/globals';
import { redactExpiredSmsDeliveryPiiUseCase } from '../src/modules/smsDelivery/usecases/redactExpiredSmsDeliveryPiiUseCase.js';

describe('redactExpiredSmsDeliveryPiiUseCase', () => {
  it('uses the configured window and bounds each repository batch', async () => {
    const redactPiiOlderThan = jest.fn().mockResolvedValue(3);
    const now = new Date('2026-10-10T00:00:00Z');
    await expect(redactExpiredSmsDeliveryPiiUseCase({ repository: { redactPiiOlderThan }, now, days: 30 })).resolves.toBe(3);
    expect(redactPiiOlderThan).toHaveBeenCalledWith(new Date('2026-09-10T00:00:00.000Z'), { limit: 1000 });
  });

  it('drains full batches until the expired backlog is exhausted', async () => {
    const redactPiiOlderThan = jest.fn()
      .mockResolvedValueOnce(1000)
      .mockResolvedValueOnce(1000)
      .mockResolvedValueOnce(250);

    await expect(redactExpiredSmsDeliveryPiiUseCase({ repository: { redactPiiOlderThan } })).resolves.toBe(2250);
    expect(redactPiiOlderThan).toHaveBeenCalledTimes(3);
  });

  it('caps one run at 100 batches so a large backlog can continue on the next scheduled cycle', async () => {
    const redactPiiOlderThan = jest.fn().mockResolvedValue(1000);

    await expect(redactExpiredSmsDeliveryPiiUseCase({ repository: { redactPiiOlderThan } })).resolves.toBe(100000);
    expect(redactPiiOlderThan).toHaveBeenCalledTimes(100);
  });
});
