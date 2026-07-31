import express from 'express';
import {
  authenticate,
  authenticateAdmin,
  authorizeAdminFinancialRoles,
  checkPermission
} from '../middleware/auth.js';
import { ADMIN_FINANCIAL_ROLES } from '../config/adminAuthConfig.js';
import { setNoStoreCacheControl } from '../middleware/cachePolicy.js';
import { PERMISSIONS } from '../config/permissions.js';
import { tenantFinancialLimiter } from '../middleware/rateLimiter.js';
import {
  approveSettlementBatch,
  approveAdjustment,
  cancelSettlementBatch,
  confirmManualPayout,
  failManualPayout,
  createManualPayout,
  createRevenueFeePolicy,
  createSettlementBatch,
  exportRevenueTransactions,
  getRevenueDashboard,
  getTenantFinancialSummary,
  listReconciliation,
  listAdjustments,
  listRevenueFeePolicies,
  listRevenueTransactions,
  listTenantFinancialFeeHistory,
  listTenantFinancialSettlements,
  listTenantFinancialTransactions,
  listSettlementBatches,
  requestAutomaticPayout,
  requestAdjustment,
  reconcileProviderFinancials,
  runInternalReconciliation,
  retryManualPayout,
  scheduleSettlementBatch,
  resolveReconciliation
} from '../modules/tenantRevenue/controllers/tenantRevenueHandlers.js';
import {
  validateTenantRevenueConfirmPayoutBody,
  validateTenantRevenueAdjustmentBody,
  validateTenantRevenueAdjustmentParam,
  validateTenantRevenueFeePolicyBody,
  validateTenantRevenueListQuery,
  validateTenantRevenueManualPayoutBody,
  validateTenantRevenuePayoutParam,
  validateTenantRevenueProviderReconciliationBody,
  validateTenantRevenueReasonBody,
  validateTenantRevenueReconciliationParam,
  validateTenantRevenueRetryPayoutBody,
  validateTenantRevenueScheduleBody,
  validateTenantRevenueSettlementBatchBody,
  validateTenantRevenueSettlementBatchParam,
  validateTenantRevenueTenantParam
} from '../validators/tenantRevenueValidator.js';

const router = express.Router();
const financePreparer = authorizeAdminFinancialRoles(
  ADMIN_FINANCIAL_ROLES.FINANCE_PREPARER,
  ADMIN_FINANCIAL_ROLES.FINANCE_APPROVER
);
const financeApprover = authorizeAdminFinancialRoles(
  ADMIN_FINANCIAL_ROLES.FINANCE_APPROVER
);

router.get(
  '/tenant/summary',
  setNoStoreCacheControl,
  authenticate,
  tenantFinancialLimiter,
  checkPermission(PERMISSIONS.REPORTS.actions.VIEW_REPORTS),
  validateTenantRevenueListQuery,
  getTenantFinancialSummary
);
router.get(
  '/tenant/transactions',
  setNoStoreCacheControl,
  authenticate,
  tenantFinancialLimiter,
  checkPermission(PERMISSIONS.REPORTS.actions.VIEW_REPORTS),
  validateTenantRevenueListQuery,
  listTenantFinancialTransactions
);
router.get(
  '/tenant/settlements',
  setNoStoreCacheControl,
  authenticate,
  tenantFinancialLimiter,
  checkPermission(PERMISSIONS.REPORTS.actions.VIEW_REPORTS),
  validateTenantRevenueListQuery,
  listTenantFinancialSettlements
);
router.get(
  '/tenant/fee-history',
  setNoStoreCacheControl,
  authenticate,
  tenantFinancialLimiter,
  checkPermission(PERMISSIONS.REPORTS.actions.VIEW_REPORTS),
  listTenantFinancialFeeHistory
);

router.use(setNoStoreCacheControl, authenticateAdmin, tenantFinancialLimiter);

router.get('/admin/dashboard', validateTenantRevenueListQuery, getRevenueDashboard);
router.get('/admin/transactions', validateTenantRevenueListQuery, listRevenueTransactions);
router.get('/admin/transactions.csv', validateTenantRevenueListQuery, exportRevenueTransactions);
router.get('/admin/tenants/:tenant_id/fee-policies', validateTenantRevenueTenantParam, listRevenueFeePolicies);
router.post(
  '/admin/tenants/:tenant_id/fee-policies',
  validateTenantRevenueTenantParam,
  financeApprover,
  validateTenantRevenueFeePolicyBody,
  createRevenueFeePolicy
);
router.get('/admin/settlement-batches', validateTenantRevenueListQuery, listSettlementBatches);
router.post(
  '/admin/settlement-batches',
  financePreparer,
  validateTenantRevenueSettlementBatchBody,
  createSettlementBatch
);
router.post(
  '/admin/settlement-batches/:settlement_batch_id/approve',
  validateTenantRevenueSettlementBatchParam,
  financeApprover,
  validateTenantRevenueReasonBody,
  approveSettlementBatch
);
router.post(
  '/admin/settlement-batches/:settlement_batch_id/cancel',
  validateTenantRevenueSettlementBatchParam,
  financeApprover,
  validateTenantRevenueReasonBody,
  cancelSettlementBatch
);
router.post(
  '/admin/settlement-batches/:settlement_batch_id/schedule',
  validateTenantRevenueSettlementBatchParam,
  financeApprover,
  validateTenantRevenueScheduleBody,
  scheduleSettlementBatch
);
router.post(
  '/admin/settlement-batches/:settlement_batch_id/payouts',
  validateTenantRevenueSettlementBatchParam,
  financePreparer,
  validateTenantRevenueManualPayoutBody,
  createManualPayout
);
router.post(
  '/admin/settlement-batches/:settlement_batch_id/automatic-payout',
  validateTenantRevenueSettlementBatchParam,
  financeApprover,
  requestAutomaticPayout
);
router.post(
  '/admin/payouts/:payout_id/confirm',
  validateTenantRevenuePayoutParam,
  financeApprover,
  validateTenantRevenueConfirmPayoutBody,
  confirmManualPayout
);
router.post(
  '/admin/payouts/:payout_id/fail',
  validateTenantRevenuePayoutParam,
  financeApprover,
  validateTenantRevenueReasonBody,
  failManualPayout
);
router.post(
  '/admin/payouts/:payout_id/retry',
  validateTenantRevenuePayoutParam,
  financeApprover,
  validateTenantRevenueRetryPayoutBody,
  retryManualPayout
);
router.get('/admin/reconciliation', validateTenantRevenueListQuery, listReconciliation);
router.post(
  '/admin/reconciliation/run-internal',
  financePreparer,
  validateTenantRevenueListQuery,
  runInternalReconciliation
);
router.post(
  '/admin/reconciliation/:reconciliation_id/resolve',
  validateTenantRevenueReconciliationParam,
  financeApprover,
  validateTenantRevenueReasonBody,
  resolveReconciliation
);
router.get('/admin/adjustments', validateTenantRevenueListQuery, listAdjustments);
router.post(
  '/admin/adjustments',
  financePreparer,
  validateTenantRevenueAdjustmentBody,
  requestAdjustment
);
router.post(
  '/admin/adjustments/:adjustment_id/approve',
  validateTenantRevenueAdjustmentParam,
  financeApprover,
  validateTenantRevenueReasonBody,
  approveAdjustment
);
router.post(
  '/admin/reconciliation/provider-financials',
  financePreparer,
  validateTenantRevenueProviderReconciliationBody,
  reconcileProviderFinancials
);

export default router;
