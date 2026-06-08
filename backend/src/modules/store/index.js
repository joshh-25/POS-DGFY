import { storeRepository } from './repositories/storeRepository.js';
import { commercePaymentRepository } from '../commercePayments/repositories/commercePaymentRepository.js';
import { paymongoService } from '../../services/paymongoService.js';
import { getStorefrontDiscoveryIndexSnapshotForTenant } from '../../services/storefrontDiscoveryIndexService.js';
import {
    commercePaymentsEnabled,
    commerceQrphEnabled,
    commercePaymongoSplitEnabled,
    requireCommerceQrphConfig
} from '../../config/commercePaymentsFeature.js';
import {
    buildListStoreCatalogUseCase,
    buildResolveStoreQrUseCase,
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
    buildStoreCheckoutPaymentSessionUseCase,
    buildGetStoreCheckoutPaymentSessionUseCase,
    buildStoreCheckoutUseCase,
    buildTrackStoreOrderUseCase,
    buildClaimStoreOrderUseCase,
    buildCancelStoreOrderUseCase,
    buildListStoreCustomerOrdersUseCase,
    buildGetStorefrontFollowStatusUseCase,
    buildFollowStorefrontUseCase,
    buildUnfollowStorefrontUseCase
} from './usecases/storeUseCases.js';

export const listStoreCatalogUseCase = buildListStoreCatalogUseCase({ storeRepository });
export const resolveStoreQrUseCase = buildResolveStoreQrUseCase({ storeRepository });
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
export const storeCheckoutPaymentSessionUseCase = buildStoreCheckoutPaymentSessionUseCase({
    storeRepository,
    commercePaymentRepository,
    paymongoService,
    commercePaymentsEnabled,
    commerceQrphEnabled,
    commercePaymongoSplitEnabled,
    requireCommerceQrphConfig
});
export const getStoreCheckoutPaymentSessionUseCase = buildGetStoreCheckoutPaymentSessionUseCase({
    commercePaymentRepository
});
export const storeCheckoutUseCase = buildStoreCheckoutUseCase({ storeRepository });
export const trackStoreOrderUseCase = buildTrackStoreOrderUseCase({ storeRepository });
export const claimStoreOrderUseCase = buildClaimStoreOrderUseCase({ storeRepository });
export const cancelStoreOrderUseCase = buildCancelStoreOrderUseCase({ storeRepository });
export const listStoreCustomerOrdersUseCase = buildListStoreCustomerOrdersUseCase({ storeRepository });
export const getStorefrontFollowStatusUseCase = buildGetStorefrontFollowStatusUseCase({
    storeRepository,
    resolveDiscoverySlug: getStorefrontDiscoveryIndexSnapshotForTenant
});
export const followStorefrontUseCase = buildFollowStorefrontUseCase({
    storeRepository,
    resolveDiscoverySlug: getStorefrontDiscoveryIndexSnapshotForTenant
});
export const unfollowStorefrontUseCase = buildUnfollowStorefrontUseCase({
    storeRepository,
    resolveDiscoverySlug: getStorefrontDiscoveryIndexSnapshotForTenant
});

export * from './contracts/storeRepository.contract.js';
export * from './repositories/storeRepository.js';
