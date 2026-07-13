---
phase: 08-commerce-foundation-product-catalog-booking-shift-cash-drawe
reviewed: 2026-07-13T00:22:48Z
depth: standard
files_reviewed: 71
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
  - apps/dgfy-api/tests/unit/modules/booking/bookingRepository.test.js
  - apps/dgfy-api/tests/unit/modules/booking/bookingUseCases.test.js
  - apps/dgfy-api/tests/unit/modules/compliance/complianceChecklistGating.test.js
  - apps/dgfy-api/tests/unit/modules/compliance/complianceGate.test.js
  - apps/dgfy-api/tests/unit/modules/compliance/complianceModeStateRepository.test.js
  - apps/dgfy-api/tests/unit/modules/compliance/complianceReviewDemotion.test.js
  - apps/dgfy-api/tests/unit/modules/inventory/inventoryMovementUseCases.test.js
  - apps/dgfy-api/tests/unit/modules/products/productUseCases.test.js
  - apps/dgfy-api/tests/unit/modules/shifts/shiftRepository.test.js
  - apps/dgfy-api/tests/unit/modules/shifts/shiftUseCases.test.js
  - apps/dgfy-migration-runner/src/migrations/schema/20260712100000-create-commerce-foundation.cjs
  - apps/dgfy-migration-runner/src/migrations/schema/20260712140000-harden-compliance-mode-state-uniqueness.cjs
  - apps/dgfy-migration-runner/src/schemaContracts/dgfyBusinessContract.js
  - apps/dgfy-migration-runner/tests/dgfyBusinessSchema.test.js
findings:
  critical: 3
  warning: 9
  info: 4
  total: 16
status: issues_found
---

# Phase 08: Code Review Report

**Reviewed:** 2026-07-13T00:22:48Z
**Depth:** standard
**Files Reviewed:** 71
**Status:** issues_found

## Summary

This review supersedes the prior 08-REVIEW.md pass and covers all 12 plans of Phase 08 (product catalog, product folders, inventory ledger, compliance-mode state, shifts/cash-drawer, booking) plus the commerce-foundation migration and schema contract.

**Prior findings independently re-verified as fixed, not re-reported:**
- Prior CR-02/CR-03 (missing row lock on `bookingRepository.cancelBooking()` / `shiftRepository.closeShift()` guard reads, allowing concurrent double-release/double-write races): confirmed fixed — both now use `lock: transaction.LOCK.UPDATE`, and `bookingRepository.test.js`/`shiftRepository.test.js` pin this behavior with dedicated regression tests.
- Prior CR-01 (reviewing evidence as `rejected`/`revoked` left `compliance_mode_state.state` untouched, so `evaluateComplianceDecision()` kept allowing Fiscal operations): confirmed fixed — `buildReviewComplianceStateUseCase` now unconditionally demotes `state` to `non_compliant_active` for `rejected`/`revoked` outcomes, and `complianceReviewDemotion.test.js` pins this. However, the fix itself introduces a new, narrower atomicity gap — see CR-03 below.

The Clean Architecture layering (routes -> controllers -> usecases -> repositories -> models) is applied consistently, and the atomic booking-capacity guard (BOK-02), the DB-generated one-open-shift key (D-12), and the append-only ledger triggers are all well-implemented and well-tested. This pass surfaced three new BLOCKER-level defects (a systemic error-masking pattern shared by every tenant repository, an unvalidated financial-integrity input on shift close, and a non-atomic compliance-state demotion introduced by the prior gap-closure) plus nine WARNING-level robustness/consistency gaps and four Info items.

## Critical Issues

### CR-01: Every tenant repository's `withModel`/`withModels` helper silently discards and re-labels ALL non-whitelisted errors as a misleading 503

**File:** `apps/dgfy-api/src/modules/products/repositories/productRepository.js:96-108` (identical pattern repeated in `productFolderRepository.js:74-86`, `bookingRepository.js:132-146`, `inventoryMovementRepository.js:136-148`, `shifts/repositories/cashDrawerEventRepository.js:103-115`, `shifts/repositories/shiftRepository.js:164-183`, `compliance/repositories/complianceModeStateRepository.js:146-164`)

**Issue:** Every repository's `withModel()`/`withModels()` wraps the actual query in a try/catch that re-throws **any** error that is not already one of that repository's own named error classes as `TenantDatabaseUnavailableError('unreachable', ...)`:

```js
async withModel(businessId, fn) {
    const databaseName = await this.resolveDatabaseName(businessId);
    try {
        const model = this.resolveModel(databaseName);
        return await fn(model);
    } catch (error) {
        if (error instanceof TenantDatabaseUnavailableError) throw error;
        throw new TenantDatabaseUnavailableError(
            'unreachable',
            'Unable to reach the tenant database for this business.'
        );
    }
}
```

This means a genuine application-level failure inside `fn` — e.g. a `SequelizeForeignKeyConstraintError` from an invalid `folder_id` on `PATCH /products/:id` (see WR-06 below), a `SequelizeUniqueConstraintError` race-loser on `POST /products/folders` that no caller here duck-types (see WR-05 below), or even a plain `TypeError` from a programmer bug — is silently swallowed (the original error and its stack trace are discarded, **never logged anywhere in this chain**) and re-surfaced through the usecase's `mapTenantDatabaseError()` as a `503 SERVICE_UNAVAILABLE` ("Unable to reach the tenant database for this business"). This is both incorrect (a client is told to retry a request that will never succeed, e.g. a permanently-invalid foreign key or a duplicate name) and a serious observability regression (a real production bug — a data-integrity violation, a bad migration, a code defect — becomes invisible in logs and is reported to the caller as an unrelated infrastructure outage).

**Fix:** Only remap errors that are actually connectivity-related (e.g. Sequelize `ConnectionError`/`ConnectionRefusedError`/`HostNotFoundError`). Rethrow everything else unchanged (or via a distinct, correctly-labeled wrapper), and log the original error before rethrowing/remapping:
```js
} catch (error) {
    if (error instanceof TenantDatabaseUnavailableError) throw error;
    if (isConnectivityError(error)) {
        throw new TenantDatabaseUnavailableError('unreachable', ...);
    }
    logger.error('Unexpected error in tenant repository call', { error, businessId });
    throw error;
}
```

### CR-02: Shift-close reconciliation inputs (`salesCash`/`refundsCash`/`payIns`/`payOuts`) are accepted directly from the client with no validation, defeating the cash-variance fraud/shortage control

**File:** `apps/dgfy-api/src/modules/shifts/controllers/shiftController.js:34-47`, `apps/dgfy-api/src/modules/shifts/usecases/shiftUseCases.js:219-268`

**Issue:** `shiftController.closeShift()` reads `sales_cash`/`refunds_cash`/`pay_ins`/`pay_outs` straight from `req.body` and passes them to `useCases.closeShift()`. `buildCloseShiftUseCase()` validates only `closingCashAmount` (`isNonNegativeNumber`); the four reconciliation inputs are coerced with `Number(x) || 0` and fed unvalidated into `computeExpectedCash()`:
```
expected_cash = opening_float_amount + salesCash - refundsCash + payIns - payOuts
cash_variance_amount = closingCashAmount - expected_cash_amount
```
The module README and code comments describe these fields as "default to 0 this phase" / "real values arrive from Phase 9's checkout completion," but the controller already wires them through as trusted client input today, with no bounds/sign checking. A cashier (or any authenticated staff/owner caller) can supply an arbitrary `sales_cash`/`pay_outs` value engineered to force `cash_variance_amount` to `0` regardless of the actual physical cash count, completely defeating the till-shortage/fraud-detection purpose SFT-02 exists for. There is no server-side source of truth for these values yet (Phase 9 hasn't wired real sales data), so accepting them from the client is strictly worse than defaulting them to `0` server-side.

**Fix:** Until Phase 9 wires an authoritative sales/refund/pay-event source, do not accept these four fields from the request body at all — hardcode them to `0` in the usecase/controller so `expected_cash_amount` is always `opening_float_amount`, matching the documented Phase 8 intent:
```js
// controller: do not forward client-supplied reconciliation inputs this phase
const result = await useCases.closeShift({
    businessId: body.business_id,
    requestingAccountId: req.account.id,
    shiftId: req.params.id,
    closingCashAmount: body.closing_cash_amount
});
```

### CR-03: `reviewComplianceState`'s FSC-01 state demotion (the prior gap-closure fix) is split across two unguarded, non-transactional repository calls — a crash or race between them reintroduces the stale, fail-open `compliant_active` row the fix was meant to eliminate

**File:** `apps/dgfy-api/src/modules/compliance/usecases/complianceUseCases.js:307-320`

**Issue:** For a `rejected`/`revoked` review outcome, the usecase performs two sequential, independent repository round-trips:
```js
await repository.recordVerification(businessId, branchId, {
    verification_status: verificationStatus,
    verified_by_actor_type: verifierActorType,
    verified_at: new Date()
});

const finalRow = verificationStatus === COMPLIANCE_VERIFICATION_STATUS.VERIFIED
    ? await repository.upsertState(businessId, branchId, { state: newState })
    : await repository.upsertState(businessId, branchId, { state: COMPLIANCE_MODE_STATE.NON_COMPLIANT_ACTIVE });
```
Each of `recordVerification()`/`upsertState()` is internally transactional, but the **pair** is not — there is no shared transaction spanning both calls. If the process crashes, the request times out, or a concurrent `getComplianceState`/`assertComplianceGate` call reads the row between these two awaits, the `compliance_mode_state` row can be observed (or persist, on partial failure) with `verification_status: 'revoked'`/`'rejected'` while `state` is still `compliant_active` — exactly the fail-open bypass the prior review's CR-01 (verified fixed by `complianceReviewDemotion.test.js`) was built to close, because `evaluateComplianceDecision()` branches exclusively on the `state` column. A network blip or pod restart between the two awaits silently reintroduces the vulnerability this same phase's own gap-closure was meant to eliminate.

**Fix:** Wrap both writes in a single `sequelize.transaction()` inside the repository (mirroring `shiftRepository.js`'s pattern of sharing one transaction across a status write + its dependent event write), e.g. add a repository method like `recordVerificationAndState(businessId, branchId, { verification, state })` that updates both fields against the same locked row in one transaction, and have the usecase call that single method instead of two independent ones.

## Warnings

### WR-01: Booking cancel path never checks for `status === 'fulfilled'` — only guards against `'cancelled'`, leaving a latent double-release bug once Phase 9 wires fulfillment

**File:** `apps/dgfy-api/src/modules/booking/usecases/bookingUseCases.js:239-241`, `apps/dgfy-api/src/modules/booking/repositories/bookingRepository.js:281-284`, `apps/dgfy-api/src/modules/booking/entities/bookingEntity.js:50-52`

**Issue:** `BookingEntity.isCancellable()` correctly defines cancellability as `this.status === 'booked'` (excluding both `cancelled` and `fulfilled`), but neither `bookingUseCases.js` nor `bookingRepository.js` ever imports or calls it. Both instead hand-roll a narrower check (`if (existing.status === 'cancelled') { ... }` in the usecase; `if (record.status === 'cancelled') { throw new BookingAlreadyCancelledError(...); }` in the repository's transactional guard). Neither path rejects a `status === 'fulfilled'` booking. Today this is unreachable (no code in this phase ever sets `status` to `'fulfilled'`), but once Phase 9 wires booking fulfillment via the reserved `availment_id` link, this gap will let a fulfilled booking be "cancelled," incorrectly incrementing `booking_capacity.slots_remaining` for a slot that has already been consumed, and flipping an already-fulfilled booking's audit record to `cancelled`.

**Fix:** Use `BookingEntity.isCancellable()` (or replicate its full condition, `status === 'booked'`) in both the usecase pre-check and the repository's transactional guard, instead of only excluding `'cancelled'`.

### WR-02: `ShiftRepository.recordNoSalePop()` reads shift status without a row lock or shared transaction, unlike `openShift()`/`closeShift()`

**File:** `apps/dgfy-api/src/modules/shifts/repositories/shiftRepository.js:309-326`

**Issue:** `recordNoSalePop()` performs a plain `Shift.findOne({ where: { id, business_id } })` (no `lock`, no `transaction`) to check `shift.status !== 'open'`, then makes a **separate** call to `cashDrawerEventRepository.create()`. `closeShift()`, by contrast, uses `lock: transaction.LOCK.UPDATE` specifically to prevent exactly this class of race. Because `recordNoSalePop()`'s check-then-act is not serialized against a concurrent `closeShift()`, a shift can be closed by another request in the gap between the status check and the event write, resulting in a `no_sale_pop` cash-drawer event recorded against an already-closed shift.

**Fix:** Wrap the read + event write in a `sequelize.transaction()` with `lock: transaction.LOCK.UPDATE` on the status check, mirroring `closeShift()`'s pattern, and pass that transaction through to `cashDrawerEventRepository.create()` (which already supports an optional `{ transaction }`).

### WR-03: Inconsistent request key casing across Phase 8 controllers (`businessId` vs `business_id`), including within the same controller file

**File:** `apps/dgfy-api/src/modules/products/controllers/productController.js:24,39,57,69`, `productFolderController.js:15,28`, `apps/dgfy-api/src/modules/compliance/controllers/complianceController.js:18,27,31` vs `apps/dgfy-api/src/modules/booking/controllers/bookingController.js:23,39,50`, `apps/dgfy-api/src/modules/inventory/controllers/inventoryMovementController.js:21,45`, `apps/dgfy-api/src/modules/shifts/controllers/shiftController.js:23,37,53,65`

**Issue:** The products and compliance controllers read `businessId`/`branchId`/`complianceProfile`/`activePolicyPackVersion` (camelCase) from `req.body`/`req.query`, while the booking, inventory, and shifts controllers read `business_id`/`branch_id`/`product_id`/etc. (snake_case) for the identical concept. `productController.js` is internally inconsistent too: `businessId` is read camelCase, but the same controller's `updateProduct()`/`setBookable()` read `inventory_mode`/`folder_id`/`base_price`/`is_active`/`slot_duration_minutes`/`concurrent_capacity` in snake_case. A client integrating against one Phase 8 endpoint using its observed casing convention will silently fail validation (`"businessId is required"`) when calling a sibling endpoint expecting the other casing — every field is read via plain property access with no fallback, so a wrong-cased field is simply `undefined`.

**Fix:** Standardize on one casing convention (this codebase's DB/model layer is snake_case throughout, so snake_case for wire-format request bodies would be the more consistent choice) and align `productController.js`/`productFolderController.js`/`complianceController.js` to match `bookingController.js`/`inventoryMovementController.js`/`shiftController.js`.

### WR-04: Inconsistent tenant-scoping filters across repository lookups by primary key

**File:** `apps/dgfy-api/src/modules/products/repositories/productRepository.js:131-137,152-177`, `apps/dgfy-api/src/modules/products/repositories/productFolderRepository.js:108-114,142-157`, `apps/dgfy-api/src/modules/booking/repositories/bookingRepository.js:231-237,270-302` vs `apps/dgfy-api/src/modules/inventory/repositories/inventoryMovementRepository.js:227-233`, `apps/dgfy-api/src/modules/shifts/repositories/cashDrawerEventRepository.js:164-170`, `apps/dgfy-api/src/modules/shifts/repositories/shiftRepository.js:332-338`

**Issue:** `ProductRepository.findById()`/`.update()`, `ProductFolderRepository.findById()`/`.update()`, and `BookingRepository.findById()`/`.cancelBooking()` look records up via `findByPk(Number(id))` alone, relying entirely on the tenant-database-per-business physical isolation for scoping. `InventoryMovementRepository.findOne()`, `CashDrawerEventRepository.findOne()`, and `ShiftRepository.findById()`/`.closeShift()`/`.recordNoSalePop()` all additionally filter `WHERE business_id = :businessId` even though they resolve the same tenant database first. This is an inconsistent defense-in-depth posture: every table in this schema carries a `business_id` column specifically documented as the scoping key, yet roughly half of Phase 8's repositories don't use it in their point-lookup queries. If the "one tenant database per business" invariant is ever relaxed (e.g. a future multi-business-per-database consolidation), the un-scoped repositories would have no protection against one business referencing another business's row by numeric ID within the same database.

**Fix:** Add `business_id: businessId` to the `WHERE` clause of every point-lookup (`findByPk` → `findOne({ where: { id, business_id } })`) in `productRepository.js`, `productFolderRepository.js`, and `bookingRepository.js`, matching the pattern already used in the inventory/shifts repositories.

### WR-05: `createProductFolder`'s uniqueness check is a TOCTOU race with no dedicated conflict mapping for the DB-level rejection

**File:** `apps/dgfy-api/src/modules/products/usecases/productFolderUseCases.js:102-136`, `apps/dgfy-api/src/modules/products/repositories/productFolderRepository.js:93-106`

**Issue:** `buildCreateProductFolderUseCase` calls `repository.findByName(businessId, name)` and only proceeds to `repository.create(...)` if no existing folder is found. Two concurrent creates with the same name can both pass the `findByName` check before either insert commits; the DB unique index (`unique_product_folders_business_name`) will correctly reject the race loser, but neither `productFolderUseCases.js` nor `productFolderRepository.js` catches/duck-types that `SequelizeUniqueConstraintError` anywhere — unlike every other create-under-uniqueness path built in this same phase (`shiftRepository`'s `DuplicateOpenShiftError`, `complianceModeStateRepository`'s `DuplicateComplianceModeStateError`). Per CR-01 above, the race loser's error is instead silently remapped to a misleading `503 SERVICE_UNAVAILABLE`, not the `409 CONFLICT` the use case's own happy-path check clearly intends.

**Fix:** Wrap `repository.create()` in a try/catch that duck-types the unique-constraint violation (mirroring `isUniqueConstraintViolation()` in `shiftRepository.js`/`complianceModeStateRepository.js`) and maps it to the existing `conflictError('A product folder with this name already exists.')`.

### WR-06: `folder_id` is never validated against an existing product folder before write

**File:** `apps/dgfy-api/src/modules/products/usecases/productUseCases.js:119-166,198-263`, `apps/dgfy-api/src/modules/products/repositories/productRepository.js:114-129,152-177`

**Issue:** Both `buildCreateProductUseCase` and `buildUpdateProductUseCase` accept `folder_id` and pass it straight through to `repository.create`/`repository.update` with no existence check. `products.folder_id` has a real FK into `product_folders.id`, so an invalid `folder_id` throws a raw Sequelize foreign-key-constraint error. Neither usecase's catch block (which only special-cases `isTenantDatabaseUnavailableError`) maps this to a clean validation error — per CR-01, it is instead silently remapped to a misleading `503 SERVICE_UNAVAILABLE` rather than the `VALIDATION_FAILED`/`RESOURCE_NOT_FOUND` shape every other invalid-reference case in this phase returns.

**Fix:** Validate `folder_id` (when non-null) against `folderRepository.findById(businessId, folder_id)` before writing, returning a `validationError`/`notFoundError` on a miss.

### WR-07: `openShift` never validates that `cashierAccountId` corresponds to the requester or an actual staff account of this business

**File:** `apps/dgfy-api/src/modules/shifts/usecases/shiftUseCases.js:160-208`

**Issue:** `buildOpenShiftUseCase` only checks `terminalId`/`cashierAccountId`/`openingFloatAmount` for presence and non-negativity, and requires the *requester* to be an active member (staff-or-owner) of the business — but never checks that the caller-supplied `cashierAccountId` is (a) an existing `staff_accounts.id` for this business, or (b) the requester's own staff identity. Any staff member or owner can open a shift attributing full cash-drawer accountability (and the one-open-shift invariant D-12/D-13 is keyed on this value) to an arbitrary integer, including another staff member's id, without that staff member's knowledge or consent. The FK on `shifts.cashier_account_id` will reject a genuinely nonexistent id, but any *valid* `staff_accounts.id` for that tenant DB is accepted regardless of whose shift is actually being opened.

**Fix:** Either require `cashierAccountId` to resolve to the requester's own staff-account mapping (via `account_staff_assignments`), or explicitly document/gate this as an owner-only "open a shift on behalf of staff" capability distinct from "staff opens their own shift."

### WR-08: Inconsistent numeric-input coercion in `productUseCases.js` vs. the rest of the phase

**File:** `apps/dgfy-api/src/modules/products/usecases/productUseCases.js:78,272-312`

**Issue:** `isPositiveInteger` (used by `buildSetProductBookableUseCase` for `slot_duration_minutes`/`concurrent_capacity`) is `Number.isInteger(value) && value > 0` — a strict type check with no coercion. Every equivalent numeric validator elsewhere in this same phase (`inventoryMovementUseCases.js`'s `isPositiveNumber`/`isFiniteNonZeroNumber`, `shiftUseCases.js`'s `isNonNegativeNumber`) explicitly coerces with `Number(value)` first. A numeric-string payload (e.g. `"30"`, which some HTTP clients/form encodings will send even for a JSON body) is silently rejected here as `VALIDATION_FAILED`, while the equivalent input shape is accepted everywhere else in Phase 8.

**Fix:** Coerce before checking, consistent with the rest of the module: `Number.isInteger(Number(value)) && Number(value) > 0`.

### WR-09: `submitComplianceEvidence` performs three sequential, unguarded repository round-trips with no shared transaction

**File:** `apps/dgfy-api/src/modules/compliance/usecases/complianceUseCases.js:213-233`

**Issue:** `buildSubmitComplianceEvidenceUseCase()` calls `repository.getForBusinessBranch()`, then `repository.upsertState()`, then `repository.recordVerification()` — three independent calls, each individually safe but with no consistency guarantee across all three. Two concurrent evidence submissions for the same business/branch can interleave (e.g. submission A's `upsertState` landing between submission B's `upsertState` and `recordVerification`), leaving the persisted `compliance_profile` from one request paired with the `verification_status` reset intended for the other. Lower severity than CR-03 because the worst outcome here is a stale/mismatched evidence submission rather than an authorization bypass, but it is the same underlying pattern.

**Fix:** Consider adding a single repository method that performs the upsert + verification-reset in one transaction, or explicitly document the race as a known Phase 8 limitation.

## Info

### IN-01: `documentary_readiness` is computed and returned twice in the same checklist object

**File:** `apps/dgfy-api/src/modules/compliance/policy/policyEngine.js:650-656,672-678`

**Issue:** `evaluateComplianceChecklist()`'s return value includes a top-level `documentary_readiness` field and, immediately below it, an identical (byte-for-byte) `evidence.submission_artifacts` object computed from the same source values. If one copy is ever edited without the other (e.g. a future field added to only one), the two would silently drift out of sync for consumers reading either shape.

**Fix:** Compute the shared shape once and reference it from both keys, or drop the top-level `documentary_readiness` field in favor of the one nested under `evidence`.

### IN-02: `buildPreflightResult` is exported but has no caller in this phase

**File:** `apps/dgfy-api/src/modules/compliance/policy/policyEngine.js:1068-1098`, `apps/dgfy-api/src/modules/compliance/index.js:30`

**Issue:** `buildPreflightResult` is implemented and re-exported from `modules/compliance/index.js`, but no controller/usecase/route in this phase invokes it. This is very likely intentional forward-compat scaffolding for a Phase 9 call site, but unlike `inventoryEffectContracts.js`'s reserved functions (which carry an explicit "D-06, Phase 9 caller" cross-reference), there is no comment here tying it to a specific future task, so it currently reads as dead code to a reviewer without that context.

**Fix:** Add a short comment cross-referencing the Phase 9 plan/task that will call this, mirroring `inventoryEffectContracts.js`'s convention.

### IN-03: No validation that a booking's `slotStart` is not in the past

**File:** `apps/dgfy-api/src/modules/booking/usecases/bookingUseCases.js:147-153`

**Issue:** `buildCreateBookingUseCase` validates that `slotStart` parses to a valid `Date` but never checks it is not already in the past. A booking can be created (and will consume capacity) for a slot that has already elapsed. This may be intentional (e.g. staff backfilling a walk-in), but is worth an explicit decision if not.

**Fix:** If backdated bookings are not an intended use case, reject `slotStart < now` with a `validationError`.

### IN-04: Magic numbers for minutes-to-milliseconds conversion

**File:** `apps/dgfy-api/src/modules/booking/usecases/bookingUseCases.js:178` (`Number(product.slot_duration_minutes) * 60000`), `apps/dgfy-api/src/modules/shifts/entities/shiftEntity.js:65` (`/ 60000`)

**Issue:** The literal `60000` (ms per minute) is duplicated in two files with no shared constant.

**Fix:** Extract a shared `MS_PER_MINUTE = 60000` constant (or a small time-utility helper) to avoid silent drift if one call site is ever changed without the other.

---

_Reviewed: 2026-07-13T00:22:48Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
