import express from 'express';
import {
  createPaymentSessionRefund,
  createTenantPayMongoChildAccount,
  getPaymentSession,
  getPayMongoSandboxCertification,
  getSettlementReport,
  handlePayMongoWebhook,
  listPaymentSessions,
  listTenantPaymentAccounts,
  operateTenantPayMongoChildAccount,
  retryPaymentSessionFinalization,
  upsertTenantPaymentAccount
} from '../modules/commercePayments/controllers/commercePaymentHandlers.js';
import { setNoStoreCacheControl } from '../middleware/cachePolicy.js';
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
router.get('/admin/certification/paymongo-sandbox', setNoStoreCacheControl, authenticateAdmin, getPayMongoSandboxCertification);
router.get('/admin/settlement-report', setNoStoreCacheControl, authenticateAdmin, validateListCommercePaymentSessionsQuery, getSettlementReport);
router.get('/admin/payment-sessions', setNoStoreCacheControl, authenticateAdmin, validateListCommercePaymentSessionsQuery, listPaymentSessions);
router.get('/admin/payment-sessions/:payment_session_id', setNoStoreCacheControl, authenticateAdmin, validateCommercePaymentSessionParam, getPaymentSession);
router.post('/admin/payment-sessions/:payment_session_id/retry-finalization', setNoStoreCacheControl, authenticateAdmin, validateCommercePaymentSessionParam, retryPaymentSessionFinalization);
router.post('/admin/payment-sessions/:payment_session_id/refunds', setNoStoreCacheControl, authenticateAdmin, validateCommercePaymentSessionParam, validateCommercePaymentRefundBody, createPaymentSessionRefund);
router.get('/admin/tenant-payment-accounts', setNoStoreCacheControl, authenticateAdmin, validateTenantPaymentAccountsQuery, listTenantPaymentAccounts);
router.post('/admin/tenants/:tenant_id/paymongo-child-account', setNoStoreCacheControl, authenticateAdmin, validateTenantPaymentAccountParam, validateTenantPayMongoChildAccountBody, createTenantPayMongoChildAccount);
router.post('/admin/tenants/:tenant_id/paymongo-child-account/:action', setNoStoreCacheControl, authenticateAdmin, validateTenantPayMongoChildAccountActionParam, operateTenantPayMongoChildAccount);
router.put('/admin/tenants/:tenant_id/payment-account', setNoStoreCacheControl, authenticateAdmin, validateTenantPaymentAccountParam, validateTenantPaymentAccountBody, upsertTenantPaymentAccount);

export default router;
