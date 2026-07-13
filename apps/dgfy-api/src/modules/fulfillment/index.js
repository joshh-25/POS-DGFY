// Dependency-injection wiring point for the fulfillment module (Clean
// Architecture "Dependency Inversion" — per project convention this file is
// the ONLY place that composes concrete implementations for this module),
// mirroring ../inventory/index.js's buildInventoryModule() pattern.
//
// Task 1 (11-02-PLAN.md) builds the repository layer:
// stageEventRepository (append-only) and courierAssignmentRepository
// (mutable payout). This file is re-extended by Task 2 to add
// availmentReadRepository, every usecase, buildFulfillmentModule(), and the
// recordStageEvents port the availments finalize seam (Plan 03) consumes.
// A minimal placeholder module-root index.js/README.md is required here
// (rather than deferred to Task 2) because apps/dgfy-api's pre-commit
// architecture guardrail (backend/scripts/check-architecture-guardrails.js)
// requires every directory under src/modules/ to have both files present at
// commit time.

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
