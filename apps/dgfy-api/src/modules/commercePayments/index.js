import logger from '../../config/logger.js';
import { paymongoService } from '../../services/paymongoService.js';
import { raiseOperationalAlert } from '../../services/operationalAlertService.js';
import { commercePaymentRepository } from './repositories/commercePaymentRepository.js';
import { buildHandlePayMongoCommerceWebhookUseCase } from './usecases/handlePayMongoCommerceWebhookUseCase.js';
import {
  buildConfirmCommercePaymentSessionSandboxUseCase,
  buildCreateCommercePaymentRefundUseCase,
  buildCreateTenantPayMongoChildAccountUseCase,
  buildGetCommercePaymentSessionUseCase,
  buildGetCommerceSettlementReportUseCase,
  buildListCommercePaymentSessionsUseCase,
  buildReconcileCommercePaymentSessionUseCase,
  buildListTenantPaymentAccountsUseCase,
  buildOperateTenantPayMongoChildAccountUseCase,
  buildRetryCommercePaymentFinalizationUseCase,
  buildUpsertTenantPaymentAccountUseCase
} from './usecases/commercePaymentAdminUseCases.js';
import { buildGetPayMongoSandboxCertificationUseCase } from './usecases/paymongoSandboxCertificationUseCase.js';
import { buildHandleCommerceOrderLifecycleUseCase } from './usecases/commerceOrderLifecycleUseCase.js';
import { recordTenantRevenueOrderFulfillmentUseCase } from '../tenantRevenue/index.js';
import { buildCreateDglaundryBookingPaymentSessionUseCase } from './usecases/createDglaundryBookingPaymentSessionUseCase.js';
import { dglaundryPartnerClient } from '../dgfyLaundryOrders/services/dglaundryPartnerClient.js';

export const handlePayMongoCommerceWebhookUseCase = buildHandlePayMongoCommerceWebhookUseCase({
  commercePaymentRepository,
  paymongoService,
  logger,
  raiseOperationalAlert,
  partnerClient: dglaundryPartnerClient
});

export const listCommercePaymentSessionsUseCase = buildListCommercePaymentSessionsUseCase({
  commercePaymentRepository
});

export const getCommercePaymentSessionUseCase = buildGetCommercePaymentSessionUseCase({
  commercePaymentRepository
});

export const getCommerceSettlementReportUseCase = buildGetCommerceSettlementReportUseCase({
  commercePaymentRepository
});

export const retryCommercePaymentFinalizationUseCase = buildRetryCommercePaymentFinalizationUseCase({
  commercePaymentRepository,
  partnerClient: dglaundryPartnerClient
});

export const reconcileCommercePaymentSessionUseCase = buildReconcileCommercePaymentSessionUseCase({
  commercePaymentRepository,
  paymongoService,
  partnerClient: dglaundryPartnerClient
});

export const confirmCommercePaymentSessionSandboxUseCase = buildConfirmCommercePaymentSessionSandboxUseCase({
  commercePaymentRepository,
  paymongoService
});

export const createCommercePaymentRefundUseCase = buildCreateCommercePaymentRefundUseCase({
  commercePaymentRepository,
  paymongoService
});

export const handleCommerceOrderLifecycleUseCase = buildHandleCommerceOrderLifecycleUseCase({
  commercePaymentRepository,
  createCommercePaymentRefundUseCase,
  recordTenantRevenueOrderFulfillmentUseCase
});

export const createTenantPayMongoChildAccountUseCase = buildCreateTenantPayMongoChildAccountUseCase({
  commercePaymentRepository,
  paymongoService
});

export const operateTenantPayMongoChildAccountUseCase = buildOperateTenantPayMongoChildAccountUseCase({
  commercePaymentRepository,
  paymongoService
});

export const upsertTenantPaymentAccountUseCase = buildUpsertTenantPaymentAccountUseCase({
  commercePaymentRepository
});

export const listTenantPaymentAccountsUseCase = buildListTenantPaymentAccountsUseCase({
  commercePaymentRepository
});

export const getPayMongoSandboxCertificationUseCase = buildGetPayMongoSandboxCertificationUseCase({
  paymongoService,
  commercePaymentRepository
});

export const createDglaundryBookingPaymentSessionUseCase = buildCreateDglaundryBookingPaymentSessionUseCase({
  commercePaymentRepository,
  paymongoService,
  partnerClient: dglaundryPartnerClient
});

export { commercePaymentRepository };
