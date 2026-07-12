---
phase: 08-commerce-foundation-product-catalog-booking-shift-cash-drawe
reviewed: 2026-07-12T15:25:51Z
depth: standard
files_reviewed: 67
files_reviewed_list:
  - apps/dgfy-api/src/config/architectureGuardrailsAllowlist.js
  - apps/dgfy-api/src/infra/tenantConnector.js
  - apps/dgfy-api/src/models/Tenant/Booking.js
  - apps/dgfy-api/src/models/Tenant/BookingCapacity.js
  - apps/dgfy-api/src/models/Tenant/CashDrawerEvent.js
  - apps/dgfy-api/src/models/Tenant/ComplianceModeState.js
  - apps/dgfy-api/src/models/Tenant/InventoryMovement.js
  - apps/dgfy-api/src/models/Tenant/Product.js
  - apps/dgfy-api/src/models/Tenant/ProductFolder.js
  - apps/dgfy-api/src/models/Tenant/Shift.js
  - apps/dgfy-api/src/modules/booking/README.md
  - apps/dgfy-api/src/modules/booking/controllers/bookingController.js
  - apps/dgfy-api/src/modules/booking/entities/bookingEntity.js
  - apps/dgfy-api/src/modules/booking/index.js
  - apps/dgfy-api/src/modules/booking/repositories/bookingRepository.js
  - apps/dgfy-api/src/modules/booking/routes.js
  - apps/dgfy-api/src/modules/booking/usecases/bookingUseCases.js
  - apps/dgfy-api/src/modules/compliance/README.md
  - apps/dgfy-api/src/modules/compliance/controllers/complianceController.js
  - apps/dgfy-api/src/modules/compliance/entities/complianceEntity.js
  - apps/dgfy-api/src/modules/compliance/index.js
  - apps/dgfy-api/src/modules/compliance/policy/constants.js
  - apps/dgfy-api/src/modules/compliance/policy/policyEngine.js
  - apps/dgfy-api/src/modules/compliance/policy/policyPacks.js
  - apps/dgfy-api/src/modules/compliance/repositories/complianceModeStateRepository.js
  - apps/dgfy-api/src/modules/compliance/routes.js
  - apps/dgfy-api/src/modules/compliance/usecases/complianceGate.js
  - apps/dgfy-api/src/modules/compliance/usecases/complianceUseCases.js
  - apps/dgfy-api/src/modules/inventory/README.md
  - apps/dgfy-api/src/modules/inventory/controllers/inventoryMovementController.js
  - apps/dgfy-api/src/modules/inventory/entities/inventoryMovementEntity.js
  - apps/dgfy-api/src/modules/inventory/index.js
  - apps/dgfy-api/src/modules/inventory/repositories/inventoryMovementRepository.js
  - apps/dgfy-api/src/modules/inventory/routes.js
  - apps/dgfy-api/src/modules/inventory/usecases/inventoryEffectContracts.js
  - apps/dgfy-api/src/modules/inventory/usecases/inventoryMovementUseCases.js
  - apps/dgfy-api/src/modules/products/README.md
  - apps/dgfy-api/src/modules/products/controllers/productController.js
  - apps/dgfy-api/src/modules/products/controllers/productFolderController.js
  - apps/dgfy-api/src/modules/products/entities/productEntity.js
  - apps/dgfy-api/src/modules/products/index.js
  - apps/dgfy-api/src/modules/products/repositories/productFolderRepository.js
  - apps/dgfy-api/src/modules/products/repositories/productRepository.js
  - apps/dgfy-api/src/modules/products/routes.js
  - apps/dgfy-api/src/modules/products/usecases/productFolderUseCases.js
  - apps/dgfy-api/src/modules/products/usecases/productUseCases.js
  - apps/dgfy-api/src/modules/shifts/README.md
  - apps/dgfy-api/src/modules/shifts/controllers/shiftController.js
  - apps/dgfy-api/src/modules/shifts/entities/shiftEntity.js
  - apps/dgfy-api/src/modules/shifts/index.js
  - apps/dgfy-api/src/modules/shifts/repositories/cashDrawerEventRepository.js
  - apps/dgfy-api/src/modules/shifts/repositories/shiftRepository.js
  - apps/dgfy-api/src/modules/shifts/routes.js
  - apps/dgfy-api/src/modules/shifts/usecases/shiftUseCases.js
  - apps/dgfy-api/src/routes/index.js
  - apps/dgfy-api/tests/integration/booking/bookingCapacity.test.js
  - apps/dgfy-api/tests/integration/commerce/commerceModulesMount.test.js
  - apps/dgfy-api/tests/unit/modules/booking/bookingUseCases.test.js
  - apps/dgfy-api/tests/unit/modules/compliance/complianceChecklistGating.test.js
  - apps/dgfy-api/tests/unit/modules/compliance/complianceGate.test.js
  - apps/dgfy-api/tests/unit/modules/compliance/complianceModeStateRepository.test.js
  - apps/dgfy-api/tests/unit/modules/inventory/inventoryMovementUseCases.test.js
  - apps/dgfy-api/tests/unit/modules/products/productUseCases.test.js
  - apps/dgfy-api/tests/unit/modules/shifts/shiftUseCases.test.js
  - apps/dgfy-migration-runner/src/migrations/schema/20260712100000-create-commerce-foundation.cjs
  - apps/dgfy-migration-runner/src/migrations/schema/20260712140000-harden-compliance-mode-state-uniqueness.cjs
  - apps/dgfy-migration-runner/src/schemaContracts/dgfyBusinessContract.js
  - apps/dgfy-migration-runner/tests/dgfyBusinessSchema.test.js
findings:
  critical: 2
  warning: 4
  info: 2
  total: 8
status: issues_found
---

# Phase 08: Code Review Report

**Reviewed:** 2026-07-12T15:25:51Z
**Depth:** standard
**Files Reviewed:** 67
**Status:** issues_found

## Summary

This is a fresh, full-scope pass over the entire Phase 08 commerce-foundation surface (products, inventory, compliance, shifts, booking, the composition root, the 08-01 + 08-09 migrations, and the schema contract), superseding the earlier 08-01..08-08 review. The overall architecture is clean and consistently mirrored across modules (routes -> controllers -> usecases -> repositories -> models, tenant-DB resolution via `TenantConnector`, `ApplicationResult`/`DomainError` envelopes). The 08-09 gap-closure work (CR-01/FSC-01 unique-index hardening, CR-02/FSC-02 checklist gating) is well-tested for the scenarios its own test files exercise.

Two BLOCKER-level issues were found. The more serious one is in the CR-02/FSC-02 gap-closure itself: `evaluateComplianceChecklist()`'s evidence-derived readiness signals use two different default policies — 5 of the 7 signals silently default to "ready" when the caller omits them, directly contradicting the explicit code-comment guarantee ("the gate never silently assumes completeness for any of the seven signals") and the whole point of the 08-09 hardening. The second is a cross-module API-contract inconsistency: `products`/`compliance` controllers read `businessId` (camelCase) from the request body/query, while `inventory`/`shifts`/`booking` controllers read `business_id` (snake_case) — a client following one module's convention will silently fail on the other four endpoints.

Several WARNING-level issues stem from a repeated `withModel(s)` pattern that converts ANY unexpected error (including genuine application bugs) into a generic `TenantDatabaseUnavailableError('unreachable')` 503, and one repository (`ProductFolderRepository`) that — unlike its sibling repositories in the very same phase — does not duck-type its DB unique-constraint violation into a clean 409, so it inherits the misleading 503 under concurrent duplicate-name creation.

## Critical Issues

### CR-01: Compliance checklist's evidence-derived readiness signals fail OPEN for 5 of 7 signals, contradicting the CR-02/FSC-02 gap-closure's own guarantee

**File:** `apps/dgfy-api/src/modules/compliance/policy/policyEngine.js:383-398`
**Issue:**
`evaluateComplianceChecklist()` computes seven evidence-derived readiness signals that `evaluateComplianceDecision()`'s `compliant_active` POS-operation branch now consults via `checklist.ready_for_compliant_activation` (added by the 08-09 CR-02/FSC-02 gap-closure, see the comment block at `policyEngine.js:1003-1022` and `complianceGate.js:28-41`, which explicitly claims: *"the gate never silently assumes completeness for any of the seven signals"*).

The seven signals do NOT share one default policy:

```js
const fiscalAccumulatorStreamReady = evidence?.fiscal_accumulator_stream_ready !== false;   // undefined -> TRUE
const auditLogAppendOnlyEnforced = evidence?.audit_log_append_only_enforced !== false;       // undefined -> TRUE
const paymentHandoffPolicyReady = evidence?.payment_handoff_policy_ready !== false;          // undefined -> TRUE
...
const submissionArtifactsReady = evidence?.submission_artifacts?.ready !== false;            // undefined -> TRUE
const encryptionPolicyPrerequisitesReady = evidence?.encryption_policy_prerequisites_ready !== false; // undefined -> TRUE
...
const rmoFilingReadinessReady = rmoFilingReadiness.ready === true;            // undefined -> FALSE
...
const fiscalTerminalRegistrationReady = fiscalTerminalRegistration.ready === true;            // undefined -> FALSE
```

Five signals use the `!== false` idiom, which treats an *omitted* field (`undefined`) as satisfied. Only two signals (`rmo_filing_readiness`, `fiscal_terminal_registration`) use `=== true`, which correctly treats an omitted field as unsatisfied.

Concretely: a `compliant_active` business with fully-complete profile/settings/artifacts/peripherals, and an `evidence` object that supplies ONLY `{ rmo_filing_readiness: { ready: true }, fiscal_terminal_registration: { ready: true } }` (i.e. the caller never asserts anything about the fiscal accumulator stream, audit-log append-only enforcement, payment-handoff policy, submission-artifact readiness, or encryption prerequisites) will still receive `ready_for_compliant_activation: true` and an `ALLOW` decision — even though five of the seven controls were never actually verified. This is exactly the "silently assumes completeness" failure mode the 08-09 gap-closure's own comments claim to have eliminated; it only closed the gap for 2 of the 7 signals.

The existing regression test (`complianceChecklistGating.test.js`'s "empty-evidence guard") only exercises `evidence: {}` (i.e. every field omitted at once), which happens to still fail because the two fail-closed signals (`rmo_filing_readiness`, `fiscal_terminal_registration`) drag the aggregate to `false`. It does not cover the partial-evidence case above, so this gap is untested and will not regress-fail if hit in Phase 9.

Given this gate is the single shared FSC-02 hand-off contract that Phase 9's checkout/shift-open/receipt-render call sites are documented to rely on for fiscal-document eligibility, a caller that forgets to populate one of the five fail-open fields (very plausible — they look optional) silently grants fiscal-document issuance without the underlying control being verified.

**Fix:** Make all seven signals fail closed consistently, e.g.:
```js
const fiscalAccumulatorStreamReady = evidence?.fiscal_accumulator_stream_ready === true;
const auditLogAppendOnlyEnforced = evidence?.audit_log_append_only_enforced === true;
const paymentHandoffPolicyReady = evidence?.payment_handoff_policy_ready === true;
const submissionArtifactsReady = evidence?.submission_artifacts?.ready === true;
const encryptionPolicyPrerequisitesReady = evidence?.encryption_policy_prerequisites_ready === true;
```
and add a test that supplies a *partial* evidence bundle (only the two currently-fail-closed fields set to `true`, everything else omitted) asserting the decision is `REQUIRES_SETUP`, not `ALLOW`.

### CR-02: `businessId` request-field naming is inconsistent across Phase 8 modules — `products`/`compliance` use camelCase, `inventory`/`shifts`/`booking` use snake_case

**File:** `apps/dgfy-api/src/modules/products/controllers/productController.js:24,39,57,69`, `apps/dgfy-api/src/modules/products/controllers/productFolderController.js:15,28`, `apps/dgfy-api/src/modules/compliance/controllers/complianceController.js:18` (and the `req.body` destructure at lines 27, 41-46) — **vs.** `apps/dgfy-api/src/modules/inventory/controllers/inventoryMovementController.js:21,45`, `apps/dgfy-api/src/modules/shifts/controllers/shiftController.js:23,37,53,65`, `apps/dgfy-api/src/modules/booking/controllers/bookingController.js:23,39,50`
**Issue:** Every commerce module in this phase mounts top-level (not nested under `/businesses/:businessId`) and therefore must read `businessId` out of the request body (writes) or query string (reads). Two modules read the camelCase key:
```js
// productController.js:24
businessId: body.businessId,
// complianceController.js:18
businessId: req.query.businessId,
```
The other three read the snake_case key:
```js
// inventoryMovementController.js:21
businessId: body.business_id,
// shiftController.js:23
businessId: body.business_id,
// bookingController.js:23
businessId: body.business_id,
```
Every other field in every one of these controllers is consistently snake_case on the wire (`product_id`, `slot_start`, `opening_float_amount`, `terminal_id`, etc. — matching the DB column naming), so this isn't "the whole module uses camelCase," it's specifically the `businessId`/`business_id` key that silently diverges per module. A client (or a shared API SDK/fetch wrapper) built against one module's convention will send the wrong key to the other four modules' endpoints, and every one of those requests will fail validation with `"businessId is required."` (400) because `body.businessId`/`body.business_id` resolves to `undefined` on the mismatched module. No test in this phase's suite (including `commerceModulesMount.test.js`, which never authenticates or sends a body) would have caught this.

**Fix:** Standardize on one convention (the codebase's dominant convention elsewhere is snake_case on the wire, matching DB columns) and update `productController.js`/`productFolderController.js`/`complianceController.js` to read `body.business_id` / `req.query.business_id`, or explicitly document/support both keys during a migration window.

## Warnings

### WR-01: `withModel(s)` in every repository masks unexpected application errors as a misleading `TenantDatabaseUnavailableError('unreachable')` 503

**File:** `apps/dgfy-api/src/modules/booking/repositories/bookingRepository.js:132-146`, `apps/dgfy-api/src/modules/products/repositories/productRepository.js:96-108`, `apps/dgfy-api/src/modules/products/repositories/productFolderRepository.js:74-86`, `apps/dgfy-api/src/modules/inventory/repositories/inventoryMovementRepository.js:136-148`, `apps/dgfy-api/src/modules/shifts/repositories/cashDrawerEventRepository.js:103-115`, `apps/dgfy-api/src/modules/shifts/repositories/shiftRepository.js:164-183`, `apps/dgfy-api/src/modules/compliance/repositories/complianceModeStateRepository.js:146-164`
**Issue:** Every repository's `withModel`/`withModels` helper wraps the caller-supplied `fn(model)` in a `try/catch` that rethrows any error not already one of the repository's own named error classes as `TenantDatabaseUnavailableError('unreachable', 'Unable to reach the tenant database for this business.')`. This swallows the true error (its message, stack, and class) for any genuine bug reachable inside the query — a Sequelize validation error, an unexpected `TypeError` from a bad input (e.g. a non-numeric `productId`/`branchId` passed through from `bookingUseCases.js`'s weak `isFiniteId` check, which only verifies the value is not `undefined`/`null`/`''`, not that it's actually numeric), a foreign-key violation, etc. The client sees a 503 "tenant database unavailable," which is both factually wrong (the database is reachable — the query failed) and actively misleading for on-call debugging, since it points responders at infrastructure instead of the actual code path that threw.

**Fix:** Narrow the catch to only convert genuinely connection/availability-shaped errors (e.g. `SequelizeConnectionError`, `ECONNREFUSED`, timeout errors) into `TenantDatabaseUnavailableError('unreachable', ...)`, and let everything else propagate so it surfaces as an unhandled 500 with its real stack trace (consistent with how usecases already `throw repoError;` for anything they don't recognize).

### WR-02: `ProductFolderRepository.create()` does not duck-type its unique-name violation, unlike every sibling repository added in this same phase

**File:** `apps/dgfy-api/src/modules/products/repositories/productFolderRepository.js:93-106`
**Issue:** `product_folders` has a DB-enforced unique index (`unique_product_folders_business_name` on `(business_id, name)`, see `20260712100000-create-commerce-foundation.cjs:120-123`). `productFolderUseCases.js`'s `buildCreateProductFolderUseCase` performs a `findByName()` pre-check before calling `repository.create()`, but that pre-check is a classic TOCTOU race: two concurrent requests for the same folder name can both pass the pre-check, then both attempt the INSERT. The loser's INSERT throws a raw `SequelizeUniqueConstraintError`, which `ProductFolderRepository.create()` does not catch — it falls straight into `withModel()`'s generic catch-all (see WR-01) and comes back as a `TenantDatabaseUnavailableError('unreachable')` 503, not the intended `409 CONFLICT`.

This is a real regression relative to the pattern this exact phase establishes elsewhere: `shiftRepository.js` (`isUniqueConstraintViolation` -> `DuplicateOpenShiftError` -> 409), `bookingRepository.js` (guarded UPDATE -> `BookingCapacityFullError` -> 409), and `complianceModeStateRepository.js` (`isUniqueConstraintViolation` -> `DuplicateComplianceModeStateError` -> 409) all explicitly guard against exactly this race and map it to a clean 409. `ProductFolderRepository` is the one repository in this phase that still lets a concurrent-duplicate race surface as a misleading 503.

**Fix:** Copy `shiftRepository.js`'s `isUniqueConstraintViolation()` helper into `productFolderRepository.js`, catch it around the `ProductFolder.create()` call, and rethrow a dedicated `DuplicateProductFolderNameError` that `productFolderUseCases.js` maps to the existing `conflictError(...)` 409 path.

### WR-03: Non-atomic two-step writes in `complianceUseCases.js` can leave `compliance_mode_state` in a partially-updated, inconsistent state on a mid-sequence failure

**File:** `apps/dgfy-api/src/modules/compliance/usecases/complianceUseCases.js:213-247` (`buildSubmitComplianceEvidenceUseCase`), `apps/dgfy-api/src/modules/compliance/usecases/complianceUseCases.js:301-313` (`buildReviewComplianceStateUseCase`)
**Issue:** Both use cases perform two sequential, independently-transacted repository calls with no shared transaction or compensating rollback:
```js
// buildSubmitComplianceEvidenceUseCase
await repository.upsertState(businessId, branchId, updates);
const withResetVerification = await repository.recordVerification(businessId, branchId, { ... pending_review ... });
```
```js
// buildReviewComplianceStateUseCase (verified path)
const verified = await repository.recordVerification(businessId, branchId, { verification_status: verificationStatus, ... });
const finalRow = verificationStatus === 'verified'
    ? await repository.upsertState(businessId, branchId, { state: newState })
    : verified;
```
If the first call in either sequence commits and the second call then throws (e.g. a transient `TenantDatabaseUnavailableError`, or, per WR-01, some other error masked as one), the use case returns a failure `ApplicationResult`, but the first write has already been durably committed. For `buildSubmitComplianceEvidenceUseCase`, this can leave `compliance_profile` updated with stale `verification_status`/`verified_by_actor_type`/`verified_at` (i.e. new evidence submitted, but not actually reset to `pending_review` as the docstring promises). For `buildReviewComplianceStateUseCase`'s verified path, this can leave `verification_status: 'verified'` recorded on the row while `state` never actually transitioned to `newState` — an auditable inconsistency in a compliance-critical record.

**Fix:** Wrap each two-step sequence in a single `sequelize.transaction()` at the repository layer (mirroring `shiftRepository.js`'s and `bookingRepository.js`'s existing multi-write transaction pattern), exposing one repository method (e.g. `submitEvidenceAtomic()` / `reviewAndTransitionAtomic()`) that performs both writes inside one transaction.

### WR-04: `isPositiveInteger` in `productUseCases.js` rejects numeric strings, inconsistent with every other numeric validator added in this phase

**File:** `apps/dgfy-api/src/modules/products/usecases/productUseCases.js:78`
**Issue:**
```js
const isPositiveInteger = (value) => Number.isInteger(value) && value > 0;
```
`Number.isInteger()` returns `false` for anything that isn't already a JS `number` primitive — a request body value of `"30"` (a numeric string, e.g. from a form-encoded client or a client that stringifies all outgoing fields) is rejected with a 400 for `slot_duration_minutes`/`concurrent_capacity` in `buildSetProductBookableUseCase`. Every other numeric validator added in this same phase coerces first: `isFiniteNumberOrNull` in this very file (`Number.isFinite(Number(value))`), `isNonNegativeNumber` in `shiftUseCases.js`, `isFiniteNonZeroNumber`/`isPositiveNumber` in `inventoryMovementUseCases.js`. This one validator's stricter, type-sensitive behavior is inconsistent with its siblings and will silently reject otherwise-valid-looking requests that the rest of the API accepts.

**Fix:** `const isPositiveInteger = (value) => Number.isInteger(Number(value)) && Number(value) > 0;` (or explicitly document that this endpoint requires JSON-typed numbers, unlike its siblings).

## Info

### IN-01: `evaluateComplianceChecklist()` computes `documentary_readiness` and `evidence.submission_artifacts` as two separately-maintained copies of the same data

**File:** `apps/dgfy-api/src/modules/compliance/policy/policyEngine.js:650-656,672-678`
**Issue:** The returned checklist object duplicates the exact same `{ complete, total, missing, ready, items }` shape twice — once at `documentary_readiness` and once at `evidence.submission_artifacts` — computed from the same source expression (`evidence?.submission_artifacts?.*`) in two places. Any future change to one copy's derivation (e.g. a rounding/parsing tweak) risks silently diverging from the other.
**Fix:** Compute the shape once into a local variable and reference it from both `documentary_readiness` and `evidence.submission_artifacts`.

### IN-02: `bookingUseCases.js`'s `isFiniteId` does not verify numeric-ness, only presence

**File:** `apps/dgfy-api/src/modules/booking/usecases/bookingUseCases.js:116`
**Issue:** `const isFiniteId = (value) => value !== undefined && value !== null && value !== '';` accepts any non-empty value, including non-numeric strings like `"abc"`, for `productId`/`branchId`/`bookingId`. Combined with WR-01, a malformed ID reaching the repository/DB layer surfaces as a misleading 503 instead of a 400 validation error at the usecase boundary where it belongs.
**Fix:** `const isFiniteId = (value) => value !== undefined && value !== null && value !== '' && Number.isFinite(Number(value));`

---

_Reviewed: 2026-07-12T15:25:51Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
