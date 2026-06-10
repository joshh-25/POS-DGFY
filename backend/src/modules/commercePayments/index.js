import logger from '../../config/logger.js';
import { paymongoService } from '../../services/paymongoService.js';
import { commercePaymentRepository } from './repositories/commercePaymentRepository.js';
import { buildHandlePayMongoCommerceWebhookUseCase } from './usecases/handlePayMongoCommerceWebhookUseCase.js';
import {
  buildCreateCommercePaymentRefundUseCase,
  buildCreateTenantPayMongoChildAccountUseCase,
  buildGetCommercePaymentSessionUseCase,
  buildGetCommerceSettlementReportUseCase,
  buildListCommercePaymentSessionsUseCase,
  buildListTenantPaymentAccountsUseCase,
  buildOperateTenantPayMongoChildAccountUseCase,
  buildRetryCommercePaymentFinalizationUseCase,
  buildUpsertTenantPaymentAccountUseCase
} from './usecases/commercePaymentAdminUseCases.js';
import { buildGetPayMongoSandboxCertificationUseCase } from './usecases/paymongoSandboxCertificationUseCase.js';

export const handlePayMongoCommerceWebhookUseCase = buildHandlePayMongoCommerceWebhookUseCase({
  commercePaymentRepository,
  paymongoService,
  logger
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
  commercePaymentRepository
});

export const createCommercePaymentRefundUseCase = buildCreateCommercePaymentRefundUseCase({
  commercePaymentRepository,
  paymongoService
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

export { commercePaymentRepository };
