import { jest } from '@jest/globals';

const mockListPosCatalogUseCase = jest.fn();
const mockCheckoutPosUseCase = jest.fn();
const mockListPosTransactionsUseCase = jest.fn();
const mockGetPosTransactionByIdUseCase = jest.fn();
const mockCloseDayZReadingUseCase = jest.fn();
const mockGetDailyZReadingUseCase = jest.fn();
const mockListPosCatalogOverridesUseCase = jest.fn();
const mockUpdatePosCatalogOverrideUseCase = jest.fn();
const mockUploadPosCatalogImageUseCase = jest.fn();
const mockDeletePosCatalogImageUseCase = jest.fn();
const mockOpenTerminalShiftUseCase = jest.fn();
const mockGetCurrentTerminalShiftUseCase = jest.fn();
const mockRecordCashDrawerEventUseCase = jest.fn();
const mockCloseTerminalShiftUseCase = jest.fn();
const mockGetTerminalTodayDashboardUseCase = jest.fn();
const mockTrackProductUsageFromResult = jest.fn();

jest.unstable_mockModule('../src/modules/pos/index.js', () => ({
    listPosCatalogUseCase: mockListPosCatalogUseCase,
    checkoutPosUseCase: mockCheckoutPosUseCase,
    listPosTransactionsUseCase: mockListPosTransactionsUseCase,
    getPosTransactionByIdUseCase: mockGetPosTransactionByIdUseCase,
    closeDayZReadingUseCase: mockCloseDayZReadingUseCase,
    getDailyZReadingUseCase: mockGetDailyZReadingUseCase,
    listPosCatalogOverridesUseCase: mockListPosCatalogOverridesUseCase,
    updatePosCatalogOverrideUseCase: mockUpdatePosCatalogOverrideUseCase,
    uploadPosCatalogImageUseCase: mockUploadPosCatalogImageUseCase,
    deletePosCatalogImageUseCase: mockDeletePosCatalogImageUseCase,
    openTerminalShiftUseCase: mockOpenTerminalShiftUseCase,
    getCurrentTerminalShiftUseCase: mockGetCurrentTerminalShiftUseCase,
    recordCashDrawerEventUseCase: mockRecordCashDrawerEventUseCase,
    closeTerminalShiftUseCase: mockCloseTerminalShiftUseCase,
    getTerminalTodayDashboardUseCase: mockGetTerminalTodayDashboardUseCase
}));

jest.unstable_mockModule('../src/services/productUsageTelemetryService.js', () => ({
    trackProductUsageFromResult: mockTrackProductUsageFromResult
}));

let listCatalog;
let checkout;
let listTransactions;
let closeDayZReading;

beforeAll(async () => {
    const mod = await import('../src/modules/pos/controllers/posHandlers.js');
    listCatalog = mod.listCatalog;
    checkout = mod.checkout;
    listTransactions = mod.listTransactions;
    closeDayZReading = mod.closeDayZReading;
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

        const req = { query: {}, validatedQuery: { search: '', folder_id: 7, limit: 100 }, requestId: 'req-pos-catalog' };
        const res = createRes();
        const next = jest.fn();

        await listCatalog(req, res, next);

        expect(mockListPosCatalogUseCase).toHaveBeenCalledWith({ query: { search: '', folder_id: 7, limit: 100 } });
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
});
