---
phase: 10-storefront-discovery-online-ordering
plan: 07
subsystem: payments
tags: [availments, storefront, finalize, idempotency, sequelize-transaction, ADR-0029, STF-05]

# Dependency graph
requires:
  - phase: 10-storefront-discovery-online-ordering
    provides: "10-02's inventory stock-reservation capability (reserveStock/commitReservation/releaseReservation single-writer ports)"
provides:
  - "finalizeStorefrontOrder: a non-POS, idempotent, atomic finalize path that turns a paid/cash storefront order into a tenant Availment"
  - "availments.source_reference (nullable, UNIQUE per business) — cross-DB idempotency guard for the storefront finalize seam"
  - "payments.payment_reference (nullable) — external gateway reference (e.g. PayMongo pay_...) stored separately from the payment_method ENUM"
affects: [10-06-storefront-place-order, 10-08-storefront-webhook-finalize]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "finalizeStorefrontOrder bypasses withModel()'s blanket error-wrapping so a real sale-effect rollback reason is never masked as a generic 503"
    - "Idempotency via row-locked lookup + UNIQUE index belt-and-suspenders (lost-guard race resolved by catching SequelizeUniqueConstraintError and re-querying the winner)"

key-files:
  created:
    - apps/dgfy-migration-runner/src/migrations/schema/20260714103000-add-availment-source-reference.cjs
    - apps/dgfy-api/src/modules/availments/usecases/storefrontFinalizeUseCases.js
    - apps/dgfy-api/tests/availments/storefrontFinalize.test.js
    - apps/dgfy-migration-runner/tests/phase10AvailmentSourceReferenceSchema.test.js
    - .planning/phases/10-storefront-discovery-online-ordering/deferred-items.md
  modified:
    - apps/dgfy-api/src/models/Tenant/Availment.js
    - apps/dgfy-api/src/models/Tenant/Payment.js
    - apps/dgfy-api/src/modules/availments/repositories/availmentRepository.js
    - apps/dgfy-api/src/modules/availments/index.js
    - apps/dgfy-migration-runner/src/schemaContracts/dgfyBusinessContract.js

key-decisions:
  - "commitReservation is an OPTIONAL dependency of buildAvailmentsModule — finalizeStorefrontOrder is only exposed on useCases when it's injected, so existing composition roots (routes/index.js, finalizeLive.test.js) that don't yet wire inventory reservations are unaffected"
  - "finalizeStorefrontOrder does NOT persist fulfillmentMode/requestedFor onto the tenant Availment — no column exists, none was scoped by Task 1's migration, and the data is already durably owned by the landlord storefront_orders row; accepted as usecase inputs for interface completeness only"
  - "A4: QR Ph rail (PayMongo qrph/qr_ph) maps onto the existing payments.payment_method ENUM's 'gcash' value — no ENUM migration needed"
  - "payment_reference (new nullable column) stores the PayMongo pay_... id separately from payment_method, per T-10-07-04"

patterns-established:
  - "A repository method that must preserve a business-logic rollback reason should call resolveDatabaseName()/getModels() directly instead of withModel(), which re-wraps ANY non-whitelisted error as TenantDatabaseUnavailableError"

requirements-completed: [STF-05]

coverage:
  - id: D1
    description: "A storefront order finalizes into a tenant Availment WITHOUT an open shift, terminal, or cashier"
    requirement: "STF-05"
    verification:
      - kind: unit
        ref: "apps/dgfy-api/tests/availments/storefrontFinalize.test.js#AvailmentRepository.finalizeStorefrontOrder > creates a finalized Availment + AvailmentItem lines + Payment and commits the reservation on a fresh call"
        status: pass
    human_judgment: false
  - id: D2
    description: "Finalize creates the Availment with a customer_account_id cross-DB reference and a unique source_reference keyed to the landlord order"
    requirement: "STF-05"
    verification:
      - kind: unit
        ref: "apps/dgfy-api/tests/availments/storefrontFinalize.test.js#AvailmentRepository.finalizeStorefrontOrder > creates a finalized Availment + AvailmentItem lines + Payment and commits the reservation on a fresh call"
        status: pass
      - kind: unit
        ref: "apps/dgfy-migration-runner/tests/phase10AvailmentSourceReferenceSchema.test.js"
        status: pass
    human_judgment: false
  - id: D3
    description: "Finalize converts the stock reservation into a sale effect through modules/inventory in the SAME tenant transaction (ADR 0029), never a direct stock write"
    requirement: "STF-05"
    verification:
      - kind: unit
        ref: "apps/dgfy-api/tests/availments/storefrontFinalize.test.js#AvailmentRepository.finalizeStorefrontOrder > rolls back the entire transaction when the reservation commit fails — no Availment persisted"
        status: pass
    human_judgment: false
  - id: D4
    description: "Finalize is idempotent: a second call for the same landlord order reference is a no-op returning the existing Availment (row-lock + unique source_reference), including the lost-guard concurrent-race case"
    requirement: "STF-05"
    verification:
      - kind: unit
        ref: "apps/dgfy-api/tests/availments/storefrontFinalize.test.js#AvailmentRepository.finalizeStorefrontOrder > is idempotent: a second call for the same source_reference returns the existing Availment without a second stock deduction"
        status: pass
      - kind: unit
        ref: "apps/dgfy-api/tests/availments/storefrontFinalize.test.js#AvailmentRepository.finalizeStorefrontOrder > re-resolves a lost-guard unique-constraint race to the winner's existing row"
        status: pass
    human_judgment: false
  - id: D5
    description: "[ASSUMED A4/A5] documented and surfaced for product/compliance confirmation before this path goes live"
    verification: []
    human_judgment: true
    rationale: "A4 (QR Ph maps to gcash ENUM value) and A5 (storefront checkout does not go through pos.checkout compliance gate) are assumptions this plan explicitly flags for human confirmation with the compliance-policy owner — not something a test can prove correct in isolation."

# Metrics
duration: 35min
completed: 2026-07-13
status: complete
---

# Phase 10 Plan 07: Storefront Finalize Seam Summary

**`finalizeStorefrontOrder`: a non-POS, idempotent tenant-transaction path that turns a paid/cash storefront order into an Availment with a cross-DB customer reference, a UNIQUE `source_reference` guard, and reservation→sale conversion — the seam Phase 9's shift/terminal/cashier-gated `finalizeAvailment` structurally cannot serve.**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-07-13
- **Tasks:** 2
- **Files modified:** 9 (5 created, 4 modified) + 1 deferred-items log

## Accomplishments

- `availments.source_reference` (nullable, UNIQUE per business) added via an additive migration — the RESEARCH Pitfall 2 belt-and-suspenders guard so a lost-guard duplicate-finalize race collapses to one Availment row.
- `payments.payment_reference` (nullable) added in the same migration — stores an external gateway reference (PayMongo `pay_...`) separately from the `payment_method` ENUM, closing T-10-07-04 without an ENUM migration.
- `AvailmentRepository.finalizeStorefrontOrder`: one `sequelize.transaction` that (a) row-locks and returns an existing Availment for a known `source_reference` (idempotent no-op, no second stock deduction), (b) creates a finalized Availment with `customer_account_id` and NO shift/terminal/cashier fields, (c) creates `AvailmentItem` lines from the caller's snapshot, (d) invokes the injected `commitReservation` (10-02) single-writer port for the reservation→sale conversion, and (e) creates the `Payment` row — a failed/thrown reservation commit rolls back the WHOLE transaction.
- Lost-guard concurrent-race handling: if two calls both miss the row-locked lookup and both attempt an insert, the loser's `SequelizeUniqueConstraintError` is caught and re-resolved to the winner's existing row instead of surfacing a raw DB error.
- `buildFinalizeStorefrontOrderUseCase`: validates input, recomputes money server-side via `money.js` (rejects a caller-supplied `totalCentavos` mismatch), normalizes `paymentMethod` (including the QR Ph→`gcash` alias, A4), and delegates to the repository.
- Wired into `buildAvailmentsModule` as an OPTIONAL `commitReservation` dependency — `finalizeStorefrontOrder` is exposed on `useCases` only when it's injected, so existing composition roots are unaffected until 10-06/10-08 wire the port.
- Backfilled the `availments`/`payments` entries in `dgfyBusinessContract.js` (a pre-existing Phase 9 gap discovered during this task — see Deviations).

## Task Commits

Each task was committed atomically:

1. **Task 1: Add source_reference to tenant Availment (migration + model) for cross-DB idempotency** - `9b29f0cf` (feat)
2. **Task 2: finalizeStorefrontOrder repository method + usecase (non-POS, idempotent, reservation→sale)** - `381dccd8` (feat, tdd)

_Note: Task 2 was implemented test-first (RED assertions written against the not-yet-implemented repository/usecase, then GREEN implementation) but landed as a single commit alongside the passing GREEN state — the RED phase was iterated locally before commit, not committed separately, since the plan's own task boundary is "repository method + usecase" as one deliverable._

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified

- `apps/dgfy-migration-runner/src/migrations/schema/20260714103000-add-availment-source-reference.cjs` - Additive migration: `availments.source_reference` (nullable, UNIQUE) + `payments.payment_reference` (nullable)
- `apps/dgfy-api/src/models/Tenant/Availment.js` - Adds `source_reference` field + unique index
- `apps/dgfy-api/src/models/Tenant/Payment.js` - Adds `payment_reference` field
- `apps/dgfy-migration-runner/src/schemaContracts/dgfyBusinessContract.js` - Backfills `availments`/`payments` table entries (pre-existing Phase 9 gap) with the new columns included
- `apps/dgfy-migration-runner/tests/phase10AvailmentSourceReferenceSchema.test.js` - Structural contract assertions (9 tests)
- `apps/dgfy-api/src/modules/availments/repositories/availmentRepository.js` - Adds `finalizeStorefrontOrder`; `toPlain`/`toPlainPayment` now surface `source_reference`/`payment_reference`
- `apps/dgfy-api/src/modules/availments/usecases/storefrontFinalizeUseCases.js` - `buildFinalizeStorefrontOrderUseCase` + `normalizeStorefrontPaymentMethod`
- `apps/dgfy-api/src/modules/availments/index.js` - Wires `finalizeStorefrontOrder` into `buildAvailmentsModule` (optional `commitReservation` dep); exports the usecase/normalizer
- `apps/dgfy-api/tests/availments/storefrontFinalize.test.js` - 15 tests (repository transactional/idempotent/rollback behavior + usecase validation/delegation)
- `.planning/phases/10-storefront-discovery-online-ordering/deferred-items.md` - 3 out-of-scope discoveries logged (see below)

## Decisions Made

- **`commitReservation` is optional at `buildAvailmentsModule` construction time.** Making it required would have broken the two existing call sites (`routes/index.js`, `finalizeLive.test.js`) that don't yet wire inventory reservations. `finalizeStorefrontOrder` is simply omitted from `useCases` when the port isn't supplied; 10-06/10-08 will inject it.
- **`fulfillmentMode`/`requestedFor` are accepted as usecase inputs but NOT persisted onto the tenant Availment.** No column exists for them, Task 1's migration scope didn't add one, and the data is already durably owned by the landlord `storefront_orders` row (created in 10-01/10-06) — persisting it again on the tenant side would be redundant cross-DB duplication, not a missing feature.
- **A4 confirmed as designed:** the tenant `payments.payment_method` ENUM already supports `gcash`/`credit_card` (shipped in Phase 9) — no ENUM migration was needed. `normalizeStorefrontPaymentMethod` maps PayMongo's `qrph`/`qr_ph` naming onto `gcash`.
- **A5 (compliance gate) is surfaced, not resolved:** `finalizeStorefrontOrder` does NOT call `assertComplianceGate`/`pos.checkout` at all — it has no shift/terminal context to satisfy that gate's preconditions even if it wanted to. This is the plan's own explicit assumption (confirm with the compliance-policy owner before this path goes live) — not silently decided by this task.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added `payments.payment_reference` column (not in the plan's original file list)**
- **Found during:** Task 1 design (planning the Payment row shape for Task 2)
- **Issue:** The plan's own behavior text and threat register (T-10-07-04) require storing "the PayMongo pay-reference... in a reference field/metadata," but the `payments` table had no such column and no migration was scoped to add one.
- **Fix:** Extended Task 1's migration to also add a nullable `payments.payment_reference` STRING(191) column, and added it to the `Payment` Tenant model and the `payments` schema-contract entry.
- **Files modified:** `20260714103000-add-availment-source-reference.cjs`, `Payment.js`, `dgfyBusinessContract.js`
- **Verification:** `phase10AvailmentSourceReferenceSchema.test.js` (9/9 passing); `storefrontFinalize.test.js` asserts `payment_reference` round-trips through `finalizeStorefrontOrder`/`toPlainPayment`.
- **Committed in:** `9b29f0cf` (Task 1 commit)

**2. [Rule 2 - Missing Critical] Backfilled `dgfyBusinessContract.js`'s `availments`/`payments` table entries**
- **Found during:** Task 1 (adding `source_reference` "to the Availment Tenant model and the dgfyBusinessContract" per the plan — but no `availments` entry existed to add to)
- **Issue:** `09-01-SUMMARY.md` claims six table entries (availments, availment_items, availment_discounts, payments, receipts, compliance_evidence) were added to `dgfyBusinessContract.js` in Phase 9. `git log` shows no Phase 9 commit ever touched this file — the entries were apparently lost from an uncommitted working tree.
- **Fix:** Added the `availments` and `payments` entries (the two tables this plan's own migration touches), matching the actual columns/indexes/FKs the Phase 9 migration creates, plus the two new columns from this plan.
- **Files modified:** `dgfyBusinessContract.js`
- **Scope note:** The other four missing entries (`availment_items`, `availment_discounts`, `receipts`, `compliance_evidence`) are OUT of this task's scope (not tables this plan modifies) — logged in `deferred-items.md` rather than fixed here.
- **Committed in:** `9b29f0cf` (Task 1 commit)

**3. [Rule 1 - Bug] `finalizeStorefrontOrder` bypasses `withModel()`'s blanket error-wrapping**
- **Found during:** Task 2 (writing the "sale-effect failure rolls back" test — the assertion on the error message failed because `withModel()`'s catch-all was re-wrapping the deliberate "Reservation commit failed for source_reference..." `Error` into a generic `TenantDatabaseUnavailableError('unreachable', ...)`)
- **Issue:** `withModel()` re-wraps ANY non-whitelisted thrown error as `TenantDatabaseUnavailableError`, which is correct for genuine connectivity failures but would mask a real business-logic rollback reason (e.g. insufficient stock) behind a misleading 503 for `finalizeStorefrontOrder`.
- **Fix:** `finalizeStorefrontOrder` calls `resolveDatabaseName()` and `tenantConnector.getModels()` directly instead of going through `withModel()`. Genuine connectivity/registry failures (missing/provisioning/inactive/unverified) still propagate as `TenantDatabaseUnavailableError` from `resolveDatabaseName()` itself — only the blanket re-wrap of OTHER errors is skipped.
- **Files modified:** `availmentRepository.js`
- **Verification:** `storefrontFinalize.test.js`'s "rolls back the entire transaction when the reservation commit fails" test asserts the real error message, not a masked 503.
- **Committed in:** `381dccd8` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (2 missing-critical, 1 bug)
**Impact on plan:** All three were necessary for correctness — (1) and (3) are required for the plan's own explicit must-haves (pay-reference storage, accurate rollback reasons) to actually work; (2) is a minimal, scope-limited backfill of exactly the two tables this plan touches, not a general Phase 9 cleanup. No scope creep beyond what Task 1/2's own deliverables required.

## Issues Encountered

- **Discovered but NOT fixed (out of scope, logged in `deferred-items.md`):**
  1. `inventoryReservationUseCases.js` (Phase 10 Plan 02, already committed) calls `ApplicationResult.error(...)` on every failure path, but `ApplicationResult` only defines `static failure()` — every failure branch throws a `TypeError` instead of returning a graceful result. `finalizeStorefrontOrder`'s own error handling is unaffected (any thrown error from the injected `commitReservation` port still propagates and rolls back the transaction correctly — only the error *message* would be a confusing `TypeError` instead of the real reason). This will also affect 10-06/10-08, which inject the same broken usecase builders.
  2. Four of six Phase 9 tenant tables (`availment_items`, `availment_discounts`, `receipts`, `compliance_evidence`) are still missing from `dgfyBusinessContract.js` — only `availments`/`payments` were backfilled here (see Deviation #2).
  3. `finalizePersist()` (Phase 9, unmodified) has the same `withModel()` error-masking issue this plan's `finalizeStorefrontOrder` avoided — a POS sale-effect failure currently surfaces as a misleading 503 instead of the real reason. Not fixed here (Phase 9 code, out of this task's file scope).
- **Shared-working-tree race during commit:** this session ran against the actual git working tree/index (not an isolated worktree despite the dispatch prompt's `<parallel_execution>` claims — `.git` was a directory, not a file). Other concurrently-running wave agents (10-03, and what appears to be 10-05/10-08 work) staged files into the SAME shared git index during this session. The first `git commit` attempt failed a pre-commit architecture-guardrail check due to another agent's in-flight, not-yet-complete module (`commercePayments` missing `README.md`). Resolved by always committing with an explicit pathspec (`git commit -m "..." -- <files>`), which commits only the intended files regardless of what else is staged in the shared index, leaving other agents' staged work untouched for their own commits.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `finalizeStorefrontOrder` is exported from the availments module (`buildAvailmentsModule({ ..., commitReservation }).useCases.finalizeStorefrontOrder`) and ready for 10-06 (cash/COD immediate-finalize branch) and 10-08 (`payment.paid` webhook finalize) to inject `commitReservation` (from `buildInventoryModule().reservationPorts.commitReservation`) and call directly.
- 10-06/10-08 should be aware of the deferred `ApplicationResult.error` bug in `inventoryReservationUseCases.js` (Issue #1 above) — it does not block their integration (rollback still happens correctly) but will surface confusing `TypeError` messages instead of real reservation-failure reasons until fixed.
- A4/A5 assumptions need product/compliance-policy-owner confirmation before this path goes live (per the plan's own Open Q2 and A4/A5 flags) — not a code blocker, a sign-off item.

---
*Phase: 10-storefront-discovery-online-ordering*
*Completed: 2026-07-13*

## Self-Check: PASSED

All 11 claimed files verified present on disk; both commits (`9b29f0cf`, `381dccd8`) verified present in git history. Full relevant test suites re-run clean: `apps/dgfy-api` (`tests/availments`, `tests/unit/modules/availments`, `tests/integration/availments`, `tests/inventory` — 117 passed, 2 live-DB-gated skipped) and `apps/dgfy-migration-runner` (330 passed, 9 live-DB-gated skipped, 0 failed). `check:architecture:dgfy-api` passing. No `backend/` writes, no new dependency.
