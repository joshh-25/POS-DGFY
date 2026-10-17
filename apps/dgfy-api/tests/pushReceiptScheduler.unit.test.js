import { afterEach, describe, expect, it, jest } from '@jest/globals';

const acquireLock = jest.fn();
const releaseLock = jest.fn();
jest.unstable_mockModule('../src/services/cacheService.js', () => ({ acquireLock, releaseLock }));
jest.unstable_mockModule('../src/modules/pushDelivery/adapters/index.js', () => ({
    getPushAccountTokenMaxAgeDays: () => 90,
    getPushDeliveryLogRetentionDays: () => 30,
    getPushGuestTokenTtlDays: () => 7,
    isPushDeliveryRetentionEnabled: () => true,
    resolvePushAdapter: () => ({ mode: 'unconfigured', adapter: {} })
}));
const { runPushReceiptCycle } = await import('../src/schedulers/pushReceiptScheduler.js');

afterEach(() => {
    jest.clearAllMocks();
    acquireLock.mockResolvedValue(true);
    releaseLock.mockResolvedValue(undefined);
});

describe('push receipt scheduler', () => {
    it('runs receipts and token/log retention under the distributed lock', async () => {
        acquireLock.mockResolvedValue(true);
        const processReceipts = jest.fn().mockResolvedValue({ status: 'completed', checked: 2 });
        const deviceRepository = {
            revokeGuestBindingsPastTtl: jest.fn().mockResolvedValue(1),
            revokeInactiveAccountTokens: jest.fn().mockResolvedValue(2),
            purgeRevokedTokens: jest.fn().mockResolvedValue(3)
        };
        const logRepository = { purgeDeliveryLogs: jest.fn().mockResolvedValue(4) };
        const result = await runPushReceiptCycle({
            processReceipts,
            deviceRepository,
            logRepository,
            now: () => new Date('2026-10-17T00:00:00.000Z')
        });

        expect(result).toEqual({
            status: 'completed',
            receipts: { status: 'completed', checked: 2 },
            retention: { guestRevoked: 1, accountRevoked: 2, tokensPurged: 3, logsPurged: 4 }
        });
        expect(acquireLock).toHaveBeenCalledWith('scheduler:push_receipts_and_retention', 900);
        expect(releaseLock).toHaveBeenCalledWith('scheduler:push_receipts_and_retention');
        expect(deviceRepository.revokeGuestBindingsPastTtl).toHaveBeenCalledWith(new Date('2026-10-10T00:00:00.000Z'));
    });

    it('does not run a cycle when another worker owns the lock', async () => {
        acquireLock.mockResolvedValue(false);
        const processReceipts = jest.fn();
        await expect(runPushReceiptCycle({ processReceipts })).resolves.toMatchObject({
            status: 'skipped', reason: 'distributed_lock'
        });
        expect(processReceipts).not.toHaveBeenCalled();
        expect(releaseLock).not.toHaveBeenCalled();
    });
});
