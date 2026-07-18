// Dependency-injection wiring point for the booking module (Clean
// Architecture "Dependency Inversion" — per project convention this file is
// the ONLY place that composes concrete implementations for this module),
// mirroring ../products/index.js's buildProductsModule() /
// ../inventory/index.js's buildInventoryModule() pattern.
//
// Task 1 (08-07-PLAN.md) built the repository/entity/usecase layers. Task 2
// adds the controllers/routes.js layer and this file's buildBookingModule()
// factory, closing every booking usecase over BookingRepository
// (tenant-scoped, resolved via the injected TenantConnector), the products
// module's ProductRepository (used ONLY to resolve a Product's bookable
// config), and the businesses module's BusinessRepository
// (membership/staff-or-owner access control only — membership lives in the
// landlord dgfy_core database).
//
// Composition wiring (mounting createBookingRoutes() under /bookings in
// apps/dgfy-api/src/routes/index.js) is 08-08's scope, not this file's.

export {
    BookingRepository,
    buildBookingRepository,
    BookingCapacityFullError,
    BookingAlreadyCancelledError
} from './repositories/bookingRepository.js';
export { BookingEntity, createBookingEntity } from './entities/bookingEntity.js';
export {
    buildCreateBookingUseCase,
    buildCancelBookingUseCase,
    buildListBookingsUseCase
} from './usecases/bookingUseCases.js';
export { buildBookingController } from './controllers/bookingController.js';
export { createBookingRoutes } from './routes.js';

import { BookingRepository } from './repositories/bookingRepository.js';
import {
    buildCreateBookingUseCase,
    buildCancelBookingUseCase,
    buildListBookingsUseCase
} from './usecases/bookingUseCases.js';

/**
 * Builds the fully wired booking module: one BookingRepository instance
 * (tenant-scoped, resolved via the injected tenantConnector) plus every
 * usecase closed over it, the injected businessRepository (membership/
 * staff-or-owner access control only), and the injected productRepository
 * (used ONLY to resolve is_bookable/slot_duration_minutes/
 * concurrent_capacity before a booking is created — 08-03's read API this
 * module depends on).
 *
 * `inventoryEffectContracts` (the inventory module's reserved, unwired
 * recordSaleEffect/recordBookingEffect stubs, D-06) is accepted but NEVER
 * invoked this phase — booking does not write inventory_movements directly
 * (any future stock effect on booking fulfillment is requested through
 * modules/inventory's reserved contract, not written here). Accepting it now
 * means a later phase can wire real fulfillment without restructuring this
 * factory.
 *
 * @param {{tenantConnector, businessDatabaseRegistryRepository?, businessRepository, productRepository, inventoryEffectContracts?: Object}} deps
 * @returns {{repository: BookingRepository, useCases: Object}}
 */
export function buildBookingModule({
    tenantConnector,
    businessDatabaseRegistryRepository,
    businessRepository,
    productRepository,
    // eslint-disable-next-line no-unused-vars -- accepted for forward-compat (D-06); not wired this phase.
    inventoryEffectContracts
} = {}) {
    const repository = new BookingRepository({ tenantConnector, businessDatabaseRegistryRepository });

    return {
        repository,
        useCases: {
            createBooking: buildCreateBookingUseCase({ repository, businessRepository, productRepository }),
            cancelBooking: buildCancelBookingUseCase({ repository, businessRepository }),
            listBookings: buildListBookingsUseCase({ repository, businessRepository })
        }
    };
}

export default buildBookingModule;
