import express from 'express';
import * as posController from '../controllers/posController.js';
import { authenticate, checkPermission, requirePremium, requireTenantCapability } from '../middleware/auth.js';
import { posLimiter } from '../middleware/rateLimiter.js';
import { PERMISSIONS } from '../config/permissions.js';
import { posCatalogBulkImageUpload, posCatalogImageUpload } from '../config/uploadConfig.js';
import {
    validatePosCheckout,
    validatePosCatalogQuery,
    validatePosScan,
    validatePosCatalogOverridesQuery,
    validatePosCatalogOverrideParam,
    validateUpdatePosCatalogOverride,
    validatePosReportsQuery,
    validatePosTransactionsQuery,
    validatePosReportsQuery,
    validatePosReportsExportQuery,
    validatePosTransactionIdParam,
    validateZReadingDateParam,
    validateCloseDayBody,
    validateXReadingQuery,
    validateGovernedResetBody,
    validateTerminalCurrentShiftQuery,
    validateTerminalDashboardTodayQuery,
    validateIncomingOnlineOrdersQuery,
    validateShiftIdParam,
    validateOpenTerminalShift,
    validateSwitchTerminalShiftLocation,
    validateCashDrawerEvent,
    validateCloseTerminalShift,
    validateUpdateOnlineOrderStatus,
    validatePosDeviceReceiptPrint,
    validatePosDeviceDrawerOpen,
    validateFiscalPrintEvent,
    validateVoidPosTransaction,
    validateGenerateESalesReport,
    validateUpdateESalesReportStatus,
    validateFiscalTerminalRegistration,
    validateVerifyTerminal,
    validatePosCashierLogin,
    validateSetupCashier
} from '../validators/posValidator.js';

const router = express.Router();

router.use(authenticate);
router.use(requirePremium);
router.use(requireTenantCapability('tenant_pos_enabled', 'POS'));
router.use(posLimiter);

router.post('/terminal/pair', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validateVerifyTerminal, posController.verifyTerminal);
router.get('/terminal/paired', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), posController.getPairedTerminal);
router.delete('/terminal/paired', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), posController.clearPairedTerminal);
router.post('/auth/cashier-login', validatePosCashierLogin, posController.loginCashier);
router.get('/setup/cashiers', checkPermission(PERMISSIONS.SYSTEM.actions.MANAGE_USERS), posController.listSetupCashiers);
router.post('/setup/cashiers', checkPermission(PERMISSIONS.SYSTEM.actions.MANAGE_USERS), validateSetupCashier, posController.createSetupCashier);

router.get('/catalog', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validatePosCatalogQuery, posController.listCatalog);
router.post('/scan', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validatePosScan, posController.scanBarcode);
router.get('/catalog-overrides', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validatePosCatalogOverridesQuery, posController.listCatalogOverrides);
router.patch('/catalog-overrides/bulk', checkPermission(PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), posController.updateBulkCatalogOverrides);
router.post('/catalog-overrides/images/bulk', checkPermission(PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), posCatalogBulkImageUpload.array('images', 50), posController.uploadBulkCatalogImages);
router.patch('/catalog-overrides/:item_id', checkPermission(PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), validatePosCatalogOverrideParam, validateUpdatePosCatalogOverride, posController.updateCatalogOverride);
router.post('/catalog-overrides/:item_id/image', checkPermission(PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), validatePosCatalogOverrideParam, posCatalogImageUpload.single('image'), posController.uploadCatalogImage);
router.delete('/catalog-overrides/:item_id/image', checkPermission(PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), validatePosCatalogOverrideParam, posController.deleteCatalogImage);
router.post('/checkouts', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validatePosCheckout, posController.checkout);
router.get('/transactions', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validatePosTransactionsQuery, posController.listTransactions);
router.get('/transactions/:id', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validatePosTransactionIdParam, posController.getTransactionById);
router.get('/terminal/shifts/current', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validateTerminalCurrentShiftQuery, posController.getCurrentTerminalShift);
router.post('/terminal/shifts/open', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateOpenTerminalShift, posController.openTerminalShift);
router.post('/terminal/shifts/:id/switch-location', checkPermission(PERMISSIONS.POS.actions.SWITCH_LOCATION_POS), posController.requirePairedTerminal, validateShiftIdParam, validateSwitchTerminalShiftLocation, posController.switchTerminalShiftLocation);
router.post('/terminal/shifts/:id/cash-events', checkPermission(PERMISSIONS.POS.actions.ADJUST_CASH_DRAWER), posController.requirePairedTerminal, validateShiftIdParam, validateCashDrawerEvent, posController.recordCashDrawerEvent);
router.post('/terminal/shifts/:id/close', checkPermission(PERMISSIONS.POS.actions.CLOSE_SHIFT_POS), posController.requirePairedTerminal, validateShiftIdParam, validateCloseTerminalShift, posController.closeTerminalShift);
router.get('/terminal/dashboard/today', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validateTerminalDashboardTodayQuery, posController.getTerminalTodayDashboard);
router.get('/reports/overview', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validatePosReportsQuery, posController.getReportsOverview);
router.get('/reports/export', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validatePosReportsExportQuery, posController.exportReports);
router.get('/device/status', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), posController.getDeviceStatus);
router.post('/device/print-receipt', checkPermission(PERMISSIONS.POS.actions.REPRINT_POS_RECEIPT), posController.requirePairedTerminal, validatePosDeviceReceiptPrint, posController.printReceipt);
router.post('/device/open-drawer', checkPermission(PERMISSIONS.POS.actions.ADJUST_CASH_DRAWER), posController.requirePairedTerminal, validatePosDeviceDrawerOpen, posController.openDeviceDrawer);
router.get('/reports/overview', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validatePosReportsQuery, posController.getReportsOverview);
router.get('/reports/export', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validatePosReportsQuery, posController.exportReports);
router.post('/transactions/:id/fiscal-print-events', checkPermission(PERMISSIONS.POS.actions.REPRINT_POS_RECEIPT), posController.requirePairedTerminal, validatePosTransactionIdParam, validateFiscalPrintEvent, posController.recordFiscalPrintEvent);
router.post('/transactions/:id/void', checkPermission(PERMISSIONS.POS.actions.VOID_POS_TRANSACTION), posController.requirePairedTerminal, validatePosTransactionIdParam, validateVoidPosTransaction, posController.voidTransaction);
router.get('/fiscal-terminal-registrations', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), posController.listFiscalTerminalRegistrations);
router.put('/fiscal-terminal-registrations', checkPermission(PERMISSIONS.POS.actions.MANAGE_FISCAL_TERMINALS), validateFiscalTerminalRegistration, posController.upsertFiscalTerminalRegistration);
router.get('/esales-reports', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), posController.listESalesReports);
router.post('/esales-reports/generate', checkPermission(PERMISSIONS.POS.actions.MANAGE_ESALES_REPORTS), validateGenerateESalesReport, posController.generateESalesReport);
router.patch('/esales-reports/:id/status', checkPermission(PERMISSIONS.POS.actions.MANAGE_ESALES_REPORTS), validatePosTransactionIdParam, validateUpdateESalesReportStatus, posController.updateESalesReportStatus);
router.get('/fiscal-ledger/integrity', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), posController.verifyFiscalEventLedger);
router.get('/incoming-orders', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validateIncomingOnlineOrdersQuery, posController.listIncomingOnlineOrders);
// ADR 0031: online order lifecycle uses logical terminal/open-shift checks; physical pairing must not block.
router.patch('/orders/:id/status', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validatePosTransactionIdParam, validateUpdateOnlineOrderStatus, posController.updateOnlineOrderStatus);
router.post('/z-reading/close-day', checkPermission(PERMISSIONS.POS.actions.CLOSE_DAY_POS), posController.requirePairedTerminal, validateCloseDayBody, posController.closeDayZReading);
router.post('/z-reading/governed-reset', checkPermission(PERMISSIONS.POS.actions.CLOSE_DAY_POS), posController.requirePairedTerminal, validateGovernedResetBody, posController.incrementGovernedResetCounter);
router.get('/x-reading/current', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validateXReadingQuery, posController.getCurrentXReading);
router.get('/z-reading/:date', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validateZReadingDateParam, posController.getDailyZReading);

export default router;
