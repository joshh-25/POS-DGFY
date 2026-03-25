import logger from '../../config/logger.js';
import { paypalService } from '../../services/paypalService.js';
import { paymongoService } from '../../services/paymongoService.js';
import { trackEngagementEvent } from '../../services/engagementService.js';
import * as emailService from '../../services/emailService.js';
import { paymentRepository } from './repositories/paymentRepository.js';
import { buildHandleWebhookUseCase } from './usecases/handleWebhookUseCase.js';
import { buildCancelSubscriptionUseCase } from './usecases/cancelSubscriptionUseCase.js';
import { buildGetBillingHistoryUseCase } from './usecases/getBillingHistoryUseCase.js';
import { buildSyncWithPayPalUseCase } from './usecases/syncWithPayPalUseCase.js';
import { buildUpgradeToPremiumUseCase } from './usecases/upgradeToPremiumUseCase.js';
import { buildMigrateToPayPalUseCase } from './usecases/migrateToPayPalUseCase.js';
import { buildChangePlanUseCase } from './usecases/changePlanUseCase.js';
import { buildSetupPayPalRecurringUseCase } from './usecases/setupPayPalRecurringUseCase.js';
import { buildRequestReactivationUseCase } from './usecases/requestReactivationUseCase.js';
import { buildReactivateWithPayPalUseCase } from './usecases/reactivateWithPayPalUseCase.js';
import { buildMigrateToPayMongoUseCase } from './usecases/migrateToPayMongoUseCase.js';
import { buildSetupPayMongoRecurringUseCase } from './usecases/setupPayMongoRecurringUseCase.js';
import { buildReactivateWithPayMongoUseCase } from './usecases/reactivateWithPayMongoUseCase.js';
import { buildSyncWithPayMongoUseCase } from './usecases/syncWithPayMongoUseCase.js';
import { buildCancelPayMongoSubscriptionUseCase } from './usecases/cancelPayMongoSubscriptionUseCase.js';
import { buildChangePayMongoSubscriptionUseCase } from './usecases/changePayMongoSubscriptionUseCase.js';

export const handleWebhookUseCase = buildHandleWebhookUseCase({
    paymentRepository,
    paypalService,
    paymongoService,
    trackEngagementEvent,
    emailService,
    logger
});

export const cancelSubscriptionUseCase = buildCancelSubscriptionUseCase({
    paymentRepository,
    paypalService,
    logger
});

export const getBillingHistoryUseCase = buildGetBillingHistoryUseCase({
    paymentRepository
});

export const syncWithPayPalUseCase = buildSyncWithPayPalUseCase({
    paymentRepository,
    paypalService
});

export const upgradeToPremiumUseCase = buildUpgradeToPremiumUseCase({
    paymentRepository,
    paypalService,
    trackEngagementEvent,
    logger
});

export const migrateToPayPalUseCase = buildMigrateToPayPalUseCase({
    paymentRepository,
    paypalService,
    trackEngagementEvent,
    logger
});

export const changePlanUseCase = buildChangePlanUseCase({
    paymentRepository,
    paypalService,
    emailService,
    logger
});

export const setupPayPalRecurringUseCase = buildSetupPayPalRecurringUseCase({
    paymentRepository,
    paypalService,
    emailService,
    logger
});

export const requestReactivationUseCase = buildRequestReactivationUseCase({
    paymentRepository,
    emailService,
    logger
});

export const reactivateWithPayPalUseCase = buildReactivateWithPayPalUseCase({
    paymentRepository,
    paypalService,
    trackEngagementEvent,
    logger
});

export const migrateToPayMongoUseCase = buildMigrateToPayMongoUseCase({
    paymentRepository,
    paymongoService,
    trackEngagementEvent,
    logger
});

export const setupPayMongoRecurringUseCase = buildSetupPayMongoRecurringUseCase({
    paymentRepository,
    paymongoService,
    emailService,
    logger
});

export const reactivateWithPayMongoUseCase = buildReactivateWithPayMongoUseCase({
    paymentRepository,
    paymongoService,
    logger
});

export const syncWithPayMongoUseCase = buildSyncWithPayMongoUseCase({
    paymentRepository,
    paymongoService,
    logger
});

export const cancelPayMongoSubscriptionUseCase = buildCancelPayMongoSubscriptionUseCase({
    paymentRepository,
    paymongoService,
    emailService,
    logger
});

export const changePayMongoSubscriptionUseCase = buildChangePayMongoSubscriptionUseCase({
    paymentRepository,
    paymongoService,
    logger
});

export * from './contracts/paymentRepository.contract.js';
export * from './repositories/paymentRepository.js';
