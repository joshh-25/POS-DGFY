import express from 'express';
import {
  confirmPaymentSessionSandbox,
  createDglaundryBookingPaymentSession,
  createPaymentSessionRefund,
  createTenantPayMongoChildAccount,
  getPaymentSession,
  getPayMongoSandboxCertification,
  getSettlementReport,
  handlePayMongoWebhook,
  listPaymentSessions,
  listTenantPaymentAccounts,
  operateTenantPayMongoChildAccount,
  reconcilePaymentSession,
  retryPaymentSessionFinalization,
  upsertTenantPaymentAccount
} from '../modules/commercePayments/controllers/commercePaymentHandlers.js';
import { setNoStoreCacheControl } from '../middleware/cachePolicy.js';
import { requireTenantContext } from '../middleware/requireTenantContext.js';
import { authenticateAdmin } from '../middleware/auth.js';
import {
  validateCommercePaymentRefundBody,
  validateCommercePaymentSessionParam,
  validateListCommercePaymentSessionsQuery,
  validateTenantPayMongoChildAccountActionParam,
  validateTenantPaymentAccountBody,
  validateTenantPaymentAccountParam,
  validateTenantPayMongoChildAccountBody,
  validateTenantPaymentAccountsQuery
} from '../validators/commercePaymentValidator.js';

const router = express.Router();

router.post('/paymongo/webhook', setNoStoreCacheControl, handlePayMongoWebhook);
// DGLaundry booking payments are dark-disabled until the provider, hosting,
// branch allowlist, and controlled payment gates are approved together.
router.post('/dglaundry/booking-groups/payment-sessions', setNoStoreCacheControl, requireTenantContext, createDglaundryBookingPaymentSession);
router.get('/admin/certification/paymongo-sandbox', setNoStoreCacheControl, authenticateAdmin, getPayMongoSandboxCertification);
router.get('/admin/settlement-report', setNoStoreCacheControl, authenticateAdmin, validateListCommercePaymentSessionsQuery, getSettlementReport);
router.get('/admin/payment-sessions', setNoStoreCacheControl, authenticateAdmin, validateListCommercePaymentSessionsQuery, listPaymentSessions);
router.get('/admin/payment-sessions/:payment_session_id', setNoStoreCacheControl, authenticateAdmin, validateCommercePaymentSessionParam, getPaymentSession);
router.post('/admin/payment-sessions/:payment_session_id/reconcile', setNoStoreCacheControl, authenticateAdmin, validateCommercePaymentSessionParam, reconcilePaymentSession);
// #1268: debug-only sandbox confirmation for PayMongo test-mode QR Ph payments. Independent of
// the loopback-gated `/api/v1/store/checkout/payment-sessions/:id/confirm-test` route — this one
// is admin-authenticated instead, for use from the IMS admin panel. Fail-closed via three
// independent layers: `authenticateAdmin` here, the use case's own `PAYMONGO_MODE` check, and
// `paymongoService.confirmSandboxQrphPayment()`'s own test-mode guard.
router.post('/admin/payment-sessions/:payment_session_id/confirm-test', setNoStoreCacheControl, authenticateAdmin, validateCommercePaymentSessionParam, confirmPaymentSessionSandbox);
router.post('/admin/payment-sessions/:payment_session_id/retry-finalization', setNoStoreCacheControl, authenticateAdmin, validateCommercePaymentSessionParam, retryPaymentSessionFinalization);
router.post('/admin/payment-sessions/:payment_session_id/refunds', setNoStoreCacheControl, authenticateAdmin, validateCommercePaymentSessionParam, validateCommercePaymentRefundBody, createPaymentSessionRefund);
router.get('/admin/tenant-payment-accounts', setNoStoreCacheControl, authenticateAdmin, validateTenantPaymentAccountsQuery, listTenantPaymentAccounts);
router.post('/admin/tenants/:tenant_id/paymongo-child-account', setNoStoreCacheControl, authenticateAdmin, validateTenantPaymentAccountParam, validateTenantPayMongoChildAccountBody, createTenantPayMongoChildAccount);
router.post('/admin/tenants/:tenant_id/paymongo-child-account/:action', setNoStoreCacheControl, authenticateAdmin, validateTenantPayMongoChildAccountActionParam, operateTenantPayMongoChildAccount);
router.put('/admin/tenants/:tenant_id/payment-account', setNoStoreCacheControl, authenticateAdmin, validateTenantPaymentAccountParam, validateTenantPaymentAccountBody, upsertTenantPaymentAccount);

export default router;
