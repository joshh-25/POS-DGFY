import express from 'express';
import { authenticate, requireTenantCapability } from '../middleware/auth.js';
import * as businessAdminHandlers from '../modules/businessAdmin/controllers/businessAdminHandlers.js';
import { validatePosTransactionIdParam, validateDecideBusinessAdminApproval } from '../validators/posValidator.js';
import { validateBusinessAdminEndAttendanceShift, validateUpdateBusinessAdminCompanyName } from '../validators/businessAdminValidator.js';
import { requireBusinessAdminDashboardEnabled } from '../modules/businessAdmin/middleware/businessAdminRolloutGate.js';

const router = express.Router();

router.use(authenticate);
router.use(requireBusinessAdminDashboardEnabled);

// OPIS needs the shared bootstrap to render tenant-facing Back Office modules that do not
// depend on POS, including storefront QR management. Keep the POS capability gate on the
// operational endpoints below instead of blocking the entire OPIS shell.
router.get('/bootstrap', businessAdminHandlers.getBootstrap);

// Canonical tenant identity is an OPIS/admin concern and must remain available even when
// POS is disabled for the tenant. The use case still enforces admin-only mutation authority.
router.patch('/company/name', validateUpdateBusinessAdminCompanyName, businessAdminHandlers.updateCompanyName);

router.use(requireTenantCapability('tenant_pos_enabled', 'POS'));

router.get('/company', businessAdminHandlers.getCompany);
router.get('/overview', businessAdminHandlers.getOverview);
router.get('/multi-company/overview', businessAdminHandlers.getMultiCompanyOverview);
router.get('/notifications', businessAdminHandlers.listNotifications);
router.patch('/notifications/:id/read', validatePosTransactionIdParam, businessAdminHandlers.markNotificationRead);
router.post('/notifications/:id/dismiss', validatePosTransactionIdParam, businessAdminHandlers.dismissNotification);
router.post('/notifications/:id/acknowledge', validatePosTransactionIdParam, businessAdminHandlers.acknowledgeNotification);
// `/activity` was a mixed notification/audit feed. Keep the legacy URL as a
// redirect so clients follow the canonical immutable Audit owner.
router.get('/activity', (req, res) => {
    const query = req.originalUrl?.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
    return res.redirect(308, `${req.baseUrl}/audit${query}`);
});
router.get('/reports', businessAdminHandlers.getReports);
router.get('/pos-activity-analytics', businessAdminHandlers.getPosActivityAnalytics);
router.get('/reports/definitions', businessAdminHandlers.listReportDefinitions);
router.get('/reports/evidence/catalog', businessAdminHandlers.listEvidenceCatalog);
router.get('/reports/evidence/ejournal', businessAdminHandlers.getEJournalEvidence);
router.get('/reports/datasets/:reportKey', businessAdminHandlers.getReportDataset);
router.get('/reports/datasets/:reportKey/export', businessAdminHandlers.exportReportDataset);
router.get('/inventory/valuation', businessAdminHandlers.getInventoryValuation);
router.get('/inventory/stock', businessAdminHandlers.listInventoryStock);
router.get('/workforce', businessAdminHandlers.getWorkforce);
router.get('/attendance', businessAdminHandlers.getAttendance);
router.post('/attendance/shifts/:id/end', validatePosTransactionIdParam, validateBusinessAdminEndAttendanceShift, businessAdminHandlers.endAttendanceShift);
router.get('/fiscal', businessAdminHandlers.getFiscal);
router.get('/inventory/recipes', businessAdminHandlers.listRecipes);
router.get('/customers', businessAdminHandlers.listCustomers);
router.post('/customers', businessAdminHandlers.createCustomer);
router.get('/customers/:profileRef', businessAdminHandlers.getCustomerDetail);
router.get('/shifts', businessAdminHandlers.listShifts);
router.get('/orders', businessAdminHandlers.listOrders);
router.get('/orders/:id', validatePosTransactionIdParam, businessAdminHandlers.getOrderDetail);
router.get('/expenses', businessAdminHandlers.listExpenses);
router.post('/expenses', businessAdminHandlers.createExpense);
router.post('/expenses/:id/void', validatePosTransactionIdParam, businessAdminHandlers.voidExpense);
router.get('/payments/monitoring', businessAdminHandlers.getCommerceMonitoring);
router.get('/report-views', businessAdminHandlers.listSavedReportViews);
router.post('/report-views', businessAdminHandlers.createSavedReportView);
router.delete('/report-views/:id', validatePosTransactionIdParam, businessAdminHandlers.deleteSavedReportView);
router.get('/audit', businessAdminHandlers.listAudit);
router.get('/approvals', businessAdminHandlers.listApprovals);
router.post('/approvals/:id/:decision(approve|reject)', validatePosTransactionIdParam, validateDecideBusinessAdminApproval, businessAdminHandlers.decideApproval);
router.post('/approvals/:id/cancel', validatePosTransactionIdParam, businessAdminHandlers.cancelApproval);

export default router;
