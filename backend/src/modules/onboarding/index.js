import { onboardingRepository } from './repositories/onboardingRepository.js';
import {
  buildGetOnboardingStatusUseCase,
  buildSaveOnboardingStepUseCase,
  buildCompleteOnboardingUseCase
} from './usecases/onboardingUseCases.js';
import { syncStorefrontDiscoveryWithReliability } from '../../services/storefrontDiscoverySyncReliabilityService.js';

export const getOnboardingStatusUseCase = buildGetOnboardingStatusUseCase({ onboardingRepository });
export const saveOnboardingStepUseCase = buildSaveOnboardingStepUseCase({ onboardingRepository });
export const completeOnboardingUseCase = buildCompleteOnboardingUseCase({
  onboardingRepository,
  syncStorefrontDiscoveryWithReliability
});

export * from './contracts/onboardingRepository.contract.js';
export * from './repositories/onboardingRepository.js';
