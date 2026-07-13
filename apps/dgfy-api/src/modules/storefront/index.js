// Dependency-injection wiring point for the storefront module (Clean
// Architecture "Dependency Inversion" — per project convention this file is
// the ONLY place that composes concrete implementations for this module),
// mirroring ../products/index.js's buildProductsModule() pattern.
//
// Task 1 (10-03-PLAN.md) built the module skeleton (repository layer +
// controllers/routes.js) against the LANDLORD dgfy_core connection
// (config/db.js) — discovery reads `storefront_discovery_index`, the
// public cross-tenant projection built in 10-01-PLAN.md. Task 2 adds the
// searchDiscovery/getStorePage/validateCart use cases below and exposes
// `validateCart` at the top level (not just nested under `useCases`) so
// 10-06's checkout paths (cash AND PayMongo) import the SAME function
// rather than re-implementing pricing.
//
// Composition wiring (mounting createStorefrontRoutes() under /storefront
// in apps/dgfy-api/src/routes/index.js) is a LATER plan's scope (10-04/
// 10-06), not this file's — mirrors 08-03/08-08's staged composition split.

import sequelize from '../../config/db.js';
import { getRedisClient } from '../../config/redis.js';
import { StorefrontDiscoveryRepository } from './repositories/storefrontDiscoveryRepository.js';
import { buildSearchDiscoveryUseCase } from './usecases/searchDiscoveryUseCases.js';
import { buildGetStorePageUseCase } from './usecases/getStorePageUseCases.js';
import { buildValidateCartUseCase } from './usecases/cartValidation.js';

export { StorefrontDiscoveryRepository, buildStorefrontDiscoveryRepository } from './repositories/storefrontDiscoveryRepository.js';
export { buildSearchDiscoveryUseCase } from './usecases/searchDiscoveryUseCases.js';
export { buildGetStorePageUseCase } from './usecases/getStorePageUseCases.js';
export { buildValidateCartUseCase } from './usecases/cartValidation.js';
export { buildDiscoveryController } from './controllers/discoveryController.js';
export { createStorefrontRoutes } from './routes.js';

/**
 * Builds the storefront module: a StorefrontDiscoveryRepository (landlord
 * dgfy_core, Redis-cached) plus every use case closed over it and the
 * injected productRepository (Phase 8's tenant catalog reader, REQUIRED —
 * getStorePage/validateCart cannot function without it).
 *
 * @param {{sequelize?: Object, getRedisClient?: Function, productRepository: Object}} deps
 * @returns {{repository: StorefrontDiscoveryRepository, useCases: {searchDiscovery: Function, getStorePage: Function, validateCart: Function}, validateCart: Function}}
 */
export function buildStorefrontModule({
    sequelize: sequelizeOverride,
    getRedisClient: getRedisClientOverride,
    productRepository
} = {}) {
    if (!productRepository) {
        throw new Error('buildStorefrontModule requires a productRepository.');
    }

    const repository = new StorefrontDiscoveryRepository({
        sequelize: sequelizeOverride || sequelize,
        getRedisClient: getRedisClientOverride || getRedisClient
    });

    const searchDiscovery = buildSearchDiscoveryUseCase({ repository });
    const getStorePage = buildGetStorePageUseCase({ repository, productRepository });
    const validateCart = buildValidateCartUseCase({ productRepository });

    return {
        repository,
        useCases: { searchDiscovery, getStorePage, validateCart },
        // Exposed at the top level too (see file header) so 10-06 imports
        // the exact same validateCart function both checkout paths share.
        validateCart
    };
}

export default buildStorefrontModule;
