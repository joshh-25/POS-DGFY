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

import sequelize from '../../config/db.js';
import { getRedisClient } from '../../config/redis.js';
import * as emailOtpModule from '../../infra/emailOtp.js';
import { StorefrontDiscoveryRepository } from './repositories/storefrontDiscoveryRepository.js';
import { GuestIdentityRepository } from './repositories/guestIdentityRepository.js';
import { buildSearchDiscoveryUseCase } from './usecases/searchDiscoveryUseCases.js';
import { buildGetStorePageUseCase } from './usecases/getStorePageUseCases.js';
import { buildValidateCartUseCase } from './usecases/cartValidation.js';
import { buildGuestCheckoutUseCases } from './usecases/guestCheckoutUseCases.js';

export { StorefrontDiscoveryRepository, buildStorefrontDiscoveryRepository } from './repositories/storefrontDiscoveryRepository.js';
export { GuestIdentityRepository, buildGuestIdentityRepository } from './repositories/guestIdentityRepository.js';
export { buildSearchDiscoveryUseCase } from './usecases/searchDiscoveryUseCases.js';
export { buildGetStorePageUseCase } from './usecases/getStorePageUseCases.js';
export { buildValidateCartUseCase } from './usecases/cartValidation.js';
export { buildGuestCheckoutUseCases } from './usecases/guestCheckoutUseCases.js';
export { buildDiscoveryController } from './controllers/discoveryController.js';
export { buildGuestCheckoutController } from './controllers/guestCheckoutController.js';
export { createStorefrontRoutes } from './routes.js';

/**
 * Builds the storefront module: a StorefrontDiscoveryRepository (landlord
 * dgfy_core, Redis-cached) plus every use case closed over it, the injected
 * productRepository (Phase 8's tenant catalog reader, REQUIRED —
 * getStorePage/validateCart cannot function without it), and a
 * GuestIdentityRepository (landlord dgfy_core StorefrontGuestIdentity,
 * REQUIRED — 10-04's guest checkout identity surface).
 *
 * @param {{sequelize?: Object, getRedisClient?: Function, productRepository: Object, storefrontGuestIdentityModel: Object, emailOtp?: Object}} deps
 * @returns {{repository: StorefrontDiscoveryRepository, guestIdentityRepository: GuestIdentityRepository, useCases: {searchDiscovery: Function, getStorePage: Function, validateCart: Function, requestGuestOtp: Function, verifyGuestOtp: Function, resolveCheckoutIdentity: Function}, validateCart: Function, resolveCheckoutIdentity: Function}}
 */
export function buildStorefrontModule({
    sequelize: sequelizeOverride,
    getRedisClient: getRedisClientOverride,
    productRepository,
    storefrontGuestIdentityModel,
    emailOtp = emailOtpModule
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

    return {
        repository,
        guestIdentityRepository,
        useCases: {
            searchDiscovery,
            getStorePage,
            validateCart,
            requestGuestOtp,
            verifyGuestOtp,
            resolveCheckoutIdentity
        },
        // Exposed at the top level too (see file header) so 10-06 imports
        // the exact same validateCart/resolveCheckoutIdentity functions
        // both checkout paths (guest + account) share.
        validateCart,
        resolveCheckoutIdentity
    };
}

export default buildStorefrontModule;
