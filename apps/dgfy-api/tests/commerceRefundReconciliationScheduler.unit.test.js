import { afterEach, describe, expect, it, jest } from '@jest/globals';

const acquireLock = jest.fn();
const releaseLock = jest.fn();
const reconcilePendingCommerceRefundsUseCase = jest.fn();
jest.unstable_mockModule('../src/services/cacheService.js', () => ({ acquireLock, releaseLock }));
jest.unstable_mockModule('../src/config/logger.js', () => ({ default: { info: jest.fn(), error: jest.fn() } }));
jest.unstable_mockModule('../src/modules/commercePayments/index.js', () => ({
  reconcilePendingCommerceRefundsUseCase
}));

const { runCommerceRefundReconciliationCycle } = await import('../src/schedulers/commerceRefundReconciliationScheduler.js');

describe('commerce refund reconciliation scheduler', () => {
  afterEach(() => {
    delete process.env.COMMERCE_REFUND_RECONCILE_ENABLED;
    acquireLock.mockReset();
    releaseLock.mockReset();
    reconcilePendingCommerceRefundsUseCase.mockReset();
  });

  it('does not acquire the lock or run when disabled', async () => {
    process.env.COMMERCE_REFUND_RECONCILE_ENABLED = 'false';
    const reconcile = jest.fn();

    await expect(runCommerceRefundReconciliationCycle({ reconcile })).resolves.toEqual({
      status: 'skipped', reason: 'disabled'
    });
    expect(acquireLock).not.toHaveBeenCalled();
    expect(reconcile).not.toHaveBeenCalled();
  });

  it('skips without the distributed lock and runs the use case when acquired', async () => {
    reconcilePendingCommerceRefundsUseCase.mockResolvedValue({ checked: 2, promoted: 1 });
    acquireLock.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    releaseLock.mockResolvedValue(undefined);

    await expect(runCommerceRefundReconciliationCycle()).resolves.toEqual({
      status: 'skipped', reason: 'distributed_lock'
    });
    await expect(runCommerceRefundReconciliationCycle()).resolves.toEqual({
      status: 'completed', checked: 2, promoted: 1
    });
    expect(reconcilePendingCommerceRefundsUseCase).toHaveBeenCalledTimes(1);
    expect(acquireLock).toHaveBeenCalledWith('scheduler:commerce_refund_reconcile', expect.any(Number));
    expect(releaseLock).toHaveBeenCalledWith('scheduler:commerce_refund_reconcile');
  });
});
