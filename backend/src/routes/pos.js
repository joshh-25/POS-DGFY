import express from 'express';
import * as posController from '../controllers/posController.js';
import { authenticate, checkPermission, requirePremium } from '../middleware/auth.js';
import { authLimiter, posLimiter } from '../middleware/rateLimiter.js';
import { PERMISSIONS } from '../config/permissions.js';
import { posCatalogBulkImageUpload, posCatalogImageUpload } from '../config/uploadConfig.js';
import {
    validatePosCheckout,
    validatePosCatalogQuery,
    validatePosScan,
    validateVerifyTerminal,
    validatePosCashierLogin,
    validateSetupCashier,
    validatePosCatalogOverridesQuery,
    validatePosCatalogOverrideParam,
    validateUpdatePosCatalogOverride,
    validatePosTransactionsQuery,
    validatePosTransactionIdParam,
    validateZReadingDateParam,
    validateCloseDayBody,
    validateXReadingQuery,
    validateGovernedResetBody,
    validateTerminalCurrentShiftQuery,
    validateTerminalDashboardTodayQuery,
    validatePosReportsQuery,
    validatePosReportsExportQuery,
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
    validateFiscalTerminalRegistration
} from '../validators/posValidator.js';

const router = express.Router();

router.post('/auth/cashier-login', authLimiter, validatePosCashierLogin, posController.loginCashier);

router.use(authenticate);
router.use(requirePremium);
router.use(posLimiter);

router.get('/setup/cashiers', checkPermission(PERMISSIONS.SYSTEM.actions.MANAGE_USERS), posController.listSetupCashiers);
router.post('/setup/cashiers', checkPermission(PERMISSIONS.SYSTEM.actions.MANAGE_USERS), validateSetupCashier, posController.createSetupCashier);
router.post('/terminal/verify', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validateVerifyTerminal, posController.verifyTerminal);
router.get('/terminal/paired', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), posController.getPairedTerminal);
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
router.post('/terminal/shifts/:id/switch-location', checkPermission(PERMISSIONS.POS.actions.SWITCH_LOCATION_POS), validateShiftIdParam, validateSwitchTerminalShiftLocation, posController.switchTerminalShiftLocation);
router.post('/terminal/shifts/:id/cash-events', checkPermission(PERMISSIONS.POS.actions.ADJUST_CASH_DRAWER), validateShiftIdParam, validateCashDrawerEvent, posController.recordCashDrawerEvent);
router.post('/terminal/shifts/:id/close', checkPermission(PERMISSIONS.POS.actions.CLOSE_DAY_POS), validateShiftIdParam, validateCloseTerminalShift, posController.closeTerminalShift);
router.get('/terminal/dashboard/today', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validateTerminalDashboardTodayQuery, posController.getTerminalTodayDashboard);
router.get('/reports/overview', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validatePosReportsQuery, posController.getReportsOverview);
router.get('/reports/top-items', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validatePosReportsQuery, posController.getReportsTopItems);
router.get('/reports/comparison', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validatePosReportsQuery, posController.getReportsComparison);
router.get('/reports/profit-loss', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validatePosReportsQuery, posController.getReportsProfitLoss);
router.get('/reports/export', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validatePosReportsExportQuery, posController.exportReports);
router.get('/device/status', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), posController.getDeviceStatus);
router.post('/device/print-receipt', checkPermission(PERMISSIONS.POS.actions.REPRINT_POS_RECEIPT), validatePosDeviceReceiptPrint, posController.printReceipt);
router.post('/device/open-drawer', checkPermission(PERMISSIONS.POS.actions.ADJUST_CASH_DRAWER), validatePosDeviceDrawerOpen, posController.openDeviceDrawer);
router.post('/transactions/:id/fiscal-print-events', checkPermission(PERMISSIONS.POS.actions.REPRINT_POS_RECEIPT), validatePosTransactionIdParam, validateFiscalPrintEvent, posController.recordFiscalPrintEvent);
router.post('/transactions/:id/void', checkPermission(PERMISSIONS.POS.actions.VOID_POS_TRANSACTION), validatePosTransactionIdParam, validateVoidPosTransaction, posController.voidTransaction);
router.get('/fiscal-terminal-registrations', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), posController.listFiscalTerminalRegistrations);
router.put('/fiscal-terminal-registrations', checkPermission(PERMISSIONS.POS.actions.MANAGE_FISCAL_TERMINALS), validateFiscalTerminalRegistration, posController.upsertFiscalTerminalRegistration);
router.get('/esales-reports', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), posController.listESalesReports);
router.post('/esales-reports/generate', checkPermission(PERMISSIONS.POS.actions.MANAGE_ESALES_REPORTS), validateGenerateESalesReport, posController.generateESalesReport);
router.patch('/esales-reports/:id/status', checkPermission(PERMISSIONS.POS.actions.MANAGE_ESALES_REPORTS), validatePosTransactionIdParam, validateUpdateESalesReportStatus, posController.updateESalesReportStatus);
router.get('/fiscal-ledger/integrity', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), posController.verifyFiscalEventLedger);
router.get('/incoming-orders', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validateIncomingOnlineOrdersQuery, posController.listIncomingOnlineOrders);
router.patch('/orders/:id/status', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validatePosTransactionIdParam, validateUpdateOnlineOrderStatus, posController.updateOnlineOrderStatus);
router.post('/z-reading/close-day', checkPermission(PERMISSIONS.POS.actions.CLOSE_DAY_POS), validateCloseDayBody, posController.closeDayZReading);
router.post('/z-reading/governed-reset', checkPermission(PERMISSIONS.POS.actions.CLOSE_DAY_POS), validateGovernedResetBody, posController.incrementGovernedResetCounter);
router.get('/x-reading/current', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validateXReadingQuery, posController.getCurrentXReading);
router.get('/z-reading/:date', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validateZReadingDateParam, posController.getDailyZReading);

export default router;
