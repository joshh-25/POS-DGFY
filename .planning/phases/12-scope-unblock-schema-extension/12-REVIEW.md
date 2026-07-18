---
phase: 12-scope-unblock-schema-extension
reviewed: 2026-07-14T00:00:00Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - apps/dgfy-api/src/infra/tenantConnector.js
  - apps/dgfy-api/src/models/Tenant/InventoryMovement.js
  - apps/dgfy-api/src/models/Tenant/Product.js
  - apps/dgfy-api/src/models/Tenant/ProductEmbedding.js
  - apps/dgfy-api/src/modules/compliance/repositories/complianceModeStateRepository.js
  - apps/dgfy-api/src/modules/compliance/usecases/complianceUseCases.js
  - apps/dgfy-api/tests/unit/modules/compliance/complianceModeStateRepository.test.js
  - apps/dgfy-api/tests/unit/modules/compliance/complianceReviewDemotion.test.js
  - apps/dgfy-migration-runner/src/data/mappings.js
  - apps/dgfy-migration-runner/src/migrations/schema/20260716100000-extend-schema-for-legacy-migration.cjs
  - apps/dgfy-migration-runner/src/schemaContracts/dgfyBusinessContract.js
  - docs/architecture/adr/0029-catalog-inventory-pos-storefront-ownership-boundaries.md
  - docs/database/dgfy-data-migration-map.md
  - docs/database/legacy-product-attributes-folding-design.md
findings:
  critical: 1
  warning: 4
  info: 3
  total: 8
status: issues_found
---

# Phase 12: Code Review Report

**Reviewed:** 2026-07-14T00:00:00Z
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

Reviewed the Phase 12 schema-extension deliverables (Product/InventoryMovement/ProductEmbedding
tenant models, the additive migration, the updated `dgfyBusinessContract.js`, the compliance
repository/usecase files carried in scope, the migration-mapper module, and the accompanying
docs). The additive schema work (new `products` columns, `product_embeddings` table) is
internally consistent across model/migration/contract. However, cross-file tracing into the
`inventory_movements` write paths (Phase 9's `availmentRepository.js` checkout finalize and
Phase 10's `inventoryReservationRepository.js` reservation-commit) surfaced a critical
correctness regression: the new `unique_inventory_movements_natural_key` index omits
`product_id`, which will reject the second and subsequent `InventoryMovement` inserts for any
multi-line POS sale or multi-item Storefront order. This is untested against a real database
(all existing unit tests mock the model layer, so the unique-index collision never fires in
CI) and would only be discovered against a live MySQL instance or in production.

Also flagged: an authorization helper in `complianceUseCases.js` that silently skips its
role/membership check when `requestingAccountId` is falsy, an overly broad catch in
`complianceModeStateRepository.js` that can mask real bugs as tenant-database-unavailable
errors, an unvalidated `Number()` coercion on `branchId`, and a non-atomic two-call write in
the evidence-submission use case that reopens (in a milder form) the same crash/race class the
review-and-demote path was specifically hardened against.

## Critical Issues

### CR-01: `unique_inventory_movements_natural_key` omits `product_id`, breaking multi-line availment/reservation commits

**File:** `apps/dgfy-migration-runner/src/migrations/schema/20260716100000-extend-schema-for-legacy-migration.cjs:175-182`
(mirrored in `apps/dgfy-api/src/models/Tenant/InventoryMovement.js:111-115` and
`apps/dgfy-migration-runner/src/schemaContracts/dgfyBusinessContract.js:302-328`)

**Issue:** The new additive unique index is defined as:

```js
await addIndexIfMissing('inventory_movements', ['business_id', 'reference_type', 'reference_id'], {
  name: 'unique_inventory_movements_natural_key',
  unique: true
});
```

i.e. `(business_id, reference_type, reference_id)` — it does **not** include `product_id`. But
two existing, already-wired call sites intentionally create *multiple* `InventoryMovement` rows
that share the exact same `(business_id, reference_type, reference_id)` tuple for a single
multi-product order/sale, differing only by `product_id`:

1. `apps/dgfy-api/src/modules/availments/repositories/availmentRepository.js:544-555` — POS
   checkout finalize loops over every `inventory_issue` line in `saleEffectLines` and calls
   `recordSaleEffect({ ..., referenceType: 'availment', referenceId: availmentId, ... })` once
   per line, all sharing the same `availmentId`. Any checkout with 2+ distinct
   `basic_inventory` products in the cart produces 2+ `InventoryMovement.create()` calls with
   identical `(business_id, 'availment', availmentId)`.
2. `apps/dgfy-api/src/modules/inventory/repositories/inventoryReservationRepository.js:300-311`
   (`commitReservation`) — loops over every active `InventoryReservation` row for one
   `referenceId` (the order's public reference) and calls `recordSaleUseCase({ ...,
   referenceType: 'inventory_reservation', referenceId, ... })` once per reservation, again
   sharing the same `referenceId` across different `product_id`s.

Both loops run inside a single `sequelize.transaction()` and throw/roll back on any write
failure. With this index in place, the **second** `InventoryMovement` insert for the second
product line in the same order/sale will fail with a unique-constraint violation
(`SequelizeUniqueConstraintError` / `ER_DUP_ENTRY`), which is not specifically caught by either
call site — it will propagate out and abort/roll back the entire checkout or reservation-commit
transaction. This means **any POS sale or Storefront order containing more than one
stock-tracked product line will fail to commit** once this migration is applied, a functional
regression that blocks a core, high-frequency flow (checkout).

This is invisible in the current test suite: `grep` across `apps/dgfy-api/tests` finds zero
references to `unique_inventory_movements_natural_key` or any test that exercises a real MySQL
unique-constraint collision for `inventory_movements` — all existing unit tests mock
`InventoryMovement`/`InventoryReservation` model methods, so the index is never actually
enforced in CI.

The migration's own design rationale ("Existing organic Phase 8/9 rows have NULL
`reference_type`/`reference_id`") is only true for the original Phase 8 `restock`/`loss`/
`adjustment` writers; it does not hold for the `sale` movement type wired by Phase 9/10's
checkout and reservation-commit flows, which are exactly the flows this index breaks.

**Fix:** Include `product_id` in the natural key so uniqueness is scoped per (order, product)
line rather than per order:

```js
await addIndexIfMissing(
  'inventory_movements',
  ['business_id', 'product_id', 'reference_type', 'reference_id'],
  { name: 'unique_inventory_movements_natural_key', unique: true }
);
```

...and mirror the same column list in `InventoryMovement.js`'s `indexes:` entry and
`dgfyBusinessContract.js`'s `inventory_movements.indexes`/`uniqueConstraints` entries. If
Phase 13's migrated-row retry idempotency genuinely needs a coarser (order-only) natural key for
some other insert path, that should be a *separate*, additively-scoped index rather than
reusing the same index name/shape that the live checkout/reservation-commit code already
violates.

## Warnings

### WR-01: `guardBusinessAccess` silently skips the membership/role check when `requestingAccountId` is falsy

**File:** `apps/dgfy-api/src/modules/compliance/usecases/complianceUseCases.js:132-142`

**Issue:**

```js
async function guardBusinessAccess(businessRepository, businessId, requestingAccountId, { role } = {}) {
    const business = await businessRepository.findById(businessId);
    if (!business) {
        return { error: businessNotFoundError() };
    }
    if (requestingAccountId) {
        const { error } = await requireMembership(businessRepository, businessId, requestingAccountId, { role });
        if (error) return { error };
    }
    return {};
}
```

If `requestingAccountId` is `undefined`/`null`/`''`, the membership/role check is skipped
entirely and `guardBusinessAccess` returns success. `buildReviewComplianceStateUseCase` (the
`owner`-gated D-04 manual-review path that can transition `compliance_mode_state.state`,
including re-enabling `compliant_active` and thus Fiscal `POS_CHECKOUT`) relies on this same
helper for its authorization gate. Today's only caller
(`complianceController.js`) always passes `req.account.id`, so this is not currently reachable
through the HTTP surface, but the use case itself has no fail-closed guarantee: any other
caller (a script, a future controller, a bug that leaves `req.account` unset) that omits
`requestingAccountId` bypasses the owner-only check on a security-sensitive compliance-state
transition. Given this exact file was hardened elsewhere (T-12-07/T-12-08) specifically to
close a fail-open compliance gap, this is worth closing at the same time.

**Fix:** Fail closed instead of silently succeeding when authorization context is expected but
missing — e.g. require `requestingAccountId` to be present whenever a `role` requirement is
supplied, or make `guardBusinessAccess` always require `requestingAccountId` and let callers
that genuinely want an unauthenticated read (if any) opt in explicitly.

### WR-02: `withModel()`'s catch-all normalizes *any* thrown error to a 503 "tenant database unreachable", masking real bugs

**File:** `apps/dgfy-api/src/modules/compliance/repositories/complianceModeStateRepository.js:146-164`

**Issue:**

```js
async withModel(businessId, fn) {
    const databaseName = await this.resolveDatabaseName(businessId);
    try {
        const model = this.resolveModel(databaseName);
        return await fn(model);
    } catch (error) {
        if (
            error instanceof TenantDatabaseUnavailableError
            || error instanceof ComplianceStateNotFoundError
            || error instanceof DuplicateComplianceModeStateError
        ) {
            throw error;
        }
        throw new TenantDatabaseUnavailableError('unreachable', 'Unable to reach the tenant database for this business.');
    }
}
```

Any error thrown inside `fn(model)` that isn't one of the three known types — including a
`TypeError` from a programming mistake inside a future callback, a Sequelize validation error
unrelated to connectivity, or any other unexpected exception — is remapped to
`TenantDatabaseUnavailableError('unreachable')`, which `complianceUseCases.js` maps to a 503
`SERVICE_UNAVAILABLE`. This makes real application bugs indistinguishable from genuine
connectivity failures, both to callers and in logs/alerting (a 503 spike would be
misattributed to infra rather than a code defect).

**Fix:** Narrow the catch to errors that are plausibly connectivity-related (e.g. duck-type on
`error.name?.startsWith('Sequelize') && /Connection/.test(error.name)`, or check
`error.original?.code` against known connection-refused/timeout codes), and let unrecognized
errors propagate so they surface as 500s and are visible as bugs rather than being silently
reclassified as infrastructure failures.

### WR-03: `normalizeBranchId` does not validate the numeric coercion, allowing `NaN` to reach the database layer

**File:** `apps/dgfy-api/src/modules/compliance/usecases/complianceUseCases.js:144`

**Issue:**

```js
const normalizeBranchId = (branchId) => (branchId === undefined || branchId === null || branchId === '' ? null : Number(branchId));
```

A non-numeric `branchId` (e.g. `"abc"` from a malformed query string or request body) is not
rejected — `Number('abc')` is `NaN`, which then flows unvalidated into
`repository.getForBusinessBranch(businessId, NaN)` / `upsertState(...)` /
`recordVerificationAndState(...)`, ultimately into a Sequelize `where: { branch_id: NaN }`
clause. This produces unpredictable query behavior (Sequelize/MySQL handling of `NaN` in a
bound parameter is not a defined "no matching rows found cleanly" contract) instead of a clean
400 validation error.

**Fix:** Validate after coercion and return a `validationError('branchId must be a valid
integer.')` when the result is `NaN`:

```js
const normalizeBranchId = (branchId) => {
    if (branchId === undefined || branchId === null || branchId === '') return null;
    const numeric = Number(branchId);
    return Number.isInteger(numeric) ? numeric : NaN; // caller validates NaN and fails closed
};
```

### WR-04: `buildSubmitComplianceEvidenceUseCase` writes via two independent, non-atomic repository calls — reopens a milder version of the race the review path was just hardened against

**File:** `apps/dgfy-api/src/modules/compliance/usecases/complianceUseCases.js:213-233`
(compare `apps/dgfy-api/src/modules/compliance/repositories/complianceModeStateRepository.js:292-344`)

**Issue:** `buildSubmitComplianceEvidenceUseCase` calls `repository.upsertState(...)` and then
`repository.recordVerification(...)` as two separate calls, each in its own transaction:

```js
await repository.upsertState(businessId, branchId, updates);
const withResetVerification = await repository.recordVerification(businessId, branchId, {
    verification_status: COMPLIANCE_VERIFICATION_STATUS.PENDING_REVIEW,
    verified_by_actor_type: null,
    verified_at: null
});
```

This file's own header comment explains that `buildReviewComplianceStateUseCase` was
specifically changed (T-12-07/T-12-08) to fold its verification-metadata write and its
`state` write into one atomic, row-locked `recordVerificationAndState()` call, precisely
because two independent calls left a crash/race window where a partially-applied write could
leave the row in an inconsistent state. `buildSubmitComplianceEvidenceUseCase` still has that
same two-call shape: if the process crashes (or another request interleaves) between
`upsertState()` and `recordVerification()`, the row is left with the newly submitted
`compliance_profile`/`state` but a **stale** `verification_status` (e.g. still `'verified'`
or `'rejected'` from a prior review cycle) — violating the documented invariant "submitting
new evidence always resets `verification_status` to `pending_review`". This does not by itself
flip `state` (so it is not the same fail-open severity as the bug T-12-07/T-12-08 fixed), but
it is the same architectural gap in the one place in this file that wasn't closed.

**Fix:** Add a `submitEvidenceAndResetVerification()`-style atomic repository method (row-locked
transaction, single `record.update()` call) mirroring `recordVerificationAndState()`, and have
`buildSubmitComplianceEvidenceUseCase` call it instead of the two independent calls.

## Info

### IN-01: `ProductEmbedding` declares `belongsTo(Product)` with no reciprocal `Product.hasOne(ProductEmbedding)`

**File:** `apps/dgfy-api/src/models/Tenant/Product.js:22-47`,
`apps/dgfy-api/src/models/Tenant/ProductEmbedding.js:22-29`

**Issue:** Every other 1:1/1:many relationship in this model set is wired bidirectionally
(`Product.hasMany(InventoryMovement)` / `InventoryMovement.belongsTo(Product)`, etc.), but
`ProductEmbedding.associate()` only defines the `belongsTo(Product)` side; `Product.associate()`
has no matching `hasOne(ProductEmbedding, { as: 'embedding' })`. No current API reads this
association in either direction yet, so this is not user-visible today, but it's an
inconsistency with the established pattern in this same file set and will need to be added
once Phase 13's mapper (or any future embeddings feature) wants `product.getEmbedding()`.

**Fix:** Add the reciprocal association for consistency:

```js
if (models.ProductEmbedding && !Product.associations?.embedding) {
    Product.hasOne(models.ProductEmbedding, { foreignKey: 'product_id', as: 'embedding' });
}
```

### IN-02: `upsertState()`'s `defaults.state` uses a falsy-coalescing `||` fallback, inconsistent with the `hasOwnProperty` pattern used immediately below it

**File:** `apps/dgfy-api/src/modules/compliance/repositories/complianceModeStateRepository.js:217`
vs. `:234-239`

**Issue:**

```js
state: updates.state || 'non_compliant_active',
```

vs. the patch built two blocks later:

```js
['state', 'compliance_profile', 'active_policy_pack_version'].forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
        patch[key] = updates[key];
    }
});
```

The `defaults` branch would silently substitute the default state if `updates.state` were ever
an explicit falsy-but-intended value (e.g. `''` or `0`), whereas the `patch` branch correctly
distinguishes "key present" from "key absent" via `hasOwnProperty`. In practice `state` is
always a non-empty enum string, so this isn't exploitable today, but the inconsistency between
the two nearby code paths is worth aligning for future-proofing.

**Fix:** Use the same `hasOwnProperty`-based check for the `defaults.state` value:

```js
state: Object.prototype.hasOwnProperty.call(updates, 'state') && updates.state
    ? updates.state
    : 'non_compliant_active',
```

### IN-03: Migration `down()` contains a dead-code Postgres-style `DROP TYPE` statement

**File:** `apps/dgfy-migration-runner/src/migrations/schema/20260716100000-extend-schema-for-legacy-migration.cjs:249-254`

**Issue:**

```js
if (queryInterface.sequelize && queryInterface.sequelize.getDialect() === 'mysql') {
  await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_products_vat_type').catch(() => {});
}
```

The comment directly above this correctly notes "MySQL inline enums drop with the column; DROP
TYPE is a Postgres-ism" — meaning this statement is guaranteed to no-op (or error, swallowed by
`.catch(() => {})`) on the only dialect this branch runs under (`dialect === 'mysql'`). It's
harmless but is dead code that adds a false impression of doing enum cleanup.

**Fix:** Remove the block, or replace the comment with a one-line note that no explicit enum
teardown is needed on MySQL (nothing to execute).

---

_Reviewed: 2026-07-14T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
