// Dependency-injection wiring point for the storefront module (Clean
// Architecture "Dependency Inversion" — per project convention this file is
// the ONLY place that composes concrete implementations for this module),
// mirroring ../products/index.js's buildProductsModule() pattern.
//
// Task 1 (10-03-PLAN.md) built the module skeleton (repository layer +
// controllers/routes.js) against the LANDLORD dgfy_core connection
// (config/db.js) — discovery reads `storefront_discovery_index`, the
// public cross-tenant projection built in 10-01-PLAN.md, and Task 2 added
// the searchDiscovery/getStorePage/validateCart use cases, exposing
// `validateCart` at the top level (not just nested under `useCases`) so
// 10-06's checkout paths (cash AND PayMongo) import the SAME function
// rather than re-implementing pricing.
//
// 10-04-PLAN.md (STF-03/D-06) adds the guest checkout identity surface:
// guestIdentityRepository (landlord dgfy_core StorefrontGuestIdentity,
// REQUIRED) + emailOtp (infra/emailOtp.js's module shape, REQUIRED) wire
// requestGuestOtp/verifyGuestOtp/resolveCheckoutIdentity, mounted alongside
// discovery on the SAME storefront router (../../routes/index.js's
// composition root).
//
// 10-06-PLAN.md (STF-04/STF-05) adds order placement + status:
// storefrontOrderModel (landlord dgfy_core StorefrontOrder, 10-01) plus
// four cross-module PORTS — reserveStock/releaseReservation/
// setReservationExpiry (10-02's InventoryReservationRepository, called
// directly rather than through its staff-membership-gated usecase
// wrappers, see placeOrderUseCases.js's doc comment) and createQrphSession
// (10-05). These, along with storefrontOrderModel, are OPTIONAL at this
// module's construction time (mirrors 10-07's buildAvailmentsModule
// commitReservation optionality convention exactly): the EXISTING
// composition root (../../routes/index.js) does not supply them yet, so
// omitting any of them simply omits `useCases.placeOrder`/
// `useCases.getOrderStatus` from this module's return value rather than
// throwing at construction time — a non-breaking addition. `finalize
// CashOrder` (10-07's finalizeStorefrontOrder) is ALSO optional; when
// absent, a placed cash order fails closed with 503 rather than the
// module refusing to build. Full production wiring of all five ports is
// 10-08's composition-root scope.

import sequelize from '../../config/db.js';
import { getRedisClient } from '../../config/redis.js';
import * as emailOtpModule from '../../infra/emailOtp.js';
import { StorefrontDiscoveryRepository } from './repositories/storefrontDiscoveryRepository.js';
import { GuestIdentityRepository } from './repositories/guestIdentityRepository.js';
import { StorefrontOrderRepository } from './repositories/storefrontOrderRepository.js';
import { buildSearchDiscoveryUseCase } from './usecases/searchDiscoveryUseCases.js';
import { buildGetStorePageUseCase } from './usecases/getStorePageUseCases.js';
import { buildValidateCartUseCase } from './usecases/cartValidation.js';
import { buildGuestCheckoutUseCases } from './usecases/guestCheckoutUseCases.js';
import { buildPlaceOrderUseCase } from './usecases/placeOrderUseCases.js';
import { buildGetOrderStatusUseCase } from './usecases/getOrderStatusUseCases.js';

export { StorefrontDiscoveryRepository, buildStorefrontDiscoveryRepository } from './repositories/storefrontDiscoveryRepository.js';
export { GuestIdentityRepository, buildGuestIdentityRepository } from './repositories/guestIdentityRepository.js';
export { StorefrontOrderRepository, buildStorefrontOrderRepository } from './repositories/storefrontOrderRepository.js';
export { buildSearchDiscoveryUseCase } from './usecases/searchDiscoveryUseCases.js';
export { buildGetStorePageUseCase } from './usecases/getStorePageUseCases.js';
export { buildValidateCartUseCase } from './usecases/cartValidation.js';
export { buildGuestCheckoutUseCases } from './usecases/guestCheckoutUseCases.js';
export { validateFulfillment, isWithinBusinessHours } from './usecases/schedulingValidation.js';
export { buildPlaceOrderUseCase } from './usecases/placeOrderUseCases.js';
export { buildGetOrderStatusUseCase } from './usecases/getOrderStatusUseCases.js';
export { buildDiscoveryController } from './controllers/discoveryController.js';
export { buildGuestCheckoutController } from './controllers/guestCheckoutController.js';
export { buildCheckoutController } from './controllers/checkoutController.js';
export { createStorefrontRoutes } from './routes.js';

/**
 * Builds the storefront module: a StorefrontDiscoveryRepository (landlord
 * dgfy_core, Redis-cached) plus every use case closed over it, the injected
 * productRepository (Phase 8's tenant catalog reader, REQUIRED —
 * getStorePage/validateCart cannot function without it), a
 * GuestIdentityRepository (landlord dgfy_core StorefrontGuestIdentity,
 * REQUIRED — 10-04's guest checkout identity surface), and (10-06,
 * OPTIONAL) a StorefrontOrderRepository + placeOrder/getOrderStatus when
 * `storefrontOrderModel` and the reservation/payment ports are supplied.
 *
 * @param {{
 *   sequelize?: Object,
 *   getRedisClient?: Function,
 *   productRepository: Object,
 *   storefrontGuestIdentityModel: Object,
 *   storefrontOrderModel?: Object,
 *   emailOtp?: Object,
 *   reserveStock?: Function,
 *   releaseReservation?: Function,
 *   setReservationExpiry?: Function,
 *   createQrphSession?: Function,
 *   finalizeCashOrder?: Function
 * }} deps
 * @returns {{repository: StorefrontDiscoveryRepository, guestIdentityRepository: GuestIdentityRepository, orderRepository?: StorefrontOrderRepository, useCases: {searchDiscovery: Function, getStorePage: Function, validateCart: Function, requestGuestOtp: Function, verifyGuestOtp: Function, resolveCheckoutIdentity: Function, placeOrder?: Function, getOrderStatus?: Function}, validateCart: Function, resolveCheckoutIdentity: Function}}
 */
export function buildStorefrontModule({
    sequelize: sequelizeOverride,
    getRedisClient: getRedisClientOverride,
    productRepository,
    storefrontGuestIdentityModel,
    storefrontOrderModel,
    emailOtp = emailOtpModule,
    reserveStock,
    releaseReservation,
    setReservationExpiry,
    createQrphSession,
    finalizeCashOrder = null
} = {}) {
    if (!productRepository) {
        throw new Error('buildStorefrontModule requires a productRepository.');
    }
    if (!storefrontGuestIdentityModel) {
        throw new Error('buildStorefrontModule requires a storefrontGuestIdentityModel.');
    }

    const repository = new StorefrontDiscoveryRepository({
        sequelize: sequelizeOverride || sequelize,
        getRedisClient: getRedisClientOverride || getRedisClient
    });
    const guestIdentityRepository = new GuestIdentityRepository({ storefrontGuestIdentityModel });

    const searchDiscovery = buildSearchDiscoveryUseCase({ repository });
    const getStorePage = buildGetStorePageUseCase({ repository, productRepository });
    const validateCart = buildValidateCartUseCase({ productRepository });
    const { requestGuestOtp, verifyGuestOtp, resolveCheckoutIdentity } = buildGuestCheckoutUseCases({
        guestIdentityRepository,
        emailOtp
    });

    // 10-06: order placement + status. OPTIONAL — see file header. The
    // order repository only needs storefrontOrderModel; placeOrder ALSO
    // needs the four reservation/payment ports (reserveStock is the
    // load-bearing one shared by every payment method, D-07/D-10).
    let orderRepository = null;
    let placeOrder;
    let getOrderStatus;
    if (storefrontOrderModel) {
        orderRepository = new StorefrontOrderRepository({ storefrontOrderModel });
        getOrderStatus = buildGetOrderStatusUseCase({ orderRepository, guestIdentityRepository });

        if (
            typeof reserveStock === 'function'
            && typeof releaseReservation === 'function'
            && typeof setReservationExpiry === 'function'
            && typeof createQrphSession === 'function'
        ) {
            placeOrder = buildPlaceOrderUseCase({
                validateCart,
                resolveCheckoutIdentity,
                orderRepository,
                reserveStock,
                releaseReservation,
                setReservationExpiry,
                createQrphSession,
                finalizeCashOrder
            });
        }
    }

    return {
        repository,
        guestIdentityRepository,
        ...(orderRepository ? { orderRepository } : {}),
        useCases: {
            searchDiscovery,
            getStorePage,
            validateCart,
            requestGuestOtp,
            verifyGuestOtp,
            resolveCheckoutIdentity,
            ...(placeOrder ? { placeOrder } : {}),
            ...(getOrderStatus ? { getOrderStatus } : {})
        },
        // Exposed at the top level too (see file header) so 10-06 imports
        // the exact same validateCart/resolveCheckoutIdentity functions
        // both checkout paths (guest + account) share.
        validateCart,
        resolveCheckoutIdentity
    };
}

export default buildStorefrontModule;
