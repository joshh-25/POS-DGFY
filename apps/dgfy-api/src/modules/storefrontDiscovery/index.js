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
import { externalRedirectRepository } from './repositories/externalRedirectRepository.js';
import {
    buildResolveExternalRedirectUseCase,
    buildListExternalAdminUseCase,
    buildSaveExternalSiteUseCase,
  buildSetExternalSiteVisibilityUseCase,
    buildSaveExternalListingUseCase,
  buildSetExternalListingVisibilityUseCase,
    buildRemoveExternalListingUseCase,
    buildClearTemporaryExternalListingsUseCase
} from './usecases/externalRedirectUseCases.js';

export const listStorefrontDiscoveryUseCase = buildListStorefrontDiscoveryUseCase({ storefrontDiscoveryRepository, storefrontDomainRepository });
export const listStorefrontMapPinsUseCase = buildListStorefrontMapPinsUseCase({ storefrontDiscoveryRepository, storefrontDomainRepository });
export const getStorefrontProfileUseCase = buildGetStorefrontProfileUseCase({ storefrontDiscoveryRepository, storefrontDomainRepository });
export const upsertExternalStorefrontListingUseCase = buildUpsertExternalStorefrontListingUseCase({ storefrontDiscoveryRepository });
export const deleteExternalStorefrontListingUseCase = buildDeleteExternalStorefrontListingUseCase({ storefrontDiscoveryRepository });
export const listExternalStorefrontListingsUseCase = buildListExternalStorefrontListingsUseCase({ storefrontDiscoveryRepository });
export const resolveExternalRedirectUseCase = buildResolveExternalRedirectUseCase({ repository: externalRedirectRepository });
export const listExternalAdminUseCase = buildListExternalAdminUseCase({ repository: externalRedirectRepository });
export const saveExternalSiteUseCase = buildSaveExternalSiteUseCase({ repository: externalRedirectRepository });
export const setExternalSiteVisibilityUseCase = buildSetExternalSiteVisibilityUseCase({ repository: externalRedirectRepository });
export const saveExternalListingUseCase = buildSaveExternalListingUseCase({ repository: externalRedirectRepository });
export const setExternalListingVisibilityUseCase = buildSetExternalListingVisibilityUseCase({ repository: externalRedirectRepository });
export const removeExternalListingUseCase = buildRemoveExternalListingUseCase({ repository: externalRedirectRepository });
export const clearTemporaryExternalListingsUseCase = buildClearTemporaryExternalListingsUseCase({ repository: externalRedirectRepository });

export * from './contracts/storefrontDiscoveryRepository.contract.js';
export * from './repositories/storefrontDiscoveryRepository.js';
