import { storefrontDiscoveryRepository } from './repositories/storefrontDiscoveryRepository.js';
import {
    buildListStorefrontDiscoveryUseCase,
    buildListStorefrontMapPinsUseCase,
    buildGetStorefrontProfileUseCase
} from './usecases/storefrontDiscoveryUseCases.js';

export const listStorefrontDiscoveryUseCase = buildListStorefrontDiscoveryUseCase({ storefrontDiscoveryRepository });
export const listStorefrontMapPinsUseCase = buildListStorefrontMapPinsUseCase({ storefrontDiscoveryRepository });
export const getStorefrontProfileUseCase = buildGetStorefrontProfileUseCase({ storefrontDiscoveryRepository });

export * from './contracts/storefrontDiscoveryRepository.contract.js';
export * from './repositories/storefrontDiscoveryRepository.js';
