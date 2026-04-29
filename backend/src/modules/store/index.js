import { storeRepository } from './repositories/storeRepository.js';
import {
    buildListStoreCatalogUseCase,
    buildListStoreLocationsUseCase,
    buildRegisterStoreCustomerUseCase,
    buildLoginStoreCustomerUseCase,
    buildGetStoreCustomerMeUseCase,
    buildListStoreCustomerAddressesUseCase,
    buildCreateStoreCustomerAddressUseCase,
    buildUpdateStoreCustomerAddressUseCase,
    buildSetDefaultStoreCustomerAddressUseCase,
    buildDeleteStoreCustomerAddressUseCase,
    buildStoreCartQuoteUseCase,
    buildStoreCheckoutUseCase,
    buildTrackStoreOrderUseCase,
    buildCancelStoreOrderUseCase,
    buildListStoreCustomerOrdersUseCase,
    buildGetStorefrontFollowStatusUseCase,
    buildFollowStorefrontUseCase,
    buildUnfollowStorefrontUseCase
} from './usecases/storeUseCases.js';

export const listStoreCatalogUseCase = buildListStoreCatalogUseCase({ storeRepository });
export const listStoreLocationsUseCase = buildListStoreLocationsUseCase({ storeRepository });
export const registerStoreCustomerUseCase = buildRegisterStoreCustomerUseCase({ storeRepository });
export const loginStoreCustomerUseCase = buildLoginStoreCustomerUseCase({ storeRepository });
export const getStoreCustomerMeUseCase = buildGetStoreCustomerMeUseCase({ storeRepository });
export const listStoreCustomerAddressesUseCase = buildListStoreCustomerAddressesUseCase({ storeRepository });
export const createStoreCustomerAddressUseCase = buildCreateStoreCustomerAddressUseCase({ storeRepository });
export const updateStoreCustomerAddressUseCase = buildUpdateStoreCustomerAddressUseCase({ storeRepository });
export const setDefaultStoreCustomerAddressUseCase = buildSetDefaultStoreCustomerAddressUseCase({ storeRepository });
export const deleteStoreCustomerAddressUseCase = buildDeleteStoreCustomerAddressUseCase({ storeRepository });
export const storeCartQuoteUseCase = buildStoreCartQuoteUseCase({ storeRepository });
export const storeCheckoutUseCase = buildStoreCheckoutUseCase({ storeRepository });
export const trackStoreOrderUseCase = buildTrackStoreOrderUseCase({ storeRepository });
export const cancelStoreOrderUseCase = buildCancelStoreOrderUseCase({ storeRepository });
export const listStoreCustomerOrdersUseCase = buildListStoreCustomerOrdersUseCase({ storeRepository });
export const getStorefrontFollowStatusUseCase = buildGetStorefrontFollowStatusUseCase({ storeRepository });
export const followStorefrontUseCase = buildFollowStorefrontUseCase({ storeRepository });
export const unfollowStorefrontUseCase = buildUnfollowStorefrontUseCase({ storeRepository });

export * from './contracts/storeRepository.contract.js';
export * from './repositories/storeRepository.js';
