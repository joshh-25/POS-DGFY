import { onboardingRepository } from './repositories/onboardingRepository.js';
import {
  buildGetOnboardingStatusUseCase,
  buildSaveOnboardingStepUseCase,
  buildCompleteOnboardingUseCase
} from './usecases/onboardingUseCases.js';
import { buildBulkCreateOnboardingItemsUseCase } from './usecases/bulkCreateOnboardingItemsUseCase.js';
import { syncStorefrontDiscoveryWithReliability } from '../../services/storefrontDiscoverySyncReliabilityService.js';
import { createItemUseCase, itemRepository } from '../inventory/index.js';
import { getAllSettingsUseCase } from '../settings/index.js';

export const getOnboardingStatusUseCase = buildGetOnboardingStatusUseCase({ onboardingRepository });
export const saveOnboardingStepUseCase = buildSaveOnboardingStepUseCase({
  onboardingRepository,
  syncStorefrontDiscoveryWithReliability
});
export const completeOnboardingUseCase = buildCompleteOnboardingUseCase({
  onboardingRepository,
  syncStorefrontDiscoveryWithReliability
});
export const bulkCreateOnboardingItemsUseCase = buildBulkCreateOnboardingItemsUseCase({
  createItemUseCase,
  getAllSettingsUseCase,
  findItemsBySkuCodes: itemRepository.findItemsBySkuCodes?.bind(itemRepository)
});

export * from './contracts/onboardingRepository.contract.js';
export * from './repositories/onboardingRepository.js';
