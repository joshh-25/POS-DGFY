import {
  approveTenantSettlementBatchUseCase,
  approveTenantRevenueAdjustmentUseCase,
  cancelTenantSettlementBatchUseCase,
  confirmTenantManualPayoutUseCase,
  failTenantManualPayoutUseCase,
  createTenantManualPayoutUseCase,
  createTenantRevenueFeePolicyUseCase,
  createTenantSettlementBatchUseCase,
  exportTenantRevenueTransactionsCsvUseCase,
  getTenantRevenueDashboardUseCase,
  listTenantRevenueFeePoliciesUseCase,
  listTenantRevenueAdjustmentsUseCase,
  listTenantRevenueReconciliationUseCase,
  listTenantRevenueTransactionsUseCase,
  listTenantSettlementBatchesUseCase,
  requestTenantAutomaticPayoutUseCase,
  requestTenantRevenueAdjustmentUseCase,
  reconcileTenantRevenueProviderFinancialsUseCase,
  runTenantRevenueInternalReconciliationUseCase,
  retryTenantManualPayoutUseCase,
  scheduleTenantSettlementBatchUseCase,
  resolveTenantRevenueReconciliationUseCase
} from '../index.js';
import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';

const timestamp = () => new Date().toISOString();
const actorFrom = (req) => req.admin?.username || req.user?.email || req.user?.username || null;
const tenantIdFrom = (req) => req.tenant?.id || req.user?.tenant_id || null;

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

export const getRevenueDashboard = async (req, res, next) => {
  try {
    return sendResult(res, await getTenantRevenueDashboardUseCase({
      query: req.validatedQuery || req.query || {}
    }));
  } catch (error) {
    return next(error);
  }
};

export const listRevenueTransactions = async (req, res, next) => {
  try {
    return sendResult(res, await listTenantRevenueTransactionsUseCase({
      query: req.validatedQuery || req.query || {}
    }));
  } catch (error) {
    return next(error);
  }
};

export const exportRevenueTransactions = async (req, res, next) => {
  try {
    const result = await exportTenantRevenueTransactionsCsvUseCase({
      query: req.validatedQuery || req.query || {}
    });
    if (!result.success) return sendResult(res, result);
    res.setHeader('Content-Type', result.data.content_type);
    res.setHeader('Content-Disposition', `attachment; filename="${result.data.filename}"`);
    return res.status(200).send(result.data.csv);
  } catch (error) {
    return next(error);
  }
};

export const listRevenueFeePolicies = async (req, res, next) => {
  try {
    return sendResult(res, await listTenantRevenueFeePoliciesUseCase({
      tenantId: (req.validatedParams || req.params).tenant_id
    }));
  } catch (error) {
    return next(error);
  }
};

export const createRevenueFeePolicy = async (req, res, next) => {
  try {
    return sendResult(res, await createTenantRevenueFeePolicyUseCase({
      tenantId: (req.validatedParams || req.params).tenant_id,
      payload: req.validatedBody || req.body || {},
      actor: actorFrom(req)
    }), 201);
  } catch (error) {
    return next(error);
  }
};

export const listSettlementBatches = async (req, res, next) => {
  try {
    return sendResult(res, await listTenantSettlementBatchesUseCase({
      query: req.validatedQuery || req.query || {}
    }));
  } catch (error) {
    return next(error);
  }
};

export const createSettlementBatch = async (req, res, next) => {
  try {
    return sendResult(res, await createTenantSettlementBatchUseCase({
      payload: req.validatedBody || req.body || {},
      actor: actorFrom(req)
    }), 201);
  } catch (error) {
    return next(error);
  }
};

export const approveSettlementBatch = async (req, res, next) => {
  try {
    return sendResult(res, await approveTenantSettlementBatchUseCase({
      settlementBatchId: (req.validatedParams || req.params).settlement_batch_id,
      payload: req.validatedBody || req.body || {},
      actor: actorFrom(req)
    }));
  } catch (error) {
    return next(error);
  }
};

export const scheduleSettlementBatch = async (req, res, next) => {
  try {
    return sendResult(res, await scheduleTenantSettlementBatchUseCase({
      settlementBatchId: (req.validatedParams || req.params).settlement_batch_id,
      payload: req.validatedBody || req.body || {},
      actor: actorFrom(req)
    }));
  } catch (error) {
    return next(error);
  }
};

export const cancelSettlementBatch = async (req, res, next) => {
  try {
    return sendResult(res, await cancelTenantSettlementBatchUseCase({
      settlementBatchId: (req.validatedParams || req.params).settlement_batch_id,
      payload: req.validatedBody || req.body || {},
      actor: actorFrom(req)
    }));
  } catch (error) {
    return next(error);
  }
};

export const createManualPayout = async (req, res, next) => {
  try {
    return sendResult(res, await createTenantManualPayoutUseCase({
      settlementBatchId: (req.validatedParams || req.params).settlement_batch_id,
      payload: req.validatedBody || req.body || {},
      actor: actorFrom(req)
    }), 201);
  } catch (error) {
    return next(error);
  }
};

export const confirmManualPayout = async (req, res, next) => {
  try {
    return sendResult(res, await confirmTenantManualPayoutUseCase({
      payoutId: (req.validatedParams || req.params).payout_id,
      payload: req.validatedBody || req.body || {},
      actor: actorFrom(req)
    }));
  } catch (error) {
    return next(error);
  }
};

export const failManualPayout = async (req, res, next) => {
  try {
    return sendResult(res, await failTenantManualPayoutUseCase({
      payoutId: (req.validatedParams || req.params).payout_id,
      payload: req.validatedBody || req.body || {},
      actor: actorFrom(req)
    }));
  } catch (error) {
    return next(error);
  }
};

export const retryManualPayout = async (req, res, next) => {
  try {
    return sendResult(res, await retryTenantManualPayoutUseCase({
      payoutId: (req.validatedParams || req.params).payout_id,
      payload: req.validatedBody || req.body || {},
      actor: actorFrom(req)
    }), 201);
  } catch (error) {
    return next(error);
  }
};

export const requestAutomaticPayout = async (req, res, next) => {
  try {
    return sendResult(res, await requestTenantAutomaticPayoutUseCase({
      settlementBatchId: (req.validatedParams || req.params).settlement_batch_id,
      payload: req.validatedBody || req.body || {},
      actor: actorFrom(req)
    }));
  } catch (error) {
    return next(error);
  }
};

export const listReconciliation = async (req, res, next) => {
  try {
    return sendResult(res, await listTenantRevenueReconciliationUseCase({
      query: req.validatedQuery || req.query || {}
    }));
  } catch (error) {
    return next(error);
  }
};

export const resolveReconciliation = async (req, res, next) => {
  try {
    return sendResult(res, await resolveTenantRevenueReconciliationUseCase({
      reconciliationId: (req.validatedParams || req.params).reconciliation_id,
      payload: req.validatedBody || req.body || {},
      actor: actorFrom(req)
    }));
  } catch (error) {
    return next(error);
  }
};

export const listAdjustments = async (req, res, next) => {
  try {
    return sendResult(res, await listTenantRevenueAdjustmentsUseCase({
      query: req.validatedQuery || req.query || {}
    }));
  } catch (error) {
    return next(error);
  }
};

export const requestAdjustment = async (req, res, next) => {
  try {
    return sendResult(res, await requestTenantRevenueAdjustmentUseCase({
      payload: req.validatedBody || req.body || {},
      actor: actorFrom(req)
    }), 201);
  } catch (error) {
    return next(error);
  }
};

export const approveAdjustment = async (req, res, next) => {
  try {
    return sendResult(res, await approveTenantRevenueAdjustmentUseCase({
      adjustmentId: (req.validatedParams || req.params).adjustment_id,
      payload: req.validatedBody || req.body || {},
      actor: actorFrom(req)
    }));
  } catch (error) {
    return next(error);
  }
};

export const reconcileProviderFinancials = async (req, res, next) => {
  try {
    return sendResult(res, await reconcileTenantRevenueProviderFinancialsUseCase({
      payload: req.validatedBody || req.body || {},
      actor: actorFrom(req)
    }));
  } catch (error) {
    return next(error);
  }
};

export const runInternalReconciliation = async (req, res, next) => {
  try {
    return sendResult(res, await runTenantRevenueInternalReconciliationUseCase({
      query: req.validatedQuery || req.query || {},
      actor: actorFrom(req)
    }));
  } catch (error) {
    return next(error);
  }
};

export const getTenantFinancialSummary = async (req, res, next) => {
  try {
    return sendResult(res, await getTenantRevenueDashboardUseCase({
      query: {
        ...(req.validatedQuery || req.query || {}),
        tenant_id: tenantIdFrom(req)
      }
    }));
  } catch (error) {
    return next(error);
  }
};

export const listTenantFinancialTransactions = async (req, res, next) => {
  try {
    return sendResult(res, await listTenantRevenueTransactionsUseCase({
      query: {
        ...(req.validatedQuery || req.query || {}),
        tenant_id: tenantIdFrom(req)
      }
    }));
  } catch (error) {
    return next(error);
  }
};

export const listTenantFinancialSettlements = async (req, res, next) => {
  try {
    return sendResult(res, await listTenantSettlementBatchesUseCase({
      query: {
        ...(req.validatedQuery || req.query || {}),
        tenant_id: tenantIdFrom(req)
      }
    }));
  } catch (error) {
    return next(error);
  }
};

export const listTenantFinancialFeeHistory = async (req, res, next) => {
  try {
    return sendResult(res, await listTenantRevenueFeePoliciesUseCase({
      tenantId: tenantIdFrom(req)
    }));
  } catch (error) {
    return next(error);
  }
};
