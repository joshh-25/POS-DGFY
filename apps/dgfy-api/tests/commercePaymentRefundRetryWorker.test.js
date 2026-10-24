import { describe, expect, it, jest } from '@jest/globals';
import { processCommercePaymentRefundRetryBatch } from '../src/workers/commercePaymentRefundRetryWorker.js';

describe('commerce payment refund retry worker', () => {
  it('claims due scheduled refunds and delegates each row to the retry use case', async () => {
    const repository = {
      claimDueCommercePaymentRefundRetry: jest.fn()
        .mockResolvedValueOnce({ refund_id: 20 })
        .mockResolvedValueOnce(null)
    };
    const retryUseCase = jest.fn().mockResolvedValue({ success: true, data: {} });
    const now = new Date('2026-10-17T10:00:00.000Z');

    const processed = await processCommercePaymentRefundRetryBatch({
      repository,
      retryUseCase,
      now,
      limit: 10
    });

    expect(processed).toBe(1);
    expect(repository.claimDueCommercePaymentRefundRetry).toHaveBeenCalledWith(expect.objectContaining({
      now,
      maxAttempts: 5,
      leaseUntil: new Date('2026-10-17T10:10:00.000Z')
    }));
    expect(retryUseCase).toHaveBeenCalledWith({
      refundId: 20,
      actor: 'commerce_payment_refund_retry_worker'
    });
  });

  it('continues processing when one retry result is unsuccessful', async () => {
    const repository = {
      claimDueCommercePaymentRefundRetry: jest.fn()
        .mockResolvedValueOnce({ refund_id: 20 })
        .mockResolvedValueOnce({ refund_id: 21 })
        .mockResolvedValueOnce(null)
    };
    const retryUseCase = jest.fn()
      .mockResolvedValueOnce({ success: false, error: new Error('provider rejected') })
      .mockResolvedValueOnce({ success: true, data: {} });

    const processed = await processCommercePaymentRefundRetryBatch({
      repository,
      retryUseCase,
      limit: 2
    });

    expect(processed).toBe(2);
    expect(retryUseCase).toHaveBeenCalledTimes(2);
  });
});
