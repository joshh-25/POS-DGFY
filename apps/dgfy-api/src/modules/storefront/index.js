// Dependency-injection wiring point for the storefront module (Clean
// Architecture "Dependency Inversion" — per project convention this file is
// the ONLY place that composes concrete implementations for this module),
// mirroring ../products/index.js's buildProductsModule() pattern.
//
// Task 1 (10-03-PLAN.md) builds the module skeleton (repository layer +
// controllers/routes.js) against the LANDLORD dgfy_core connection
// (config/db.js) — discovery reads `storefront_discovery_index`, the
// public cross-tenant projection built in 10-01-PLAN.md. Task 2 adds the
// searchDiscovery/getStorePage/validateCart use cases and wires them into
// buildStorefrontModule()'s `useCases` below (and exposes `validateCart`
// at the top level so 10-06's checkout paths import the SAME function).
//
// Composition wiring (mounting createStorefrontRoutes() under /storefront
// in apps/dgfy-api/src/routes/index.js) is a LATER plan's scope (10-04/
// 10-06), not this file's — mirrors 08-03/08-08's staged composition split.

import sequelize from '../../config/db.js';
import { getRedisClient } from '../../config/redis.js';
import { StorefrontDiscoveryRepository } from './repositories/storefrontDiscoveryRepository.js';

export { StorefrontDiscoveryRepository, buildStorefrontDiscoveryRepository } from './repositories/storefrontDiscoveryRepository.js';
export { buildDiscoveryController } from './controllers/discoveryController.js';
export { createStorefrontRoutes } from './routes.js';

/**
 * Builds the storefront module: a StorefrontDiscoveryRepository (landlord
 * dgfy_core, Redis-cached) plus every use case closed over it and the
 * injected productRepository (Phase 8's tenant catalog reader, used by
 * getStorePage/validateCart once Task 2 wires them in).
 *
 * @param {{sequelize?: Object, getRedisClient?: Function, productRepository?: Object}} [deps]
 * @returns {{repository: StorefrontDiscoveryRepository, useCases: Object}}
 */
export function buildStorefrontModule({
    sequelize: sequelizeOverride,
    getRedisClient: getRedisClientOverride,
    productRepository
} = {}) {
    void productRepository; // wired in by Task 2 (getStorePage/validateCart)

    const repository = new StorefrontDiscoveryRepository({
        sequelize: sequelizeOverride || sequelize,
        getRedisClient: getRedisClientOverride || getRedisClient
    });

    return {
        repository,
        // Populated by Task 2: searchDiscovery, getStorePage, validateCart.
        useCases: {}
    };
}

export default buildStorefrontModule;
