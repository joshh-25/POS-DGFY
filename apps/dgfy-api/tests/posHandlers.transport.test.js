import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { mockBarrel } from './helpers/esmBarrelMock.js';

const mockListPosCatalogUseCase = jest.fn();
const mockScanPosBarcodeUseCase = jest.fn();
const mockCheckoutPosUseCase = jest.fn();
const mockListPosDiscountEmployeesUseCase = jest.fn();
const mockListPosDiscountApproversUseCase = jest.fn();
const mockVerifyPosDiscountApprovalUseCase = jest.fn();
const mockListPosTransactionsUseCase = jest.fn();
const mockGetPosReportsOverviewUseCase = jest.fn();
const mockExportPosReportsUseCase = jest.fn();
const mockExportProcurementCsvUseCase = jest.fn();
const mockGetPosTransactionByIdUseCase = jest.fn();
const mockRecordFiscalPrintEventUseCase = jest.fn();
const mockVoidPosTransactionUseCase = jest.fn();
const mockCashRefundPosTransactionUseCase = jest.fn();
const mockExternalRefundPosTransactionUseCase = jest.fn();
const mockProviderRefundPosTransactionUseCase = jest.fn();
const mockSplitAllocationReversalUseCase = jest.fn();
const mockGenerateESalesReportUseCase = jest.fn();
const mockListESalesReportsUseCase = jest.fn();
const mockVerifyFiscalEventLedgerUseCase = jest.fn();
const mockUpdateESalesReportStatusUseCase = jest.fn();
const mockUpsertFiscalTerminalRegistrationUseCase = jest.fn();
const mockListFiscalTerminalRegistrationsUseCase = jest.fn();
const mockCloseDayZReadingUseCase = jest.fn();
const mockGetDailyZReadingUseCase = jest.fn();
const mockGetCurrentXReadingUseCase = jest.fn();
const mockIncrementGovernedResetCounterUseCase = jest.fn();
const mockListPosCatalogOverridesUseCase = jest.fn();
const mockUpdatePosCatalogOverrideUseCase = jest.fn();
const mockUpdateBulkPosCatalogOverridesUseCase = jest.fn();
const mockUploadPosCatalogImageUseCase = jest.fn();
const mockUploadBulkPosCatalogImagesUseCase = jest.fn();
const mockDeletePosCatalogImageUseCase = jest.fn();
const mockOpenTerminalShiftUseCase = jest.fn();
const mockCreatePosSetupCashierUseCase = jest.fn();
const mockListPosSetupCashiersUseCase = jest.fn();
const mockLoginPosCashierUseCase = jest.fn();
const mockSwitchTerminalShiftLocationUseCase = jest.fn();
const mockGetCurrentTerminalShiftUseCase = jest.fn();
const mockGetCashierShiftHistoryUseCase = jest.fn();
const mockRecordCashDrawerEventUseCase = jest.fn();
const mockCloseTerminalShiftUseCase = jest.fn();
const mockForceCloseStaleTerminalShiftUseCase = jest.fn();
const mockGetTerminalTodayDashboardUseCase = jest.fn();
const mockListIncomingOnlineOrdersUseCase = jest.fn();
const mockListOnlineOrderHistoryUseCase = jest.fn();
const mockListActiveDeliveryPersonnelUseCase = jest.fn();
const mockGetAdminLocationMonitorUseCase = jest.fn();
const mockCollectCashPickupOrderUseCase = jest.fn();
const mockCollectCashDeliveryOrderUseCase = jest.fn();
// Phase 148 (#825): the module mock enumerates every export posHandlers.js imports, so a new use
// case has to be declared here too -- otherwise the whole suite fails to link, not just the tests
// that exercise it.
const mockRecordOrderBalancePaymentUseCase = jest.fn();
const mockAssignDeliveryPersonnelUseCase = jest.fn();
const mockUpdateDeliveryJobStatusUseCase = jest.fn();
const mockUpdateOnlineOrderStatusUseCase = jest.fn();
const mockGetPosDeviceStatusUseCase = jest.fn();
const mockPrintPosReceiptUseCase = jest.fn();
const mockPrintPosShiftSummaryUseCase = jest.fn();
const mockPrintPosZReadingUseCase = jest.fn();
const mockOpenPosDrawerUseCase = jest.fn();
const mockAuthorizePosDrawerUseCase = jest.fn();
const mockVerifyPosTerminalUseCase = jest.fn();
const mockGetPairedPosTerminalUseCase = jest.fn();
const mockCreatePosParkedSaleUseCase = jest.fn();
const mockListPosParkedSalesUseCase = jest.fn();
const mockClaimPosParkedSaleUseCase = jest.fn();
const mockReparkPosParkedSaleUseCase = jest.fn();
const mockCancelPosParkedSaleUseCase = jest.fn();
const mockCreatePosPaymentSessionUseCase = jest.fn();
const mockGetPosPaymentSessionUseCase = jest.fn();
const mockGetActivePosPaymentSessionUseCase = jest.fn();
const mockAddPosPaymentAllocationUseCase = jest.fn();
const mockCancelPosPaymentAllocationUseCase = jest.fn();
const mockConfirmPosPaymentAllocationUseCase = jest.fn();
const mockReconcilePosPaymentAllocationUseCase = jest.fn();
const mockCancelPosPaymentSessionUseCase = jest.fn();
const mockCompletePosPaymentSessionUseCase = jest.fn();
const mockGetMerchantTenderReconciliationUseCase = jest.fn();
const mockReviewMerchantTenderReconciliationUseCase = jest.fn();
const mockGetCurrentPosCashierAttendanceUseCase = jest.fn();
const mockGetPosCashierAttendanceConfigUseCase = jest.fn();
const mockUpdatePosCashierAttendanceConfigUseCase = jest.fn();
const mockTimeInPosCashierAttendanceUseCase = jest.fn();
const mockTimeOutPosCashierAttendanceUseCase = jest.fn();
const mockStartPosCashierBreakUseCase = jest.fn();
const mockEndPosCashierBreakUseCase = jest.fn();
const mockStartPosCashierReliefDutyUseCase = jest.fn();
const mockEndPosCashierReliefDutyUseCase = jest.fn();
const mockCorrectPosCashierAttendanceUseCase = jest.fn();
const mockTrackProductUsageFromResult = jest.fn();

const posHandlersBarrelOverrides = {
    listPosCatalogUseCase: mockListPosCatalogUseCase,
    scanPosBarcodeUseCase: mockScanPosBarcodeUseCase,
    checkoutPosUseCase: mockCheckoutPosUseCase,
    listPosDiscountEmployeesUseCase: mockListPosDiscountEmployeesUseCase,
    listPosDiscountApproversUseCase: mockListPosDiscountApproversUseCase,
    verifyPosDiscountApprovalUseCase: mockVerifyPosDiscountApprovalUseCase,
    listPosTransactionsUseCase: mockListPosTransactionsUseCase,
    getPosReportsOverviewUseCase: mockGetPosReportsOverviewUseCase,
    exportPosReportsUseCase: mockExportPosReportsUseCase,
    exportProcurementCsvUseCase: mockExportProcurementCsvUseCase,
    getPosTransactionByIdUseCase: mockGetPosTransactionByIdUseCase,
    recordFiscalPrintEventUseCase: mockRecordFiscalPrintEventUseCase,
    voidPosTransactionUseCase: mockVoidPosTransactionUseCase,
    cashRefundPosTransactionUseCase: mockCashRefundPosTransactionUseCase,
    externalRefundPosTransactionUseCase: mockExternalRefundPosTransactionUseCase,
    providerRefundPosTransactionUseCase: mockProviderRefundPosTransactionUseCase,
    splitAllocationReversalUseCase: mockSplitAllocationReversalUseCase,
    generateESalesReportUseCase: mockGenerateESalesReportUseCase,
    listESalesReportsUseCase: mockListESalesReportsUseCase,
    verifyFiscalEventLedgerUseCase: mockVerifyFiscalEventLedgerUseCase,
    updateESalesReportStatusUseCase: mockUpdateESalesReportStatusUseCase,
    upsertFiscalTerminalRegistrationUseCase: mockUpsertFiscalTerminalRegistrationUseCase,
    listFiscalTerminalRegistrationsUseCase: mockListFiscalTerminalRegistrationsUseCase,
    closeDayZReadingUseCase: mockCloseDayZReadingUseCase,
    getDailyZReadingUseCase: mockGetDailyZReadingUseCase,
    getCurrentXReadingUseCase: mockGetCurrentXReadingUseCase,
    incrementGovernedResetCounterUseCase: mockIncrementGovernedResetCounterUseCase,
    listPosCatalogOverridesUseCase: mockListPosCatalogOverridesUseCase,
    updatePosCatalogOverrideUseCase: mockUpdatePosCatalogOverrideUseCase,
    updateBulkPosCatalogOverridesUseCase: mockUpdateBulkPosCatalogOverridesUseCase,
    uploadPosCatalogImageUseCase: mockUploadPosCatalogImageUseCase,
    uploadBulkPosCatalogImagesUseCase: mockUploadBulkPosCatalogImagesUseCase,
    deletePosCatalogImageUseCase: mockDeletePosCatalogImageUseCase,
    openTerminalShiftUseCase: mockOpenTerminalShiftUseCase,
    createPosSetupCashierUseCase: mockCreatePosSetupCashierUseCase,
    listPosSetupCashiersUseCase: mockListPosSetupCashiersUseCase,
    loginPosCashierUseCase: mockLoginPosCashierUseCase,
    switchTerminalShiftLocationUseCase: mockSwitchTerminalShiftLocationUseCase,
    getCurrentTerminalShiftUseCase: mockGetCurrentTerminalShiftUseCase,
    getCashierShiftHistoryUseCase: mockGetCashierShiftHistoryUseCase,
    recordCashDrawerEventUseCase: mockRecordCashDrawerEventUseCase,
    closeTerminalShiftUseCase: mockCloseTerminalShiftUseCase,
    forceCloseStaleTerminalShiftUseCase: mockForceCloseStaleTerminalShiftUseCase,
    getTerminalTodayDashboardUseCase: mockGetTerminalTodayDashboardUseCase,
    listIncomingOnlineOrdersUseCase: mockListIncomingOnlineOrdersUseCase,
    listOnlineOrderHistoryUseCase: mockListOnlineOrderHistoryUseCase,
    listActiveDeliveryPersonnelUseCase: mockListActiveDeliveryPersonnelUseCase,
    getAdminLocationMonitorUseCase: mockGetAdminLocationMonitorUseCase,
    collectCashPickupOrderUseCase: mockCollectCashPickupOrderUseCase,
    collectCashDeliveryOrderUseCase: mockCollectCashDeliveryOrderUseCase,
    recordOrderBalancePaymentUseCase: mockRecordOrderBalancePaymentUseCase,
    assignDeliveryPersonnelUseCase: mockAssignDeliveryPersonnelUseCase,
    updateDeliveryJobStatusUseCase: mockUpdateDeliveryJobStatusUseCase,
    updateOnlineOrderStatusUseCase: mockUpdateOnlineOrderStatusUseCase,
    getPosDeviceStatusUseCase: mockGetPosDeviceStatusUseCase,
    printPosReceiptUseCase: mockPrintPosReceiptUseCase,
    printPosShiftSummaryUseCase: mockPrintPosShiftSummaryUseCase,
    printPosZReadingUseCase: mockPrintPosZReadingUseCase,
    openPosDrawerUseCase: mockOpenPosDrawerUseCase,
    authorizePosDrawerUseCase: mockAuthorizePosDrawerUseCase,
    verifyPosTerminalUseCase: mockVerifyPosTerminalUseCase,
    getPairedPosTerminalUseCase: mockGetPairedPosTerminalUseCase,
    createPosParkedSaleUseCase: mockCreatePosParkedSaleUseCase,
    listPosParkedSalesUseCase: mockListPosParkedSalesUseCase,
    claimPosParkedSaleUseCase: mockClaimPosParkedSaleUseCase,
    reparkPosParkedSaleUseCase: mockReparkPosParkedSaleUseCase,
    cancelPosParkedSaleUseCase: mockCancelPosParkedSaleUseCase,
    createPosPaymentSessionUseCase: mockCreatePosPaymentSessionUseCase,
    getPosPaymentSessionUseCase: mockGetPosPaymentSessionUseCase,
    getActivePosPaymentSessionUseCase: mockGetActivePosPaymentSessionUseCase,
    addPosPaymentAllocationUseCase: mockAddPosPaymentAllocationUseCase,
    cancelPosPaymentAllocationUseCase: mockCancelPosPaymentAllocationUseCase,
    confirmPosPaymentAllocationUseCase: mockConfirmPosPaymentAllocationUseCase,
    reconcilePosPaymentAllocationUseCase: mockReconcilePosPaymentAllocationUseCase,
    cancelPosPaymentSessionUseCase: mockCancelPosPaymentSessionUseCase,
    completePosPaymentSessionUseCase: mockCompletePosPaymentSessionUseCase,
    getMerchantTenderReconciliationUseCase: mockGetMerchantTenderReconciliationUseCase,
    reviewMerchantTenderReconciliationUseCase: mockReviewMerchantTenderReconciliationUseCase,
    getCurrentPosCashierAttendanceUseCase: mockGetCurrentPosCashierAttendanceUseCase,
    getPosCashierAttendanceConfigUseCase: mockGetPosCashierAttendanceConfigUseCase,
    updatePosCashierAttendanceConfigUseCase: mockUpdatePosCashierAttendanceConfigUseCase,
    timeInPosCashierAttendanceUseCase: mockTimeInPosCashierAttendanceUseCase,
    timeOutPosCashierAttendanceUseCase: mockTimeOutPosCashierAttendanceUseCase,
    startPosCashierBreakUseCase: mockStartPosCashierBreakUseCase,
    endPosCashierBreakUseCase: mockEndPosCashierBreakUseCase,
    startPosCashierReliefDutyUseCase: mockStartPosCashierReliefDutyUseCase,
    endPosCashierReliefDutyUseCase: mockEndPosCashierReliefDutyUseCase,
    correctPosCashierAttendanceUseCase: mockCorrectPosCashierAttendanceUseCase,
};

mockBarrel(jest, '../src/modules/pos/index.js', {
    from: import.meta.url,
    overrides: posHandlersBarrelOverrides
});

jest.unstable_mockModule('../src/services/productUsageTelemetryService.js', () => ({
    trackProductUsageFromResult: mockTrackProductUsageFromResult
}));

let listCatalog;
let checkout;
let voidTransaction;
let listTransactions;
let getReportsOverview;
let exportReports;
let exportProcurementCsv;
let closeDayZReading;
let getCurrentXReading;
let incrementGovernedResetCounter;
let openTerminalShift;
let switchTerminalShiftLocation;
let recordCashDrawerEvent;
let closeTerminalShift;
let forceCloseStaleTerminalShift;
let getAdminLocationMonitor;
let listActiveDeliveryPersonnel;
let listOnlineOrderHistory;
let collectCashDeliveryOrder;
let assignDeliveryPersonnel;
let updateDeliveryJobStatus;
let updateOnlineOrderStatus;
let uploadCatalogImage;

beforeAll(async () => {
    const mod = await import('../src/modules/pos/controllers/posHandlers.js');
    listCatalog = mod.listCatalog;
    uploadCatalogImage = mod.uploadCatalogImage;
    checkout = mod.checkout;
    voidTransaction = mod.voidTransaction;
    listTransactions = mod.listTransactions;
    getReportsOverview = mod.getReportsOverview;
    exportReports = mod.exportReports;
    exportProcurementCsv = mod.exportProcurementCsv;
    closeDayZReading = mod.closeDayZReading;
    getCurrentXReading = mod.getCurrentXReading;
    incrementGovernedResetCounter = mod.incrementGovernedResetCounter;
    openTerminalShift = mod.openTerminalShift;
    switchTerminalShiftLocation = mod.switchTerminalShiftLocation;
    recordCashDrawerEvent = mod.recordCashDrawerEvent;
    closeTerminalShift = mod.closeTerminalShift;
    forceCloseStaleTerminalShift = mod.forceCloseStaleTerminalShift;
    getAdminLocationMonitor = mod.getAdminLocationMonitor;
    listActiveDeliveryPersonnel = mod.listActiveDeliveryPersonnel;
    listOnlineOrderHistory = mod.listOnlineOrderHistory;
    collectCashDeliveryOrder = mod.collectCashDeliveryOrder;
    assignDeliveryPersonnel = mod.assignDeliveryPersonnel;
    updateDeliveryJobStatus = mod.updateDeliveryJobStatus;
    updateOnlineOrderStatus = mod.updateOnlineOrderStatus;
});

const createRes = () => {
    const res = {
        locals: {},
        status: jest.fn(),
        json: jest.fn(),
        send: jest.fn(),
        setHeader: jest.fn()
    };
    res.status.mockReturnValue(res);
    res.send.mockReturnValue(res);
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

    it('voidTransaction uses the registered terminal identity when the request body omits it', async () => {
        mockVoidPosTransactionUseCase.mockResolvedValue({
            success: true,
            data: { transaction: { pos_transaction_id: 178 } }
        });

        const req = {
            validatedData: { reason: 'Manager correction' },
            body: {},
            params: { id: '178' },
            validatedParams: { id: 178 },
            posTerminalRegistration: { terminal_id: 'POS-02', location_id: 9 },
            user: { user_id: 99, role: 'admin', permissions: ['pos:void'] }
        };
        const res = createRes();
        const next = jest.fn();

        await voidTransaction(req, res, next);

        expect(mockVoidPosTransactionUseCase).toHaveBeenCalledWith({
            posTransactionId: 178,
            payload: {
                reason: 'Manager correction',
                terminal_id: 'POS-02',
                terminal_location_id: 9
            },
            user: req.user
        });
        expect(res.status).toHaveBeenCalledWith(200);
        expect(next).not.toHaveBeenCalled();
    });

    it('voidTransaction overrides client-supplied terminal scope with the registered terminal', async () => {
        mockVoidPosTransactionUseCase.mockResolvedValue({
            success: true,
            data: { transaction: { pos_transaction_id: 179 } }
        });

        const req = {
            validatedData: {
                reason: 'Manager correction',
                terminal_id: 'CLIENT-SUPPLIED',
                terminal_location_id: 1
            },
            body: {},
            params: { id: '179' },
            validatedParams: { id: 179 },
            posTerminalRegistration: { terminal_id: 'POS-02', location_id: 9 },
            user: { user_id: 99, role: 'admin', permissions: ['pos:void'] }
        };
        const res = createRes();

        await voidTransaction(req, res, jest.fn());

        expect(mockVoidPosTransactionUseCase).toHaveBeenCalledWith({
            posTransactionId: 179,
            payload: {
                reason: 'Manager correction',
                terminal_id: 'POS-02',
                terminal_location_id: 9
            },
            user: req.user
        });
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
            user: expect.objectContaining({ user_id: 4 }),
            operatorSessionId: null
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

    it('listOnlineOrderHistory returns the paginated POS history payload', async () => {
        mockListOnlineOrderHistoryUseCase.mockResolvedValue({
            success: true,
            data: {
                orders: [{ pos_transaction_id: 44, fulfillment_status: 'rejected', payment_status: 'unpaid' }],
                pagination: { page: 2, limit: 25, total: 26, totalPages: 2 }
            }
        });

        const req = {
            query: {},
            validatedQuery: {
                location_id: 7,
                search: 'INV-000044',
                fulfillment_status: 'rejected',
                payment_status: 'unpaid',
                page: 2,
                limit: 25
            },
            user: { user_id: 4, tenant_id: 'tenant-1' },
            requestId: 'req-pos-order-history'
        };
        const res = createRes();
        const next = jest.fn();

        await listOnlineOrderHistory(req, res, next);

        expect(mockListOnlineOrderHistoryUseCase).toHaveBeenCalledWith({
            query: req.validatedQuery,
            user: req.user
        });
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            data: expect.objectContaining({
                orders: expect.arrayContaining([
                    expect.objectContaining({ pos_transaction_id: 44, fulfillment_status: 'rejected' })
                ]),
                pagination: { page: 2, limit: 25, total: 26, totalPages: 2 }
            }),
            timestamp: expect.any(String)
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('listOnlineOrderHistory preserves the standardized failure payload', async () => {
        mockListOnlineOrderHistoryUseCase.mockResolvedValue({
            success: false,
            error: {
                code: 'AUTHORIZATION_FAILED',
                message: 'POS view permission is required',
                details: null,
                statusCode: 403
            }
        });

        const req = {
            query: {},
            validatedQuery: {},
            user: { user_id: 4, tenant_id: 'tenant-1' },
            requestId: 'req-pos-order-history-forbidden'
        };
        const res = createRes();
        const next = jest.fn();

        await listOnlineOrderHistory(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({
            success: false,
            data: null,
            message: 'POS view permission is required',
            error_code: 'AUTHORIZATION_FAILED',
            errors: null,
            request_id: 'req-pos-order-history-forbidden',
            timestamp: expect.any(String)
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('getReportsOverview returns success payload contract', async () => {
        mockGetPosReportsOverviewUseCase.mockResolvedValue({
            success: true,
            data: {
                summary_cards: { total_sales: 1000, total_transactions: 5, gross_sales: 1000, pos_profit_loss: 400 },
                daily_report: { summary: {}, top_items: [] }
            }
        });

        const req = {
            query: { granularity: 'daily', date_from: '2026-07-01', date_to: '2026-07-06' },
            validatedQuery: { granularity: 'daily', date_from: '2026-07-01', date_to: '2026-07-06' },
            user: { user_id: 4, tenant_id: 'tenant-1' },
            requestId: 'req-pos-reports-overview'
        };
        const res = createRes();
        const next = jest.fn();

        await getReportsOverview(req, res, next);

        expect(mockGetPosReportsOverviewUseCase).toHaveBeenCalledWith({
            query: req.validatedQuery,
            user: req.user
        });
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            data: expect.objectContaining({
                summary_cards: expect.objectContaining({ total_sales: 1000 })
            }),
            timestamp: expect.any(String)
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('getReportsOverview returns standardized error payload', async () => {
        mockGetPosReportsOverviewUseCase.mockResolvedValue({
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
            requestId: 'req-pos-reports-overview-error'
        };
        const res = createRes();
        const next = jest.fn();

        await getReportsOverview(req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            success: false,
            data: null,
            message: 'query must be an object',
            error_code: 'VALIDATION_FAILED',
            errors: null,
            request_id: 'req-pos-reports-overview-error',
            timestamp: expect.any(String)
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('exportReports streams a CSV response with headers', async () => {
        mockExportPosReportsUseCase.mockResolvedValue({
            success: true,
            data: {
                filename: 'pos-daily-report-2026-07-01_to_2026-07-06.csv',
                content_type: 'text/csv; charset=utf-8',
                content: '"Metric","Value"\n"Gross Sales",1000'
            }
        });

        const req = {
            query: { granularity: 'daily', date_from: '2026-07-01', date_to: '2026-07-06', section: 'daily' },
            validatedQuery: { granularity: 'daily', date_from: '2026-07-01', date_to: '2026-07-06', section: 'daily' },
            user: { user_id: 4, tenant_id: 'tenant-1' },
            requestId: 'req-pos-reports-export'
        };
        const res = createRes();
        res.setHeader = jest.fn();
        res.send = jest.fn();
        const next = jest.fn();

        await exportReports(req, res, next);

        expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
        expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="pos-daily-report-2026-07-01_to_2026-07-06.csv"');
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.send).toHaveBeenCalledWith('"Metric","Value"\n"Gross Sales",1000');
        expect(next).not.toHaveBeenCalled();
    });

    it('exportReports returns standardized error payload on failure', async () => {
        mockExportPosReportsUseCase.mockResolvedValue({
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
            requestId: 'req-pos-reports-export-error'
        };
        const res = createRes();
        res.setHeader = jest.fn();
        res.send = jest.fn();
        const next = jest.fn();

        await exportReports(req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            success: false,
            message: 'query must be an object',
            error_code: 'VALIDATION_FAILED',
            request_id: 'req-pos-reports-export-error'
        }));
        expect(res.send).not.toHaveBeenCalled();
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

    it('getReportsOverview returns stable analytics payload', async () => {
        mockGetPosReportsOverviewUseCase.mockResolvedValue({
            success: true,
            data: {
                summary_cards: {
                    total_sales: 999,
                    total_transactions: 8,
                    gross_sales: 1100,
                    net_sales: 999,
                    pos_profit_loss: 321
                }
            }
        });

        const req = {
            validatedQuery: { date_from: '2026-06-01', date_to: '2026-06-22', location_id: 4, source: 'in_store' },
            query: {},
            user: { user_id: 11, tenant_id: 'tenant-1' },
            requestId: 'req-pos-reports-overview'
        };
        const res = createRes();
        const next = jest.fn();

        await getReportsOverview(req, res, next);

        expect(mockGetPosReportsOverviewUseCase).toHaveBeenCalledWith({
            query: { date_from: '2026-06-01', date_to: '2026-06-22', location_id: 4, source: 'in_store' },
            user: expect.objectContaining({ user_id: 11 })
        });
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            data: {
                summary_cards: {
                    total_sales: 999,
                    total_transactions: 8,
                    gross_sales: 1100,
                    net_sales: 999,
                    pos_profit_loss: 321
                }
            },
            timestamp: expect.any(String)
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('exportReports writes CSV response headers and body', async () => {
        mockExportPosReportsUseCase.mockResolvedValue({
            success: true,
            data: {
                filename: 'pos-daily-report.csv',
                content_type: 'text/csv; charset=utf-8',
                content: '"Metric","Value"\n"Gross Sales","1000"'
            }
        });

        const req = {
            validatedQuery: { section: 'daily', date_from: '2026-06-22', date_to: '2026-06-22', location_id: 4 },
            query: {},
            user: { user_id: 11, tenant_id: 'tenant-1' },
            requestId: 'req-pos-reports-export'
        };
        const res = createRes();
        const next = jest.fn();

        await exportReports(req, res, next);

        expect(mockExportPosReportsUseCase).toHaveBeenCalledWith({
            query: { section: 'daily', date_from: '2026-06-22', date_to: '2026-06-22', location_id: 4 },
            user: expect.objectContaining({ user_id: 11 })
        });
        expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
        expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="pos-daily-report.csv"');
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.send).toHaveBeenCalledWith('"Metric","Value"\n"Gross Sales","1000"');
        expect(next).not.toHaveBeenCalled();
    });

    it('exportProcurementCsv writes CSV response headers and body', async () => {
        mockExportProcurementCsvUseCase.mockResolvedValue({
            success: true,
            data: {
                filename: 'pos-procurement-export-2026-09-03.csv',
                content_type: 'text/csv; charset=utf-8',
                content: '"Order #","Order Date"\n"INV-001","2026-09-01T08:00:00.000Z"'
            }
        });

        const req = {
            validatedQuery: { location_id: 4 },
            query: {},
            user: { user_id: 11, tenant_id: 'tenant-1' },
            requestId: 'req-pos-procurement-export'
        };
        const res = createRes();
        const next = jest.fn();

        await exportProcurementCsv(req, res, next);

        expect(mockExportProcurementCsvUseCase).toHaveBeenCalledWith({
            query: { location_id: 4 },
            user: expect.objectContaining({ user_id: 11 })
        });
        expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
        expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="pos-procurement-export-2026-09-03.csv"');
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.send).toHaveBeenCalledWith('"Order #","Order Date"\n"INV-001","2026-09-01T08:00:00.000Z"');
        expect(next).not.toHaveBeenCalled();
    });

    it('exportProcurementCsv returns standardized error payload on failure', async () => {
        mockExportProcurementCsvUseCase.mockResolvedValue({
            success: false,
            error: {
                code: 'VALIDATION_FAILED',
                message: 'location_id must be a positive integer',
                details: null,
                statusCode: 422
            }
        });

        const req = {
            query: {},
            validatedQuery: { location_id: 'abc' },
            user: { user_id: 4, tenant_id: 'tenant-1' },
            requestId: 'req-pos-procurement-export-error'
        };
        const res = createRes();
        res.setHeader = jest.fn();
        res.send = jest.fn();
        const next = jest.fn();

        await exportProcurementCsv(req, res, next);

        expect(res.status).toHaveBeenCalledWith(422);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            success: false,
            message: 'location_id must be a positive integer',
            error_code: 'VALIDATION_FAILED',
            request_id: 'req-pos-procurement-export-error'
        }));
        expect(res.send).not.toHaveBeenCalled();
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

    it('forceCloseStaleTerminalShift forwards the recovery evidence contract', async () => {
        mockForceCloseStaleTerminalShiftUseCase.mockResolvedValue({
            success: true,
            data: {
                idempotent_replay: false,
                replay_outcome: 'processed',
                shift: { pos_terminal_shift_id: 77, status: 'closed' },
                recovery_authorization: {
                    shift_cashier_id: 4,
                    authorization_mode: 'master_admin_stale_recovery'
                }
            }
        });

        const req = {
            validatedParams: { id: 77 },
            params: { id: 77 },
            validatedData: {
                idempotency_key: 'stale-shift-recovery-77',
                closing_cash_amount: 1200,
                reason: 'Operator left without closing'
            },
            body: {},
            user: { user_id: 1, tenant_id: 'tenant-1', is_master_admin: true },
            requestId: 'req-pos-stale-shift-recovery'
        };
        const res = createRes();
        const next = jest.fn();

        await forceCloseStaleTerminalShift(req, res, next);

        expect(mockForceCloseStaleTerminalShiftUseCase).toHaveBeenCalledWith({
            shiftId: 77,
            payload: expect.objectContaining({
                idempotency_key: 'stale-shift-recovery-77',
                closing_cash_amount: 1200
            }),
            user: expect.objectContaining({ user_id: 1 })
        });
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            data: expect.objectContaining({
                replay_outcome: 'processed'
            }),
            message: 'Stale terminal shift recovered successfully',
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

    it('collectCashDeliveryOrder returns the delivery cash collection contract', async () => {
        mockCollectCashDeliveryOrderUseCase.mockResolvedValue({
            success: true,
            data: {
                idempotent_replay: false,
                replay_outcome: 'processed',
                collection: { order_method: 'delivery', payment_timing: 'on_delivery' }
            }
        });

        const req = {
            validatedParams: { id: 89 },
            params: { id: 89 },
            validatedData: {
                idempotency_key: 'delivery-cash-20260409-89',
                terminal_id: 'COUNTER-01',
                cash_received: 200
            },
            body: {},
            user: { user_id: 4, tenant_id: 'tenant-1' },
            ip: '127.0.0.1',
            get: jest.fn(() => 'test-agent'),
            requestId: 'req-pos-delivery-cash'
        };
        const res = createRes();
        const next = jest.fn();

        await collectCashDeliveryOrder(req, res, next);

        expect(mockCollectCashDeliveryOrderUseCase).toHaveBeenCalledWith({
            posTransactionId: 89,
            payload: req.validatedData,
            user: req.user,
            auditContext: {
                ipAddress: '127.0.0.1',
                userAgent: 'test-agent'
            }
        });
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            data: expect.objectContaining({
                idempotent_replay: false,
                replay_outcome: 'processed'
            }),
            message: 'Cash payment collected for delivery order.',
            timestamp: expect.any(String)
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('listActiveDeliveryPersonnel returns the scoped registry contract', async () => {
        mockListActiveDeliveryPersonnelUseCase.mockResolvedValue({
            success: true,
            data: {
                location_id: 7,
                delivery_personnel: [{ delivery_personnel_id: 21, display_name: 'Branch Rider' }]
            }
        });

        const req = {
            validatedQuery: { location_id: 7 },
            query: {},
            user: { user_id: 4, tenant_id: 'tenant-1' }
        };
        const res = createRes();
        const next = jest.fn();

        await listActiveDeliveryPersonnel(req, res, next);

        expect(mockListActiveDeliveryPersonnelUseCase).toHaveBeenCalledWith({
            query: { location_id: 7 },
            user: req.user
        });
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            data: expect.objectContaining({
                location_id: 7,
                delivery_personnel: expect.any(Array)
            }),
            timestamp: expect.any(String)
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('assignDeliveryPersonnel returns the accountable assignment contract', async () => {
        mockAssignDeliveryPersonnelUseCase.mockResolvedValue({
            success: true,
            data: {
                idempotent_replay: false,
                replay_outcome: 'processed',
                delivery_job: { status: 'assigned', delivery_personnel_id: 21 },
                assignment: { assigned_shift_id: 77 }
            }
        });

        const req = {
            validatedParams: { id: 89 },
            params: { id: 89 },
            validatedData: {
                idempotency_key: 'delivery-assignment-20260808-89',
                delivery_personnel_id: 21
            },
            body: {},
            user: { user_id: 4, tenant_id: 'tenant-1' },
            ip: '127.0.0.1',
            get: jest.fn(() => 'test-agent')
        };
        const res = createRes();
        const next = jest.fn();

        await assignDeliveryPersonnel(req, res, next);

        expect(mockAssignDeliveryPersonnelUseCase).toHaveBeenCalledWith({
            posTransactionId: 89,
            payload: req.validatedData,
            user: req.user,
            auditContext: {
                ipAddress: '127.0.0.1',
                userAgent: 'test-agent'
            }
        });
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            data: expect.objectContaining({
                idempotent_replay: false,
                delivery_job: expect.objectContaining({ status: 'assigned' })
            }),
            message: 'Delivery personnel assigned successfully.',
            timestamp: expect.any(String)
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('updateDeliveryJobStatus returns the guarded manual delivery lifecycle contract', async () => {
        mockUpdateDeliveryJobStatusUseCase.mockResolvedValue({
            success: true,
            data: {
                idempotent_replay: false,
                replay_outcome: 'processed',
                delivery_job: { status: 'delivered' },
                status_transition: { current_status: 'picked_up', requested_status: 'delivered' }
            }
        });

        const req = {
            validatedParams: { id: 89 },
            params: { id: 89 },
            validatedData: {
                idempotency_key: 'delivery-job-20260409-89',
                status: 'delivered'
            },
            body: {},
            user: { user_id: 4, tenant_id: 'tenant-1' },
            ip: '127.0.0.1',
            get: jest.fn(() => 'test-agent'),
            requestId: 'req-pos-delivery-job'
        };
        const res = createRes();
        const next = jest.fn();

        await updateDeliveryJobStatus(req, res, next);

        expect(mockUpdateDeliveryJobStatusUseCase).toHaveBeenCalledWith({
            posTransactionId: 89,
            payload: req.validatedData,
            user: req.user,
            auditContext: {
                ipAddress: '127.0.0.1',
                userAgent: 'test-agent'
            }
        });
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            data: expect.objectContaining({
                idempotent_replay: false,
                delivery_job: { status: 'delivered' }
            }),
            message: 'Delivery job status updated successfully.',
            timestamp: expect.any(String)
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('getAdminLocationMonitor returns branch monitoring data without changing shift ownership', async () => {
        mockGetAdminLocationMonitorUseCase.mockResolvedValue({
            success: true,
            data: {
                location_id: 3,
                orders: [{ pos_transaction_id: 89 }],
                terminal_shifts: [{ pos_terminal_shift_id: 77 }]
            }
        });

        const req = {
            validatedQuery: { location_id: 3 },
            query: {},
            user: { user_id: 4, tenant_id: 'tenant-1', role: 'admin' },
            requestId: 'req-pos-admin-monitor'
        };
        const res = createRes();
        const next = jest.fn();

        await getAdminLocationMonitor(req, res, next);

        expect(mockGetAdminLocationMonitorUseCase).toHaveBeenCalledWith({
            query: { location_id: 3 },
            user: expect.objectContaining({ user_id: 4 })
        });
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            data: expect.objectContaining({
                location_id: 3,
                orders: expect.any(Array),
                terminal_shifts: expect.any(Array)
            }),
            timestamp: expect.any(String)
        });
        expect(next).not.toHaveBeenCalled();
    });

    // Phase 299 (#265): uploadCatalogImage's route now parses via multer .fields(), so the
    // controller reads req.files (not req.file) and forwards a parsed client_image_manifest.
    describe('uploadCatalogImage -- .fields() multipart transport (#265 Phase 299)', () => {
        it('forwards the required image plus optional client-derived variants and manifest', async () => {
            mockUploadPosCatalogImageUseCase.mockResolvedValue({
                success: true,
                data: { item_id: 42, pos_image_url: '/uploads/pos.webp' }
            });

            const imageFile = { path: '/tmp/image.jpg', originalname: 'image.jpg', mimetype: 'image/jpeg', size: 1000 };
            const mediumFile = { path: '/tmp/medium.webp', originalname: 'medium.webp', mimetype: 'image/webp', size: 200 };
            const thumbnailFile = { path: '/tmp/thumb.webp', originalname: 'thumb.webp', mimetype: 'image/webp', size: 50 };
            const req = {
                validatedParams: { item_id: 42 },
                params: { item_id: '42' },
                files: { image: [imageFile], image_medium: [mediumFile], image_thumbnail: [thumbnailFile] },
                body: { client_image_manifest: JSON.stringify({ source_mime_hint: 'image/png', large_pre_optimized: true }) },
                user: { user_id: 1, is_master_admin: true, permissions: ['items:edit'] }
            };
            const res = createRes();
            const next = jest.fn();

            await uploadCatalogImage(req, res, next);

            expect(mockUploadPosCatalogImageUseCase).toHaveBeenCalledWith({
                itemId: 42,
                files: { image: [imageFile], image_medium: [mediumFile], image_thumbnail: [thumbnailFile] },
                clientImageManifest: { sourceMimeHint: 'image/png', largePreOptimized: true },
                user: req.user
            });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(next).not.toHaveBeenCalled();
        });

        it('still works with only the required image field present (no variants, no manifest)', async () => {
            mockUploadPosCatalogImageUseCase.mockResolvedValue({
                success: true,
                data: { item_id: 43, pos_image_url: '/uploads/pos.webp' }
            });

            const imageFile = { path: '/tmp/image-only.jpg', originalname: 'image-only.jpg', mimetype: 'image/jpeg', size: 1000 };
            const req = {
                validatedParams: { item_id: 43 },
                params: { item_id: '43' },
                files: { image: [imageFile] },
                body: {},
                user: { user_id: 1, is_master_admin: true, permissions: ['items:edit'] }
            };
            const res = createRes();
            const next = jest.fn();

            await uploadCatalogImage(req, res, next);

            expect(mockUploadPosCatalogImageUseCase).toHaveBeenCalledWith({
                itemId: 43,
                files: { image: [imageFile] },
                clientImageManifest: null,
                user: req.user
            });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(next).not.toHaveBeenCalled();
        });

        it('ignores a malformed client_image_manifest rather than failing the request', async () => {
            mockUploadPosCatalogImageUseCase.mockResolvedValue({
                success: true,
                data: { item_id: 44, pos_image_url: '/uploads/pos.webp' }
            });

            const imageFile = { path: '/tmp/image-bad-manifest.jpg', originalname: 'image.jpg', mimetype: 'image/jpeg', size: 1000 };
            const req = {
                validatedParams: { item_id: 44 },
                params: { item_id: '44' },
                files: { image: [imageFile] },
                body: { client_image_manifest: '{not valid json' },
                user: { user_id: 1, is_master_admin: true, permissions: ['items:edit'] }
            };
            const res = createRes();
            const next = jest.fn();

            await uploadCatalogImage(req, res, next);

            expect(mockUploadPosCatalogImageUseCase).toHaveBeenCalledWith({
                itemId: 44,
                files: { image: [imageFile] },
                clientImageManifest: null,
                user: req.user
            });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(next).not.toHaveBeenCalled();
        });
    });
});
