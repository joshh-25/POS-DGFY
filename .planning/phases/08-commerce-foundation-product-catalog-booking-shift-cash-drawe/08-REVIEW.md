---
phase: 08-commerce-foundation-product-catalog-booking-shift-cash-drawe
reviewed: 2026-07-13T00:00:00Z
depth: standard
files_reviewed: 68
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
  - apps/dgfy-api/src/modules/booking/controllers/bookingController.js
  - apps/dgfy-api/src/modules/booking/entities/bookingEntity.js
  - apps/dgfy-api/src/modules/booking/index.js
  - apps/dgfy-api/src/modules/booking/README.md
  - apps/dgfy-api/src/modules/booking/repositories/bookingRepository.js
  - apps/dgfy-api/src/modules/booking/routes.js
  - apps/dgfy-api/src/modules/booking/usecases/bookingUseCases.js
  - apps/dgfy-api/src/modules/compliance/controllers/complianceController.js
  - apps/dgfy-api/src/modules/compliance/entities/complianceEntity.js
  - apps/dgfy-api/src/modules/compliance/index.js
  - apps/dgfy-api/src/modules/compliance/policy/constants.js
  - apps/dgfy-api/src/modules/compliance/policy/policyEngine.js
  - apps/dgfy-api/src/modules/compliance/policy/policyPacks.js
  - apps/dgfy-api/src/modules/compliance/README.md
  - apps/dgfy-api/src/modules/compliance/repositories/complianceModeStateRepository.js
  - apps/dgfy-api/src/modules/compliance/routes.js
  - apps/dgfy-api/src/modules/compliance/usecases/complianceGate.js
  - apps/dgfy-api/src/modules/compliance/usecases/complianceUseCases.js
  - apps/dgfy-api/src/modules/inventory/controllers/inventoryMovementController.js
  - apps/dgfy-api/src/modules/inventory/entities/inventoryMovementEntity.js
  - apps/dgfy-api/src/modules/inventory/index.js
  - apps/dgfy-api/src/modules/inventory/README.md
  - apps/dgfy-api/src/modules/inventory/repositories/inventoryMovementRepository.js
  - apps/dgfy-api/src/modules/inventory/routes.js
  - apps/dgfy-api/src/modules/inventory/usecases/inventoryEffectContracts.js
  - apps/dgfy-api/src/modules/inventory/usecases/inventoryMovementUseCases.js
  - apps/dgfy-api/src/modules/products/controllers/productController.js
  - apps/dgfy-api/src/modules/products/controllers/productFolderController.js
  - apps/dgfy-api/src/modules/products/entities/productEntity.js
  - apps/dgfy-api/src/modules/products/index.js
  - apps/dgfy-api/src/modules/products/README.md
  - apps/dgfy-api/src/modules/products/repositories/productFolderRepository.js
  - apps/dgfy-api/src/modules/products/repositories/productRepository.js
  - apps/dgfy-api/src/modules/products/routes.js
  - apps/dgfy-api/src/modules/products/usecases/productFolderUseCases.js
  - apps/dgfy-api/src/modules/products/usecases/productUseCases.js
  - apps/dgfy-api/src/modules/shifts/controllers/shiftController.js
  - apps/dgfy-api/src/modules/shifts/entities/shiftEntity.js
  - apps/dgfy-api/src/modules/shifts/index.js
  - apps/dgfy-api/src/modules/shifts/README.md
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
  critical: 3
  warning: 5
  info: 3
  total: 11
status: issues_found
---

# Phase 08: Code Review Report

**Reviewed:** 2026-07-13T00:00:00Z
**Depth:** standard
**Files Reviewed:** 68
**Status:** issues_found

## Summary

This is a full re-review of all 68 files currently in scope for Phase 8 (Commerce Foundation), performed after the 08-10 gap-closure plan landed the fail-open compliance-authorization fix in `policyEngine.js` (5 evidence-signal defaults changed from `!== false` to `=== true`). That fix was independently re-verified here: `evaluateComplianceChecklist()` now derives `fiscalAccumulatorStreamReady`, `auditLogAppendOnlyEnforced`, `paymentHandoffPolicyReady`, `submissionArtifactsReady`, `encryptionPolicyPrerequisitesReady`, `rmoFilingReadinessReady`, and `fiscalTerminalRegistrationReady` all via strict `=== true` checks, and `complianceChecklistGating.test.js` / `complianceGate.test.js` both pin an empty-evidence bundle to `REQUIRES_SETUP`, not `ALLOW`. The fail-open bug from the prior review cycle is closed.

This pass, however, surfaced three new BLOCKER-level correctness bugs that were not previously flagged, all in the same family: **read-then-conditional-write races inside a `sequelize.transaction()` block that omit a row lock**, undermining invariants the code's own comments and README files explicitly claim to guarantee. Two are in the concurrency-sensitive booking/shift write paths (`bookingRepository.cancelBooking`, `shiftRepository.closeShift`); the third is a compliance-review gap where marking evidence `rejected`/`revoked` has no effect on the actual authorization decision, because the policy engine never consults `verification_status` and there is no usecase path to demote `compliance_mode_state` outside the `verified` outcome. Several further WARNING-level gaps in defense-in-depth, error-mapping consistency, and input-validation consistency across the products/shifts/booking modules are also documented below.

## Critical Issues

### CR-01: Revoking/rejecting compliance evidence does not revoke Fiscal-capable authorization

**File:** `apps/dgfy-api/src/modules/compliance/usecases/complianceUseCases.js:274-329` (`buildReviewComplianceStateUseCase`), `apps/dgfy-api/src/modules/compliance/usecases/complianceGate.js:121-141` (tenant construction passed into the policy engine), `apps/dgfy-api/src/modules/compliance/policy/policyEngine.js:747-1066` (`evaluateComplianceDecision`)

**Issue:** `buildReviewComplianceStateUseCase` only writes `newState` onto `compliance_mode_state.state` when `verificationStatus === 'verified'` (line 292: `if (verificationStatus === COMPLIANCE_VERIFICATION_STATUS.VERIFIED && !VALID_MODE_STATES.has(newState))`, then line 308-310: `finalRow = verificationStatus === VERIFIED ? await repository.upsertState(...) : verified`). For `rejected`/`revoked` outcomes, only the verification metadata (`verification_status`/`verified_by_actor_type`/`verified_at`) is patched — `state` is left completely untouched.

Meanwhile, `evaluateComplianceDecision()` (the sole authority `assertComplianceGate` calls, per `complianceGate.js`'s own header comment: "This is the ONLY place a gated usecase in this codebase should call the policy engine") branches exclusively on `tenant.compliance_mode_state` (i.e. `state`), never on `verification_status`. `complianceGate.js`'s `tenant` object (lines 121-130) doesn't even forward `verification_status` into the decision context.

Net effect: a business that reached `compliant_active` and is later reviewed and marked `revoked` (e.g. because a submitted BIR accreditation was found to be forged, or NPC/BSP controls were found broken) keeps operating exactly as before — `evaluateComplianceDecision` still returns `ALLOW` for Fiscal-context POS operations, because `state` is still `compliant_active` and the checklist evidence flags (independent of `verification_status`) are unaffected by the review outcome. There is no usecase call anywhere in this module that can demote `state` in response to a `rejected`/`revoked` review; only a fresh `verified` review (with an explicit `newState`) can change it.

**Fix:** When `verificationStatus` is `rejected` or `revoked`, the review usecase should also transition `state` to a safe fallback (e.g. `non_compliant_active` or `compliant_pending`, per whatever the intended compliance state machine transition is) rather than leaving it untouched — or, at minimum, `evaluateComplianceDecision` must treat a non-`verified` `verification_status` as invalidating `compliant_active` for gating purposes:
```js
// complianceUseCases.js
const finalRow = verificationStatus === COMPLIANCE_VERIFICATION_STATUS.VERIFIED
    ? await repository.upsertState(businessId, branchId, { state: newState })
    : await repository.upsertState(businessId, branchId, { state: COMPLIANCE_MODE_STATE.NON_COMPLIANT_ACTIVE });
```

### CR-02: `bookingRepository.cancelBooking()` is race-prone — concurrent cancels can double-release booking capacity

**File:** `apps/dgfy-api/src/modules/booking/repositories/bookingRepository.js:266-295`

**Issue:** `cancelBooking()` reads the booking row with a plain `Booking.findByPk(Number(id), { transaction })` (no `lock` option), checks `record.status === 'cancelled'` to guard against double-release, then issues the `slots_remaining + 1` update and the status write. Under MySQL's default `REPEATABLE READ` isolation, two concurrent `cancelBooking(businessId, id)` calls for the *same* booking can each start their transaction, each read `status: 'booked'` (neither has committed yet), and each pass the "not already cancelled" guard — resulting in `BookingCapacity.slots_remaining` being incremented twice for a single logical cancellation. This directly contradicts the file's own header comment ("mirror `+1` inside the SAME transaction as the booking's status write... D-08") and the module README's explicit prohibition ("Capacity is never a read-then-write check ... never double-releases the slot"): that guarantee is enforced on the *create* path via a guarded atomic `UPDATE ... WHERE slots_remaining >= 1` (Pattern D), but the *cancel* path reintroduces exactly the read-then-write race Pattern D was designed to avoid, one level up (on the booking's own status column instead of the capacity counter).

Compare with `apps/dgfy-api/src/modules/compliance/repositories/complianceModeStateRepository.js:276-280`, which uses `lock: transaction.LOCK.UPDATE` for the equivalent read-then-conditional-write shape — proving the pattern is known elsewhere in this codebase but wasn't applied here.

**Fix:** Either add a row lock to the guard read, or replace the read-then-write with a guarded atomic UPDATE (consistent with the create-side pattern):
```js
const record = await Booking.findByPk(Number(id), { transaction, lock: transaction.LOCK.UPDATE });
// ...or, preferred (matches Pattern D):
const [affectedRows] = await Booking.update(
    { status: 'cancelled', cancelled_at: new Date() },
    { where: { id: Number(id), status: 'booked' }, transaction }
);
if (affectedRows !== 1) throw new BookingAlreadyCancelledError(...);
```

### CR-03: `shiftRepository.closeShift()` has the same missing-lock race — concurrent closes can double-write the ledger and lose reconciliation data

**File:** `apps/dgfy-api/src/modules/shifts/repositories/shiftRepository.js:251-293`

**Issue:** `closeShift()` reads the shift with `Shift.findOne({ where: {...}, transaction })` (no `lock` option), checks `shift.status !== 'open'`, then writes the shift update and a `'close'` `cash_drawer_events` row. As with CR-02, two concurrent close requests for the same `shiftId` (e.g. a retried network request, or a double-submit from the POS UI) can both observe `status: 'open'` before either commits, both pass the guard, and both write — producing:
1. Two `'close'` rows in the append-only `cash_drawer_events` ledger for a single shift close (the ledger is documented as recording exactly one `close` event per shift close), and
2. A lost-update race on `closing_cash_amount`/`expected_cash_amount`/`cash_variance_amount` — whichever transaction commits last silently overwrites the other's reconciliation numbers with no error surfaced to either caller.

This undermines SFT-02/SFT-03's core guarantee (accurate, auditable cash reconciliation) under exactly the kind of double-submit that is common in POS UIs.

**Fix:** Add a row lock to the guard read (mirrors `complianceModeStateRepository.recordVerification`'s already-established pattern in this same phase), or use a guarded atomic UPDATE keyed on `status = 'open'`:
```js
const shift = await Shift.findOne({
    where: { id: Number(shiftId), business_id: businessId },
    transaction,
    lock: transaction.LOCK.UPDATE
});
```

## Warnings

### WR-01: Inconsistent defense-in-depth — several repositories omit an explicit `business_id` predicate on primary-key lookups

**File:** `apps/dgfy-api/src/modules/products/repositories/productRepository.js:131-137,152-177`, `apps/dgfy-api/src/modules/products/repositories/productFolderRepository.js:108-114,142-157`, `apps/dgfy-api/src/modules/booking/repositories/bookingRepository.js:231-237,266-295`

**Issue:** `ProductRepository.findById`/`update`, `ProductFolderRepository.findById`/`update`, and `BookingRepository.findById`/`cancelBooking` all resolve a row via a bare `Model.findByPk(Number(id))`, relying entirely on `TenantConnector`'s per-business database routing for isolation. This is inconsistent with `ShiftRepository.findById`/`closeShift` and `InventoryMovementRepository.findOne`/`recordMovementWithStockSync` (via the `Product.update(..., { where: { id, business_id, ... } })` guard), which all explicitly filter by `business_id` in the query in addition to tenant-DB routing. If `TenantConnector`/the business-database registry ever mis-resolves two businesses to the same database (e.g. a future provisioning bug), the repositories without the extra `business_id` predicate would silently cross business boundaries; the ones with it would fail safely.

**Fix:** Add `business_id: businessId` to the `where` clause (or an equivalent existence check) on every tenant-scoped primary-key lookup, for defense-in-depth consistency with the rest of this phase's own repositories.

### WR-02: `createProductFolder`'s uniqueness check is a TOCTOU race with no error mapping for the DB-level rejection

**File:** `apps/dgfy-api/src/modules/products/usecases/productFolderUseCases.js:102-136`, `apps/dgfy-api/src/modules/products/repositories/productFolderRepository.js:93-106`

**Issue:** `buildCreateProductFolderUseCase` calls `repository.findByName(businessId, name)` and only proceeds to `repository.create(...)` if no existing folder is found (lines 121-127). Two concurrent creates with the same name can both pass the `findByName` check before either insert commits; the DB unique index (`unique_product_folders_business_name`) will correctly reject the race loser, but neither `productFolderUseCases.js` nor `productFolderRepository.js` catches/duck-types that `SequelizeUniqueConstraintError` anywhere — unlike every other create-under-uniqueness path built in this same phase (`shiftRepository`'s `DuplicateOpenShiftError` handling, and `complianceModeStateRepository`'s `DuplicateComplianceModeStateError`). The race loser here gets an unhandled exception instead of the intended, user-facing 409 CONFLICT.

**Fix:** Wrap `repository.create()` in a try/catch that duck-types the unique-constraint violation (mirroring `isUniqueConstraintViolation()` in `shiftRepository.js`/`complianceModeStateRepository.js`) and maps it to the existing `conflictError('A product folder with this name already exists.')`.

### WR-03: `openShift` never validates that `cashierAccountId` corresponds to the requester or an actual staff account of this business

**File:** `apps/dgfy-api/src/modules/shifts/usecases/shiftUseCases.js:160-208`

**Issue:** `buildOpenShiftUseCase` only checks `terminalId`/`cashierAccountId`/`openingFloatAmount` for presence and non-negativity (lines 174-181) and requires the *requester* to be an active member (staff-or-owner) of the business — but never checks that the caller-supplied `cashierAccountId` is (a) an existing `staff_accounts.id` for this business, or (b) the requester's own staff identity. Any staff member or owner can open a shift attributing full cash-drawer accountability (and the one-open-shift invariant D-12/D-13 is keyed on this value) to an arbitrary integer, including another staff member's id, without that staff member's knowledge or consent. The FK on `shifts.cashier_account_id` will reject a genuinely nonexistent id, but any *valid* `staff_accounts.id` for that tenant DB is accepted regardless of whose shift is actually being opened.

**Fix:** Either require `cashierAccountId` to resolve to the requester's own staff-account mapping (via `account_staff_assignments`), or explicitly document/gate this as an owner-only "open a shift on behalf of staff" capability distinct from "staff opens their own shift."

### WR-04: `folder_id` is never validated against an existing product folder before write

**File:** `apps/dgfy-api/src/modules/products/usecases/productUseCases.js:119-166,198-263`, `apps/dgfy-api/src/modules/products/repositories/productRepository.js:114-129,152-177`

**Issue:** Both `buildCreateProductUseCase` and `buildUpdateProductUseCase` accept `folder_id` and pass it straight through to `repository.create`/`repository.update` with no existence check. `products.folder_id` has a real FK into `product_folders.id` (`onDelete: 'SET NULL'`), so an invalid `folder_id` will throw a raw Sequelize foreign-key-constraint error. Neither usecase's catch block (which only special-cases `isTenantDatabaseUnavailableError`) maps this to a clean validation error — it falls through to `throw tenantError`, surfacing as an unhandled 500 rather than the `VALIDATION_FAILED`/`RESOURCE_NOT_FOUND` shape every other invalid-reference case in this phase returns.

**Fix:** Validate `folder_id` (when non-null) against `folderRepository.findById(businessId, folder_id)` before writing, returning a `validationError`/`notFoundError` on a miss.

### WR-05: Inconsistent numeric-input coercion between `productUseCases.js` and the rest of the phase

**File:** `apps/dgfy-api/src/modules/products/usecases/productUseCases.js:78,272-312`

**Issue:** `isPositiveInteger` (used by `buildSetProductBookableUseCase` for `slot_duration_minutes`/`concurrent_capacity`) is `Number.isInteger(value) && value > 0` — a strict type check with no coercion. Every equivalent numeric validator elsewhere in this same phase (`inventoryMovementUseCases.js`'s `isPositiveNumber`/`isFiniteNonZeroNumber`, `shiftUseCases.js`'s `isNonNegativeNumber`) explicitly coerces with `Number(value)` first. A numeric-string payload (e.g. `"30"`, which some HTTP clients/form encodings will send even for a JSON body) is silently rejected here as `VALIDATION_FAILED`, while the equivalent input shape is accepted everywhere else in Phase 8.

**Fix:** Coerce before checking, consistent with the rest of the module: `Number.isInteger(Number(value)) && Number(value) > 0`.

## Info

### IN-01: `documentary_readiness` is computed and returned twice in the same checklist object

**File:** `apps/dgfy-api/src/modules/compliance/policy/policyEngine.js:650-656,672-678`

**Issue:** `evaluateComplianceChecklist()`'s return value includes a top-level `documentary_readiness` field and, immediately below it, an identical (byte-for-byte) `evidence.submission_artifacts` object computed from the same source values. If one copy is ever edited without the other (e.g. a future field added to only one), the two would silently drift out of sync for consumers reading either shape.

**Fix:** Compute the shared shape once and reference it from both keys, or drop the top-level `documentary_readiness` field in favor of the one nested under `evidence`.

### IN-02: `buildPreflightResult` is exported but has no caller in this phase

**File:** `apps/dgfy-api/src/modules/compliance/policy/policyEngine.js:1068-1098`, `apps/dgfy-api/src/modules/compliance/index.js:30`

**Issue:** `buildPreflightResult` is implemented and re-exported from `modules/compliance/index.js`, but no controller/usecase/route in this phase invokes it. It appears to be scaffolding for a Phase 9 call site. This is fine as intentional forward-compat, but there is no tracking comment/TODO tying it to a specific future phase task the way `inventoryEffectContracts.js`'s reserved functions are (D-06 references), so it currently reads as dead code to a reviewer without that context.

**Fix:** Add a short comment cross-referencing the Phase 9 plan/task that will call this, mirroring `inventoryEffectContracts.js`'s convention.

### IN-03: No validation that a booking's `slotStart` is not in the past

**File:** `apps/dgfy-api/src/modules/booking/usecases/bookingUseCases.js:147-153`

**Issue:** `buildCreateBookingUseCase` validates that `slotStart` parses to a valid `Date` but never checks it is not already in the past. A booking can be created (and will consume capacity) for a slot that has already elapsed. This may be intentional (e.g. staff backfilling a walk-in), but is worth an explicit decision if not.

**Fix:** If backdated bookings are not an intended use case, reject `slotStart < now` with a `validationError`.

---

_Reviewed: 2026-07-13T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
