import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockGetPosDeviceStatusUseCase = jest.fn();

// posHandlers.js is a wide barrel importing every POS use case by name; only
// getDeviceStatus is exercised here, but the module mock must still provide a
// stub for every named export it destructures at import time.
jest.unstable_mockModule('../src/modules/pos/index.js', () => ({
    verifyPosTerminalUseCase: jest.fn(),
    listPosCatalogUseCase: jest.fn(),
    scanPosBarcodeUseCase: jest.fn(),
    checkoutPosUseCase: jest.fn(),
    listPosDiscountApproversUseCase: jest.fn(),
    verifyPosDiscountApprovalUseCase: jest.fn(),
    listPosTransactionsUseCase: jest.fn(),
    getPosReportsOverviewUseCase: jest.fn(),
    exportPosReportsUseCase: jest.fn(),
    getPosTransactionByIdUseCase: jest.fn(),
    recordFiscalPrintEventUseCase: jest.fn(),
    voidPosTransactionUseCase: jest.fn(),
    cashRefundPosTransactionUseCase: jest.fn(),
    externalRefundPosTransactionUseCase: jest.fn(),
    providerRefundPosTransactionUseCase: jest.fn(),
    splitAllocationReversalUseCase: jest.fn(),
    generateESalesReportUseCase: jest.fn(),
    listESalesReportsUseCase: jest.fn(),
    verifyFiscalEventLedgerUseCase: jest.fn(),
    updateESalesReportStatusUseCase: jest.fn(),
    upsertFiscalTerminalRegistrationUseCase: jest.fn(),
    listFiscalTerminalRegistrationsUseCase: jest.fn(),
    closeDayZReadingUseCase: jest.fn(),
    getDayCloseReadinessUseCase: jest.fn(),
    getDailyZReadingUseCase: jest.fn(),
    getCurrentXReadingUseCase: jest.fn(),
    incrementGovernedResetCounterUseCase: jest.fn(),
    listPosCatalogOverridesUseCase: jest.fn(),
    updatePosCatalogOverrideUseCase: jest.fn(),
    updateBulkPosCatalogOverridesUseCase: jest.fn(),
    uploadPosCatalogImageUseCase: jest.fn(),
    uploadBulkPosCatalogImagesUseCase: jest.fn(),
    deletePosCatalogImageUseCase: jest.fn(),
    openTerminalShiftUseCase: jest.fn(),
    createPosSetupCashierUseCase: jest.fn(),
    listPosSetupCashiersUseCase: jest.fn(),
    loginPosCashierUseCase: jest.fn(),
    switchTerminalShiftLocationUseCase: jest.fn(),
    getCurrentTerminalShiftUseCase: jest.fn(),
    getCashierShiftHistoryUseCase: jest.fn(),
    recordCashDrawerEventUseCase: jest.fn(),
    closeTerminalShiftUseCase: jest.fn(),
    forceCloseStaleTerminalShiftUseCase: jest.fn(),
    getTerminalTodayDashboardUseCase: jest.fn(),
    listIncomingOnlineOrdersUseCase: jest.fn(),
    listOnlineOrderHistoryUseCase: jest.fn(),
    listActiveDeliveryPersonnelUseCase: jest.fn(),
    getAdminLocationMonitorUseCase: jest.fn(),
    collectCashPickupOrderUseCase: jest.fn(),
    collectCashDeliveryOrderUseCase: jest.fn(),
    assignDeliveryPersonnelUseCase: jest.fn(),
    updateDeliveryJobStatusUseCase: jest.fn(),
    updateOnlineOrderStatusUseCase: jest.fn(),
    getPosDeviceStatusUseCase: mockGetPosDeviceStatusUseCase,
    printPosReceiptUseCase: jest.fn(),
    printPosShiftSummaryUseCase: jest.fn(),
    printPosZReadingUseCase: jest.fn(),
    openPosDrawerUseCase: jest.fn(),
    authorizePosDrawerUseCase: jest.fn(),
    getPairedPosTerminalUseCase: jest.fn(),
    createPosParkedSaleUseCase: jest.fn(),
    listPosParkedSalesUseCase: jest.fn(),
    claimPosParkedSaleUseCase: jest.fn(),
    reparkPosParkedSaleUseCase: jest.fn(),
    cancelPosParkedSaleUseCase: jest.fn(),
    createPosPaymentSessionUseCase: jest.fn(),
    getPosPaymentSessionUseCase: jest.fn(),
    getActivePosPaymentSessionUseCase: jest.fn(),
    addPosPaymentAllocationUseCase: jest.fn(),
    cancelPosPaymentAllocationUseCase: jest.fn(),
    confirmPosPaymentAllocationUseCase: jest.fn(),
    reconcilePosPaymentAllocationUseCase: jest.fn(),
    cancelPosPaymentSessionUseCase: jest.fn(),
    completePosPaymentSessionUseCase: jest.fn(),
    getMerchantTenderReconciliationUseCase: jest.fn(),
    reviewMerchantTenderReconciliationUseCase: jest.fn(),
    getCurrentPosCashierAttendanceUseCase: jest.fn(),
    timeInPosCashierAttendanceUseCase: jest.fn(),
    timeOutPosCashierAttendanceUseCase: jest.fn(),
    startPosCashierBreakUseCase: jest.fn(),
    endPosCashierBreakUseCase: jest.fn(),
    startPosCashierReliefDutyUseCase: jest.fn(),
    endPosCashierReliefDutyUseCase: jest.fn(),
    correctPosCashierAttendanceUseCase: jest.fn(),
    // Phase 148 (#825): this module mock enumerates every named export modules/pos/index.js
    // provides, so a new use case has to be declared here too or the route wiring under test
    // fails to construct.
    recordOrderBalancePaymentUseCase: jest.fn(),
    enrollPosCashierPinUseCase: jest.fn(),
    resetPosCashierPinUseCase: jest.fn(),
    takeOverPosRegisterUseCase: jest.fn(),
    returnPosRegisterUseCase: jest.fn(),
    startPosSharedReliefUseCase: jest.fn(),
    endPosSharedReliefUseCase: jest.fn(),
    countedPosCustodyHandoffUseCase: jest.fn(),
    getCurrentPosOperatorUseCase: jest.fn(),
    listEligiblePosOperatorsUseCase: jest.fn(),
    authorizePosOperatorMutationUseCase: jest.fn(),
    releasePosOperatorMutationUseCase: jest.fn(),
    endPosOperatorSessionUseCase: jest.fn(),
    revokePosOperatorSessionsForTerminal: jest.fn(),
    posTerminalPairingMaxAgeMs: 300000
}));

jest.unstable_mockModule('../src/services/productUsageTelemetryService.js', () => ({
    trackProductUsageFromResult: jest.fn()
}));

jest.unstable_mockModule('../src/utils/browserSessionCookies.js', () => ({
    setTenantSessionCookies: jest.fn(),
    setBearerSessionCookie: jest.fn(),
    clearSessionCookie: jest.fn(),
    getCookie: jest.fn(),
    SESSION_COOKIE_NAMES: {
        posOperatorAuthority: 'sku_pos_operator_authority'
    }
}));

let getDeviceStatus;

beforeAll(async () => {
    ({ getDeviceStatus } = await import('../src/modules/pos/controllers/posHandlers.js'));
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

const createReq = () => ({
    user: { user_id: 1 },
    ip: '127.0.0.1',
    get: jest.fn().mockReturnValue('test-agent'),
    requestId: 'req-1'
});

beforeEach(() => {
    mockGetPosDeviceStatusUseCase.mockReset();
});

describe('GET /pos/device/status transport', () => {
    it('never returns 503 when no hardware driver is configured for this terminal', async () => {
        mockGetPosDeviceStatusUseCase.mockResolvedValue({
            success: true,
            data: {
                bridge: { ok: true, mode: 'client_managed', printersDetected: 0 },
                driver: { id: 'client_managed', available: false },
                hardware_required: false
            },
            error: null
        });

        const req = createReq();
        const res = createRes();
        const next = jest.fn();

        await getDeviceStatus(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.status).not.toHaveBeenCalledWith(503);
        const [payload] = res.json.mock.calls[0];
        expect(payload.success).toBe(true);
        expect(payload.data.driver.id).toBe('client_managed');
    });

    it('returns 503 only when a driver is configured but genuinely unreachable', async () => {
        mockGetPosDeviceStatusUseCase.mockResolvedValue({
            success: false,
            data: null,
            error: {
                code: 'SERVICE_UNAVAILABLE',
                message: 'Device bridge is not reachable at http://127.0.0.1:5101/device/status',
                statusCode: 503,
                details: null
            }
        });

        const req = createReq();
        const res = createRes();
        const next = jest.fn();

        await getDeviceStatus(req, res, next);

        expect(res.status).toHaveBeenCalledWith(503);
    });
});
