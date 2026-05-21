export const ARCHITECTURE_CONTROLLER_NAMING_ALLOWLIST = Object.freeze([
    // linked_task_id: SKU-ARCH-ALLOWLIST-002
    // planned_removal_phase: Phase 2 controller naming normalization
    // planned_removal_date: 2026-06-30
    'src/modules/shared/controllers/useCaseResponder.js'
]);

export const ARCHITECTURE_USECASE_SERVICE_IMPORT_ALLOWLIST = Object.freeze([
    // linked_task_id: SKU-ARCH-ALLOWLIST-003
    // planned_removal_phase: Phase 2 AI use-case modular extraction
    // planned_removal_date: 2026-06-30
    'src/modules/ai/usecases/toolHandlers/toolRegistryMap.js',
    // linked_task_id: SKU-ARCH-ALLOWLIST-004
    // planned_removal_phase: Phase 2 payments service decomposition
    // planned_removal_date: 2026-06-30
    'src/modules/payments/usecases/handleWebhookUseCase.js',
    // linked_task_id: SKU-ARCH-ALLOWLIST-005
    // planned_removal_phase: Phase 2 payments service decomposition
    // planned_removal_date: 2026-06-30
    'src/modules/payments/usecases/upgradeToPremiumUseCase.js',
    // linked_task_id: SKU-ARCH-ALLOWLIST-006
    // planned_removal_phase: Phase 2 tenant registration modular extraction
    // planned_removal_date: 2026-06-30
    'src/modules/tenants/usecases/registerCompanyRequestUseCase.js',
    // linked_task_id: SKU-ARCH-ALLOWLIST-007
    // planned_removal_phase: Phase 2 inventory service modularization
    // planned_removal_date: 2026-06-30
    'src/modules/purchaseOrders/usecases/receivePurchaseOrderUseCase.js',
    // linked_task_id: SKU-ARCH-ALLOWLIST-008
    // planned_removal_phase: Phase 2 POS module service extraction
    // planned_removal_date: 2026-06-30
    'src/modules/pos/usecases/posUseCases.js'
]);

export default Object.freeze({
    controllerNaming: ARCHITECTURE_CONTROLLER_NAMING_ALLOWLIST,
    usecaseLegacyServiceImports: ARCHITECTURE_USECASE_SERVICE_IMPORT_ALLOWLIST
});
