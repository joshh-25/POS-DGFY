import {
  createCommercePaymentRefundUseCase,
  createTenantPayMongoChildAccountUseCase,
  getCommercePaymentSessionUseCase,
  getCommerceSettlementReportUseCase,
  getPayMongoSandboxCertificationUseCase,
  handlePayMongoCommerceWebhookUseCase,
  listCommercePaymentSessionsUseCase,
  listTenantPaymentAccountsUseCase,
  operateTenantPayMongoChildAccountUseCase,
  reconcileCommercePaymentSessionUseCase,
  retryCommercePaymentFinalizationUseCase,
  upsertTenantPaymentAccountUseCase
} from '../index.js';
import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';

const timestamp = () => new Date().toISOString();

const sendResult = (res, result, successStatus = 200) => sendUseCaseResult(res, result, {
  successStatusCodeResolver: () => successStatus,
  successPayloadResolver: () => ({
    success: true,
    data: result.data,
    timestamp: timestamp()
  }),
  errorPayloadResolver: (failure) => ({
    success: false,
    data: null,
    message: failure.message,
    error_code: failure.code,
    errors: failure.details,
    timestamp: timestamp()
  })
});

export const handlePayMongoWebhook = async (req, res, next) => {
  try {
    const result = await handlePayMongoCommerceWebhookUseCase({
      headers: req.headers,
      body: req.body,
      rawBody: req.rawBody
    });

    return sendResult(res, result);
  } catch (error) {
    next(error);
  }
};

export const listPaymentSessions = async (req, res, next) => {
  try {
    const result = await listCommercePaymentSessionsUseCase({ query: req.validatedQuery || req.query || {} });
    return sendResult(res, result);
  } catch (error) {
    next(error);
  }
};

export const getPaymentSession = async (req, res, next) => {
  try {
    const result = await getCommercePaymentSessionUseCase({
      paymentSessionId: (req.validatedParams || req.params).payment_session_id
    });
    return sendResult(res, result);
  } catch (error) {
    next(error);
  }
};

export const getSettlementReport = async (req, res, next) => {
  try {
    const result = await getCommerceSettlementReportUseCase({ query: req.validatedQuery || req.query || {} });
    return sendResult(res, result);
  } catch (error) {
    next(error);
  }
};

export const getPayMongoSandboxCertification = async (req, res, next) => {
  try {
    const result = await getPayMongoSandboxCertificationUseCase();
    return sendResult(res, result);
  } catch (error) {
    next(error);
  }
};

export const retryPaymentSessionFinalization = async (req, res, next) => {
  try {
    const result = await retryCommercePaymentFinalizationUseCase({
      paymentSessionId: (req.validatedParams || req.params).payment_session_id
    });
    return sendResult(res, result);
  } catch (error) {
    next(error);
  }
};

export const reconcilePaymentSession = async (req, res, next) => {
  try {
    const result = await reconcileCommercePaymentSessionUseCase({
      paymentSessionId: (req.validatedParams || req.params).payment_session_id,
      actor: req.admin?.username || req.user?.email || req.user?.username || 'paymongo_admin_reconciliation'
    });
    return sendResult(res, result);
  } catch (error) {
    next(error);
  }
};

export const createPaymentSessionRefund = async (req, res, next) => {
  try {
    const result = await createCommercePaymentRefundUseCase({
      paymentSessionId: (req.validatedParams || req.params).payment_session_id,
      payload: req.validatedBody || req.body || {},
      actor: req.admin?.username || req.user?.email || req.user?.username || null
    });
    return sendResult(res, result, 201);
  } catch (error) {
    next(error);
  }
};

export const createTenantPayMongoChildAccount = async (req, res, next) => {
  try {
    const result = await createTenantPayMongoChildAccountUseCase({
      tenantId: (req.validatedParams || req.params).tenant_id,
      payload: req.validatedBody || req.body || {},
      actor: req.admin?.username || req.user?.email || req.user?.username || null
    });
    return sendResult(res, result, 201);
  } catch (error) {
    next(error);
  }
};

export const operateTenantPayMongoChildAccount = async (req, res, next) => {
  try {
    const params = req.validatedParams || req.params;
    const result = await operateTenantPayMongoChildAccountUseCase({
      tenantId: params.tenant_id,
      action: params.action,
      actor: req.admin?.username || req.user?.email || req.user?.username || null
    });
    return sendResult(res, result);
  } catch (error) {
    next(error);
  }
};

export const upsertTenantPaymentAccount = async (req, res, next) => {
  try {
    const result = await upsertTenantPaymentAccountUseCase({
      tenantId: (req.validatedParams || req.params).tenant_id,
      payload: req.validatedBody || req.body || {},
      actor: req.admin?.username || req.user?.email || req.user?.username || null
    });
    return sendResult(res, result);
  } catch (error) {
    next(error);
  }
};

export const listTenantPaymentAccounts = async (req, res, next) => {
  try {
    const result = await listTenantPaymentAccountsUseCase({ query: req.validatedQuery || req.query || {} });
    return sendResult(res, result);
  } catch (error) {
    next(error);
  }
};
