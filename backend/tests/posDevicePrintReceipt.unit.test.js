import { jest } from '@jest/globals';

const mockGetAllSettingsUseCase = jest.fn();

jest.unstable_mockModule('../src/modules/settings/index.js', () => ({
    getAllSettingsUseCase: mockGetAllSettingsUseCase
}));

let buildPrintPosReceiptUseCase;

beforeAll(async () => {
    ({ buildPrintPosReceiptUseCase } = await import('../src/modules/pos/usecases/posDeviceUseCases.js'));
});

const buildTransaction = () => ({
    pos_transaction_id: 42,
    invoice_number: 'INV-0001',
    total_amount: 150,
    lines: []
});

const buildPosRepositoryStub = ({ transaction = buildTransaction() } = {}) => ({
    findOperationReplayByKey: jest.fn().mockResolvedValue(null),
    findOpenTerminalShift: jest.fn().mockResolvedValue({ pos_terminal_shift_id: 9 }),
    getTransactionById: jest.fn().mockResolvedValue(transaction),
    createAuditLog: jest.fn().mockResolvedValue(null),
    createOperationReplay: jest.fn().mockResolvedValue(null)
});

beforeEach(() => {
    mockGetAllSettingsUseCase.mockReset().mockResolvedValue({ success: true, data: {}, error: null });
});

describe('buildPrintPosReceiptUseCase — client-delegated printing', () => {
    it('skips the server driver and still audits + returns the canonical receipt contract when a client driver already printed', async () => {
        const posRepository = buildPosRepositoryStub();
        const deviceDriver = {
            id: 'client_managed',
            printReceipt: jest.fn()
        };
        const useCase = buildPrintPosReceiptUseCase({ posRepository, deviceDriver });

        const result = await useCase({
            payload: {
                transaction_id: 42,
                client_driver_id: 'imin_native',
                client_result: { success: true, message: 'Printed via iMin' }
            },
            user: { user_id: 1 }
        });

        expect(result.success).toBe(true);
        expect(deviceDriver.printReceipt).not.toHaveBeenCalled();
        expect(result.data.bridge).toEqual({
            ok: true,
            delegated: true,
            driver: 'imin_native',
            client_result: { success: true, message: 'Printed via iMin' }
        });
        expect(result.data.receipt_contract).toBeDefined();

        expect(posRepository.createAuditLog).toHaveBeenCalledTimes(1);
        const [auditCall] = posRepository.createAuditLog.mock.calls;
        expect(auditCall[0].changes.driver_id).toBe('imin_native');

        expect(posRepository.createOperationReplay).not.toHaveBeenCalled();
    });

    it('records a failed client print outcome without throwing', async () => {
        const posRepository = buildPosRepositoryStub();
        const deviceDriver = { id: 'client_managed', printReceipt: jest.fn() };
        const useCase = buildPrintPosReceiptUseCase({ posRepository, deviceDriver });

        const result = await useCase({
            payload: {
                transaction_id: 42,
                client_driver_id: 'imin_native',
                client_result: { success: false, reason_code: 'PAPER_OUT' }
            },
            user: { user_id: 1 }
        });

        expect(result.success).toBe(true);
        expect(result.data.bridge.ok).toBe(false);
    });

    it('still dispatches to the server driver when no client_driver_id is provided', async () => {
        const posRepository = buildPosRepositoryStub();
        const deviceDriver = {
            id: 'lan_escpos_bridge',
            printReceipt: jest.fn().mockResolvedValue({ ok: true, result: { copies: 1 } })
        };
        const useCase = buildPrintPosReceiptUseCase({ posRepository, deviceDriver });

        const result = await useCase({
            payload: { transaction_id: 42 },
            user: { user_id: 1 }
        });

        expect(result.success).toBe(true);
        expect(deviceDriver.printReceipt).toHaveBeenCalledTimes(1);
        expect(result.data.bridge).toEqual({ ok: true, result: { copies: 1 } });
    });
});
