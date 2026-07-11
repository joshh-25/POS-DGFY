export const ARCHITECTURE_CONTROLLER_NAMING_ALLOWLIST = Object.freeze([
    // linked_task_id: SKU-ARCH-ALLOWLIST-002
    // planned_removal_phase: Phase 2 controller naming normalization
    // planned_removal_date: 2026-06-30
    'src/modules/shared/controllers/useCaseResponder.js',
    // linked_task_id: DGFY-PHASE4-WAVE2-001
    // planned_removal_phase: n/a — check-architecture-guardrails.js resolves
    //   relative paths from backend/ even when ARCH_GUARDRAIL_MODULES_ROOT
    //   points at apps/dgfy-api/src/modules (see package.json's
    //   check:architecture:dgfy-api script), so these paths carry a
    //   ../apps/dgfy-api/ prefix. 04-02-PLAN.md's locked file names
    //   (accountController.js/businessController.js) intentionally don't
    //   follow backend/'s *Handlers.js convention — apps/dgfy-api is a
    //   separate Clean-Architecture service with its own module README
    //   documenting the routes -> controllers -> usecases -> repositories ->
    //   models layering.
    // planned_removal_date: n/a
    '../apps/dgfy-api/src/modules/accounts/controllers/accountController.js',
    '../apps/dgfy-api/src/modules/businesses/controllers/businessController.js'
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
]);

export default Object.freeze({
    controllerNaming: ARCHITECTURE_CONTROLLER_NAMING_ALLOWLIST,
    usecaseLegacyServiceImports: ARCHITECTURE_USECASE_SERVICE_IMPORT_ALLOWLIST
});
