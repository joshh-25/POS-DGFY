import express from 'express';
import * as posController from '../controllers/posController.js';
import * as employeeCreditController from '../modules/employeeCredit/controllers/employeeCreditHandlers.js';
import * as employeeController from '../modules/employees/controllers/employeeHandlers.js';
import { authenticate, checkAnyPermission, checkPermission, requirePremium, requireTenantCapability } from '../middleware/auth.js';
import { requireWorkflowCapability } from '../middleware/workflowModeCapability.js';
import { posDrawerAuthorizationLimiter, posLimiter } from '../middleware/rateLimiter.js';
import { PERMISSIONS } from '../config/permissions.js';
import { posCatalogBulkImageUpload, posCatalogImageUpload, preserveTenantContext } from '../config/uploadConfig.js';
import {
    validatePosCheckout,
    validateCreatePosParkedSale,
    validateListPosParkedSales,
    validateClaimPosParkedSale,
    validateCancelPosParkedSale,
    validateReparkPosParkedSale,
    validateParkedSaleIdParam,
    validateCreatePosPaymentSession,
    validateAddPosPaymentAllocation,
    validateCancelPosPayment,
    validateCompletePosPayment,
    validateConfirmPosPaymentAllocation,
    validateReconcilePosPaymentAllocation,
    validateReviewMerchantTenderReconciliation,
    validateSplitPaymentSessionIdParam,
    validateSplitPaymentSessionScopeQuery,
    validateSplitPaymentAllocationIdParam,
    validatePosCatalogQuery,
    validatePosScan,
    validatePosCatalogOverridesQuery,
    validatePosCatalogOverrideParam,
    validateUpdatePosCatalogOverride,
    validatePosReportsQuery,
    validatePosTransactionsQuery,
    validatePosReportsExportQuery,
    validatePosTransactionIdParam,
    validateZReadingDateParam,
    validateZReadingQuery,
    validateCloseDayBody,
    validateXReadingQuery,
    validateGovernedResetBody,
    validateTerminalCurrentShiftQuery,
    validateTerminalShiftHistoryQuery,
    validateTerminalDashboardTodayQuery,
    validateIncomingOnlineOrdersQuery,
    validateOnlineOrderHistoryQuery,
    validateDeliveryPersonnelListQuery,
    validateAdminLocationMonitorQuery,
    validateCollectCashPickupOrder,
    validateCollectCashDeliveryOrder,
    validateUpdateDeliveryJobStatus,
    validateAssignDeliveryPersonnel,
    validateShiftIdParam,
    validateOpenTerminalShift,
    validateSwitchTerminalShiftLocation,
    validateCashDrawerEvent,
    validateCloseTerminalShift,
    validateForceCloseStaleTerminalShift,
    validateUpdateOnlineOrderStatus,
    validatePosDeviceReceiptPrint,
    validatePosDeviceShiftSummaryPrint,
    validatePosDeviceZReadingPrint,
    validatePosDeviceDrawerOpen,
    validatePosDrawerAuthorization,
    validateFiscalPrintEvent,
    validateVoidPosTransaction,
    validateCashRefundPosTransaction,
    validateExternalRefundPosTransaction,
    validateProviderRefundPosTransaction,
    validateSplitAllocationReversal,
    validateGenerateESalesReport,
    validateUpdateESalesReportStatus,
    validateFiscalTerminalRegistration,
    validateVerifyTerminal,
    validatePosCashierLogin,
    validateSetupCashier,
    validatePosDiscountApproval,
    validateEmployeeCreditAccountParam,
    validateEmployeeCreditUserParam,
    validateEmployeeParam,
    validateEmployeeListQuery,
    validateEmployeeCreate,
    validateEmployeeUpdate,
    validateEmployeeCreditAccountUpdate,
    validateEmployeeCreditOutstandingAdjustment,
    validateEmployeeCreditRepayment,
    validateEmployeeCreditCheckoutOptionsQuery,
    validateEmployeeCreditLookupQuery,
    validateEmployeeCreditReportQuery
} from '../validators/posValidator.js';

const router = express.Router();
const employeeCreditCheckoutPermission = checkPermission(PERMISSIONS.POS.actions.USE_EMPLOYEE_CREDIT);
const requireEmployeeCreditCheckoutPermission = (req, res, next) => {
    if (req.validatedData?.payment_type !== 'employee_credit') return next();
    return employeeCreditCheckoutPermission(req, res, next);
};

// Cashiers have no tenant access token before their first POS login. Tenant
// context, premium/capability checks, rate limiting, and payload validation
// still run before credentials are verified by the POS login use case.
router.post(
    '/auth/cashier-login',
    requirePremium,
    requireTenantCapability('tenant_pos_enabled', 'POS'),
    posLimiter,
    validatePosCashierLogin,
    posController.loginCashier
);

router.use(authenticate);
router.use(requirePremium);
router.use(requireTenantCapability('tenant_pos_enabled', 'POS'));
// `pos` (the workflow capability, distinct from the landlord-level
// tenant_pos_enabled gate above) is held by every mode, so this changes
// nothing today; it makes the capability real so a Store Profile that can
// subtract modules has a working off-switch for the POS surface.
router.use(requireWorkflowCapability('pos', 'POS'));
router.use(posLimiter);

router.post('/terminal/pair', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validateVerifyTerminal, posController.verifyTerminal);
router.get('/terminal/paired', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), posController.getPairedTerminal);
router.delete('/terminal/paired', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), posController.clearPairedTerminal);
router.get('/setup/cashiers', checkPermission(PERMISSIONS.SYSTEM.actions.MANAGE_USERS), posController.listSetupCashiers);
router.post('/setup/cashiers', checkPermission(PERMISSIONS.SYSTEM.actions.MANAGE_USERS), validateSetupCashier, posController.createSetupCashier);

router.get('/catalog', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validatePosCatalogQuery, posController.listCatalog);
router.get('/catalog/events', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), posController.streamCatalogEvents);
router.post('/scan', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validatePosScan, posController.scanBarcode);
router.get('/catalog-overrides', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validatePosCatalogOverridesQuery, posController.listCatalogOverrides);
router.patch('/catalog-overrides/bulk', checkPermission(PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), posController.updateBulkCatalogOverrides);
router.post('/catalog-overrides/images/bulk', checkPermission(PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), preserveTenantContext(posCatalogBulkImageUpload.array('images', 50)), posController.uploadBulkCatalogImages);
router.patch('/catalog-overrides/:item_id', checkPermission(PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), validatePosCatalogOverrideParam, validateUpdatePosCatalogOverride, posController.updateCatalogOverride);
router.post('/catalog-overrides/:item_id/image', checkPermission(PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), validatePosCatalogOverrideParam, preserveTenantContext(posCatalogImageUpload.single('image')), posController.uploadCatalogImage);
router.delete('/catalog-overrides/:item_id/image', checkPermission(PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), validatePosCatalogOverrideParam, posController.deleteCatalogImage);
router.post('/checkouts', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validatePosCheckout, requireEmployeeCreditCheckoutPermission, posController.checkout);
router.post('/parked-sales', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateCreatePosParkedSale, posController.createParkedSale);
router.get('/parked-sales', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validateListPosParkedSales, posController.listParkedSales);
router.post('/parked-sales/:id/claim', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateParkedSaleIdParam, validateClaimPosParkedSale, posController.claimParkedSale);
router.post('/parked-sales/:id/repark', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateParkedSaleIdParam, validateReparkPosParkedSale, posController.reparkParkedSale);
router.post('/parked-sales/:id/cancel', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateParkedSaleIdParam, validateCancelPosParkedSale, posController.cancelParkedSale);
router.post('/payment-sessions', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateCreatePosPaymentSession, posController.createPaymentSession);
router.get('/payment-sessions/active', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateSplitPaymentSessionScopeQuery, posController.getActivePaymentSession);
router.get('/payment-sessions/:id', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validateSplitPaymentSessionIdParam, validateSplitPaymentSessionScopeQuery, posController.getPaymentSession);
router.post('/payment-sessions/:id/allocations', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateSplitPaymentSessionIdParam, validateAddPosPaymentAllocation, posController.addPaymentAllocation);
router.post('/payment-sessions/:id/allocations/:allocation_id/cancel', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateSplitPaymentAllocationIdParam, validateCancelPosPayment, posController.cancelPaymentAllocation);
router.post('/payment-sessions/:id/allocations/:allocation_id/confirm', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateSplitPaymentAllocationIdParam, validateConfirmPosPaymentAllocation, posController.confirmPaymentAllocation);
router.post('/payment-sessions/:id/allocations/:allocation_id/reconcile', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateSplitPaymentAllocationIdParam, validateReconcilePosPaymentAllocation, posController.reconcilePaymentAllocation);
router.post('/payment-sessions/:id/cancel', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateSplitPaymentSessionIdParam, validateCancelPosPayment, posController.cancelPaymentSession);
router.post('/payment-sessions/:id/complete', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateSplitPaymentSessionIdParam, validateCompletePosPayment, posController.completePaymentSession);
router.get(
    '/employees',
    checkAnyPermission([
        PERMISSIONS.POS.actions.MANAGE_EMPLOYEES,
        PERMISSIONS.POS.actions.MANAGE_EMPLOYEE_CREDIT
    ]),
    validateEmployeeListQuery,
    employeeController.listEmployees
);
router.post('/employees', checkPermission(PERMISSIONS.POS.actions.MANAGE_EMPLOYEES), validateEmployeeCreate, employeeController.createEmployee);
router.patch('/employees/:employeeId', checkPermission(PERMISSIONS.POS.actions.MANAGE_EMPLOYEES), validateEmployeeParam, validateEmployeeUpdate, employeeController.updateEmployee);
router.get('/employee-credit/accounts', checkPermission(PERMISSIONS.POS.actions.MANAGE_EMPLOYEE_CREDIT), employeeCreditController.listEmployeeCreditAccounts);
router.post('/employee-credit/employee-accounts/enable-active', checkPermission(PERMISSIONS.POS.actions.MANAGE_EMPLOYEE_CREDIT), employeeCreditController.enableEmployeeCreditForActiveEmployees);
router.patch('/employee-credit/accounts/:userId', checkPermission(PERMISSIONS.POS.actions.MANAGE_EMPLOYEE_CREDIT), validateEmployeeCreditUserParam, validateEmployeeCreditAccountUpdate, employeeCreditController.updateEmployeeCreditAccount);
router.patch('/employee-credit/employee-accounts/:employeeId', checkPermission(PERMISSIONS.POS.actions.MANAGE_EMPLOYEE_CREDIT), validateEmployeeParam, validateEmployeeCreditAccountUpdate, employeeCreditController.updateEmployeeCreditEmployeeAccount);
router.post('/employee-credit/accounts/:accountId/repay', checkPermission(PERMISSIONS.POS.actions.MANAGE_EMPLOYEE_CREDIT), validateEmployeeCreditAccountParam, validateEmployeeCreditRepayment, employeeCreditController.recordEmployeeCreditRepayment);
router.post('/employee-credit/accounts/:accountId/adjust-outstanding', checkPermission(PERMISSIONS.POS.actions.MANAGE_EMPLOYEE_CREDIT), validateEmployeeCreditAccountParam, validateEmployeeCreditOutstandingAdjustment, employeeCreditController.adjustEmployeeCreditOutstanding);
router.get('/employee-credit/checkout-options', checkPermission(PERMISSIONS.POS.actions.USE_EMPLOYEE_CREDIT), validateEmployeeCreditCheckoutOptionsQuery, employeeCreditController.listEmployeeCreditCheckoutOptions);
router.get('/employee-credit/lookup', checkPermission(PERMISSIONS.POS.actions.USE_EMPLOYEE_CREDIT), validateEmployeeCreditLookupQuery, employeeCreditController.lookupEmployeeCreditAccount);
router.get('/employee-credit/report', checkPermission(PERMISSIONS.POS.actions.VIEW_EMPLOYEE_CREDIT_REPORT), validateEmployeeCreditReportQuery, employeeCreditController.getEmployeeCreditReport);
router.get('/discount-approvers', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), posController.listDiscountApprovers);
router.post('/discount-approvals/verify', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validatePosDiscountApproval, posController.verifyDiscountApproval);
router.get('/transactions', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validatePosTransactionsQuery, posController.listTransactions);
router.get('/transactions/:id', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validatePosTransactionIdParam, posController.getTransactionById);
router.get('/terminal/shifts/current', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validateTerminalCurrentShiftQuery, posController.getCurrentTerminalShift);
router.get('/terminal/shifts/history', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validateTerminalShiftHistoryQuery, posController.getCashierShiftHistory);
router.post('/terminal/shifts/open', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateOpenTerminalShift, posController.openTerminalShift);
router.post('/terminal/shifts/:id/switch-location', checkPermission(PERMISSIONS.POS.actions.SWITCH_LOCATION_POS), posController.requirePairedTerminal, validateShiftIdParam, validateSwitchTerminalShiftLocation, posController.switchTerminalShiftLocation);
router.post('/terminal/shifts/:id/cash-events', checkPermission(PERMISSIONS.POS.actions.ADJUST_CASH_DRAWER), posController.requirePairedTerminal, validateShiftIdParam, validateCashDrawerEvent, posController.recordCashDrawerEvent);
// Close shift resolves terminal identity from the open shift itself. Requiring a
// paired terminal here blocks valid cashier close-shift flows after cookie-based
// pairing was retired.
router.post('/terminal/shifts/:id/close', checkPermission(PERMISSIONS.POS.actions.CLOSE_SHIFT_POS), validateShiftIdParam, validateCloseTerminalShift, posController.closeTerminalShift);
router.post('/terminal/shifts/:id/force-close', checkPermission(PERMISSIONS.POS.actions.CLOSE_SHIFT_POS), validateShiftIdParam, validateForceCloseStaleTerminalShift, posController.forceCloseStaleTerminalShift);
router.get('/terminal/shifts/:id/merchant-tender-reconciliation', checkPermission(PERMISSIONS.POS.actions.CLOSE_DAY_POS), validateShiftIdParam, posController.getMerchantTenderReconciliation);
router.post('/terminal/shifts/:id/merchant-tender-reconciliation', checkPermission(PERMISSIONS.POS.actions.CLOSE_DAY_POS), validateShiftIdParam, validateReviewMerchantTenderReconciliation, posController.reviewMerchantTenderReconciliation);
router.get('/terminal/dashboard/today', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validateTerminalDashboardTodayQuery, posController.getTerminalTodayDashboard);
router.get('/reports/overview', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validatePosReportsQuery, posController.getReportsOverview);
router.get('/reports/export', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validatePosReportsExportQuery, posController.exportReports);
router.get('/device/status', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), posController.getDeviceStatus);
router.post('/device/print-receipt', checkPermission(PERMISSIONS.POS.actions.REPRINT_POS_RECEIPT), posController.requirePairedTerminal, validatePosDeviceReceiptPrint, posController.printReceipt);
router.post('/terminal/shifts/:id/print-summary', checkPermission(PERMISSIONS.POS.actions.REPRINT_POS_RECEIPT), validateShiftIdParam, validatePosDeviceShiftSummaryPrint, posController.printShiftSummary);
router.post('/z-reading/:date/print', checkPermission(PERMISSIONS.POS.actions.CLOSE_DAY_POS), posController.requirePairedTerminal, validateZReadingDateParam, validatePosDeviceZReadingPrint, posController.printZReading);
router.post('/device/open-drawer', checkPermission(PERMISSIONS.POS.actions.ADJUST_CASH_DRAWER), posController.requirePairedTerminal, validatePosDeviceDrawerOpen, posController.openDeviceDrawer);
router.post('/device/authorize-drawer', checkPermission(PERMISSIONS.POS.actions.ADJUST_CASH_DRAWER), posController.requirePairedTerminal, posDrawerAuthorizationLimiter, validatePosDrawerAuthorization, posController.authorizeDeviceDrawer);
router.post('/transactions/:id/fiscal-print-events', checkPermission(PERMISSIONS.POS.actions.REPRINT_POS_RECEIPT), posController.requirePairedTerminal, validatePosTransactionIdParam, validateFiscalPrintEvent, posController.recordFiscalPrintEvent);
router.post('/transactions/:id/void', checkPermission(PERMISSIONS.POS.actions.VOID_POS_TRANSACTION), posController.requirePairedTerminal, validatePosTransactionIdParam, validateVoidPosTransaction, posController.voidTransaction);
router.post('/transactions/:id/cash-refund', checkPermission(PERMISSIONS.POS.actions.ADJUST_CASH_DRAWER), posController.requirePairedTerminal, validatePosTransactionIdParam, validateCashRefundPosTransaction, posController.cashRefundTransaction);
router.post('/transactions/:id/external-refund', checkPermission(PERMISSIONS.POS.actions.VOID_POS_TRANSACTION), posController.requirePairedTerminal, validatePosTransactionIdParam, validateExternalRefundPosTransaction, posController.externalRefundTransaction);
router.post('/transactions/:id/provider-refund', checkPermission(PERMISSIONS.POS.actions.VOID_POS_TRANSACTION), posController.requirePairedTerminal, validatePosTransactionIdParam, validateProviderRefundPosTransaction, posController.providerRefundTransaction);
router.post('/transactions/:id/split-allocations/:allocation_id/reversal', checkAnyPermission([
    PERMISSIONS.POS.actions.VOID_POS_TRANSACTION,
    PERMISSIONS.POS.actions.ADJUST_CASH_DRAWER
]), posController.requirePairedTerminal, validateSplitPaymentAllocationIdParam, validateSplitAllocationReversal, posController.splitAllocationReversal);
router.get('/fiscal-terminal-registrations', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), posController.listFiscalTerminalRegistrations);
router.put('/fiscal-terminal-registrations', checkPermission(PERMISSIONS.POS.actions.MANAGE_FISCAL_TERMINALS), validateFiscalTerminalRegistration, posController.upsertFiscalTerminalRegistration);
router.get('/esales-reports', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), posController.listESalesReports);
router.post('/esales-reports/generate', checkPermission(PERMISSIONS.POS.actions.MANAGE_ESALES_REPORTS), validateGenerateESalesReport, posController.generateESalesReport);
router.patch('/esales-reports/:id/status', checkPermission(PERMISSIONS.POS.actions.MANAGE_ESALES_REPORTS), validatePosTransactionIdParam, validateUpdateESalesReportStatus, posController.updateESalesReportStatus);
router.get('/fiscal-ledger/integrity', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), posController.verifyFiscalEventLedger);
router.get('/incoming-orders', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validateIncomingOnlineOrdersQuery, posController.listIncomingOnlineOrders);
router.get('/order-history', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validateOnlineOrderHistoryQuery, posController.listOnlineOrderHistory);
router.get('/delivery-personnel', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validateDeliveryPersonnelListQuery, posController.listActiveDeliveryPersonnel);
router.get('/admin/location-monitor', checkPermission(PERMISSIONS.POS.actions.SWITCH_LOCATION_POS), validateAdminLocationMonitorQuery, posController.getAdminLocationMonitor);
router.post('/orders/:id/collect-cash', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), posController.requirePairedTerminal, validatePosTransactionIdParam, validateCollectCashPickupOrder, posController.collectCashPickupOrder);
router.post('/orders/:id/collect-delivery-cash', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), posController.requirePairedTerminal, validatePosTransactionIdParam, validateCollectCashDeliveryOrder, posController.collectCashDeliveryOrder);
// ADR 0031: online order lifecycle uses logical terminal/open-shift checks; physical pairing must not block.
router.patch('/orders/:id/delivery-job/status', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validatePosTransactionIdParam, validateUpdateDeliveryJobStatus, posController.updateDeliveryJobStatus);
router.patch('/orders/:id/delivery-job/assignment', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validatePosTransactionIdParam, validateAssignDeliveryPersonnel, posController.assignDeliveryPersonnel);
router.patch('/orders/:id/status', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validatePosTransactionIdParam, validateUpdateOnlineOrderStatus, posController.updateOnlineOrderStatus);
router.get('/z-reading/close-readiness', checkPermission(PERMISSIONS.POS.actions.CLOSE_DAY_POS), posController.requirePairedTerminal, posController.getDayCloseReadiness);
router.post('/z-reading/close-day', checkPermission(PERMISSIONS.POS.actions.CLOSE_DAY_POS), posController.requirePairedTerminal, validateCloseDayBody, posController.closeDayZReading);
router.post('/z-reading/governed-reset', checkPermission(PERMISSIONS.POS.actions.CLOSE_DAY_POS), posController.requirePairedTerminal, validateGovernedResetBody, posController.incrementGovernedResetCounter);
router.get('/x-reading/current', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validateXReadingQuery, posController.getCurrentXReading);
router.get('/z-reading/:date', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validateZReadingDateParam, validateZReadingQuery, posController.getDailyZReading);

export default router;
