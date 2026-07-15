---
phase: 11-order-fulfillment-delivery-coordination
reviewed: 2026-07-14T00:00:00Z
depth: standard
files_reviewed: 22
files_reviewed_list:
  - apps/dgfy-api/src/config/architectureGuardrailsAllowlist.js
  - apps/dgfy-api/src/infra/tenantConnector.js
  - apps/dgfy-api/src/models/Tenant/Availment.js
  - apps/dgfy-api/src/models/Tenant/AvailmentStageEvent.js
  - apps/dgfy-api/src/models/Tenant/CourierAssignment.js
  - apps/dgfy-api/src/modules/availments/index.js
  - apps/dgfy-api/src/modules/availments/repositories/availmentRepository.js
  - apps/dgfy-api/src/modules/availments/usecases/availmentUseCases.js
  - apps/dgfy-api/src/modules/availments/usecases/storefrontFinalizeUseCases.js
  - apps/dgfy-api/src/modules/fulfillment/controllers/fulfillmentController.js
  - apps/dgfy-api/src/modules/fulfillment/index.js
  - apps/dgfy-api/src/modules/fulfillment/README.md
  - apps/dgfy-api/src/modules/fulfillment/repositories/availmentReadRepository.js
  - apps/dgfy-api/src/modules/fulfillment/repositories/courierAssignmentRepository.js
  - apps/dgfy-api/src/modules/fulfillment/repositories/stageEventRepository.js
  - apps/dgfy-api/src/modules/fulfillment/routes.js
  - apps/dgfy-api/src/modules/fulfillment/usecases/fulfillmentUseCases.js
  - apps/dgfy-api/src/routes/index.js
  - apps/dgfy-api/tests/integration/availments/fulfillmentFinalizeLive.test.js
  - apps/dgfy-api/tests/unit/modules/fulfillment/fulfillmentRepositories.test.js
  - apps/dgfy-api/tests/unit/modules/fulfillment/fulfillmentUseCases.test.js
  - apps/dgfy-migration-runner/src/migrations/schema/20260715120000-create-availment-fulfillment.cjs
  - apps/dgfy-migration-runner/src/schemaContracts/dgfyBusinessContract.js
findings:
  critical: 2
  warning: 4
  info: 3
  total: 9
status: issues_found
---

# Phase 11: Code Review Report

**Reviewed:** 2026-07-14T00:00:00Z
**Depth:** standard
**Files Reviewed:** 22
**Status:** issues_found

## Summary

Reviewed the Order Fulfillment & Delivery Coordination phase: the two new tenant models (`AvailmentStageEvent`, `CourierAssignment`), the new `fulfillment` module (repositories/usecases/controller/routes), the `11-01` schema migration + contract update, and the finalize-seam integration threaded into the pre-existing `availments` module (`availmentRepository.js`, `availmentUseCases.js`, `storefrontFinalizeUseCases.js`).

The append-only enforcement (DB triggers + model hooks + narrow repository surface) is solid and is proven against real MySQL in `fulfillmentFinalizeLive.test.js`. However, two classes of bug were found that undermine the module's own core guarantee — that `Availment.fulfillment_status/fulfillment_stage` (the read cache) always agrees with the `availment_stage_events` ledger (the source of truth):

1. `buildProgressStageUseCase` writes the ledger row and the cache update as two independent, non-transactional calls — a failure between them leaves the cache stale, and since the *next* stage transition is computed from that same stale cache, a permanent, silently-corrupting divergence between ledger and cache is possible.
2. `fulfillmentMode` is never validated before being written into two different NOT NULL / ENUM-constrained columns inside the finalize transactions (`finalizePersist` and `finalizeStorefrontOrder`), and one of those two paths (`finalizePersist`, via `AvailmentRepository.withModel`'s catch-all) actively re-labels the resulting DB error as `TenantDatabaseUnavailableError('unreachable')`, surfacing a validation problem to the caller as a misleading 503 "tenant database unreachable" — even when the database is perfectly reachable.

Several smaller quality issues (unvalidated `courier_contact` length, unattributed courier/stage-event actor IDs, dead exported helper) are listed under Warnings/Info.

## Critical Issues

### CR-01: Unvalidated `fulfillmentMode` breaks both finalize seams, one of them with a misleading error code

**File:** `apps/dgfy-api/src/modules/availments/usecases/availmentUseCases.js:583-621` (POS path), `apps/dgfy-api/src/modules/availments/repositories/availmentRepository.js:447-508` (`finalizePersist`), `apps/dgfy-api/src/modules/availments/usecases/storefrontFinalizeUseCases.js:115-194` (storefront path), `apps/dgfy-api/src/modules/availments/repositories/availmentRepository.js:627-728` (`finalizeStorefrontOrder`)

**Issue:**
Neither `buildFinalizeAvailmentUseCase` nor `buildFinalizeStorefrontOrderUseCase` validates `fulfillmentMode` before it reaches the repository, even though both files already validate every other input up front (`paymentMethod`, `terminalId`, `cashierAccountId`, `sourceReference`, line shapes, etc.).

- **POS path:** `AvailmentRepository.finalizePersist` computes `resolvedFulfillmentMode = fulfillmentMode || 'dine_in'` (repository line 451) and writes it straight into `availments.fulfillment_mode`, an ENUM('pickup','delivery','dine_in') column (`Availment.js:224-227`). Any caller that supplies a value outside that set (e.g. a typo like `pick_up`) causes `availment.update(...)` to throw a Sequelize validation/DB error. That error is NOT one of the domain errors `withModel` whitelists (`availmentRepository.js:169-182`), so it is caught and re-wrapped into `TenantDatabaseUnavailableError('unreachable', ...)`. `mapTenantDatabaseError` (`availmentUseCases.js:78-87`) then turns that into a **503 SERVICE_UNAVAILABLE** — the caller sees "tenant database unreachable" for what is actually a 400-class input validation problem, and the actual root cause is invisible.
- **Storefront path:** `buildFinalizeStorefrontOrderUseCase`'s `fulfillmentMode` defaults to `null` (`storefrontFinalizeUseCases.js:131`) and is threaded straight through to `repository.finalizeStorefrontOrder` (line 192), which persists it onto the Availment (nullable, so this part succeeds) but then also writes it into the stage-event row: `recordStageEvents(businessId, [{ ..., fulfillmentMode, ... }], { transaction })` (`availmentRepository.js:720-728`). `AvailmentStageEvent.fulfillment_mode` is **`allowNull: false`** (`AvailmentStageEvent.js:59-62`, migration `20260715120000-create-availment-fulfillment.cjs:142-145`). `recordStageEvents` is always injected in production (`routes/index.js:163-166`), so any caller of `finalizeStorefrontOrder`/`buildFinalizeStorefrontOrderUseCase` that omits `fulfillmentMode` will fail the NOT NULL constraint on `availment_stage_events`, rolling back the **entire** finalize transaction — including the Availment, AvailmentItem rows, and the `commitReservation` stock-effect conversion that had already succeeded earlier in the same transaction — turning a legitimate order finalize into a hard failure. This method deliberately bypasses `withModel`'s catch-all (see its own "NOTE (deviation, Rule 1)" comment), so here the error surfaces as a raw, unmapped DB error instead of a 503 — but still a broken finalize instead of a clean 400.

**Fix:** Validate `fulfillmentMode` against the known set (`['pickup', 'dine_in', 'delivery']` for POS, `['pickup', 'delivery']` for storefront, mirroring `STAGE_SEQUENCES`'s keys) up front in both use cases, returning a `validationError(...)` `ApplicationResult.failure` before any repository call — the same pattern already used for `paymentMethod`:

```js
// availmentUseCases.js, buildFinalizeAvailmentUseCase, alongside the other input checks
const resolvedFulfillmentMode = fulfillmentMode || posFulfillmentModeDefault;
if (!['pickup', 'dine_in', 'delivery'].includes(resolvedFulfillmentMode)) {
    return ApplicationResult.failure(validationError('fulfillmentMode must be one of: pickup, dine_in, delivery.'));
}

// storefrontFinalizeUseCases.js, buildFinalizeStorefrontOrderUseCase
if (!['pickup', 'delivery'].includes(fulfillmentMode)) {
    return ApplicationResult.failure(validationError('fulfillmentMode is required and must be one of: pickup, delivery.'));
}
```

Additionally, `AvailmentRepository.withModel`'s catch-all (line 178) should not blanket every non-whitelisted error into `unreachable` — at minimum, a `SequelizeValidationError`/`SequelizeDatabaseError` should propagate distinctly so the usecase layer can map it to a 400/422 instead of a 503 (the file's own header comment already flags this exact masking behavior as a known, deferred issue for `finalizePersist`'s sale-effect failures — the same masking now also applies to `recordStageEvents` failures).

---

### CR-02: `progressStage`'s ledger write and cache-sync write are not atomic — a partial failure permanently desyncs the source of truth from the read cache

**File:** `apps/dgfy-api/src/modules/fulfillment/usecases/fulfillmentUseCases.js:239-253`, `apps/dgfy-api/src/modules/fulfillment/controllers/fulfillmentController.js:33-44`

**Issue:**
`buildProgressStageUseCase` performs two separate writes to progress an availment's stage:

```js
const stageEvent = await stageEventRepository.create(businessId, { ... }, transaction ? { transaction } : {});
await availmentRepository.updateFulfillmentState(businessId, availmentId, { ... }, transaction ? { transaction } : {});
```

Both repository methods accept an optional `{ transaction }` and would honor one if supplied — but `fulfillmentController.js`'s `progressStage` handler never passes a `transaction` into the usecase call (line 35-43), and `buildFulfillmentModule()` (`index.js`) never opens one either. So in the only wired production call path, `transaction` is always `null`/`undefined`, and these are two independent, non-atomic writes against two different tables.

If the process crashes, the connection drops, or the second `Availment.update()` call fails for any reason *after* the first `AvailmentStageEvent.create()` succeeds, the append-only ledger (source of truth, per the module's own README and D-05/D-06/D-15) now shows the availment progressed to the new stage, but the denormalized `Availment.fulfillment_status`/`fulfillment_stage` cache still shows the OLD stage. This is not just a stale read — `buildProgressStageUseCase` itself computes the *next* legal transition from that same stale cache (`availmentRepository.findById` → `nextLegalStage(mode, currentStatus)`), so the very next call to `/fulfillment/stage` for that availment will compute its "next legal stage" from the wrong starting point, either re-inserting a duplicate ledger row for a stage that was already reached, or attempting an illegal skip — silently corrupting the append-only audit ledger this whole module exists to protect.

This directly contradicts the atomicity discipline the rest of this phase (and the pre-existing `finalizePersist`/`finalizeStorefrontOrder` methods) is careful to apply: every other multi-table write in this phase is wrapped in one `sequelize.transaction(...)`.

**Fix:** Wrap the two writes in one transaction, opened by the usecase (or, per the existing composition pattern, by the repository) and passed to both calls:

```js
export function buildProgressStageUseCase({ stageEventRepository, availmentRepository, businessRepository, sequelize }) {
    return async (input = {}) => {
        // ...validation unchanged...
        try {
            const availment = await availmentRepository.findById(businessId, availmentId);
            // ...guard checks unchanged...

            return await sequelize.transaction(async (transaction) => {
                const stageEvent = await stageEventRepository.create(businessId, { ... }, { transaction });
                await availmentRepository.updateFulfillmentState(businessId, availmentId, { ... }, { transaction });
                return ApplicationResult.success({ stageEvent, fulfillmentStatus: targetStatus, isForced });
            });
        } catch (repoError) { ... }
    };
}
```

(`sequelize` can be resolved the same way `finalizePersist` resolves it: `tenantConnector.getModels(databaseName).Availment.sequelize`, threaded in via `buildFulfillmentModule()`.)

## Warnings

### WR-01: `assignCourier`'s supersede-then-create sequence is not atomic — a failed insert silently strands the availment with no active courier

**File:** `apps/dgfy-api/src/modules/fulfillment/usecases/fulfillmentUseCases.js:304-317`

**Issue:** `buildAssignCourierUseCase` calls `courierAssignmentRepository.markSuperseded(businessId, priorActive.id)` and then `courierAssignmentRepository.create(businessId, { ... })` as two independent writes with no transaction. If `create()` throws after `markSuperseded()` has already committed (e.g. a transient DB error, or the courier_name validation somehow slips past the earlier length check), the prior assignment is now marked `is_active: false` with no new active row to replace it — the availment silently has no active courier assignment at all, and the caller only sees a thrown error with no indication the supersede already happened.

**Fix:** Wrap both calls in one `sequelize.transaction(...)`, mirroring the fix suggested for CR-02, or have `courierAssignmentRepository` expose a single `reassign(businessId, { priorAssignmentId, ...newAssignmentInput })` method that does both writes inside one transaction.

### WR-02: `courier_contact` has no length validation, unlike `courier_name`

**File:** `apps/dgfy-api/src/modules/fulfillment/usecases/fulfillmentUseCases.js:271-303`

**Issue:** `buildAssignCourierUseCase` validates `courierName` for presence and a 255-char max (matching `courier_name STRING(255)` in the model/migration), but `courierContact` (also `STRING(255)`) has no equivalent check. An overlong value will fail at the Sequelize/DB layer with a raw, unmapped validation error instead of a clean 400 `ApplicationResult.failure`.

**Fix:**
```js
if (courierContact && String(courierContact).length > 255) {
    return ApplicationResult.failure(validationError('courier_contact must be 255 characters or fewer.'));
}
```

### WR-03: Actor/attribution fields are accepted from the request body with no verification against the authenticated requester

**File:** `apps/dgfy-api/src/modules/fulfillment/controllers/fulfillmentController.js:33-58`

**Issue:** `progressStage` reads `actor_staff_account_id` from `req.body` (line 41) and `assignCourier` reads `assigned_by_staff_account_id` from `req.body` (line 56) — both are then persisted verbatim into the append-only `availment_stage_events`/`courier_assignments` audit trail as the acting staff member, with no check that the value corresponds to the authenticated `req.account.id`'s own staff record. Any authenticated member of the business can attribute a stage transition or courier assignment to an arbitrary `staff_account_id`, undermining the audit trail these tables are designed to provide (the append-only guarantees protect against *tampering* the ledger, but not against *misattributing* a legitimate write at insert time).

**Fix:** Resolve the acting staff account server-side from `req.account.id` (e.g. via the existing `account_staff_assignments` link, mirroring how `cashierAccountId`/`terminalId` are validated as required — not client-optional — in `buildFinalizeAvailmentUseCase`), or, if a staff member genuinely needs to record on behalf of another staff member (e.g. a shift note), gate that with an explicit permission check the way `hasManualDiscountPermission` gates manual discounts in `availmentUseCases.js`.

### WR-04: `courier_name` length check runs against the untrimmed value while the trimmed value is what's persisted

**File:** `apps/dgfy-api/src/modules/fulfillment/usecases/fulfillmentUseCases.js:289-294`

**Issue:**
```js
if (!courierName || typeof courierName !== 'string' || !courierName.trim()) {
    return ApplicationResult.failure(validationError('courier_name is required.'));
}
if (courierName.length > 255) {
    return ApplicationResult.failure(validationError('courier_name must be 255 characters or fewer.'));
}
```
The length check uses `courierName.length` (raw, untrimmed) while `courierAssignmentRepository.create(...)` is later called with `courierName.trim()` (line 312). This means a name with a large amount of leading/trailing whitespace could be rejected even though the value that would actually be persisted is well under 255 characters. Low impact (fail-closed, not fail-open), but inconsistent with the value actually written.

**Fix:** Check the trimmed value: `if (courierName.trim().length > 255) { ... }`.

## Info

### IN-01: Dead exported helper `isPlainObject`/`_isPlainObject`

**File:** `apps/dgfy-api/src/modules/fulfillment/usecases/fulfillmentUseCases.js:133,364`

**Issue:** `isPlainObject` is defined and re-exported as `_isPlainObject` but is never called anywhere else in this file, and `grep` across `apps/dgfy-api/src` and `apps/dgfy-api/tests` shows no other importer. It appears to be leftover scaffolding (a near-identical private helper of the same name exists in `modules/compliance/usecases/complianceUseCases.js`, where it IS used).

**Fix:** Remove the unused `isPlainObject` function and its `_isPlainObject` export from this file, or wire it into an actual validation if one was intended (e.g. validating a structured `input` shape somewhere in this module).

### IN-02: Migration `down()`'s MySQL-guarded `DROP TYPE` statements are dead code (PostgreSQL-only syntax, silently swallowed)

**File:** `apps/dgfy-migration-runner/src/migrations/schema/20260715120000-create-availment-fulfillment.cjs:286-292`

**Issue:** The `down()` migration guards a block with `if (... .getDialect() === 'mysql')` and then issues five `DROP TYPE IF EXISTS enum_...` statements — but `DROP TYPE` is PostgreSQL syntax; MySQL has no equivalent statement and stores ENUMs inline on the column, not as a separate named type. Each call is wrapped in `.catch(() => {})`, so this block always silently no-ops on the only dialect it claims to target. This is copied verbatim from the same (pre-existing) pattern in several earlier migrations in this schema family, so it's not a regression introduced by this phase, but it's worth flagging since it reads as intentional MySQL cleanup and isn't.

**Fix:** Not urgent (harmless no-op), but either remove the dead block or fix the dialect check if any target dialect actually needs it.

### IN-03: `markPayout`'s client-supplied `paidAt` is not validated as a date

**File:** `apps/dgfy-api/src/modules/fulfillment/usecases/fulfillmentUseCases.js:332-361`

**Issue:** `buildMarkPayoutUseCase` accepts `paidAt` from the caller and passes `paidAt || new Date()` straight to `courierAssignmentRepository.updatePayout(...)` with no type/format check. A malformed value (e.g. an arbitrary string) will surface as a raw, unmapped Sequelize/DB error rather than a clean validation failure.

**Fix:**
```js
if (paidAt !== null && paidAt !== undefined && Number.isNaN(new Date(paidAt).getTime())) {
    return ApplicationResult.failure(validationError('paid_at must be a valid date.'));
}
```

---

_Reviewed: 2026-07-14T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
