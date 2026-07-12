// Dependency-injection wiring point for the shifts module (Clean
// Architecture "Dependency Inversion" — per project convention this file is
// the ONLY place that composes concrete implementations for this module),
// mirroring ../inventory/index.js's buildInventoryModule() pattern.
//
// Task 1 (08-05-PLAN.md) builds the repository/entity/usecase layers and
// re-exports them here (architecture guardrail requires every module
// directory to carry an index.js from its first commit). Task 2 adds the
// controllers/routes.js layer and this file's buildShiftsModule() factory.
//
// Composition wiring (mounting createShiftRoutes() under /shifts in
// apps/dgfy-api/src/routes/index.js) is 08-08's scope, not this file's.

export {
    ShiftRepository,
    buildShiftRepository,
    DuplicateOpenShiftError,
    ShiftNotFoundError,
    ShiftNotOpenError
} from './repositories/shiftRepository.js';
export { CashDrawerEventRepository, buildCashDrawerEventRepository } from './repositories/cashDrawerEventRepository.js';
export { ShiftEntity, createShiftEntity } from './entities/shiftEntity.js';
export {
    computeExpectedCash,
    buildOpenShiftUseCase,
    buildCloseShiftUseCase,
    buildRecordNoSalePopUseCase,
    buildListShiftsUseCase
} from './usecases/shiftUseCases.js';
