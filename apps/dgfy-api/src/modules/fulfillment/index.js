// Dependency-injection wiring point for the fulfillment module (Clean
// Architecture "Dependency Inversion" — per project convention this file is
// the ONLY place that composes concrete implementations for this module),
// mirroring ../inventory/index.js's buildInventoryModule() pattern.
//
// Task 1 (11-02-PLAN.md) built the repository layer: stageEventRepository
// (append-only) and courierAssignmentRepository (mutable payout). Task 2
// adds availmentReadRepository (the FUL-01 read path, also reused as the
// FUL-02 "load/sync a single availment" dependency — both constructed from
// the SAME { tenantConnector, businessDatabaseRegistryRepository }, per
// 11-PATTERNS.md), every usecase, the controller/routes layer, and this
// file's buildFulfillmentModule() factory — closing every FUL-01/02/03
// usecase over the three repositories and the businesses module's
// BusinessRepository (membership access control only — membership lives in
// the landlord dgfy_core database).
//
// Exposes a `recordStageEvents` port bound to stageEventRepository.bulkCreate
// — the injectable PORT the availments module's finalize seam (Plan 03)
// consumes, mirroring how modules/inventory exposes
// reservationPorts.commitReservation / effectContracts.recordSaleEffect.
//
// Composition wiring (mounting createFulfillmentRoutes() under /fulfillment
// and injecting recordStageEvents into buildAvailmentsModule() in
// apps/dgfy-api/src/routes/index.js) is Plan 03's scope, not this file's.

export {
    StageEventRepository,
    TenantDatabaseUnavailableError as StageEventTenantDatabaseUnavailableError,
    buildStageEventRepository
} from './repositories/stageEventRepository.js';
export {
    CourierAssignmentRepository,
    TenantDatabaseUnavailableError as CourierAssignmentTenantDatabaseUnavailableError,
    buildCourierAssignmentRepository
} from './repositories/courierAssignmentRepository.js';
export {
    AvailmentReadRepository,
    TenantDatabaseUnavailableError as AvailmentReadTenantDatabaseUnavailableError,
    buildAvailmentReadRepository
} from './repositories/availmentReadRepository.js';
export {
    STAGE_SEQUENCES,
    buildListIncomingOrdersUseCase,
    buildProgressStageUseCase,
    buildAssignCourierUseCase,
    buildMarkPayoutUseCase
} from './usecases/fulfillmentUseCases.js';
export { buildFulfillmentController } from './controllers/fulfillmentController.js';
export { createFulfillmentRoutes } from './routes.js';

import { StageEventRepository } from './repositories/stageEventRepository.js';
import { CourierAssignmentRepository } from './repositories/courierAssignmentRepository.js';
import { AvailmentReadRepository } from './repositories/availmentReadRepository.js';
import {
    buildListIncomingOrdersUseCase,
    buildProgressStageUseCase,
    buildAssignCourierUseCase,
    buildMarkPayoutUseCase
} from './usecases/fulfillmentUseCases.js';
import { createFulfillmentRoutes } from './routes.js';

/**
 * Builds the fully wired fulfillment module: stageEventRepository,
 * courierAssignmentRepository, and availmentReadRepository (all tenant-
 * scoped, resolved via the injected tenantConnector), plus every FUL-01/02/
 * 03 usecase closed over them and the injected businessRepository
 * (membership gating, A3 — any active member).
 *
 * @param {{tenantConnector, businessDatabaseRegistryRepository?, businessRepository}} deps
 * @returns {{repositories: Object, useCases: Object, createFulfillmentRoutes: Function, recordStageEvents: Function}}
 */
export function buildFulfillmentModule({
    tenantConnector,
    businessDatabaseRegistryRepository,
    businessRepository
} = {}) {
    const stageEventRepository = new StageEventRepository({ tenantConnector, businessDatabaseRegistryRepository });
    const courierAssignmentRepository = new CourierAssignmentRepository({ tenantConnector, businessDatabaseRegistryRepository });
    const availmentReadRepository = new AvailmentReadRepository({ tenantConnector, businessDatabaseRegistryRepository });

    const useCases = {
        listIncomingOrders: buildListIncomingOrdersUseCase({ availmentReadRepository, businessRepository }),
        progressStage: buildProgressStageUseCase({
            stageEventRepository,
            availmentRepository: availmentReadRepository,
            businessRepository
        }),
        assignCourier: buildAssignCourierUseCase({ courierAssignmentRepository, businessRepository }),
        markPayout: buildMarkPayoutUseCase({ courierAssignmentRepository, businessRepository })
    };

    // recordStageEvents port: injectable seam the availments module's
    // finalize transaction (Plan 03) calls directly — bulkCreate accepts
    // and passes through the caller's { transaction } so the stage-event
    // write commits atomically with the finalize.
    const recordStageEvents = (businessId, events, options = {}) => (
        stageEventRepository.bulkCreate(businessId, events, options)
    );

    return {
        repositories: { stageEventRepository, courierAssignmentRepository, availmentReadRepository },
        useCases,
        createFulfillmentRoutes: (deps) => createFulfillmentRoutes(useCases, deps),
        recordStageEvents
    };
}

export default buildFulfillmentModule;
