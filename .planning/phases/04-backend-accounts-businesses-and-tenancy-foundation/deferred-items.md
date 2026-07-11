# Deferred Items — Phase 04

Items discovered during execution that are out of scope for the current
plan/task and were deliberately NOT fixed, per the Scope Boundary rule
(only auto-fix issues directly caused by the current task's changes).

## From 04-08 (Task 2)

- **File:** `apps/dgfy-api/tests/integration/businesses/businessRoutes.test.js`
- **Issue:** `provisionTenantForBusiness()` calls
  `businessDatabaseRegistryRepository.create({...status: 'active'})` AFTER
  `POST /businesses` has already auto-created a `provisioning` registry row
  for the same `businessId` via `findOrCreateForBusiness()` (04-06). Since
  `business_database_registry` has no unique constraint on `business_id`
  (only on `database_name`), this creates a SECOND registry row per
  business rather than erroring. `findByBusinessId()`'s `findOne()` call
  (no explicit `ORDER BY`) may then resolve either row when a real MySQL
  server backs this suite — a genuine latent correctness bug, though this
  file does not exercise `POST /businesses/:id/activate-session` so it was
  not directly triggered by 04-08's `tenantSessionUseCases.js` gate change.
- **Why deferred:** `businessRoutes.test.js` is not in 04-08-PLAN.md's
  `<files>` list for Task 2, and this bug is pre-existing (introduced in an
  earlier wave), not caused by 04-08's changes. Per the Scope Boundary rule,
  pre-existing issues in unrelated files are logged here rather than fixed.
- **Suggested fix (future wave):** Apply the same fix already applied in
  04-08 to `businessFlows.test.js` / `businessValidation.test.js` /
  `tenantSessionFlows.test.js` / `tenantSessionValidation.test.js` /
  `tenantSessionRoutes.test.js` / `phase4FullFlow.test.js`: resolve the
  existing `provisioning` row via `findByBusinessId()` and call
  `updateStatus()` on it (see
  `apps/dgfy-api/tests/helpers/tenantSchemaProvisioning.js`'s
  `provisionAndActivateTenantDatabase()`) instead of creating a second row.
