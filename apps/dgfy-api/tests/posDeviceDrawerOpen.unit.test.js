import { jest } from '@jest/globals';

const mockGetAllSettingsUseCase = jest.fn();

jest.unstable_mockModule('../src/modules/settings/index.js', () => ({
    getAllSettingsUseCase: mockGetAllSettingsUseCase
}));

let buildOpenPosDrawerUseCase;

beforeAll(async () => {
    ({ buildOpenPosDrawerUseCase } = await import('../src/modules/pos/usecases/posDeviceUseCases.js'));
});

const buildShift = (overrides = {}) => ({
    pos_terminal_shift_id: 9,
    terminal_id: 'POS-01',
    location_id: 1,
    cashier_id: 1,
    status: 'open',
    ...overrides
});

const buildTransaction = (overrides = {}) => ({
    pos_transaction_id: 42,
    shift_id: 9,
    ...overrides
});

const buildPosRepositoryStub = ({ shift = buildShift(), transaction = buildTransaction(), operator = null } = {}) => ({
    findOperationReplayByKey: jest.fn().mockResolvedValue(null),
    getTerminalShiftById: jest.fn().mockResolvedValue(shift),
    getTransactionById: jest.fn().mockResolvedValue(transaction),
    createAuditLog: jest.fn().mockResolvedValue(null),
    createOperationReplay: jest.fn().mockResolvedValue(null),
    findActivePosDrawerOperatorById: jest.fn().mockResolvedValue(operator)
});

const buildDeviceDriver = () => ({
    id: 'server_driver',
    openDrawer: jest.fn().mockResolvedValue({ ok: true, result: 'opened' })
});

beforeEach(() => {
    mockGetAllSettingsUseCase.mockReset().mockResolvedValue({ success: true, data: {}, error: null });
});

describe('buildOpenPosDrawerUseCase — checkout_auto_* ownership guard (RF-1)', () => {
    it('rejects a non-cashier, non-admin holder of ADJUST_CASH_DRAWER on a checkout_auto_* reason', async () => {
        const posRepository = buildPosRepositoryStub({
            shift: buildShift({ cashier_id: 1 }),
            operator: { user_id: 2, role: 'cashier', is_active: true, is_master_admin: false }
        });
        const deviceDriver = buildDeviceDriver();
        const useCase = buildOpenPosDrawerUseCase({ posRepository, deviceDriver, authorizationService: {} });

        const result = await useCase({
            payload: {
                shift_id: 9,
                transaction_id: 42,
                reason: 'checkout_auto_open_drawer',
                idempotency_key: 'drawer-open-001'
            },
            // A different user (id 2) than the shift's assigned cashier (id 1).
            user: { user_id: 2, role: 'cashier' }
        });

        expect(result.success).toBe(false);
        expect(result.error).toMatchObject({
            details: { reason_code: 'DRAWER_SHIFT_CASHIER_MISMATCH' }
        });
        expect(deviceDriver.openDrawer).not.toHaveBeenCalled();
    });

    it('allows the shift\'s own cashier on a checkout_auto_* reason', async () => {
        const posRepository = buildPosRepositoryStub({
            shift: buildShift({ cashier_id: 1 }),
            operator: { user_id: 1, role: 'cashier', is_active: true, is_master_admin: false }
        });
        const deviceDriver = buildDeviceDriver();
        const useCase = buildOpenPosDrawerUseCase({ posRepository, deviceDriver, authorizationService: {} });

        const result = await useCase({
            payload: {
                shift_id: 9,
                transaction_id: 42,
                reason: 'checkout_auto_open_drawer',
                idempotency_key: 'drawer-open-002'
            },
            user: { user_id: 1, role: 'cashier' }
        });

        expect(result.success).toBe(true);
        expect(deviceDriver.openDrawer).toHaveBeenCalledTimes(1);
    });

    it('allows an admin operator to auto-open a drawer that is not their own shift', async () => {
        const posRepository = buildPosRepositoryStub({
            shift: buildShift({ cashier_id: 1 }),
            operator: { user_id: 9, role: 'admin', is_active: true, is_master_admin: false }
        });
        const deviceDriver = buildDeviceDriver();
        const useCase = buildOpenPosDrawerUseCase({ posRepository, deviceDriver, authorizationService: {} });

        const result = await useCase({
            payload: {
                shift_id: 9,
                transaction_id: 42,
                reason: 'checkout_auto_open_drawer',
                idempotency_key: 'drawer-open-003'
            },
            user: { user_id: 9, role: 'admin' }
        });

        expect(result.success).toBe(true);
        expect(deviceDriver.openDrawer).toHaveBeenCalledTimes(1);
    });
});
