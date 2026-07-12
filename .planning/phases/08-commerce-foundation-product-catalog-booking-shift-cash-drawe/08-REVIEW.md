---
phase: 08-commerce-foundation-product-catalog-booking-shift-cash-drawe
reviewed: 2026-07-12T14:23:08Z
depth: standard
files_reviewed: 65
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
  - apps/dgfy-api/tests/unit/modules/compliance/complianceGate.test.js
  - apps/dgfy-api/tests/unit/modules/inventory/inventoryMovementUseCases.test.js
  - apps/dgfy-api/tests/unit/modules/products/productUseCases.test.js
  - apps/dgfy-api/tests/unit/modules/shifts/shiftUseCases.test.js
  - apps/dgfy-migration-runner/src/migrations/schema/20260712100000-create-commerce-foundation.cjs
  - apps/dgfy-migration-runner/src/schemaContracts/dgfyBusinessContract.js
  - apps/dgfy-migration-runner/tests/dgfyBusinessSchema.test.js
findings:
  critical: 2
  warning: 6
  info: 3
  total: 11
status: issues_found
---

# Phase 08: Code Review Report

**Reviewed:** 2026-07-12T14:23:08Z
**Depth:** standard
**Files Reviewed:** 65
**Status:** issues_found

## Summary

This phase adds 8 new Sequelize Tenant models, a 700+ line migration, and 5 Clean-Architecture modules (products, inventory, shifts, compliance, booking). The layering discipline (routes -> controllers -> usecases -> repositories -> models) is followed consistently and the atomic-guarded-UPDATE pattern used for booking capacity (`BookingCapacity.update` with `Op.gte`/`sequelize.literal`) is implemented correctly and is proven under concurrency by both a unit test and a real-MySQL integration test.

However, two BLOCKER-level defects were found:

1. `ComplianceModeStateRepository.upsertState()` uses an unguarded find-then-create/update sequence (a classic TOCTOU race) to maintain what is documented as a one-row-per-business/branch invariant — and for the very common `branch_id IS NULL` case, the DB-level unique index the code relies on as a backstop cannot actually enforce that invariant at all, because MySQL treats every `NULL` in a unique index as distinct. Concurrent evidence submissions can silently create duplicate `compliance_mode_state` rows.
2. `policy/policyEngine.js`'s `compliant_active` POS-operation gate never actually consults most of the evidence-derived checklist signals (`documentary_readiness`, RMO filing, encryption prerequisites, fiscal terminal registration, audit-log append-only enforcement, payment-handoff policy) that `evaluateComplianceChecklist` computes — it only gates on `profile_complete`/`settings_complete`/`artifacts_complete`/`peripherals_complete`. This directly contradicts `complianceGate.js`'s own header comment, which claims the gate "correctly falls through ... rather than the gate silently assuming completeness" for exactly these signals.

Several WARNING-level issues (a fail-open authorization helper reused across 5 use-case modules, a systemic error-swallowing pattern that turns FK/validation errors into misleading 503s, and inconsistent tenant-scoping on a few repository lookups) and a handful of INFO items round out the findings below.

## Critical Issues

### CR-01: Compliance evidence upsert has a TOCTOU race, and the DB unique index cannot back it for `branch_id IS NULL`

**File:** `apps/dgfy-api/src/modules/compliance/repositories/complianceModeStateRepository.js:155-187`
**Also affects:** `apps/dgfy-api/src/models/Tenant/ComplianceModeState.js:94-96`, `apps/dgfy-migration-runner/src/migrations/schema/20260712100000-create-commerce-foundation.cjs:435-438`

**Issue:** `upsertState()` (and, to a lesser extent, `recordVerification()`) is a plain `findOne()` followed by a conditional `create()`/`update()` — not wrapped in a transaction, and not protected by any atomic guarded-write pattern. Two concurrent `submitComplianceEvidence` calls for the same `(business_id, branch_id)` pair can both execute `findOne()` before either `create()` runs, and both will then insert a row.

This is exactly the race class the rest of this phase deliberately avoids elsewhere — `bookingRepository.createBooking()` uses a single guarded `UPDATE ... WHERE slots_remaining >= 1` inside a transaction, and `shiftRepository.openShift()` relies on a DB-enforced unique index plus explicit duck-typed conflict handling (`DuplicateOpenShiftError`). `complianceModeStateRepository.js`'s own header comment claims the `(business_id, branch_id)` unique index (`unique_compliance_mode_state_business_branch`) is the row's invariant, but:

- For the very common `branch_id: null` case (business-wide compliance state, "no branch scope" per the model's own comment), MySQL's InnoDB unique index does **not** treat two `NULL` values in an indexed column as equal — every `NULL` is distinct for uniqueness purposes. So concurrent `create()` calls for the same business with `branch_id = null` will **both succeed**, silently producing two `compliance_mode_state` rows for the same business.
- For a non-null `branch_id`, the second concurrent `create()` would hit the unique index and throw a raw `SequelizeUniqueConstraintError` — but nothing in `upsertState()` duck-types or maps that error (contrast with `shiftRepository.js`'s `isUniqueConstraintViolation()` helper), so it propagates up through `withModel()`'s generic catch and gets relabeled as `TenantDatabaseUnavailableError('unreachable', ...)` — a misleading 503, not a clean 409.

Once duplicate rows exist for a business, `getForBusinessBranch()`/`assertComplianceGate()` (both plain `findOne()`) will non-deterministically return whichever row MySQL returns first, so the FSC-02 compliance gate (used to decide whether fiscal operations are permitted) can flip between different states across requests.

**Fix:** Make the write atomic. Options, in order of preference:
1. Give `compliance_mode_state` a deterministic key that MySQL uniqueness *can* enforce (e.g. use `branch_id: 0` as the "no branch" sentinel instead of `NULL`, matching the pattern already used correctly for `booking_capacity`/`shifts`' composite unique indexes, both of which are all NOT NULL columns), **and**
2. Wrap the read-then-write in a transaction with `SELECT ... FOR UPDATE`, or use `findOrCreate()` (which Sequelize will safely retry on a unique-constraint race, as `bookingRepository.js` already relies on for `booking_capacity`), **and**
3. Duck-type the unique-constraint violation (mirroring `shiftRepository.js`'s `isUniqueConstraintViolation`) and map it to a clean `DomainErrorCode.CONFLICT` (409) rather than letting it fall through to `TenantDatabaseUnavailableError('unreachable')`.

```js
// complianceModeStateRepository.js — sketch
async upsertState(businessId, branchId = null, updates = {}) {
    return this.withModel(businessId, async (ComplianceModeState) => {
        const [record] = await ComplianceModeState.findOrCreate({
            where: { business_id: businessId, branch_id: branchId },
            defaults: {
                business_id: businessId,
                branch_id: branchId,
                state: updates.state || 'non_compliant_active',
                compliance_profile: updates.compliance_profile ?? null,
                active_policy_pack_version: updates.active_policy_pack_version ?? null
            }
        });
        // ... then patch `record` with any remaining fields from `updates`
    });
}
```
(This still requires fixing the `branch_id IS NULL` uniqueness gap at the schema level — a sentinel value or a MySQL 8 functional unique index on `COALESCE(branch_id, 0)` — for `findOrCreate`'s retry-on-conflict behavior to actually have something to conflict against.)

### CR-02: `compliant_active` POS-operation gate ignores most of its own computed checklist signals — contradicts the gate's documented guarantee

**File:** `apps/dgfy-api/src/modules/compliance/policy/policyEngine.js:383-399, 945-1012`
**Also affects:** `apps/dgfy-api/src/modules/compliance/usecases/complianceGate.js:24-29`

**Issue:** `evaluateComplianceChecklist()` computes seven distinct evidence-derived readiness signals (`fiscalAccumulatorStreamReady`, `auditLogAppendOnlyEnforced`, `paymentHandoffPolicyReady`, `encryptionPolicyPrerequisitesReady`, `submissionArtifactsReady`/documentary readiness, `rmoFilingReadinessReady`, `fiscalTerminalRegistrationReady`) and folds them into `activation_blockers` and `ready_for_compliant_activation` (lines 526-707). But `evaluateComplianceDecision()`'s `compliant_active` branch for POS/receipt operations (lines 947-1012) only checks four of the checklist's fields:

```js
if (!checklist.profile_complete || !checklist.settings_complete) { ... REQUIRES_SETUP ... }
if (!checklist.artifacts_complete) { ... REQUIRES_SETUP ... }
if (!checklist.peripherals_complete) { ... DENY ... }
return buildDecision({ ... decision: COMPLIANCE_DECISION.ALLOW ... });
```

None of the seven evidence-derived signals above — including RMO 24-2023 filing readiness and fiscal terminal registration, both of which have dedicated `COMPLIANCE_REASON_CODE` entries specifically for blocking activation — are consulted before returning `ALLOW` for a checkout/receipt-render/terminal operation. A `compliant_active` business with a stale/never-verified fiscal terminal registration or incomplete RMO filing evidence will still get `ALLOW` for `POS_CHECKOUT`.

This directly contradicts `complianceGate.js`'s own header comment (lines 24-29): *"assertComplianceGate accepts artifacts/peripherals/settings/evidence as optional pass-through inputs (defaulting to empty) so a compliant_active business with no submitted checklist evidence correctly falls through evaluateComplianceChecklist's 'incomplete' paths (REQUIRES_SETUP) rather than the gate silently assuming completeness."* That guarantee does not hold for 5 of the 7 evidence-derived checklist fields, both because most of them default to `ready = true` when `evidence` is `{}` (`evidence?.x !== false` is `true` for `undefined`), and because the decision branch never reads them regardless.

Since `assertComplianceGate` is explicitly documented as "Phase 9's hand-off contract" and "the ONLY place a gated usecase in this codebase should call the policy engine," this gap will ship forward unnoticed unless corrected now — Phase 9 will reasonably assume the gate already enforces the full checklist because the code comment says so.

**Fix:** Either (a) add the missing evidence-derived checks to the `compliant_active` POS-operation branch of `evaluateComplianceDecision` (mirroring the `activation_blockers` logic, mapping each to its own `REQUIRES_SETUP`/`DENY` + reason code), or (b) if this is intentionally deferred to a later phase, correct `complianceGate.js`'s header comment so it does not assert a guarantee the code doesn't provide, and add an explicit `// TODO(Phase 9): ...` note plus a regression test asserting the current (narrower) gating behavior so the gap can't silently regress further.

## Warnings

### WR-01: `guardBusinessAccess` fails open (skips the membership/role check entirely) when `requestingAccountId` is falsy

**File:** `apps/dgfy-api/src/modules/products/usecases/productUseCases.js:103-113`
**Also affects:** `apps/dgfy-api/src/modules/products/usecases/productFolderUseCases.js:83-93`, `apps/dgfy-api/src/modules/inventory/usecases/inventoryMovementUseCases.js:109-119`, `apps/dgfy-api/src/modules/shifts/usecases/shiftUseCases.js:114-124`, `apps/dgfy-api/src/modules/compliance/usecases/complianceUseCases.js:109-119`

**Issue:** The shared `guardBusinessAccess` helper (independently duplicated across 5 use-case modules per this codebase's "self-contained module" convention) only checks membership/role `if (requestingAccountId)`:

```js
async function guardBusinessAccess(businessRepository, businessId, requestingAccountId, { role } = {}) {
    const business = await businessRepository.findById(businessId);
    if (!business) return { error: businessNotFoundError() };
    if (requestingAccountId) {
        const { error } = await requireMembership(businessRepository, businessId, requestingAccountId, { role });
        if (error) return { error };
    }
    return {};
}
```

When `requestingAccountId` is falsy (undefined/null/empty string), the function returns `{}` — i.e. **access granted, no error** — regardless of role requirements. Every HTTP controller in this phase currently always supplies `req.account.id` (guaranteed non-empty by the upstream `authenticateAccount` middleware), so this isn't reachable via the public API today. But it is a fail-open design: any future direct caller of these use cases (an internal script, a Phase 9 checkout/availment flow invoking `createProduct`/`recordRestock`/`openShift` programmatically without first resolving an account id) silently bypasses all authorization instead of being rejected. A fail-closed default (require `requestingAccountId` and deny when absent, with an explicit "system caller" escape hatch if one is truly needed) is the safer contract for an authorization helper.

**Fix:**
```js
async function guardBusinessAccess(businessRepository, businessId, requestingAccountId, { role } = {}) {
    const business = await businessRepository.findById(businessId);
    if (!business) return { error: businessNotFoundError() };
    if (!requestingAccountId) {
        return { error: forbiddenError('Authentication is required to perform this action.') };
    }
    const { error } = await requireMembership(businessRepository, businessId, requestingAccountId, { role });
    if (error) return { error };
    return {};
}
```

### WR-02: Repository `withModel`/`withModels` wraps every non-whitelisted error (including FK constraint violations) into `TenantDatabaseUnavailableError('unreachable')`, which use cases then surface as a misleading 503

**File:** `apps/dgfy-api/src/modules/shifts/repositories/shiftRepository.js:164-183, 230-238`
**Also affects:** `apps/dgfy-api/src/modules/products/repositories/productRepository.js:96-108`, `apps/dgfy-api/src/modules/products/repositories/productFolderRepository.js:74-86`, `apps/dgfy-api/src/modules/inventory/repositories/inventoryMovementRepository.js:136-148, 330-339`, `apps/dgfy-api/src/modules/shifts/repositories/cashDrawerEventRepository.js:103-115`, `apps/dgfy-api/src/modules/compliance/repositories/complianceModeStateRepository.js:113-127`, `apps/dgfy-api/src/modules/booking/repositories/bookingRepository.js:132-146`

**Issue:** Every repository's `withModel`/`withModels` helper catches *any* error not already one of its own named error classes and rethrows it as `TenantDatabaseUnavailableError('unreachable', ...)`:

```js
} catch (error) {
    if (error instanceof TenantDatabaseUnavailableError) throw error;
    throw new TenantDatabaseUnavailableError('unreachable', 'Unable to reach the tenant database for this business.');
}
```

The corresponding use-case layer then maps every `reason !== 'missing'/'not_configured'` to `503 SERVICE_UNAVAILABLE`. This means a genuine client-caused error — e.g. `shiftController.openShift` being called with a `cashierAccountId` or `terminalId` that doesn't exist in `staff_accounts`/`terminal_identities` for this tenant (a FK constraint violation), or `productController.createProduct` with a bogus `folder_id` — is reported to the caller as "tenant database unreachable" with a 503, instead of a 400/404 that reflects the actual, client-fixable problem. This also means genuine infrastructure incidents (connection pool exhaustion, network partition) are indistinguishable in the API response from a validation mistake, which will confuse both API consumers and on-call responders reading logs/alerts.

**Fix:** At minimum, do not use the same "unreachable" reason for every uncaught error. Distinguish (a) FK/constraint violations — duck-type on `SequelizeForeignKeyConstraintError`/`error.original.code === 'ER_NO_REFERENCED_ROW_2'` and map to a 400/404 `DomainError` — from (b) genuine connectivity failures (`SequelizeConnectionError` and friends), which alone should map to 503.

### WR-03: `ProductRepository`, `ProductFolderRepository`, and `BookingRepository` don't scope single-row lookups by `business_id`, unlike their sibling repositories

**File:** `apps/dgfy-api/src/modules/products/repositories/productRepository.js:131-137, 152-177`
**Also affects:** `apps/dgfy-api/src/modules/products/repositories/productFolderRepository.js:108-114, 142-157`, `apps/dgfy-api/src/modules/booking/repositories/bookingRepository.js:231-237, 266-295`

**Issue:** `ProductRepository.findById()`/`.update()`, `ProductFolderRepository.findById()`/`.update()`, and `BookingRepository.findById()`/`.cancelBooking()` all resolve a row via a bare `Model.findByPk(Number(id))` (or `findByPk` inside a transaction for booking), with **no `business_id` filter in the WHERE clause**. This relies entirely on "one physical database per business" for tenant isolation.

Contrast this with `InventoryMovementRepository.findOne()`, `ShiftRepository.findById()`/`.closeShift()`, `CashDrawerEventRepository.findOne()`, and `ComplianceModeStateRepository`'s queries, all of which explicitly filter `WHERE ... AND business_id = :businessId` even though they resolve the same per-business tenant connection. That defense-in-depth is cheap and is already the established convention in this exact phase's own sibling files — its absence in three of the eight repositories is an inconsistency, and it is the only thing standing between "isolated by business_id" and "isolated only by which physical database happened to be resolved" if the tenant-database-resolution assumption (1 DB per business) is ever violated (e.g. a future consolidation, a registry misconfiguration pointing two businesses at the same `database_name`, or a test/staging environment that intentionally shares one DB).

**Fix:** Add `where: { business_id: businessId }` to every single-row lookup in these three repositories, mirroring `shiftRepository.js`/`inventoryMovementRepository.js`'s existing pattern:
```js
const record = await Product.findOne({ where: { id: Number(id), business_id: businessId } });
```

### WR-04: `shiftRepository.openShift()` never validates that `cashierAccountId`/`terminalId` belong to `businessId`'s tenant database before the FK-constrained INSERT

**File:** `apps/dgfy-api/src/modules/shifts/usecases/shiftUseCases.js:160-208`
**Also affects:** `apps/dgfy-api/src/modules/shifts/controllers/shiftController.js:20-31`, `apps/dgfy-api/src/modules/shifts/repositories/shiftRepository.js:194-238`

**Issue:** `buildOpenShiftUseCase` validates that `cashierAccountId`/`terminalId` are present and non-null, but never checks that they resolve to existing `staff_accounts`/`terminal_identities` rows for this business before calling `repository.openShift()`. If the client (or a staff member picking from a stale cached list) supplies an ID that doesn't exist, the resulting FK constraint violation is caught by `openShift()`'s inner `catch` block, fails the `isUniqueConstraintViolation()` duck-type check (it's not a unique-index violation), and falls through to the outer catch, which (per WR-02) reports it as a 503 "tenant database unreachable" rather than a 400/404 identifying the invalid `cashierAccountId`/`terminalId`.

**Fix:** Validate `terminalId`/`cashierAccountId` existence explicitly in the use case (or repository) before the INSERT, and return a clean `404`/`400` `DomainError` when either doesn't resolve — consistent with how `bookingUseCases.js` explicitly resolves and validates the `Product` via `productRepository.findById()` before calling `repository.createBooking()`.

### WR-05: `booking_capacity`'s guarded release on cancel is not bounded by the slot's original capacity

**File:** `apps/dgfy-api/src/modules/booking/repositories/bookingRepository.js:266-295`

**Issue:** `cancelBooking()` unconditionally applies `slots_remaining = slots_remaining + 1` for the booking's `(product_id, branch_id, slot_start)` whenever a `booked` booking is cancelled. There is no upper bound tying this back to the slot's originally-provisioned capacity. Under the current single-writer contract this can't currently be reached from outside (creates only ever decrement, cancels only ever increment 1:1 with a prior successful create), so this is low-risk today — but if a future change (a data-migration backfill, a manual DB fix, a Phase-9 refund/reschedule flow) ever double-cancels a booking outside `cancelBooking()`'s existing `BookingAlreadyCancelledError` guard, or if `concurrent_capacity` is edited downward on a `Product` after bookings already exist for a slot, `slots_remaining` can silently exceed the product's `concurrent_capacity`, at which point the atomic guard in `createBooking()` (`slots_remaining >= 1`) no longer reflects the intended ceiling.

**Fix:** Consider asserting `slots_remaining < concurrent_capacity` as a guard on the release UPDATE (mirroring the `>= 1` guard used on decrement), or documenting explicitly why this is safe to omit given the current single-writer invariants, so a future change to this file doesn't have to re-derive that reasoning from scratch.

### WR-06: The new commerce-foundation migration has no dedicated unit test; only the pre-existing business-foundation migration is unit-tested

**File:** `apps/dgfy-migration-runner/src/migrations/schema/20260712100000-create-commerce-foundation.cjs`
**Also affects:** `apps/dgfy-migration-runner/tests/dgfyBusinessSchema.test.js`

**Issue:** `dgfyBusinessSchema.test.js` (the only migration-runner test file in this phase's file list) unit-tests `20260710021000-create-dgfy-business-foundation.cjs` and `20260711143000-add-dgfy-business-staff-invitations.cjs` against a mocked `queryInterface` (idempotency, index/FK wiring, table set). It never loads or exercises `20260712100000-create-commerce-foundation.cjs` — the migration this phase actually adds — the same way. The only exercise of this migration file is `bookingCapacity.test.js`, a real-MySQL integration test that is **skipped by default** (`RUN_BOOKING_CAPACITY_INTEGRATION=true` opt-in) and only covers the `bookings`/`booking_capacity` tables' concurrency behavior, not the migration's idempotency guards, the append-only triggers on `inventory_movements`/`cash_drawer_events`, or the `active_terminal_cashier_key` generated column on `shifts`. None of these — the parts of this migration most likely to have a subtle bug (raw SQL trigger/generated-column strings, `DROP TRIGGER IF EXISTS` idempotency, `describeTable` gating) — have any unit-level coverage that runs in ordinary CI.

**Fix:** Add a `dgfyBusinessSchema.test.js`-style mocked-`queryInterface` unit test suite for `20260712100000-create-commerce-foundation.cjs` mirroring the existing pattern (idempotent `createTable`/`addIndex` skip-on-exists, contract column/index/FK parity, rejected-table absence), plus at least a smoke assertion that the raw `CREATE TRIGGER`/`ALTER TABLE ... GENERATED ALWAYS` query strings are issued for the expected table names.

## Info

### IN-01: Migration `down()`'s "DROP TYPE" cleanup block is dead code on MySQL

**File:** `apps/dgfy-migration-runner/src/migrations/schema/20260712100000-create-commerce-foundation.cjs:508-518`

**Issue:** `down()` issues 9 `DROP TYPE IF EXISTS enum_*` statements guarded by `getDialect() === 'mysql'`, each wrapped in `.catch(() => {})`. MySQL has no `DROP TYPE` DDL statement — ENUMs in MySQL are inline column type definitions, not separate named types (unlike PostgreSQL, where this idiom is meaningful). Since this project's `dialect` is always `'mysql'` (`tenantConnector.js:49`), every one of these 9 statements will throw a SQL syntax error on every rollback, and the error is always silently swallowed. This is confusing dead code copy-pasted from a Postgres-oriented migration pattern — it implies enum cleanup happens on rollback when it never does anything (dropping the table already removes the inline enum definition).

**Fix:** Delete the `DROP TYPE` block entirely (dropping the tables already cleans up the inline MySQL enums), or replace the dialect guard with a comment clarifying it is intentionally a no-op reserved for a future Postgres target, if that's actually the intent.

### IN-02: `BookingEntity.ownedBy()` / `ProductEntity.isBookableEligible()` duplicate inline logic in the use-case layer instead of being called

**File:** `apps/dgfy-api/src/modules/booking/entities/bookingEntity.js:62-64`
**Also affects:** `apps/dgfy-api/src/modules/products/entities/productEntity.js:50-52`

**Issue:** `bookingUseCases.js`'s `buildCancelBookingUseCase` re-implements the exact ownership check `BookingEntity.ownedBy()` already provides (`existing.customer_account_id === requestingAccountId`) inline rather than constructing a `BookingEntity` and calling it; `productUseCases.js`'s `buildSetProductBookableUseCase` does the same for `ProductEntity.isBookableEligible()`. This mirrors a documented project convention ("entities exist standalone without usecases importing them directly"), so it's intentional rather than an oversight, but it does mean these entity methods are effectively unreachable/untested dead code from the use-case layer's perspective — a future edit to the ownership/eligibility rule in one place (the entity) will silently not affect the other (the use case), since they aren't the same code path.

**Fix:** No action required if the "standalone entity" convention is deliberate project policy: consider adding a one-line comment at each duplicated check noting the entity method exists so a future maintainer doesn't have to discover the divergence by searching, or have the use case actually call the entity method to keep the two in sync by construction.

### IN-03: `buildCreateBookingUseCase`/`buildCancelBookingUseCase` skip the `businessRepository.findById()` existence check that every sibling module's `guardBusinessAccess` performs

**File:** `apps/dgfy-api/src/modules/booking/usecases/bookingUseCases.js:134-200, 212-255`

**Issue:** Unlike `productUseCases.js`/`inventoryMovementUseCases.js`/`shiftUseCases.js`/`complianceUseCases.js`, which all call a shared `guardBusinessAccess` that starts with `businessRepository.findById(businessId)` and returns a `404 Business not found` `DomainError` if it's missing, `buildCreateBookingUseCase`/`buildCancelBookingUseCase` never check business existence directly — they only call `isActiveStaffOrOwner`, which calls `getMembership` (returns `false`/no membership for a non-existent business) and then fall through to the tenant-database resolution, which will separately 404 with `NO_TENANT_DATABASE` once `productRepository.findById`/`repository.createBooking` runs. The end result is still a 404, but with a different error code/message than the rest of the API's convention ("Business not found" vs. "No tenant database is registered for this business"), which is a minor inconsistency for API consumers that branch on `error.details.error_code`.

**Fix:** For consistency, consider having `buildCreateBookingUseCase`/`buildCancelBookingUseCase` call the same `guardBusinessAccess`-style existence check other modules use, or explicitly document why booking's authorization shape (dual staff-or-owner/consumer) makes that check structurally different on purpose.

---

_Reviewed: 2026-07-12T14:23:08Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
