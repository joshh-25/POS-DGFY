import { jest } from '@jest/globals';

const mockListPosCatalogUseCase = jest.fn();
const mockCheckoutPosUseCase = jest.fn();
const mockListPosTransactionsUseCase = jest.fn();
const mockGetPosTransactionByIdUseCase = jest.fn();
const mockCloseDayZReadingUseCase = jest.fn();
const mockGetDailyZReadingUseCase = jest.fn();
const mockGetCurrentXReadingUseCase = jest.fn();
const mockIncrementGovernedResetCounterUseCase = jest.fn();
const mockListPosCatalogOverridesUseCase = jest.fn();
const mockUpdatePosCatalogOverrideUseCase = jest.fn();
const mockUploadPosCatalogImageUseCase = jest.fn();
const mockDeletePosCatalogImageUseCase = jest.fn();
const mockOpenTerminalShiftUseCase = jest.fn();
const mockSwitchTerminalShiftLocationUseCase = jest.fn();
const mockGetCurrentTerminalShiftUseCase = jest.fn();
const mockRecordCashDrawerEventUseCase = jest.fn();
const mockCloseTerminalShiftUseCase = jest.fn();
const mockGetTerminalTodayDashboardUseCase = jest.fn();
const mockListIncomingOnlineOrdersUseCase = jest.fn();
const mockUpdateOnlineOrderStatusUseCase = jest.fn();
const mockTrackProductUsageFromResult = jest.fn();

jest.unstable_mockModule('../src/modules/pos/index.js', () => ({
    listPosCatalogUseCase: mockListPosCatalogUseCase,
    checkoutPosUseCase: mockCheckoutPosUseCase,
    listPosTransactionsUseCase: mockListPosTransactionsUseCase,
    getPosTransactionByIdUseCase: mockGetPosTransactionByIdUseCase,
    closeDayZReadingUseCase: mockCloseDayZReadingUseCase,
    getDailyZReadingUseCase: mockGetDailyZReadingUseCase,
    getCurrentXReadingUseCase: mockGetCurrentXReadingUseCase,
    incrementGovernedResetCounterUseCase: mockIncrementGovernedResetCounterUseCase,
    listPosCatalogOverridesUseCase: mockListPosCatalogOverridesUseCase,
    updatePosCatalogOverrideUseCase: mockUpdatePosCatalogOverrideUseCase,
    uploadPosCatalogImageUseCase: mockUploadPosCatalogImageUseCase,
    deletePosCatalogImageUseCase: mockDeletePosCatalogImageUseCase,
    openTerminalShiftUseCase: mockOpenTerminalShiftUseCase,
    switchTerminalShiftLocationUseCase: mockSwitchTerminalShiftLocationUseCase,
    getCurrentTerminalShiftUseCase: mockGetCurrentTerminalShiftUseCase,
    recordCashDrawerEventUseCase: mockRecordCashDrawerEventUseCase,
    closeTerminalShiftUseCase: mockCloseTerminalShiftUseCase,
    getTerminalTodayDashboardUseCase: mockGetTerminalTodayDashboardUseCase,
    listIncomingOnlineOrdersUseCase: mockListIncomingOnlineOrdersUseCase,
    updateOnlineOrderStatusUseCase: mockUpdateOnlineOrderStatusUseCase
}));

jest.unstable_mockModule('../src/services/productUsageTelemetryService.js', () => ({
    trackProductUsageFromResult: mockTrackProductUsageFromResult
}));

let listCatalog;
let checkout;
let listTransactions;
let closeDayZReading;
let getCurrentXReading;
let incrementGovernedResetCounter;
let openTerminalShift;
let switchTerminalShiftLocation;
let recordCashDrawerEvent;
let closeTerminalShift;
let updateOnlineOrderStatus;

beforeAll(async () => {
    const mod = await import('../src/modules/pos/controllers/posHandlers.js');
    listCatalog = mod.listCatalog;
    checkout = mod.checkout;
    listTransactions = mod.listTransactions;
    closeDayZReading = mod.closeDayZReading;
    getCurrentXReading = mod.getCurrentXReading;
    incrementGovernedResetCounter = mod.incrementGovernedResetCounter;
    openTerminalShift = mod.openTerminalShift;
    switchTerminalShiftLocation = mod.switchTerminalShiftLocation;
    recordCashDrawerEvent = mod.recordCashDrawerEvent;
    closeTerminalShift = mod.closeTerminalShift;
    updateOnlineOrderStatus = mod.updateOnlineOrderStatus;
});

const createRes = () => {
    const res = {
        locals: {},
        status: jest.fn(),
        json: jest.fn()
    };
    res.status.mockReturnValue(res);
    return res;
};

describe('posHandlers transport contracts', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockTrackProductUsageFromResult.mockResolvedValue({ created: true });
    });

    it('listCatalog returns stable success payload', async () => {
        mockListPosCatalogUseCase.mockResolvedValue({
            success: true,
            data: [{ item_id: 1, name: 'Tea' }]
        });

        const req = {
            query: {},
            validatedQuery: { search: '', folder_id: 7, limit: 100 },
            user: { user_id: 4, tenant_id: 'tenant-1' },
            requestId: 'req-pos-catalog'
        };
        const res = createRes();
        const next = jest.fn();

        await listCatalog(req, res, next);

        expect(mockListPosCatalogUseCase).toHaveBeenCalledWith({
            query: { search: '', folder_id: 7, limit: 100 },
            user: expect.objectContaining({ user_id: 4 })
        });
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            data: [{ item_id: 1, name: 'Tea' }],
            timestamp: expect.any(String)
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('checkout returns 201 response with normalized payload', async () => {
        mockCheckoutPosUseCase.mockResolvedValue({
            success: true,
            data: {
                idempotent_replay: false,
                transaction: { pos_transaction_id: 9, invoice_number: 'INV-000009' }
            }
        });

        const req = {
            validatedData: { idempotency_key: 'idem-123', lines: [{ item_id: 1, quantity: 1 }] },
            headers: { 'x-pos-terminal-id': 'POS-01' },
            user: { user_id: 4, tenant_id: 'tenant-1' },
            requestId: 'req-pos-checkout'
        };
        const res = createRes();
        const next = jest.fn();

        await checkout(req, res, next);

        expect(mockCheckoutPosUseCase).toHaveBeenCalledWith({
            payload: expect.objectContaining({
                terminal_id: 'POS-01'
            }),
            userId: 4,
            user: expect.objectContaining({ user_id: 4 })
        });
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            data: {
                idempotent_replay: false,
                transaction: { pos_transaction_id: 9, invoice_number: 'INV-000009' }
            },
            message: 'POS checkout completed',
            timestamp: expect.any(String)
        });
        expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
            eventType: 'pos_checkout_completed',
            surface: 'pos',
            action: 'checkout'
        }));
        expect(next).not.toHaveBeenCalled();
    });

    it('listTransactions returns standardized error payload', async () => {
        mockListPosTransactionsUseCase.mockResolvedValue({
            success: false,
            error: {
                code: 'VALIDATION_FAILED',
                message: 'query must be an object',
                details: null,
                statusCode: 400
            }
        });

        const req = {
            query: {},
            validatedQuery: {},
            user: { user_id: 4, tenant_id: 'tenant-1' },
            requestId: 'req-pos-list'
        };
        const res = createRes();
        const next = jest.fn();

        await listTransactions(req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            success: false,
            data: null,
            message: 'query must be an object',
            error_code: 'VALIDATION_FAILED',
            errors: null,
            request_id: 'req-pos-list',
            timestamp: expect.any(String)
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('closeDayZReading returns success message contract', async () => {
        mockCloseDayZReadingUseCase.mockResolvedValue({
            success: true,
            data: {
                business_date: '2026-03-25',
                summary: { transaction_count: 7, total_amount: 1999.5 }
            }
        });

        const req = {
            validatedData: { business_date: '2026-03-25' },
            user: { user_id: 4, tenant_id: 'tenant-1' },
            requestId: 'req-pos-z'
        };
        const res = createRes();
        const next = jest.fn();

        await closeDayZReading(req, res, next);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            data: {
                business_date: '2026-03-25',
                summary: { transaction_count: 7, total_amount: 1999.5 }
            },
            message: 'Z-reading generated successfully',
            timestamp: expect.any(String)
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('getCurrentXReading returns stable success payload', async () => {
        mockGetCurrentXReadingUseCase.mockResolvedValue({
            success: true,
            data: {
                business_date: '2026-04-08',
                reading_identifier: 'XR-20260408-010203',
                summary: { transaction_count: 3, total_amount: 1250 }
            }
        });

        const req = {
            validatedQuery: { business_date: '2026-04-08', terminal_id: 'WEB-POS-01' },
            query: {},
            requestId: 'req-pos-x'
        };
        const res = createRes();
        const next = jest.fn();

        await getCurrentXReading(req, res, next);

        expect(mockGetCurrentXReadingUseCase).toHaveBeenCalledWith({
            query: { business_date: '2026-04-08', terminal_id: 'WEB-POS-01' }
        });
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            data: {
                business_date: '2026-04-08',
                reading_identifier: 'XR-20260408-010203',
                summary: { transaction_count: 3, total_amount: 1250 }
            },
            timestamp: expect.any(String)
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('incrementGovernedResetCounter returns success message contract', async () => {
        mockIncrementGovernedResetCounterUseCase.mockResolvedValue({
            success: true,
            data: {
                business_date: '2026-04-08',
                reset_event_identifier: 'RST-20260408-00000009',
                counters: { reset_counter: 9 }
            }
        });

        const req = {
            validatedData: {
                reason: 'Audit reset event after regulator validation',
                confirmation_text: 'INCREMENT RESET COUNTER'
            },
            body: {},
            user: { user_id: 4, tenant_id: 'tenant-1' },
            requestId: 'req-pos-reset'
        };
        const res = createRes();
        const next = jest.fn();

        await incrementGovernedResetCounter(req, res, next);

        expect(mockIncrementGovernedResetCounterUseCase).toHaveBeenCalledWith({
            payload: {
                reason: 'Audit reset event after regulator validation',
                confirmation_text: 'INCREMENT RESET COUNTER'
            },
            user: expect.objectContaining({ user_id: 4 })
        });
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            data: {
                business_date: '2026-04-08',
                reset_event_identifier: 'RST-20260408-00000009',
                counters: { reset_counter: 9 }
            },
            message: 'Reset counter increment recorded',
            timestamp: expect.any(String)
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('openTerminalShift preserves replay metadata contract in success responses', async () => {
        mockOpenTerminalShiftUseCase.mockResolvedValue({
            success: true,
            data: {
                idempotent_replay: true,
                replay_outcome: 'idempotent_replay',
                reused_existing: true,
                shift: { pos_terminal_shift_id: 77, terminal_id: 'WEB-POS-01' }
            }
        });

        const req = {
            validatedData: { terminal_id: 'WEB-POS-01', idempotency_key: 'shift-open-20260409-01' },
            body: {},
            user: { user_id: 4, tenant_id: 'tenant-1' },
            requestId: 'req-pos-shift-open'
        };
        const res = createRes();
        const next = jest.fn();

        await openTerminalShift(req, res, next);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            data: expect.objectContaining({
                idempotent_replay: true,
                replay_outcome: 'idempotent_replay'
            }),
            message: 'Terminal shift is ready',
            timestamp: expect.any(String)
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('recordCashDrawerEvent preserves replay metadata contract in success responses', async () => {
        mockRecordCashDrawerEventUseCase.mockResolvedValue({
            success: true,
            data: {
                idempotent_replay: false,
                replay_outcome: 'processed',
                event_type: 'cash_in',
                pos_terminal_shift_id: 77
            }
        });

        const req = {
            validatedParams: { id: 77 },
            params: { id: 77 },
            validatedData: {
                idempotency_key: 'cash-event-20260409-01',
                event_type: 'cash_in',
                amount: 100,
                reason: 'Petty cash top-up'
            },
            body: {},
            user: { user_id: 4, tenant_id: 'tenant-1' },
            requestId: 'req-pos-cash-event'
        };
        const res = createRes();
        const next = jest.fn();

        await recordCashDrawerEvent(req, res, next);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            data: expect.objectContaining({
                idempotent_replay: false,
                replay_outcome: 'processed'
            }),
            message: 'Cash drawer event recorded',
            timestamp: expect.any(String)
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('switchTerminalShiftLocation returns stable success payload', async () => {
        mockSwitchTerminalShiftLocationUseCase.mockResolvedValue({
            success: true,
            data: {
                idempotent_replay: false,
                replay_outcome: 'processed',
                from_shift: { pos_terminal_shift_id: 77, location_id: 2 },
                to_shift: { pos_terminal_shift_id: 78, location_id: 3 }
            }
        });

        const req = {
            validatedParams: { id: 77 },
            params: { id: 77 },
            validatedData: {
                target_location_id: 3,
                reason: 'Staff reassignment for lunch coverage',
                idempotency_key: 'shift-switch-20260409-01'
            },
            body: {},
            user: { user_id: 4, tenant_id: 'tenant-1' },
            requestId: 'req-pos-shift-switch'
        };
        const res = createRes();
        const next = jest.fn();

        await switchTerminalShiftLocation(req, res, next);

        expect(mockSwitchTerminalShiftLocationUseCase).toHaveBeenCalledWith({
            shiftId: 77,
            payload: {
                target_location_id: 3,
                reason: 'Staff reassignment for lunch coverage',
                idempotency_key: 'shift-switch-20260409-01'
            },
            user: expect.objectContaining({ user_id: 4 })
        });
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            data: expect.objectContaining({
                replay_outcome: 'processed'
            }),
            message: 'Terminal shift location switched successfully',
            timestamp: expect.any(String)
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('closeTerminalShift preserves replay metadata contract in success responses', async () => {
        mockCloseTerminalShiftUseCase.mockResolvedValue({
            success: true,
            data: {
                idempotent_replay: false,
                replay_outcome: 'processed',
                shift: { pos_terminal_shift_id: 77, status: 'closed' }
            }
        });

        const req = {
            validatedParams: { id: 77 },
            params: { id: 77 },
            validatedData: {
                idempotency_key: 'shift-close-20260409-01',
                closing_cash_amount: 1200,
                closing_note: 'End of day'
            },
            body: {},
            user: { user_id: 4, tenant_id: 'tenant-1' },
            requestId: 'req-pos-shift-close'
        };
        const res = createRes();
        const next = jest.fn();

        await closeTerminalShift(req, res, next);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            data: expect.objectContaining({
                idempotent_replay: false,
                replay_outcome: 'processed'
            }),
            message: 'Terminal shift closed successfully',
            timestamp: expect.any(String)
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('updateOnlineOrderStatus preserves replay metadata contract in success responses', async () => {
        mockUpdateOnlineOrderStatusUseCase.mockResolvedValue({
            success: true,
            data: {
                idempotent_replay: false,
                replay_outcome: 'processed',
                order: { pos_transaction_id: 89, fulfillment_status: 'confirmed' }
            }
        });

        const req = {
            validatedParams: { id: 89 },
            params: { id: 89 },
            validatedData: {
                idempotency_key: 'order-status-20260409-89',
                fulfillment_status: 'confirmed'
            },
            body: {},
            user: { user_id: 4, tenant_id: 'tenant-1' },
            requestId: 'req-pos-order-status'
        };
        const res = createRes();
        const next = jest.fn();

        await updateOnlineOrderStatus(req, res, next);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            data: expect.objectContaining({
                idempotent_replay: false,
                replay_outcome: 'processed'
            }),
            message: 'Online order status updated successfully',
            timestamp: expect.any(String)
        });
        expect(next).not.toHaveBeenCalled();
    });
});
