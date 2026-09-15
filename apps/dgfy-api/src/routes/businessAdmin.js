import express from 'express';
import { authenticate, requireTenantCapability } from '../middleware/auth.js';
import * as businessAdminHandlers from '../modules/businessAdmin/controllers/businessAdminHandlers.js';
import { validatePosTransactionIdParam, validateDecideBusinessAdminApproval } from '../validators/posValidator.js';
import { requireBusinessAdminDashboardEnabled } from '../modules/businessAdmin/middleware/businessAdminRolloutGate.js';

const router = express.Router();

router.use(authenticate);
router.use(requireTenantCapability('tenant_pos_enabled', 'POS'));
router.use(requireBusinessAdminDashboardEnabled);

router.get('/bootstrap', businessAdminHandlers.getBootstrap);
router.get('/overview', businessAdminHandlers.getOverview);
router.get('/multi-company/overview', businessAdminHandlers.getMultiCompanyOverview);
router.get('/notifications', businessAdminHandlers.listNotifications);
router.patch('/notifications/:id/read', validatePosTransactionIdParam, businessAdminHandlers.markNotificationRead);
router.post('/notifications/:id/dismiss', validatePosTransactionIdParam, businessAdminHandlers.dismissNotification);
router.post('/notifications/:id/acknowledge', validatePosTransactionIdParam, businessAdminHandlers.acknowledgeNotification);
router.get('/activity', businessAdminHandlers.listActivity);
router.get('/reports', businessAdminHandlers.getReports);
router.get('/reports/definitions', businessAdminHandlers.listReportDefinitions);
router.get('/reports/datasets/:reportKey', businessAdminHandlers.getReportDataset);
router.get('/reports/datasets/:reportKey/export', businessAdminHandlers.exportReportDataset);
router.get('/inventory/valuation', businessAdminHandlers.getInventoryValuation);
router.get('/inventory/stock', businessAdminHandlers.listInventoryStock);
router.get('/workforce', businessAdminHandlers.getWorkforce);
router.get('/fiscal', businessAdminHandlers.getFiscal);
router.get('/inventory/recipes', businessAdminHandlers.listRecipes);
router.get('/customers', businessAdminHandlers.listCustomers);
router.get('/customers/:profileRef', businessAdminHandlers.getCustomerDetail);
router.get('/shifts', businessAdminHandlers.listShifts);
router.get('/orders', businessAdminHandlers.listOrders);
router.get('/orders/:id', validatePosTransactionIdParam, businessAdminHandlers.getOrderDetail);
router.get('/payments/monitoring', businessAdminHandlers.getCommerceMonitoring);
router.get('/report-views', businessAdminHandlers.listSavedReportViews);
router.post('/report-views', businessAdminHandlers.createSavedReportView);
router.delete('/report-views/:id', validatePosTransactionIdParam, businessAdminHandlers.deleteSavedReportView);
router.get('/audit', businessAdminHandlers.listAudit);
router.get('/approvals', businessAdminHandlers.listApprovals);
router.post('/approvals/:id/:decision(approve|reject)', validatePosTransactionIdParam, validateDecideBusinessAdminApproval, businessAdminHandlers.decideApproval);
router.post('/approvals/:id/cancel', validatePosTransactionIdParam, businessAdminHandlers.cancelApproval);

export default router;
