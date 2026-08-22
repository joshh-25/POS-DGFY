import { storeRepository } from './repositories/storeRepository.js';
import { commercePaymentRepository } from '../commercePayments/repositories/commercePaymentRepository.js';
import { tenantRevenueRepository } from '../tenantRevenue/repositories/tenantRevenueRepository.js';
import { downpaymentSettingsRepository } from '../downpayment/repositories/downpaymentSettingsRepository.js';
import { inventoryReservationService } from '../inventory/index.js';
import { paymongoService } from '../../services/paymongoService.js';
import { getStorefrontDiscoveryIndexSnapshotForTenant } from '../../services/storefrontDiscoveryIndexService.js';
import { EMAIL_OTP_PURPOSES, requestEmailOtp, verifyEmailOtp } from '../../services/emailOtpService.js';
import {
    commercePaymentsEnabled,
    commerceQrphEnabled,
    commercePaymongoSplitEnabled,
    storefrontDirectGcashEnabled,
    storefrontDirectGcashRequested,
    storefrontDirectMayaEnabled,
    storefrontDirectMayaRequested,
    storefrontDirectCardEnabled,
    storefrontDirectCardRequested,
    storefrontDirectPaymentRequired,
    getPayMongoMode,
    requireCommerceQrphConfig,
    requireCommercePaymentConfig
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
    buildRequestStoreGuestCheckoutOtpUseCase,
    buildVerifyStoreGuestCheckoutOtpUseCase,
    buildStoreCheckoutPaymentSessionUseCase,
    buildGetStoreCheckoutPaymentSessionUseCase,
    buildConfirmStoreCheckoutSandboxPaymentUseCase,
    buildStoreCheckoutUseCase,
    buildTrackStoreOrderUseCase,
    buildClaimStoreOrderUseCase,
    buildCancelStoreOrderUseCase,
    buildListStoreCustomerOrdersUseCase,
    buildGetStorefrontFollowStatusUseCase,
    buildFollowStorefrontUseCase,
    buildUnfollowStorefrontUseCase
} from './usecases/storeUseCases.js';

export const listStoreCatalogUseCase = buildListStoreCatalogUseCase({
    storeRepository,
    commercePaymentRepository,
    tenantRevenueRepository,
    commercePaymentsEnabled,
    commerceQrphEnabled,
    paymongoService,
    requireCommerceQrphConfig,
    requireCommercePaymentConfig,
    paymongoMode: getPayMongoMode(),
    downpaymentSettingsRepository
});
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
export const storeCartQuoteUseCase = buildStoreCartQuoteUseCase({ storeRepository, downpaymentSettingsRepository });
const emailOtpService = { EMAIL_OTP_PURPOSES, requestEmailOtp, verifyEmailOtp };
export const requestStoreGuestCheckoutOtpUseCase = buildRequestStoreGuestCheckoutOtpUseCase({ emailOtpService });
export const verifyStoreGuestCheckoutOtpUseCase = buildVerifyStoreGuestCheckoutOtpUseCase({ emailOtpService });
export const storeCheckoutPaymentSessionUseCase = buildStoreCheckoutPaymentSessionUseCase({
    storeRepository,
    commercePaymentRepository,
    tenantRevenueRepository,
    paymongoService,
    commercePaymentsEnabled,
    commerceQrphEnabled,
    commercePaymongoSplitEnabled,
    directGcashEnabled: storefrontDirectGcashEnabled,
    directGcashRequested: storefrontDirectGcashRequested,
    directMayaEnabled: storefrontDirectMayaEnabled,
    directMayaRequested: storefrontDirectMayaRequested,
    directCardEnabled: storefrontDirectCardEnabled,
    directCardRequested: storefrontDirectCardRequested,
    directPaymentRequired: storefrontDirectPaymentRequired,
    requireCommerceQrphConfig,
    requireCommercePaymentConfig,
    downpaymentSettingsRepository
});
export const getStoreCheckoutPaymentSessionUseCase = buildGetStoreCheckoutPaymentSessionUseCase({
    commercePaymentRepository
});
export const confirmStoreCheckoutSandboxPaymentUseCase = buildConfirmStoreCheckoutSandboxPaymentUseCase({
    commercePaymentRepository,
    paymongoService
});
export const storeCheckoutUseCase = buildStoreCheckoutUseCase({
    storeRepository,
    downpaymentSettingsRepository,
    inventoryReservationService
});
export const trackStoreOrderUseCase = buildTrackStoreOrderUseCase({ storeRepository });
export const claimStoreOrderUseCase = buildClaimStoreOrderUseCase({ storeRepository });
export const cancelStoreOrderUseCase = buildCancelStoreOrderUseCase({
    storeRepository,
    inventoryReservationService
});
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
