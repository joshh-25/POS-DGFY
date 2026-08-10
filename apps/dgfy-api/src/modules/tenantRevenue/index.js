import { tenantRevenueRepository } from './repositories/tenantRevenueRepository.js';
import * as payoutDestinationCrypto from './services/payoutDestinationCrypto.js';
import { buildTenantRevenueUseCases } from './usecases/tenantRevenueUseCases.js';

export const tenantRevenueUseCases = buildTenantRevenueUseCases({
  tenantRevenueRepository,
  payoutDestinationCrypto
});

export const {
  createFeePolicy: createTenantRevenueFeePolicyUseCase,
  listFeePolicies: listTenantRevenueFeePoliciesUseCase,
  postPaidTransaction: postPaidTenantRevenueTransactionUseCase,
  recordOrderFulfillment: recordTenantRevenueOrderFulfillmentUseCase,
  recordSucceededRefund: recordSucceededTenantRevenueRefundUseCase,
  recordChargeback: recordTenantRevenueChargebackUseCase,
  requestAdjustment: requestTenantRevenueAdjustmentUseCase,
  approveAdjustment: approveTenantRevenueAdjustmentUseCase,
  listAdjustments: listTenantRevenueAdjustmentsUseCase,
  reconcileProviderFinancials: reconcileTenantRevenueProviderFinancialsUseCase,
  listTransactions: listTenantRevenueTransactionsUseCase,
  getDashboard: getTenantRevenueDashboardUseCase,
  createSettlementBatch: createTenantSettlementBatchUseCase,
  listSettlementBatches: listTenantSettlementBatchesUseCase,
  approveSettlementBatch: approveTenantSettlementBatchUseCase,
  scheduleSettlementBatch: scheduleTenantSettlementBatchUseCase,
  cancelSettlementBatch: cancelTenantSettlementBatchUseCase,
  createManualPayout: createTenantManualPayoutUseCase,
  confirmManualPayout: confirmTenantManualPayoutUseCase,
  failManualPayout: failTenantManualPayoutUseCase,
  retryManualPayout: retryTenantManualPayoutUseCase,
  requestAutomaticPayout: requestTenantAutomaticPayoutUseCase,
  listReconciliation: listTenantRevenueReconciliationUseCase,
  runInternalReconciliation: runTenantRevenueInternalReconciliationUseCase,
  resolveReconciliation: resolveTenantRevenueReconciliationUseCase,
  exportTransactionsCsv: exportTenantRevenueTransactionsCsvUseCase
} = tenantRevenueUseCases;

export { tenantRevenueRepository };
