// Per-file judgments the rule engine in audit-backend-test-inventory.js cannot reproduce on its
// own -- the ~90-file manual classification pass done while planning #1441/Phase 250. Each entry
// names a `classification` (keep | consolidate | trim | delete | demote), a one-line `reason`, and
// -- for consolidate/demote -- a `mergeInto`/`newTier` target. This is what makes "rationale per
// deletion/consolidation" durable instead of living only in a PR description, and what makes the
// generated doc deterministic across re-runs.
//
// Same guard as scripts/backend-db-dependent-tests.js: throws on a path that no longer exists, so
// a rename/delete can't silently go stale here either. To remove an entry: delete the file (or the
// override, if the rule engine's own default is now correct) and re-run `npm run audit:backend-tests`.
'use strict';

module.exports = {
  // -- Section B: highest-confidence deletions (11 files) --------------------------------------
  'tests/posDeviceStatus.transport.test.js': {
    classification: 'delete',
    reason: 'its 2 cases are posDeviceStatus.unit.test.js cases 1 and 3 plus status(200/503) passthrough; 133 hand-enumerated stubs',
  },
  'tests/toctou_reproduction.test.js': {
    classification: 'delete',
    reason: 'fully mocked strict subset of toctou_integration.test.js case 1',
  },
  'tests/posOrderHistory.route.contract.test.js': {
    classification: 'delete',
    reason: 'one exact route line; behavior covered by posOrderHistory.usecase + posHandlers.transport listOnlineOrderHistory cases',
  },
  'tests/posCatalogBarcodeScope.contract.test.js': {
    classification: 'delete',
    reason: 'pins an attributes:[...] literal (the file itself rotted once); internalItemBarcode.contract runs the real Joi schema',
  },
  'tests/posCatalogCategory.contract.test.js': {
    classification: 'delete',
    reason: "pins a private helper's declaration text",
  },
  'tests/hospitalityOnboarding.contract.test.js': {
    classification: 'delete',
    reason: 'covered by onboardingUsecases.applicationResult + onboardingRepository.schemaCompatibility',
  },
  'tests/posTransactionHistory.search.contract.test.js': {
    classification: 'delete',
    reason: "toContain('cashier_id')-class greps on a repository file; posOrderHistory.usecase covers search",
  },
  'tests/itemBarcodeLabelContract.test.js': {
    classification: 'delete',
    reason: "toContain('item: {')-class greps; internalItemBarcode.contract / itemLocationStockOverlay cover labels",
  },
  'tests/billingAnchorBackfill.migration.test.js': {
    classification: 'delete',
    reason: 'billingScheduler.db.integration exercises the anchor behavior',
  },
  'tests/complianceDowngradeHardening.migration.test.js': {
    classification: 'delete',
    reason: 'complianceDowngradeTrigger.db.integration runs the triggers for real',
  },
  'tests/token_refresh_race_integration.test.js': {
    classification: 'delete',
    reason: 'never executes in any gate (describe.skip unless TEST_TYPE=integration, which the matrix never sets); case 1.6 covered by rtr_verification "RT1 used twice"; case 1.5 (6 concurrent refreshes on real Redis, no lock) recorded as an uncovered scenario',
  },

  // -- Consolidations (mechanical, in PR-A) -----------------------------------------------------
  'tests/posDiscountCalculator.test.js': {
    classification: 'consolidate',
    mergeInto: 'tests/posDiscountCalculator.unit.test.js',
    reason: 'not a subset of .unit -- legacy vat_type alias + lines:[] auto-select semantics live only here; fold both cases in verbatim',
  },
  'tests/commercePaymentReconciliation.route.contract.test.js': {
    classification: 'consolidate',
    mergeInto: 'tests/commercePaymentRouteMount.contract.test.js',
    reason: 'route-mount assertions duplicated between the two files',
  },
  'tests/dgfyTenantSessionService.contract.test.js': {
    classification: 'consolidate',
    mergeInto: 'tests/posDayClosePinSelfService.contract.test.js',
    reason: '3 fragments duplicated between the two files; posDayClosePinSelfService encodes a real incident and is the keeper',
  },
  'tests/posDayClosePinSelfService.contract.test.js': {
    classification: 'keep',
    reason: 'merge target for dgfyTenantSessionService.contract; encodes a real incident',
  },
  'tests/onboardingRoutes.contract.test.js': {
    classification: 'consolidate',
    mergeInto: 'tests/rateLimiterExemptionCoverage.contract.test.js',
    reason: 'limiter-presence assertions belong with rateLimiterExemptionCoverage',
  },
  'tests/itemsCategoryRoutes.contract.test.js': {
    classification: 'consolidate',
    mergeInto: 'tests/routeAuthorizationDeclarations.contract.test.js',
    reason: 'route-declaration grep; folded into the shared route-authorization sweep (#1451)',
  },
  'tests/adminAssistedProvisioningRoutes.contract.test.js': {
    classification: 'consolidate',
    mergeInto: 'tests/routeAuthorizationDeclarations.contract.test.js',
    reason: 'route-declaration grep; folded into the shared route-authorization sweep (#1451)',
  },
  'tests/routeAuthorizationDeclarations.contract.test.js': {
    classification: 'keep',
    reason: 'merge target for the route-declaration sweep; real RBAC regression guards on route lines (#1451)',
  },

  // -- Trims (keep the file, drop literal/duplicate assertions) ---------------------------------
  'tests/modeFinancialTracking.contract.test.js': {
    classification: 'trim',
    reason: 'keep the buildStockBearingItemWhere import check; drop the rest',
  },
  'tests/employeeCreditMigration.contract.test.js': {
    classification: 'trim',
    reason: 'keep 6 unique-constraint/ENUM assertions; drop 21 bare column greps',
  },
  'tests/posShiftLocationBackfillRemediation.migration.test.js': {
    classification: 'trim',
    reason: 'keep only the "migrations must not import app code" negative',
  },

  // -- DB-manifest demotions (db -> fast tier; import-only, no real query) ----------------------
  'tests/engagementEventModel.test.js': {
    classification: 'demote',
    newTier: 'fast',
    reason: "imports models/index.js but issues no queries; src/config/database.js constructs Sequelize without connecting, so it passes under the fast tier's DB_PORT=1 guard",
  },
  'tests/tenantCredentialSurface.security.test.js': {
    classification: 'demote',
    newTier: 'fast',
    reason: 'import-only; no real query issued',
  },
  'tests/paymentAtomicity.test.js': {
    classification: 'keep',
    reason: 'demotion candidate rejected by the empirical re-proof (#1441): jest.spyOn(db.sequelize, "transaction") still opens a real transaction inside handleWebhook, so it fails under the fast tier\'s DB_PORT=1 guard even though the model methods themselves are mocked. Stays on the db manifest',
  },
  'tests/posParkedSale.schema.contract.test.js': {
    classification: 'demote',
    newTier: 'fast',
    reason: 'import-only; no real query issued',
  },
  'tests/posSplitPayment.schema.contract.test.js': {
    classification: 'demote',
    newTier: 'fast',
    reason: 'import-only; no real query issued',
  },
  'tests/posCashierAttendanceSchema.contract.test.js': {
    classification: 'demote',
    newTier: 'fast',
    reason: 'import-only; no real query issued',
  },

  // -- Deletions (PR-C) --------------------------------------------------------------------------
  'tests/posSetupCashierRoute.transport.test.js': {
    classification: 'delete',
    reason: 'both cases assert only "not 404" on GET/POST of one path, at the cost of a full supertest src/server.js boot; route existence re-proved as a cheap source-text assertion in routeAuthorizationDeclarations.contract (#1451)',
  },

  // -- Correctness fix (own commit, not a cut) --------------------------------------------------
  'tests/e2e-full-cycle.test.js': {
    classification: 'keep',
    reason: 'correctness fix: beforeAll now throws when the runtime audit is unhealthy instead of silently returning (false-green fix, #1441)',
  },
};
