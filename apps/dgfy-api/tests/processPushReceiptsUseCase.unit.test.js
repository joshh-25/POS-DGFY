import { describe, expect, it, jest } from '@jest/globals';
import { buildProcessPushReceiptsUseCase } from '../src/modules/pushDelivery/usecases/processPushReceiptsUseCase.js';

describe('processPushReceiptsUseCase', () => {
    it('records receipts and revokes DeviceNotRegistered tokens', async () => {
        const repository = {
            findReceiptCandidates: jest.fn().mockResolvedValue([{
                id: 'log-1', token_id: 'device-1', ticket_id: 'ticket-1'
            }]),
            updateById: jest.fn().mockResolvedValue({}),
            revokeTokenById: jest.fn().mockResolvedValue(1)
        };
        const adapter = { getReceipts: jest.fn().mockResolvedValue({
            'ticket-1': { status: 'error', details: { error: 'DeviceNotRegistered' } }
        }) };
        const process = buildProcessPushReceiptsUseCase({
            repository,
            adapterResolver: () => ({ mode: 'expo', adapter }),
            now: () => new Date('2026-10-17T01:00:00.000Z')
        });

        await expect(process()).resolves.toMatchObject({ status: 'completed', checked: 1 });
        expect(repository.updateById).toHaveBeenCalledWith('log-1', expect.objectContaining({
            receipt_status: 'error', receipt_checked_at: expect.any(Date), error_code: 'devicenotregistered'
        }));
        expect(repository.revokeTokenById).toHaveBeenCalledWith('device-1', 'device_not_registered');
    });

    it('leaves unavailable receipt batches for a later poll without blocking retention', async () => {
        const repository = { findReceiptCandidates: jest.fn().mockResolvedValue([
            { id: 'log-1', token_id: 'device-1', ticket_id: 'ticket-1' }
        ]) };
        const adapter = { getReceipts: jest.fn().mockRejectedValue(new Error('Expo unavailable')) };
        const process = buildProcessPushReceiptsUseCase({ repository, adapterResolver: () => ({ mode: 'expo', adapter }) });
        await expect(process()).resolves.toMatchObject({ status: 'completed', checked: 0, failed_batches: 1 });
    });
});
