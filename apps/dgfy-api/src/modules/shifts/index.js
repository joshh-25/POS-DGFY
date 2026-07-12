// Dependency-injection wiring point for the shifts module (Clean
// Architecture "Dependency Inversion" — per project convention this file is
// the ONLY place that composes concrete implementations for this module),
// mirroring ../inventory/index.js's buildInventoryModule() pattern.
//
// Task 1 (08-05-PLAN.md) built the repository/entity/usecase layers. Task 2
// adds the controllers/routes.js layer and this file's buildShiftsModule()
// factory, closing every shift usecase over ShiftRepository (tenant-scoped,
// resolved via the injected TenantConnector, with CashDrawerEventRepository
// as its append-only collaborator) and the businesses module's
// BusinessRepository (membership/staff-or-owner access control only —
// membership lives in the landlord dgfy_core database).
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
export { buildShiftController } from './controllers/shiftController.js';
export { createShiftRoutes } from './routes.js';

import { ShiftRepository } from './repositories/shiftRepository.js';
import { CashDrawerEventRepository } from './repositories/cashDrawerEventRepository.js';
import {
    buildOpenShiftUseCase,
    buildCloseShiftUseCase,
    buildRecordNoSalePopUseCase,
    buildListShiftsUseCase
} from './usecases/shiftUseCases.js';

// Operator-configurable stale-shift threshold (D-11) — read here (the
// module's composition boundary), never inline in the usecase/entity
// layers, and never a hardcoded literal passed to buildListShiftsUseCase.
// SHIFT_STALE_THRESHOLD_MINUTES lets an operator tune this per deployment;
// 60 minutes is only the fallback when the env var is absent/invalid.
const DEFAULT_STALE_THRESHOLD_MINUTES = 60;

const resolveStaleThresholdMinutes = (override) => {
    if (Number.isFinite(Number(override)) && Number(override) > 0) {
        return Number(override);
    }
    const fromEnv = Number(process.env.SHIFT_STALE_THRESHOLD_MINUTES);
    if (Number.isFinite(fromEnv) && fromEnv > 0) {
        return fromEnv;
    }
    return DEFAULT_STALE_THRESHOLD_MINUTES;
};

/**
 * Builds the fully wired shifts module: one ShiftRepository instance
 * (tenant-scoped, resolved via the injected tenantConnector, with a
 * CashDrawerEventRepository collaborator for its append-only event writes)
 * plus every shift usecase closed over it and the injected
 * businessRepository (used ONLY for membership/staff-or-owner access
 * control).
 *
 * `assertComplianceGate` (FSC-02) is accepted but OPTIONAL and never
 * invoked this phase — Phase 9 wires the real gate call site into
 * shift-open. Accepting it here now means Phase 9 can inject a real
 * implementation without restructuring this factory.
 *
 * `staleThresholdMinutes` (D-11) is operator-configurable: pass it
 * explicitly, or omit it to fall back to the SHIFT_STALE_THRESHOLD_MINUTES
 * env var, or a last-resort default — never a hardcoded literal baked into
 * the usecase itself.
 *
 * @param {{tenantConnector, businessDatabaseRegistryRepository?, businessRepository, staleThresholdMinutes?, assertComplianceGate?: Function}} deps
 * @returns {{repository: ShiftRepository, cashDrawerEventRepository: CashDrawerEventRepository, useCases: Object}}
 */
export function buildShiftsModule({
    tenantConnector,
    businessDatabaseRegistryRepository,
    businessRepository,
    staleThresholdMinutes,
    // eslint-disable-next-line no-unused-vars -- accepted for forward-compat (FSC-02); Phase 9 wires the real gate call site.
    assertComplianceGate
} = {}) {
    const cashDrawerEventRepository = new CashDrawerEventRepository({
        tenantConnector,
        businessDatabaseRegistryRepository
    });
    const repository = new ShiftRepository({
        tenantConnector,
        businessDatabaseRegistryRepository,
        cashDrawerEventRepository
    });

    return {
        repository,
        cashDrawerEventRepository,
        useCases: {
            openShift: buildOpenShiftUseCase({ repository, businessRepository }),
            closeShift: buildCloseShiftUseCase({ repository, businessRepository }),
            recordNoSalePop: buildRecordNoSalePopUseCase({ repository, businessRepository }),
            listShifts: buildListShiftsUseCase({
                repository,
                businessRepository,
                staleThresholdMinutes: resolveStaleThresholdMinutes(staleThresholdMinutes)
            })
        }
    };
}

export default buildShiftsModule;
