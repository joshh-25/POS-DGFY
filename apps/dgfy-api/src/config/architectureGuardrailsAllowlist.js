// apps/dgfy-api's own architecture-guardrail allowlist, loaded via
// ARCH_GUARDRAIL_ALLOWLIST_PATH (see root package.json's
// check:architecture:dgfy-api script) instead of living under backend/ —
// Phase 4's scope boundary keeps backend/ and frontend/ completely
// untouched (not even config/data files).
//
// NOTE: backend/scripts/check-architecture-guardrails.js still computes
// relativePath as `path.relative(backendRoot, absolutePath)` where
// backendRoot is always backend/ (regardless of where this allowlist file
// itself lives, or where ARCH_GUARDRAIL_MODULES_ROOT points), so entries
// here still need the same `../apps/dgfy-api/...` prefix format as if this
// lived in backend/src/config/. Only the *location* of the allowlist file
// moved; the path format inside it is unchanged.
//
// linked_task_id: DGFY-PHASE4-WAVE2-001
// planned_removal_phase: n/a — 04-02-PLAN.md's locked file names
//   (accountController.js/businessController.js) intentionally don't follow
//   backend/'s *Handlers.js controller-naming convention; apps/dgfy-api is a
//   separate Clean-Architecture service with its own module README
//   documenting the routes -> controllers -> usecases -> repositories ->
//   models layering.
// planned_removal_date: n/a
export const ARCHITECTURE_CONTROLLER_NAMING_ALLOWLIST = Object.freeze([
    '../apps/dgfy-api/src/modules/accounts/controllers/accountController.js',
    '../apps/dgfy-api/src/modules/businesses/controllers/businessController.js'
]);

// apps/dgfy-api has no usecase-layer legacy-service-import exceptions yet.
export const ARCHITECTURE_USECASE_SERVICE_IMPORT_ALLOWLIST = Object.freeze([]);

export default Object.freeze({
    controllerNaming: ARCHITECTURE_CONTROLLER_NAMING_ALLOWLIST,
    usecaseLegacyServiceImports: ARCHITECTURE_USECASE_SERVICE_IMPORT_ALLOWLIST
});
