import express from 'express';
import * as posController from '../controllers/posController.js';
import * as employeeCreditController from '../modules/employeeCredit/controllers/employeeCreditHandlers.js';
import * as employeeController from '../modules/employees/controllers/employeeHandlers.js';
import * as deliveryPersonnelController from '../modules/deliveryPersonnel/controllers/deliveryPersonnelHandlers.js';
import { authenticate, checkAnyPermission, checkPermission, requirePremium, requireTenantCapability } from '../middleware/auth.js';
import { requireWorkflowCapability } from '../middleware/workflowModeCapability.js';
import { posDrawerAuthorizationLimiter, posLimiter } from '../middleware/rateLimiter.js';
import { PERMISSIONS } from '../config/permissions.js';
import { posCatalogBulkImageUpload, posCatalogImageUpload, posPaymentProofUpload, preserveTenantContext } from '../config/uploadConfig.js';
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
    validateProcurementExportQuery,
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
    validateRecordOrderBalancePayment,
    validatePosBalancePaymentProofParams,
    validateUpdateDeliveryJobStatus,
    validateAssignDeliveryPersonnel,
    validateShiftIdParam,
    validateOpenTerminalShift,
    validateAttendanceMutation,
    validateAttendanceQuery,
    validateAttendanceConfigUpdate,
    validateAttendanceCorrection,
    validateCashierPin,
    validateOperatorTransition,
    validateOperatorCurrentQuery,
    validateCashierResume,
    validateOperatorEnd,
    validateSwitchTerminalShiftLocation,
    validateCashDrawerEvent,
    validateCloseTerminalShift,
    validateForceCloseStaleTerminalShift,
    validateUpdateOnlineOrderStatus,
    validateUpdateOnlineOrderDeliveryAddress,
    validatePosDeviceReceiptPrint,
    validateOnlineOrderReceiptAutoPrintClaim,
    validatePosDeviceShiftSummaryPrint,
    validatePosDeviceZReadingPrint,
    validatePosDeviceDrawerOpen,
    validatePosDrawerAuthorization,
    validateFiscalPrintEvent,
    validateVoidPosTransaction,
    validateOverrideDeliveryFee,
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
    validateEmployeeCreditReportQuery,
    validateDeliveryPersonnelRegistryQuery,
    validateDeliveryPersonnelParam,
    validateDeliveryPersonnelCreate,
    validateDeliveryPersonnelUpdate,
    validateDeliveryRunCreate,
    validateDeliveryRunUpdate,
    validateDeliveryRunIdParam,
    validateDeliveryRunMemberParam,
    validateDeliveryRunPersonnelSet,
    validateDeliveryRunMembersAdd,
    validateDeliveryRunDispatch,
    validateDeliveryRunListQuery
} from '../validators/posValidator.js';
import * as deliveryRunController from '../modules/pos/controllers/deliveryRunHandlers.js';

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

router.get('/attendance/config', checkPermission(PERMISSIONS.SYSTEM.actions.VIEW_SETTINGS), posController.getAttendanceConfig);
router.put('/attendance/config', checkPermission(PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS), validateAttendanceConfigUpdate, posController.updateAttendanceConfig);
router.get('/attendance/current', checkPermission(PERMISSIONS.POS.actions.VIEW_ATTENDANCE), validateAttendanceQuery, posController.getCurrentAttendance);
router.post('/attendance/time-in', checkPermission(PERMISSIONS.POS.actions.OPERATE_ATTENDANCE), validateAttendanceMutation, posController.timeInAttendance);
router.post('/attendance/time-out', checkPermission(PERMISSIONS.POS.actions.OPERATE_ATTENDANCE), validateAttendanceMutation, posController.timeOutAttendance);
router.post('/attendance/breaks/start', checkPermission(PERMISSIONS.POS.actions.OPERATE_ATTENDANCE), validateAttendanceMutation, posController.startAttendanceBreak);
router.post('/attendance/breaks/end', checkPermission(PERMISSIONS.POS.actions.OPERATE_ATTENDANCE), validateAttendanceMutation, posController.endAttendanceBreak);
router.post('/attendance/relief/start', checkPermission(PERMISSIONS.POS.actions.OPERATE_ATTENDANCE), validateAttendanceMutation, posController.startReliefDuty);
router.post('/attendance/relief/end', checkPermission(PERMISSIONS.POS.actions.OPERATE_ATTENDANCE), validateAttendanceMutation, posController.endReliefDuty);
router.post('/attendance/corrections', checkPermission(PERMISSIONS.POS.actions.MANAGE_ATTENDANCE), validateAttendanceCorrection, posController.correctAttendance);

// Phase 159: secure operator authority and custody transitions. These routes are
// deliberately paired-terminal scoped, CSRF-protected by the global middleware,
// and remain inaccessible while the lifecycle flag is disabled.
router.post('/operator/pin/enroll', checkPermission(PERMISSIONS.POS.actions.OPERATE_ATTENDANCE), validateCashierPin, posController.enrollCashierPin);
router.post('/operator/pin/reset', checkPermission(PERMISSIONS.SYSTEM.actions.MANAGE_USERS), validateCashierPin, posController.resetCashierPin);
// #1045: permission is enforced INSIDE the use case, after the attendance-feature
// resolve (posOperatorAuthorityUseCases.js getCurrent, posCashierLifecycleUseCases.js
// resume), so a location with pos_cashier_attendance_lifecycle_v1 disabled answers
// POS_ATTENDANCE_FEATURE_DISABLED instead of a bare 403 the terminal reads as "another
// cashier owns this register." Do not re-add checkPermission here — see the two
// use cases above for the fail-closed check that replaces it.
router.get('/terminal/operator/current', posController.requirePairedTerminal, validateOperatorCurrentQuery, posController.getCurrentOperator);
router.get('/terminal/operator/eligible', checkPermission(PERMISSIONS.POS.actions.VIEW_ATTENDANCE), posController.requirePairedTerminal, validateOperatorCurrentQuery, posController.listEligibleOperators);
router.post('/terminal/operator/resume', posController.requirePairedTerminal, validateCashierResume, posController.resumeCashier);
router.post('/terminal/operator/takeover', checkPermission(PERMISSIONS.POS.actions.OPERATE_ATTENDANCE), posController.requirePairedTerminal, validateOperatorTransition, posController.takeOverRegister);
router.post('/terminal/operator/return', checkPermission(PERMISSIONS.POS.actions.OPERATE_ATTENDANCE), posController.requirePairedTerminal, validateOperatorTransition, posController.returnRegister);
router.post('/terminal/operator/shared-relief/start', checkPermission(PERMISSIONS.POS.actions.OPERATE_ATTENDANCE), posController.requirePairedTerminal, validateOperatorTransition, posController.startSharedRelief);
router.post('/terminal/operator/shared-relief/end', checkPermission(PERMISSIONS.POS.actions.OPERATE_ATTENDANCE), posController.requirePairedTerminal, validateOperatorTransition, posController.endSharedRelief);
router.post('/terminal/operator/handoff/count', checkPermission(PERMISSIONS.POS.actions.OPERATE_ATTENDANCE), posController.requirePairedTerminal, validateOperatorTransition, posController.countedCustodyHandoff);
router.post('/terminal/operator/end', checkPermission(PERMISSIONS.POS.actions.OPERATE_ATTENDANCE), posController.requirePairedTerminal, validateOperatorEnd, posController.endOperatorSession);

router.get('/catalog', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validatePosCatalogQuery, posController.listCatalog);
router.get('/catalog/events', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), posController.streamCatalogEvents);
router.post('/scan', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validatePosScan, posController.scanBarcode);
router.get('/catalog-overrides', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validatePosCatalogOverridesQuery, posController.listCatalogOverrides);
router.patch('/catalog-overrides/bulk', checkPermission(PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), posController.updateBulkCatalogOverrides);
router.post('/catalog-overrides/images/bulk', checkPermission(PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), preserveTenantContext(posCatalogBulkImageUpload.array('images', 50)), posController.uploadBulkCatalogImages);
router.patch('/catalog-overrides/:item_id', checkPermission(PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), validatePosCatalogOverrideParam, validateUpdatePosCatalogOverride, posController.updateCatalogOverride);
router.post('/catalog-overrides/:item_id/image', checkPermission(PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), validatePosCatalogOverrideParam, preserveTenantContext(posCatalogImageUpload.fields([{ name: 'image', maxCount: 1 }, { name: 'image_medium', maxCount: 1 }, { name: 'image_thumbnail', maxCount: 1 }])), posController.uploadCatalogImage);
router.delete('/catalog-overrides/:item_id/image', checkPermission(PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), validatePosCatalogOverrideParam, posController.deleteCatalogImage);
router.post('/checkouts', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), posController.requirePairedTerminal, validatePosCheckout, requireEmployeeCreditCheckoutPermission, posController.requireActiveOperatorForMutation, posController.checkout);
router.post('/parked-sales', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), posController.requirePairedTerminal, validateCreatePosParkedSale, posController.requireActiveOperatorForMutation, posController.createParkedSale);
router.get('/parked-sales', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validateListPosParkedSales, posController.listParkedSales);
router.post('/parked-sales/:id/claim', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), posController.requirePairedTerminal, validateParkedSaleIdParam, validateClaimPosParkedSale, posController.requireActiveOperatorForMutation, posController.claimParkedSale);
router.post('/parked-sales/:id/repark', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), posController.requirePairedTerminal, validateParkedSaleIdParam, validateReparkPosParkedSale, posController.requireActiveOperatorForMutation, posController.reparkParkedSale);
router.post('/parked-sales/:id/cancel', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), posController.requirePairedTerminal, validateParkedSaleIdParam, validateCancelPosParkedSale, posController.requireActiveOperatorForMutation, posController.cancelParkedSale);
router.post('/payment-sessions', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), posController.requirePairedTerminal, validateCreatePosPaymentSession, posController.requireActiveOperatorForMutation, posController.createPaymentSession);
router.get('/payment-sessions/active', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateSplitPaymentSessionScopeQuery, posController.getActivePaymentSession);
router.get('/payment-sessions/:id', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validateSplitPaymentSessionIdParam, validateSplitPaymentSessionScopeQuery, posController.getPaymentSession);
router.post('/payment-sessions/:id/allocations', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), posController.requirePairedTerminal, validateSplitPaymentSessionIdParam, validateAddPosPaymentAllocation, posController.requireActiveOperatorForMutation, posController.addPaymentAllocation);
router.post('/payment-sessions/:id/allocations/:allocation_id/cancel', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), posController.requirePairedTerminal, validateSplitPaymentAllocationIdParam, validateCancelPosPayment, posController.requireActiveOperatorForMutation, posController.cancelPaymentAllocation);
router.post('/payment-sessions/:id/allocations/:allocation_id/confirm', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), posController.requirePairedTerminal, validateSplitPaymentAllocationIdParam, validateConfirmPosPaymentAllocation, posController.requireActiveOperatorForMutation, posController.confirmPaymentAllocation);
router.post('/payment-sessions/:id/allocations/:allocation_id/reconcile', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), posController.requirePairedTerminal, validateSplitPaymentAllocationIdParam, validateReconcilePosPaymentAllocation, posController.requireActiveOperatorForMutation, posController.reconcilePaymentAllocation);
router.post('/payment-sessions/:id/cancel', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), posController.requirePairedTerminal, validateSplitPaymentSessionIdParam, validateCancelPosPayment, posController.requireActiveOperatorForMutation, posController.cancelPaymentSession);
router.post('/payment-sessions/:id/complete', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), posController.requirePairedTerminal, validateSplitPaymentSessionIdParam, validateCompletePosPayment, posController.requireActiveOperatorForMutation, posController.completePaymentSession);
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
router.get('/discount-employees', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), posController.listDiscountEmployees);
router.post('/discount-approvals/verify', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), posController.requirePairedTerminal, validatePosDiscountApproval, posController.requireActiveOperatorForMutation, posController.verifyDiscountApproval);
router.get('/transactions', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validatePosTransactionsQuery, posController.listTransactions);
router.get('/transactions/:id', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validatePosTransactionIdParam, posController.getTransactionById);
router.get('/terminal/shifts/current', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validateTerminalCurrentShiftQuery, posController.getCurrentTerminalShift);
router.get('/terminal/shifts/history', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validateTerminalShiftHistoryQuery, posController.getCashierShiftHistory);
router.post('/terminal/shifts/open', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateOpenTerminalShift, posController.openTerminalShift);
router.post('/terminal/shifts/:id/switch-location', checkPermission(PERMISSIONS.POS.actions.SWITCH_LOCATION_POS), posController.requirePairedTerminal, validateShiftIdParam, validateSwitchTerminalShiftLocation, posController.switchTerminalShiftLocation);
router.post('/terminal/shifts/:id/cash-events', checkPermission(PERMISSIONS.POS.actions.ADJUST_CASH_DRAWER), posController.requirePairedTerminal, validateShiftIdParam, validateCashDrawerEvent, posController.requireActiveOperatorForMutation, posController.recordCashDrawerEvent);
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
// Phase 261 (#1488): pre-run procurement CSV export, deliberately no shift_id requirement --
// usable before a run is built, unlike the shift-bound incoming-orders queue below.
router.get('/reports/procurement-export', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validateProcurementExportQuery, posController.exportProcurementCsv);
router.get('/device/status', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), posController.getDeviceStatus);
router.post('/device/print-receipt', checkPermission(PERMISSIONS.POS.actions.REPRINT_POS_RECEIPT), posController.requirePairedTerminal, validatePosDeviceReceiptPrint, posController.printReceipt);
router.post('/device/online-order-receipt-claim', checkPermission(PERMISSIONS.POS.actions.REPRINT_POS_RECEIPT), posController.requirePairedTerminal, validateOnlineOrderReceiptAutoPrintClaim, posController.claimOnlineOrderReceiptAutoPrint);
router.post('/terminal/shifts/:id/print-summary', checkPermission(PERMISSIONS.POS.actions.REPRINT_POS_RECEIPT), validateShiftIdParam, validatePosDeviceShiftSummaryPrint, posController.printShiftSummary);
router.post('/z-reading/:date/print', checkPermission(PERMISSIONS.POS.actions.CLOSE_DAY_POS), posController.requirePairedTerminal, validateZReadingDateParam, validatePosDeviceZReadingPrint, posController.printZReading);
router.post('/device/open-drawer', checkPermission(PERMISSIONS.POS.actions.ADJUST_CASH_DRAWER), posController.requirePairedTerminal, validatePosDeviceDrawerOpen, posController.requireActiveOperatorForMutation, posController.openDeviceDrawer);
router.post('/device/authorize-drawer', checkPermission(PERMISSIONS.POS.actions.ADJUST_CASH_DRAWER), posController.requirePairedTerminal, posDrawerAuthorizationLimiter, validatePosDrawerAuthorization, posController.requireActiveOperatorForMutation, posController.authorizeDeviceDrawer);
router.post('/transactions/:id/fiscal-print-events', checkPermission(PERMISSIONS.POS.actions.REPRINT_POS_RECEIPT), posController.requirePairedTerminal, validatePosTransactionIdParam, validateFiscalPrintEvent, posController.recordFiscalPrintEvent);
router.post('/transactions/:id/void', checkPermission(PERMISSIONS.POS.actions.VOID_POS_TRANSACTION), posController.requirePairedTerminal, validatePosTransactionIdParam, validateVoidPosTransaction, posController.requireActiveOperatorForMutation, posController.voidTransaction);
// Phase 238 (#1330): not gated on a paired terminal/active shift, unlike void/refund above --
// same class of guard as PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS (a permissioned order-level
// edit, not a terminal cash-handling action), so it works from a back-office screen too.
router.patch('/transactions/:id/delivery-fee', checkPermission(PERMISSIONS.POS.actions.OVERRIDE_DELIVERY_FEE), validatePosTransactionIdParam, validateOverrideDeliveryFee, posController.overrideDeliveryFee);
router.post('/transactions/:id/cash-refund', checkPermission(PERMISSIONS.POS.actions.ADJUST_CASH_DRAWER), posController.requirePairedTerminal, validatePosTransactionIdParam, validateCashRefundPosTransaction, posController.requireActiveOperatorForMutation, posController.cashRefundTransaction);
router.post('/transactions/:id/external-refund', checkPermission(PERMISSIONS.POS.actions.VOID_POS_TRANSACTION), posController.requirePairedTerminal, validatePosTransactionIdParam, validateExternalRefundPosTransaction, posController.requireActiveOperatorForMutation, posController.externalRefundTransaction);
router.post('/transactions/:id/provider-refund', checkPermission(PERMISSIONS.POS.actions.VOID_POS_TRANSACTION), posController.requirePairedTerminal, validatePosTransactionIdParam, validateProviderRefundPosTransaction, posController.requireActiveOperatorForMutation, posController.providerRefundTransaction);
router.post('/transactions/:id/split-allocations/:allocation_id/reversal', checkAnyPermission([
    PERMISSIONS.POS.actions.VOID_POS_TRANSACTION,
    PERMISSIONS.POS.actions.ADJUST_CASH_DRAWER
]), posController.requirePairedTerminal, validateSplitPaymentAllocationIdParam, validateSplitAllocationReversal, posController.requireActiveOperatorForMutation, posController.splitAllocationReversal);
router.get('/fiscal-terminal-registrations', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), posController.listFiscalTerminalRegistrations);
router.put('/fiscal-terminal-registrations', checkPermission(PERMISSIONS.POS.actions.MANAGE_FISCAL_TERMINALS), validateFiscalTerminalRegistration, posController.upsertFiscalTerminalRegistration);
router.get('/esales-reports', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), posController.listESalesReports);
router.post('/esales-reports/generate', checkPermission(PERMISSIONS.POS.actions.MANAGE_ESALES_REPORTS), validateGenerateESalesReport, posController.generateESalesReport);
router.patch('/esales-reports/:id/status', checkPermission(PERMISSIONS.POS.actions.MANAGE_ESALES_REPORTS), validatePosTransactionIdParam, validateUpdateESalesReportStatus, posController.updateESalesReportStatus);
router.get('/fiscal-ledger/integrity', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), posController.verifyFiscalEventLedger);
router.get('/incoming-orders', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validateIncomingOnlineOrdersQuery, posController.listIncomingOnlineOrders);
router.get('/order-history', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validateOnlineOrderHistoryQuery, posController.listOnlineOrderHistory);
router.get('/delivery-personnel', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validateDeliveryPersonnelListQuery, posController.listActiveDeliveryPersonnel);
router.get('/delivery-personnel/registry', checkPermission(PERMISSIONS.POS.actions.MANAGE_EMPLOYEES), validateDeliveryPersonnelRegistryQuery, deliveryPersonnelController.listDeliveryPersonnelRegistry);
router.post('/delivery-personnel', checkPermission(PERMISSIONS.POS.actions.MANAGE_EMPLOYEES), validateDeliveryPersonnelCreate, deliveryPersonnelController.createDeliveryPersonnel);
router.patch('/delivery-personnel/:deliveryPersonnelId', checkPermission(PERMISSIONS.POS.actions.MANAGE_EMPLOYEES), validateDeliveryPersonnelParam, validateDeliveryPersonnelUpdate, deliveryPersonnelController.updateDeliveryPersonnel);
// Phase 225 (#1273/#1081): delivery run CRUD + membership. `pos:transact` for mutations, matching
// ADR 0034's 2026-08-08 amendment grant for selecting a delivery person / advancing a manual job --
// runs are that same authority exercised in bulk. `pos:view` for reads matches GET /delivery-personnel.
router.post('/delivery-runs', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateDeliveryRunCreate, deliveryRunController.createDeliveryRun);
router.get('/delivery-runs', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validateDeliveryRunListQuery, deliveryRunController.listDeliveryRuns);
router.get('/delivery-runs/:deliveryRunId', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validateDeliveryRunIdParam, deliveryRunController.getDeliveryRun);
router.patch('/delivery-runs/:deliveryRunId', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateDeliveryRunIdParam, validateDeliveryRunUpdate, deliveryRunController.updateDeliveryRun);
router.put('/delivery-runs/:deliveryRunId/personnel', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateDeliveryRunIdParam, validateDeliveryRunPersonnelSet, deliveryRunController.setDeliveryRunPersonnel);
router.post('/delivery-runs/:deliveryRunId/members', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateDeliveryRunIdParam, validateDeliveryRunMembersAdd, deliveryRunController.addDeliveryRunMembers);
router.delete('/delivery-runs/:deliveryRunId/members/:posTransactionId', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateDeliveryRunMemberParam, deliveryRunController.removeDeliveryRunMember);
// Phase 228 (#1273/#1271): best-effort dispatch of every eligible member -- see
// buildDispatchDeliveryRunUseCase for the guard chain and reason-code taxonomy.
router.post('/delivery-runs/:deliveryRunId/dispatch', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateDeliveryRunIdParam, validateDeliveryRunDispatch, deliveryRunController.dispatchDeliveryRun);
router.get('/admin/location-monitor', checkPermission(PERMISSIONS.POS.actions.SWITCH_LOCATION_POS), validateAdminLocationMonitorQuery, posController.getAdminLocationMonitor);
router.post('/orders/:id/collect-cash', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), posController.requirePairedTerminal, validatePosTransactionIdParam, validateCollectCashPickupOrder, posController.requireActiveOperatorForMutation, posController.collectCashPickupOrder);
router.post('/orders/:id/collect-delivery-cash', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), posController.requirePairedTerminal, validatePosTransactionIdParam, validateCollectCashDeliveryOrder, posController.requireActiveOperatorForMutation, posController.collectCashDeliveryOrder);
// Phase 148 (#825): balance settlement for a partially-paid downpayment order. Same permission,
// pairing, and param-validation chain as the two collect-cash routes above -- it is the same class
// of money-recording action at the same terminal, just for the balance leg (ADR 0069 clause 2
// [binding], carried forward by ADR 0070: staff-recorded, never a second automatic charge).
router.post('/orders/:id/record-payment', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), posController.requirePairedTerminal, validatePosTransactionIdParam, validateRecordOrderBalancePayment, posController.requireActiveOperatorForMutation, posController.recordOrderBalancePayment);
// Phase 204 (#965): proof-of-payment image for an already-recorded balance settlement. Same
// authority tier as record-payment above (TRANSACT_POS + pairing + active-operator) -- attaching
// evidence to a payment is the same class of action as recording it. Pat's decision on #965: this
// is financial-evidence PII and must never be served through a public/static path -- see the authed
// streaming GET immediately below, and PHASE_204_PLAN.md section 4.
router.post(
    '/orders/:id/balance-payments/:payment_id/proof',
    checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS),
    posController.requirePairedTerminal,
    validatePosBalancePaymentProofParams,
    preserveTenantContext(posPaymentProofUpload.single('proof')),
    posController.requireActiveOperatorForMutation,
    posController.uploadOrderBalancePaymentProof
);
// VIEW_POS, not TRANSACT_POS -- reading evidence is a read-tier action; a manager reviewing a
// settlement should not need transact rights. No requirePairedTerminal -- pairing is a mutation
// control on this router, and requiring it here would block back-office review from a
// non-terminal browser for no security gain (tenant scope + permission already bound the read).
router.get(
    '/orders/:id/balance-payments/:payment_id/proof',
    checkPermission(PERMISSIONS.POS.actions.VIEW_POS),
    validatePosBalancePaymentProofParams,
    posController.getOrderBalancePaymentProof
);
// ADR 0031: online order lifecycle uses logical terminal/open-shift checks; physical pairing must not block.
router.patch('/orders/:id/delivery-job/status', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validatePosTransactionIdParam, validateUpdateDeliveryJobStatus, posController.updateDeliveryJobStatus);
router.patch('/orders/:id/delivery-job/assignment', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validatePosTransactionIdParam, validateAssignDeliveryPersonnel, posController.assignDeliveryPersonnel);
router.patch('/orders/:id/status', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validatePosTransactionIdParam, validateUpdateOnlineOrderStatus, posController.updateOnlineOrderStatus);
// Phase 210 (#1179). Staff-only post-placement delivery address/pin edit. Same permission as the
// status update above -- this is a staff order-management action on the same surface.
router.patch('/orders/:id/delivery-address', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validatePosTransactionIdParam, validateUpdateOnlineOrderDeliveryAddress, posController.updateOnlineOrderDeliveryAddress);
router.get('/z-reading/close-readiness', checkPermission(PERMISSIONS.POS.actions.CLOSE_DAY_POS), posController.requirePairedTerminal, posController.getDayCloseReadiness);
router.post('/z-reading/close-day', checkPermission(PERMISSIONS.POS.actions.CLOSE_DAY_POS), posController.requirePairedTerminal, validateCloseDayBody, posController.closeDayZReading);
router.post('/z-reading/governed-reset', checkPermission(PERMISSIONS.POS.actions.CLOSE_DAY_POS), posController.requirePairedTerminal, validateGovernedResetBody, posController.incrementGovernedResetCounter);
router.get('/x-reading/current', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validateXReadingQuery, posController.getCurrentXReading);
router.get('/z-reading/:date', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validateZReadingDateParam, validateZReadingQuery, posController.getDailyZReading);

export default router;
