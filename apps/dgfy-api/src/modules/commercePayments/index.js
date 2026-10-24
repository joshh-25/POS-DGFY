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
  buildListCommercePaymentRefundsUseCase,
  buildReconcileCommercePaymentSessionUseCase,
  buildListTenantPaymentAccountsUseCase,
  buildOperateTenantPayMongoChildAccountUseCase,
  buildRetryCommercePaymentFinalizationUseCase,
  buildRetryCommercePaymentRefundUseCase,
  buildUpsertTenantPaymentAccountUseCase
} from './usecases/commercePaymentAdminUseCases.js';
import { buildReconcilePendingCommerceRefundsUseCase } from './usecases/reconcilePendingCommerceRefundsUseCase.js';
import { buildGetPayMongoSandboxCertificationUseCase } from './usecases/paymongoSandboxCertificationUseCase.js';
import { buildHandleCommerceOrderLifecycleUseCase } from './usecases/commerceOrderLifecycleUseCase.js';
import { recordTenantRevenueOrderFulfillmentUseCase } from '../tenantRevenue/index.js';
import { buildCreateDglaundryBookingPaymentSessionUseCase } from './usecases/createDglaundryBookingPaymentSessionUseCase.js';
import { dglaundryDurableDelivery as dglaundryPartnerClient } from '../dgfyLaundryOrders/index.js';
import { dgfyLaundryOrderRepository } from '../dgfyLaundryOrders/repositories/dgfyLaundryOrderRepository.js';
import { reconcileDeliveredDglaundryBooking } from './usecases/finalizeDglaundryBookingSession.js';

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

export const listCommercePaymentRefundsUseCase = buildListCommercePaymentRefundsUseCase({
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
  paymongoService,
  raiseAlert: raiseOperationalAlert,
  logger
});

export const retryCommercePaymentRefundUseCase = buildRetryCommercePaymentRefundUseCase({
  commercePaymentRepository,
  paymongoService,
  createCommercePaymentRefundUseCase
});

export const reconcilePendingCommerceRefundsUseCase = buildReconcilePendingCommerceRefundsUseCase({
  commercePaymentRepository,
  paymongoService,
  raiseAlert: raiseOperationalAlert,
  logger,
  pendingAlertHours: () => Number.parseInt(process.env.COMMERCE_REFUND_PENDING_ALERT_HOURS || '24', 10) || 24
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
  partnerClient: dglaundryPartnerClient,
  mappingRepository: dgfyLaundryOrderRepository
});

export const reconcileDglaundryOutboxCompletion = async ({ completionReference }) => {
  const session = await commercePaymentRepository.findSessionBySessionId(completionReference);
  if (!session) throw new Error('DGLAUNDRY_BOOKING_PAYMENT_SESSION_NOT_FOUND');
  return reconcileDeliveredDglaundryBooking({ session, commercePaymentRepository });
};

export { commercePaymentRepository };
