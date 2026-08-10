import { storefrontDiscoveryRepository } from './repositories/storefrontDiscoveryRepository.js';
import {
    buildListStorefrontDiscoveryUseCase,
    buildListStorefrontMapPinsUseCase,
    buildGetStorefrontProfileUseCase,
    buildUpsertExternalStorefrontListingUseCase,
    buildDeleteExternalStorefrontListingUseCase,
    buildListExternalStorefrontListingsUseCase
} from './usecases/storefrontDiscoveryUseCases.js';
import { storefrontDomainRepository } from '../storefrontDomains/repositories/storefrontDomainRepository.js';

export const listStorefrontDiscoveryUseCase = buildListStorefrontDiscoveryUseCase({ storefrontDiscoveryRepository, storefrontDomainRepository });
export const listStorefrontMapPinsUseCase = buildListStorefrontMapPinsUseCase({ storefrontDiscoveryRepository, storefrontDomainRepository });
export const getStorefrontProfileUseCase = buildGetStorefrontProfileUseCase({ storefrontDiscoveryRepository, storefrontDomainRepository });
export const upsertExternalStorefrontListingUseCase = buildUpsertExternalStorefrontListingUseCase({ storefrontDiscoveryRepository });
export const deleteExternalStorefrontListingUseCase = buildDeleteExternalStorefrontListingUseCase({ storefrontDiscoveryRepository });
export const listExternalStorefrontListingsUseCase = buildListExternalStorefrontListingsUseCase({ storefrontDiscoveryRepository });

export * from './contracts/storefrontDiscoveryRepository.contract.js';
export * from './repositories/storefrontDiscoveryRepository.js';
