import logger from '../../config/logger.js';
import { paypalService } from '../../services/paypalService.js';
import { trackEngagementEvent } from '../../services/engagementService.js';
import { paymentRepository } from './repositories/paymentRepository.js';
import { buildHandleWebhookUseCase } from './usecases/handleWebhookUseCase.js';
import { buildCancelSubscriptionUseCase } from './usecases/cancelSubscriptionUseCase.js';
import { buildGetBillingHistoryUseCase } from './usecases/getBillingHistoryUseCase.js';
import { buildSyncWithPayPalUseCase } from './usecases/syncWithPayPalUseCase.js';
import { buildUpgradeToPremiumUseCase } from './usecases/upgradeToPremiumUseCase.js';

export const handleWebhookUseCase = buildHandleWebhookUseCase({
    paymentRepository,
    paypalService,
    trackEngagementEvent,
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

export * from './contracts/paymentRepository.contract.js';
export * from './repositories/paymentRepository.js';
