import { jest } from '@jest/globals';
import { buildPrintPosReceiptUseCase } from '../src/modules/pos/usecases/posDeviceUseCases.js';

describe('POS device shift guards', () => {
    it('blocks receipt printing when the authenticated operator has no open shift', async () => {
        const posRepository = {
            findOperationReplayByKey: jest.fn().mockResolvedValue(null),
            findOpenTerminalShift: jest.fn().mockResolvedValue(null),
            getTransactionById: jest.fn()
        };
        const deviceBridgeService = {
            printReceipt: jest.fn()
        };
        const printReceipt = buildPrintPosReceiptUseCase({
            posRepository,
            deviceBridgeService
        });

        const result = await printReceipt({
            payload: { transaction_id: 42 },
            user: { user_id: 7 }
        });

        expect(result.success).toBe(false);
        expect(result.error?.message).toBe('Receipt printing requires an open shift');
        expect(posRepository.getTransactionById).not.toHaveBeenCalled();
        expect(deviceBridgeService.printReceipt).not.toHaveBeenCalled();
    });
});
