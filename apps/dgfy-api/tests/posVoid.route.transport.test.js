import express from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockVoidTransaction = jest.fn((req, res) => res.status(200).json({
    success: true,
    data: {
        pos_transaction_id: req.validatedParams?.id,
        actor: req.user,
        payload: req.validatedData,
        terminal: req.posTerminalRegistration
    }
}));

const mockCashRefundTransaction = jest.fn((req, res) => res.status(200).json({
    success: true,
    data: {
        pos_transaction_id: req.validatedParams?.id,
        payload: req.validatedData,
        terminal: req.posTerminalRegistration
    }
}));

const mockExternalRefundTransaction = jest.fn((req, res) => res.status(200).json({
    success: true,
    data: {
        pos_transaction_id: req.validatedParams?.id,
        payload: req.validatedData,
        terminal: req.posTerminalRegistration
    }
}));

const mockProviderRefundTransaction = jest.fn((req, res) => res.status(200).json({
    success: true,
    data: {
        pos_transaction_id: req.validatedParams?.id,
        payload: req.validatedData,
        terminal: req.posTerminalRegistration
    }
}));

const mockSplitAllocationReversal = jest.fn((req, res) => res.status(200).json({
    success: true,
    data: {
        pos_transaction_id: req.validatedParams?.id,
        allocation_id: req.validatedParams?.allocation_id,
        payload: req.validatedData,
        terminal: req.posTerminalRegistration
    }
}));

const createControllerMock = (names, overrides = {}) => Object.fromEntries(
    names.map((name) => [
        name,
        overrides[name] || jest.fn((req, res) => res.status(200).json({ success: true, data: {} }))
    ])
);

const posControllerNames = [
    'addPaymentAllocation', 'assignDeliveryPersonnel', 'authorizeDeviceDrawer', 'cancelParkedSale',
    'cancelPaymentAllocation', 'cancelPaymentSession', 'checkout', 'claimParkedSale',
    'clearPairedTerminal', 'closeDayZReading', 'closeTerminalShift', 'collectCashDeliveryOrder',
    'collectCashPickupOrder', 'completePaymentSession', 'confirmPaymentAllocation', 'createParkedSale',
    'createPaymentSession', 'createSetupCashier', 'deleteCatalogImage', 'exportReports',
    'forceCloseStaleTerminalShift', 'generateESalesReport', 'getActivePaymentSession',
    'getAdminLocationMonitor', 'getCashierShiftHistory', 'getCurrentTerminalShift', 'getCurrentXReading',
    'getDailyZReading', 'getDayCloseReadiness', 'getDeviceStatus', 'getMerchantTenderReconciliation',
    'getPairedTerminal', 'getPaymentSession', 'getReportsOverview', 'getTerminalTodayDashboard',
    'getTransactionById', 'incrementGovernedResetCounter', 'listActiveDeliveryPersonnel', 'listCatalog',
    'listCatalogOverrides', 'listDiscountApprovers', 'listESalesReports', 'listFiscalTerminalRegistrations',
    'listIncomingOnlineOrders', 'listOnlineOrderHistory', 'listParkedSales', 'listSetupCashiers',
    'listTransactions', 'loginCashier', 'openDeviceDrawer', 'openTerminalShift', 'printReceipt',
    'printShiftSummary', 'printZReading', 'reconcilePaymentAllocation', 'recordCashDrawerEvent',
    'recordFiscalPrintEvent', 'reparkParkedSale', 'requirePairedTerminal', 'requireActiveOperatorForMutation',
    'reviewMerchantTenderReconciliation', 'scanBarcode', 'streamCatalogEvents', 'switchTerminalShiftLocation',
    'updateBulkCatalogOverrides', 'updateCatalogOverride', 'updateDeliveryJobStatus',
    'updateESalesReportStatus', 'uploadBulkCatalogImages', 'uploadCatalogImage',
    'updateOnlineOrderStatus', 'upsertFiscalTerminalRegistration', 'verifyDiscountApproval',
    'verifyFiscalEventLedger', 'verifyTerminal', 'voidTransaction', 'cashRefundTransaction', 'externalRefundTransaction', 'providerRefundTransaction', 'splitAllocationReversal',
    // Phase 148 (#825): this list enumerates every named export posController.js provides, so a
    // new one has to be added here too or the route wiring under test fails to construct.
    'recordOrderBalancePayment'
    , 'getCurrentAttendance', 'timeInAttendance', 'timeOutAttendance', 'startAttendanceBreak',
    'endAttendanceBreak', 'startReliefDuty', 'endReliefDuty', 'correctAttendance', 'enrollCashierPin',
    'resetCashierPin', 'takeOverRegister', 'returnRegister', 'startSharedRelief', 'endSharedRelief',
    'countedCustodyHandoff', 'getCurrentOperator', 'listEligibleOperators', 'endOperatorSession'
];

const employeeCreditControllerNames = [
    'adjustEmployeeCreditOutstanding', 'enableEmployeeCreditForActiveEmployees', 'getEmployeeCreditReport',
    'listEmployeeCreditAccounts', 'listEmployeeCreditCheckoutOptions', 'lookupEmployeeCreditAccount',
    'recordEmployeeCreditRepayment', 'updateEmployeeCreditAccount', 'updateEmployeeCreditEmployeeAccount'
];

const employeeControllerNames = ['createEmployee', 'listEmployees', 'updateEmployee'];

const posControllerMock = createControllerMock(posControllerNames, {
    voidTransaction: mockVoidTransaction,
    cashRefundTransaction: mockCashRefundTransaction,
    externalRefundTransaction: mockExternalRefundTransaction,
    providerRefundTransaction: mockProviderRefundTransaction,
    splitAllocationReversal: mockSplitAllocationReversal,
    requirePairedTerminal: jest.fn((req, res, next) => {
        const requestedTerminalId = String(
            req.body?.terminal_id
            || req.headers?.['x-pos-terminal-id']
            || ''
        ).trim().toUpperCase();
        if (!terminalRegistered || requestedTerminalId !== 'COUNTER-01') {
            return res.status(403).json({
                success: false,
                error_code: 'POS_TERMINAL_INACTIVE_OR_UNKNOWN',
                message: 'The selected terminal is not active or registered for this business.'
            });
        }
        req.posTerminalRegistration = {
            terminal_id: 'COUNTER-01',
            location_id: 7
        };
        return next();
    }),
    requireActiveOperatorForMutation: jest.fn((req, res, next) => next())
});

const employeeCreditControllerMock = createControllerMock(employeeCreditControllerNames);
const employeeControllerMock = createControllerMock(employeeControllerNames);

let authenticated = true;
let terminalRegistered = true;
let permissionSet = new Set(['pos:void']);

const passThrough = (req, res, next) => next();
const mockAuthenticate = (req, res, next) => {
    if (!authenticated) return res.status(401).json({ success: false, message: 'Unauthorized' });
    req.user = {
        user_id: 99,
        role: 'admin',
        permissions: [...permissionSet]
    };
    return next();
};
const mockCheckPermission = (permission) => (req, res, next) => {
    if (!permissionSet.has(permission)) {
        return res.status(403).json({
            success: false,
            error_code: 'AUTHORIZATION_FAILED',
            message: 'You do not have permission to perform this action.'
        });
    }
    return next();
};
const mockCheckAnyPermission = (permissions) => (req, res, next) => {
    if (!permissions.some((permission) => permissionSet.has(permission))) {
        return res.status(403).json({
            success: false,
            error_code: 'AUTHORIZATION_FAILED',
            message: 'You do not have permission to perform this action.'
        });
    }
    return next();
};

jest.unstable_mockModule('../src/controllers/posController.js', () => posControllerMock);
jest.unstable_mockModule('../src/modules/employeeCredit/controllers/employeeCreditHandlers.js', () => employeeCreditControllerMock);
jest.unstable_mockModule('../src/modules/employees/controllers/employeeHandlers.js', () => employeeControllerMock);
jest.unstable_mockModule('../src/middleware/auth.js', () => ({
    authenticate: mockAuthenticate,
    checkAnyPermission: mockCheckAnyPermission,
    checkPermission: mockCheckPermission,
    requirePremium: passThrough,
    requireTenantCapability: () => passThrough
}));
jest.unstable_mockModule('../src/middleware/workflowModeCapability.js', () => ({
    requireWorkflowCapability: () => passThrough
}));
jest.unstable_mockModule('../src/middleware/rateLimiter.js', () => ({
    posDrawerAuthorizationLimiter: passThrough,
    posLimiter: passThrough
}));
jest.unstable_mockModule('../src/config/uploadConfig.js', () => ({
    posCatalogBulkImageUpload: { array: () => passThrough },
    posCatalogImageUpload: { single: () => passThrough },
    preserveTenantContext: () => passThrough
}));

let app;

beforeAll(async () => {
    const router = (await import('../src/routes/pos.js')).default;
    app = express();
    app.use(express.json());
    app.use('/api/v1/pos', router);
});

beforeEach(() => {
    authenticated = true;
    terminalRegistered = true;
    permissionSet = new Set(['pos:void']);
    jest.clearAllMocks();
});

describe('POS transaction void route transport contract', () => {
    it('keeps transaction-detail adjustment evidence behind pos:view', async () => {
        permissionSet = new Set(['pos:view']);

        const response = await request(app)
            .get('/api/v1/pos/transactions/182');

        expect(response.status).toBe(200);
        expect(posControllerMock.getTransactionById).toHaveBeenCalledTimes(1);

        permissionSet = new Set();
        const unauthorized = await request(app)
            .get('/api/v1/pos/transactions/182');

        expect(unauthorized.status).toBe(403);
        expect(posControllerMock.getTransactionById).toHaveBeenCalledTimes(1);
    });

    it('requires authentication and the dedicated pos:void permission before dispatching', async () => {
        authenticated = false;

        const unauthenticated = await request(app)
            .post('/api/v1/pos/transactions/178/void')
            .set('x-pos-terminal-id', 'COUNTER-01')
            .send({ reason: 'Manager correction' });

        expect(unauthenticated.status).toBe(401);
        expect(mockVoidTransaction).not.toHaveBeenCalled();

        authenticated = true;
        permissionSet = new Set();
        const unauthorized = await request(app)
            .post('/api/v1/pos/transactions/178/void')
            .set('x-pos-terminal-id', 'COUNTER-01')
            .send({ reason: 'Manager correction' });

        expect(unauthorized.status).toBe(403);
        expect(posControllerMock.requirePairedTerminal).not.toHaveBeenCalled();
        expect(mockVoidTransaction).not.toHaveBeenCalled();
    });

    it('requires an active registered terminal before validating or dispatching the void', async () => {
        terminalRegistered = false;

        const response = await request(app)
            .post('/api/v1/pos/transactions/178/void')
            .set('x-pos-terminal-id', 'UNKNOWN-01')
            .send({ reason: 'Manager correction' });

        expect(response.status).toBe(403);
        expect(mockVoidTransaction).not.toHaveBeenCalled();

        terminalRegistered = true;
        const missingTerminal = await request(app)
            .post('/api/v1/pos/transactions/178/void')
            .send({ reason: 'Manager correction' });

        expect(missingTerminal.status).toBe(403);
        expect(mockVoidTransaction).not.toHaveBeenCalled();
    });

    it('rejects invalid reason or transaction IDs at the route boundary', async () => {
        const invalidReason = await request(app)
            .post('/api/v1/pos/transactions/178/void')
            .set('x-pos-terminal-id', 'COUNTER-01')
            .send({ reason: 'no' });
        expect(invalidReason.status).toBe(422);
        expect(mockVoidTransaction).not.toHaveBeenCalled();

        const invalidId = await request(app)
            .post('/api/v1/pos/transactions/not-an-id/void')
            .set('x-pos-terminal-id', 'COUNTER-01')
            .send({ reason: 'Manager correction' });
        expect(invalidId.status).toBe(422);
        expect(mockVoidTransaction).not.toHaveBeenCalled();
    });

    it('dispatches an authenticated administrator void without requiring shift_id', async () => {
        const response = await request(app)
            .post('/api/v1/pos/transactions/178/void')
            .set('x-pos-terminal-id', 'COUNTER-01')
            .send({ reason: 'Manager correction' });

        expect(response.status).toBe(200);
        expect(response.body.data.pos_transaction_id).toBe(178);
        expect(response.body.data.payload).toEqual({ reason: 'Manager correction' });
        expect(response.body.data.actor).toEqual(expect.objectContaining({
            user_id: 99,
            role: 'admin'
        }));
        expect(response.body.data.terminal).toEqual({
            terminal_id: 'COUNTER-01',
            location_id: 7
        });
        expect(mockVoidTransaction).toHaveBeenCalledTimes(1);
    });

    it('protects cash refunds with cash-drawer permission and validates the cashier shift payload', async () => {
        permissionSet = new Set(['pos:cash_drawer_adjust']);

        const response = await request(app)
            .post('/api/v1/pos/transactions/178/cash-refund')
            .set('x-pos-terminal-id', 'COUNTER-01')
            .send({
                shift_id: 107,
                reason: 'Customer returned paid item',
                idempotency_key: 'cash-refund-178'
            });

        expect(response.status).toBe(200);
        expect(response.body.data.pos_transaction_id).toBe(178);
        expect(response.body.data.payload).toEqual({
            shift_id: 107,
            reason: 'Customer returned paid item',
            idempotency_key: 'cash-refund-178'
        });
        expect(response.body.data.terminal).toEqual({
            terminal_id: 'COUNTER-01',
            location_id: 7
        });
        expect(mockCashRefundTransaction).toHaveBeenCalledTimes(1);

        permissionSet = new Set(['pos:void']);
        const unauthorized = await request(app)
            .post('/api/v1/pos/transactions/178/cash-refund')
            .set('x-pos-terminal-id', 'COUNTER-01')
            .send({
                shift_id: 107,
                reason: 'Customer returned paid item',
                idempotency_key: 'cash-refund-179'
            });
        expect(unauthorized.status).toBe(403);
        expect(mockCashRefundTransaction).toHaveBeenCalledTimes(1);
    });

    it('protects external reversal evidence with pos:void and validates the reference', async () => {
        permissionSet = new Set(['pos:void']);

        const response = await request(app)
            .post('/api/v1/pos/transactions/178/external-refund')
            .set('x-pos-terminal-id', 'COUNTER-01')
            .send({
                shift_id: 107,
                external_reference: 'STORE-REF-178',
                reason: 'Store reversal reference recorded',
                idempotency_key: 'external-refund-178'
            });

        expect(response.status).toBe(200);
        expect(response.body.data.payload).toEqual({
            shift_id: 107,
            external_reference: 'STORE-REF-178',
            reason: 'Store reversal reference recorded',
            idempotency_key: 'external-refund-178',
            completion_confirmed: false
        });
        expect(mockExternalRefundTransaction).toHaveBeenCalledTimes(1);

        const invalidReference = await request(app)
            .post('/api/v1/pos/transactions/178/external-refund')
            .set('x-pos-terminal-id', 'COUNTER-01')
            .send({
                shift_id: 107,
                external_reference: 'x',
                reason: 'Store reversal reference recorded',
                idempotency_key: 'external-refund-179'
            });
        expect(invalidReference.status).toBe(422);
        expect(mockExternalRefundTransaction).toHaveBeenCalledTimes(1);
    });

    it('protects provider refunds with pos:void and validates only the client refund contract', async () => {
        const response = await request(app)
            .post('/api/v1/pos/transactions/178/provider-refund')
            .set('x-pos-terminal-id', 'COUNTER-01')
            .send({
                shift_id: 107,
                reason: 'Customer reversal confirmed online',
                idempotency_key: 'provider-refund-178'
            });

        expect(response.status).toBe(200);
        expect(response.body.data.pos_transaction_id).toBe(178);
        expect(response.body.data.payload).toEqual({
            shift_id: 107,
            reason: 'Customer reversal confirmed online',
            idempotency_key: 'provider-refund-178',
            provider_reason: 'others'
        });
        expect(response.body.data.payload.payment_reference).toBeUndefined();
        expect(response.body.data.terminal).toEqual({
            terminal_id: 'COUNTER-01',
            location_id: 7
        });
        expect(mockProviderRefundTransaction).toHaveBeenCalledTimes(1);

        permissionSet = new Set(['pos:view']);
        const unauthorized = await request(app)
            .post('/api/v1/pos/transactions/178/provider-refund')
            .set('x-pos-terminal-id', 'COUNTER-01')
            .send({
                shift_id: 107,
                reason: 'Customer reversal confirmed online',
                idempotency_key: 'provider-refund-179'
            });
        expect(unauthorized.status).toBe(403);
        expect(mockProviderRefundTransaction).toHaveBeenCalledTimes(1);
    });

    it('allows either void authority or cash-drawer authority to dispatch split allocation reversal', async () => {
        permissionSet = new Set(['pos:void']);
        const external = await request(app)
            .post('/api/v1/pos/transactions/178/split-allocations/12/reversal')
            .set('x-pos-terminal-id', 'COUNTER-01')
            .send({
                external_reference: 'STORE-REV-178',
                reason: 'Split tender reversal evidence',
                idempotency_key: 'split-reversal-178'
            });

        expect(external.status).toBe(200);
        expect(external.body.data.allocation_id).toBe(12);
        expect(external.body.data.payload).toEqual({
            external_reference: 'STORE-REV-178',
            reason: 'Split tender reversal evidence',
            idempotency_key: 'split-reversal-178',
            completion_confirmed: false
        });
        expect(mockSplitAllocationReversal).toHaveBeenCalledTimes(1);

        permissionSet = new Set(['pos:cash_drawer_adjust']);
        const cash = await request(app)
            .post('/api/v1/pos/transactions/178/split-allocations/13/reversal')
            .set('x-pos-terminal-id', 'COUNTER-01')
            .send({
                shift_id: 107,
                amount: 25,
                reason: 'Split cash refund',
                idempotency_key: 'split-reversal-179'
            });

        expect(cash.status).toBe(200);
        expect(cash.body.data.allocation_id).toBe(13);
        expect(mockSplitAllocationReversal).toHaveBeenCalledTimes(2);

        permissionSet = new Set(['pos:view']);
        const unauthorized = await request(app)
            .post('/api/v1/pos/transactions/178/split-allocations/14/reversal')
            .set('x-pos-terminal-id', 'COUNTER-01')
            .send({ reason: 'Not authorized', idempotency_key: 'split-reversal-180' });
        expect(unauthorized.status).toBe(403);
        expect(mockSplitAllocationReversal).toHaveBeenCalledTimes(2);
    });
});
