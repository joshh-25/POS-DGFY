// The explicit, checked-in list of apps/dgfy-api test files that need a real MySQL connection
// (or otherwise touch the real Sequelize `sequelize`/`db` singletons rather than a mock) -- #1015.
//
// Everything NOT in this list runs in the "fast" tier: one unchunked Jest invocation, real worker
// parallelism, no schema preflight, and -- as a permanent guardrail, not just a one-time check --
// DB_HOST/DB_PORT deliberately pointed nowhere reachable (see
// scripts/run-backend-test-matrix.js's runFastTier()). A file that actually needs MySQL but isn't
// listed here fails loudly the moment it runs in the fast tier, instead of silently passing by
// luck because some real database happened to be reachable in whatever environment ran it.
//
// This list was derived two ways, which agreed on all but 2 files (#1015 investigation):
//   1. References `tests/helpers/testTenantHelper.js`, `sequelize.authenticate()`,
//      `landlordSchemaReadiness.js`, or `sync({ force: ... })` directly.
//   2. Imports `src/models/index.js` or `src/config/database.js` without mocking either via
//      `jest.unstable_mockModule`.
// `posCheckout.db.integration.test.js`, `securityTransport.middleware.test.js`, and
// `auditIndexesScript.integration.test.js` matched neither heuristic (the first two reach the DB
// through a service/repository layer, not a direct import; the third `spawnSync`s
// `scripts/audit-indexes.js` as a NODE_ENV=production child process, so grepping the test file
// itself for a models/database import finds nothing) but were caught by the empirical proof
// itself: with DB_HOST/DB_PORT deliberately unreachable, the first two threw
// SequelizeConnectionRefusedError directly, and the third's own assertions (`status=healthy` /
// `status=degraded`) failed because its spawned child process couldn't reach a database either.
// That's exactly what the empirical check is for -- a heuristic alone would have missed all three.
//
// To add an entry: add the path (relative to apps/dgfy-api, matching the existing
// `tests/<name>.test.js` shape), then re-run the classification proof --
//   BACKEND_TEST_MATRIX_FAST_ALLOW_DB=false npm run test:backend:fast
// -- with no reachable database (the default; see runFastTier()) and confirm it's still green.
// To remove an entry: the same command must still be green with the entry gone.
//
// #1441 (Phase 250): demoted `engagementEventModel`, `tenantCredentialSurface.security`,
// `posParkedSale.schema.contract`, `posSplitPayment.schema.contract`, and
// `posCashierAttendanceSchema.contract` -- each imports `src/models/index.js` but issues no real
// query, so `src/config/database.js`'s Sequelize construction (which never connects on its own)
// lets them pass under the fast tier's DB_PORT=1 guard. Re-proved via the same command above.
// `paymentAtomicity.test.js` was planned as a 6th demotion on the same "import-only" reasoning but
// the empirical re-proof caught it as a false positive: it `jest.spyOn(db.sequelize,
// 'transaction')` rather than mocking the module, so `handleWebhook`'s real
// `sequelize.transaction(async (t) => ...)` call still tries to open a real transaction --
// under DB_PORT=1 that rejects before the callback runs, so `Payment.create` is never called with
// a transaction and the assertion fails. Kept on the manifest; not demoted.
// Also removed `token_refresh_race_integration.test.js`'s entry -- the file itself was deleted
// (never executed in any gate; see docs/testing/backend-test-suite-value-audit.md).
module.exports = [
  'tests/adminTenantLifecycle.integration.test.js',
  'tests/ai_cost_control_e2e.test.js',
  'tests/ai_export_e2e.test.js',
  'tests/auditIndexesScript.integration.test.js',
  'tests/auth.ratelimit.e2e.test.js',
  'tests/auth.test.js',
  'tests/authFailClosed.test.js',
  'tests/authTenantIsolation.hardening.test.js',
  'tests/billingScheduler.db.integration.test.js',
  'tests/complianceDowngradeTrigger.db.integration.test.js',
  'tests/e2e-full-cycle.test.js',
  'tests/lookup_v2.test.js',
  'tests/paymentAtomicity.test.js',
  'tests/posCheckout.db.integration.test.js',
  'tests/posSalesReconciliation.db.integration.test.js',
  'tests/purchaseOrder.test.js',
  'tests/race_condition_repro.test.js',
  'tests/reproduce_import_bypass.test.js',
  'tests/rtr_verification.test.js',
  'tests/securityTransport.middleware.test.js',
  'tests/storefrontPrimaryLocation.discovery.integration.test.js',
  'tests/supertest_security.test.js',
  'tests/tenantModelFactory.contract.test.js',
  'tests/tenantProvisioning.test.js',
  'tests/tenantProvisioningAdminUserId.test.js',
  // #1071/#1124: the real end-to-end coverage for the post-sync tenant-bootstrap seam (the
  // 000001->000002 migration ordering claim tenantProvisioning.storefrontBootstrap.test.js used to
  // accidentally exercise, unintentionally, before it was routed through a mocked seam -- see that
  // file's own comment) against a real MySQL connection.
  'tests/tenantSchemaBootstrap.integration.test.js',
  // Added alongside #1022's tenantHandler mock-drift fix -- this file's own SyntaxError (a stale
  // mock missing two exports added by 84109da50/#916) was masking that it unconditionally imports
  // the real `src/models/index.js` (unmocked) and performs real `User.create()` writes. Once the
  // mock is fixed the module loads, and confirmed empirically: with DB_HOST/DB_PORT pinned
  // unreachable (the fast tier's default), it throws SequelizeConnectionRefusedError directly --
  // exactly the empirical proof this file's own header describes for the three files heuristics
  // alone missed.
  'tests/toctou_integration.test.js',
  'tests/token_refresh_race.test.js',
  'tests/voidMovement.supertest.test.js',
  'tests/voidMovement.test.js',
];
