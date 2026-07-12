---
phase: 08-commerce-foundation-product-catalog-booking-shift-cash-drawe
verified: 2026-07-12T14:30:28Z
status: gaps_found
score: 5/7 must-haves verified
behavior_unverified: 2
overrides_applied: 0
gaps:
  - truth: "FSC-01: A tenant/branch carries exactly one compliance_mode_state row per (business_id, branch_id) — the D-01/D-02 tenant-scoped state invariant."
    status: failed
    reason: "ComplianceModeStateRepository.upsertState() (and recordVerification()) is a plain findOne()-then-create()/update() with no transaction, no SELECT ... FOR UPDATE, and no findOrCreate() retry — a classic TOCTOU race. Worse, the DB-level unique index the code relies on as a backstop (unique_compliance_mode_state_business_branch on (business_id, branch_id)) cannot enforce the invariant at all for the branch_id IS NULL case (the common 'business-wide, no branch scope' case), because MySQL treats every NULL in a unique index as distinct. Concurrent evidence submissions for the same business with branch_id=null will both succeed and insert two rows, after which getForBusinessBranch()/assertComplianceGate() (both plain findOne()) return whichever row MySQL happens to return first — the compliance gate can then non-deterministically flip between different states across requests for the same business. This is CR-01 in 08-REVIEW.md (Critical/Blocker severity); confirmed directly in complianceModeStateRepository.js:155-187 and the migration's unique index definition."
    artifacts:
      - path: "apps/dgfy-api/src/modules/compliance/repositories/complianceModeStateRepository.js"
        issue: "upsertState()/recordVerification() use unguarded findOne()-then-create()/update(); no transaction or findOrCreate() retry-on-conflict."
      - path: "apps/dgfy-migration-runner/src/migrations/schema/20260712100000-create-commerce-foundation.cjs"
        issue: "unique_compliance_mode_state_business_branch is a plain unique index on (business_id, branch_id); MySQL NULL-uniqueness semantics mean it does not back the invariant when branch_id IS NULL."
    missing:
      - "A deterministic key MySQL can actually enforce for the 'no branch' case (e.g. branch_id sentinel 0 instead of NULL, or a functional unique index on COALESCE(branch_id, 0))."
      - "An atomic write path (transaction with SELECT ... FOR UPDATE, or Sequelize findOrCreate()) instead of the current plain findOne()-then-create()/update()."
      - "Duck-typed unique-constraint-violation handling mapped to a clean 409 DomainError, mirroring shiftRepository.js's isUniqueConstraintViolation() pattern, instead of falling through to a misleading TenantDatabaseUnavailableError('unreachable') 503."
  - truth: "FSC-02: The single shared compliance gate port (assertComplianceGate) actually evaluates eligibility against the full evidence-derived readiness checklist it documents itself as enforcing, not duplicated/weakened per surface."
    status: failed
    reason: "evaluateComplianceChecklist() computes seven evidence-derived readiness signals (fiscalAccumulatorStreamReady, auditLogAppendOnlyEnforced, paymentHandoffPolicyReady, encryptionPolicyPrerequisitesReady, submissionArtifactsReady, rmoFilingReadinessReady, fiscalTerminalRegistrationReady), but evaluateComplianceDecision()'s compliant_active branch for POS/receipt operations (policyEngine.js:945-1012, confirmed by direct read) only consults profile_complete/settings_complete/artifacts_complete/peripherals_complete before returning ALLOW — none of the seven signals above (including RMO 24-2023 filing and fiscal terminal registration, each with a dedicated COMPLIANCE_REASON_CODE) gate the decision. This directly contradicts complianceGate.js's own header comment, which claims the gate 'correctly falls through ... rather than the gate silently assuming completeness' for exactly these signals — a compliant_active business with a never-verified fiscal terminal or incomplete RMO filing evidence still gets ALLOW for POS_CHECKOUT. This is CR-02 in 08-REVIEW.md (Critical/Blocker severity). The D-05 deviation itself (compliant_active allows both fiscal and non_fiscal) IS correctly implemented and IS proven by a passing dedicated regression test (complianceGate.test.js) — the gap is specifically in the unconsulted evidence-derived checklist signals, not in the D-05 behavior."
    artifacts:
      - path: "apps/dgfy-api/src/modules/compliance/policy/policyEngine.js"
        issue: "evaluateComplianceDecision()'s compliant_active POS-operation branch (lines ~945-1012) never reads fiscalAccumulatorStreamReady/auditLogAppendOnlyEnforced/paymentHandoffPolicyReady/encryptionPolicyPrerequisitesReady/rmoFilingReadinessReady/fiscalTerminalRegistrationReady from the checklist it computes."
      - path: "apps/dgfy-api/src/modules/compliance/usecases/complianceGate.js"
        issue: "Header comment (lines ~24-29) asserts a completeness guarantee the gate's decision branch does not actually implement."
    missing:
      - "Either add the missing evidence-derived checks to the compliant_active POS-operation decision branch (mapping each to its own REQUIRES_SETUP/DENY + reason code), or correct complianceGate.js's header comment to not claim a guarantee the code doesn't provide, plus an explicit tracked TODO and a regression test pinning the current (narrower) behavior so it can't silently regress further."
behavior_unverified_items:
  - truth: "PRD-04/SFT-03: An UPDATE or DELETE against any inventory_movements or cash_drawer_events row is rejected at the database layer with SQLSTATE 45000 (BEFORE UPDATE/DELETE triggers)."
    test: "Run the 08-01 migration against a real dgfy_business_* tenant database, then attempt a raw UPDATE and DELETE against an inventory_movements row and a cash_drawer_events row; confirm both are rejected with SQLSTATE 45000."
    why_human: "The trigger SQL is present in the migration (CREATE TRIGGER ... SIGNAL SQLSTATE '45000', with DROP TRIGGER IF EXISTS idempotency) and the app-layer repositories/models independently refuse to expose update/delete paths, but firing the actual MySQL trigger requires a live MySQL instance, which is not reachable in this environment. No unit test in this repo executes DDL/trigger SQL against a real database (08-REVIEW.md WR-06 notes the new migration has no dedicated unit-level test coverage at all, even mocked)."
  - truth: "SFT-01/BOK-02: A second concurrent write for the same (terminal_id, cashier_account_id) shift-open, and N simultaneous createBooking calls against a capacity-1 slot, are rejected by real DB-level constraints/atomic UPDATEs under real concurrency (no oversell, no duplicate open shift)."
    test: "Run shiftRepository.openShift() twice concurrently against a real tenant DB for the same (terminal_id, cashier_account_id) and confirm the second is rejected via the active_terminal_cashier_key unique index; run apps/dgfy-api/tests/integration/booking/bookingCapacity.test.js with RUN_BOOKING_CAPACITY_INTEGRATION=true against real MySQL and confirm exactly 1 success with no oversell."
    why_human: "The application-layer mapping (isUniqueConstraintViolation -> DuplicateOpenShiftError -> 409; BookingCapacityFullError on affectedRows!==1) is unit-tested, and the atomic-guarded-UPDATE code pattern for booking capacity is correctly structured (single UPDATE ... WHERE slots_remaining >= 1 inside a transaction, matching Pitfall 3 guidance) — but the only test that exercises real MySQL concurrency (bookingCapacity.test.js) is gated behind RUN_BOOKING_CAPACITY_INTEGRATION=true and skips cleanly by default; no live MySQL instance is reachable in this environment to run it. The booking unit test's 'N simultaneous' case uses a mocked repository with a JS-level counter, which proves usecase-layer logic but not the real DB race condition."
human_verification:
  - test: "Run the 08-01 migration against a real dgfy_business_* tenant, then run the migration-runner `verify` command and confirm ok:true with rejected_tables_present empty, even though products/shifts now exist."
    expected: "verify returns ok:true; the 8 new tables appear in the tenant schema; stock_movements/items/PosTransactionLine remain absent/rejected."
    why_human: "Requires a live MySQL instance; not reachable in this environment. Migration code and schema-contract code are both statically verified as correct/consistent (read directly), but the runtime `schema`/`verify` CLI round-trip against a real tenant DB is unexercised here."
  - test: "Attempt a raw SQL UPDATE/DELETE against an inventory_movements row and a cash_drawer_events row on a real tenant DB."
    expected: "Both operations fail with SQLSTATE 45000 (the BEFORE UPDATE/DELETE triggers fire)."
    why_human: "See behavior_unverified_items above — no live MySQL available; no unit test in this repo exercises the raw trigger SQL (08-REVIEW.md WR-06)."
  - test: "Open two shifts concurrently for the same (terminal_id, cashier_account_id) against a real tenant DB; run bookingCapacity.test.js with RUN_BOOKING_CAPACITY_INTEGRATION=true against real MySQL."
    expected: "The second concurrent shift-open is rejected by the DB unique index (mapped to a 409); the booking concurrency test shows exactly 1 success and N-1 clean 409 conflicts with no oversell."
    why_human: "See behavior_unverified_items above — real concurrency against a live database cannot be proven by a mocked-repository unit test alone; no live MySQL available in this environment."
---

# Phase 8: Commerce Foundation — Product Catalog, Booking, Shift & Cash Drawer, Compliance Gating Verification Report

**Phase Goal:** Build the Commerce Foundation domain beside legacy — Product Catalog (Food/Service/Retail, stock/non-stock, folders, Basic Inventory), Booking (bookable Services, branch-level capacity), Shift & Cash Drawer (open/close, cash-drawer auditing, reconciliation), and Fiscal/Compliance (policy-engine gate) — as 5 Clean-Architecture modules (products, inventory, shifts, compliance, booking) on top of a new tenant-schema foundation (8 tables + DB-enforced invariants) and 8 Sequelize Tenant models, all wired into the dgfy-api composition root.

**Verified:** 2026-07-12T14:30:28Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1/PRD-01,02,03,05: Business owner can create a Product (food/service/retail), group into folders, choose basic_inventory/non_stock, on genuinely new `dgfy_business_*` tables, never FK'd to legacy `items`/`PosTransactionLine` | ✓ VERIFIED | Migration creates `products`/`product_folders` with the exact columns (category ENUM, inventory_mode ENUM, no `stock_effect_type` per D-07); schema contract updated (products/shifts removed from rejectedTables, `stock_movements` kept rejected); `productUseCases.test.js` (16 tests) passes proving category/inventory_mode validation, folder uniqueness, owner-gating; `git log` across the full phase commit range (`5e50af37^..HEAD`) shows zero `backend/` file touches. |
| 2 | SC2/PRD-04: Every stock-count change is recorded as an append-only Inventory Movement row that cannot be mutated after insert | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | App-layer fully present: `InventoryMovementRepository` exposes only `create/bulkCreate/findAll/findOne` (grepped — no update/delete); `InventoryMovement`/`CashDrawerEvent` models define `beforeUpdate`/`beforeBulkUpdate` hooks that throw and have no `updated_at` column; `inventoryMovementUseCases.test.js` (11 tests) passes, including the transactional stock-sync path. The actual DB-layer backstop (`BEFORE UPDATE`/`BEFORE DELETE` trigger, `SIGNAL SQLSTATE '45000'`) is present in the migration but unexercised — no live MySQL reachable, and no unit test in this repo runs the trigger SQL (08-REVIEW.md WR-06). See human_verification. |
| 3 | SC3/BOK-01,02,03: Business owner can mark a Service Product bookable (slot duration + branch-level concurrent capacity); Booking blocks once capacity is reached; cancel releases the slot; a Booking carries a reserved link to its fulfilling Availment | ✓ VERIFIED (code+test), with a real-concurrency caveat | `bookingRepository.createBooking()` uses a single atomic guarded `UPDATE ... WHERE slots_remaining >= 1` inside the same transaction as the booking insert (`affectedRows !== 1` throws `BookingCapacityFullError` before any row is written) — read directly, matches Pitfall 3 guidance exactly; `cancelBooking()` mirrors `+1` in the same transaction with a `BookingAlreadyCancelledError` guard against double-release; `availment_id` is a reserved nullable INTEGER column with no FK (BOK-03); `bookingUseCases.test.js` (13 tests, including staff/owner+consumer dual-auth cancel and a mocked 5-way concurrent create test) and `commerceModulesMount.test.js` pass. The mocked concurrency test proves usecase-layer logic, not a real DB race; the one test that does prove real-MySQL non-oversell (`bookingCapacity.test.js`) is opt-in (`RUN_BOOKING_CAPACITY_INTEGRATION=true`) and not run in this environment — see behavior_unverified_items. |
| 4 | SC4/SFT-01,02,03: Staff can open a shift with a declared float (one open shift per cashier+terminal, DB-enforced), close it with a computed Expected-vs-Actual signed Difference, and every cash-drawer event (incl. no-sale pop) is logged; stale shifts flagged (never auto-closed), threshold operator-configurable | ✓ VERIFIED (code+test), with a real-DB caveat | Migration adds the `active_terminal_cashier_key` `GENERATED ALWAYS AS (...) STORED` column + unique index exactly per D-12/D-13; `shiftRepository.js` has a dedicated `isUniqueConstraintViolation()` duck-type that maps the raw unique-index violation to a clean `DuplicateOpenShiftError` (409) — confirmed by direct read, in contrast to compliance's unguarded path (see gap below); `cash_drawer_events` is append-only (no update/delete exposed, throwing model hooks); `staleThresholdMinutes` is read from `process.env.SHIFT_STALE_THRESHOLD_MINUTES` in `routes/index.js` (not hardcoded), and `buildListShiftsUseCase` flags-but-never-auto-closes stale shifts; `shiftUseCases.test.js` (19 tests) passes, covering the 409 mapping, reconciliation formula shape (all Phase-9 inputs at 0 this phase), and stale-flag behavior. The real DB unique-index firing under concurrent writes is unexercised — no live MySQL — see human_verification. |
| 5 | SC5/FSC-01: A tenant/branch carries exactly one `compliance_mode_state` row per (business_id, branch_id), reflecting the D-01/D-02 3-state model with full policy-pack depth | ✗ FAILED | `ComplianceModeStateRepository.upsertState()`/`recordVerification()` (read directly, lines 155-187) use a plain `findOne()`-then-`create()`/`update()` with no transaction, no `SELECT ... FOR UPDATE`, no `findOrCreate()` — a TOCTOU race. The DB unique index on `(business_id, branch_id)` (confirmed in the migration) cannot back the invariant at all for `branch_id IS NULL` (the common no-branch-scope case), since MySQL treats every `NULL` as distinct in a unique index — concurrent evidence submissions can silently create duplicate rows. This is CR-01 in 08-REVIEW.md (Critical). See gaps. |
| 6 | SC5/FSC-02: Checkout/Shift/receipt-issuance are gated through one shared compliance policy-engine gate port that actually enforces the paperwork-readiness signals it computes and documents | ✗ FAILED | The gate port exists (`assertComplianceGate({businessId, operation, requestedDocumentContext})`) and the specific D-05 deviation (`compliant_active` allows BOTH `fiscal` and `non_fiscal`, no `DOCUMENT_CONTEXT_NOT_ALLOWED` branch) is correctly implemented and proven by a passing dedicated regression test (`complianceGate.test.js`, 6/6 tests, including "the ported engine source contains no DOCUMENT_CONTEXT_NOT_ALLOWED deny path"). However, `evaluateComplianceDecision()`'s `compliant_active` branch (confirmed by direct read, `policyEngine.js:945-1012`) never consults 5 of 7 evidence-derived checklist signals (`rmoFilingReadinessReady`, `fiscalTerminalRegistrationReady`, `auditLogAppendOnlyEnforced`, `paymentHandoffPolicyReady`, `encryptionPolicyPrerequisitesReady`) before returning ALLOW — directly contradicting `complianceGate.js`'s own header comment claiming full checklist enforcement. This is CR-02 in 08-REVIEW.md (Critical). See gaps. |
| 7 | Composition-root wiring: all 5 commerce modules built with the SAME shared `tenantConnector`/`businessRepository`/`businessDatabaseRegistryRepository`, mounted under `/products`, `/inventory`, `/bookings`, `/shifts`, `/compliance` behind `authenticateAccount`; booking receives `productRepository` + inventory's `effectContracts`; shifts receives `assertComplianceGate` injected-but-unwired | ✓ VERIFIED | `routes/index.js` read directly: businesses module built first, its `tenantConnector`/`businessDatabaseRegistryRepository`/`businessRepository` instances are the exact same objects passed into all 5 `buildXModule()` calls (no second/divergent instance); all 5 route groups mounted with `authenticateAccount`; `assertComplianceGate` is passed into `buildShiftsModule` with an explicit comment "Do NOT invoke this gate from shift-open here" (matches the prohibition). `commerceModulesMount.test.js` (6/6) and the full `dgfy-api` suite (239/239 non-skipped tests, 19/36 suites run — remainder are pre-existing opt-in integration suites) pass. |

**Score:** 5/7 truths verified (2 present, behavior-unverified — see human_verification; 2 of the above 7 rows are FAILED gaps, not counted toward either verified or behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/dgfy-migration-runner/src/migrations/schema/20260712100000-create-commerce-foundation.cjs` | 8 new tenant tables + append-only triggers + one-open-shift generated column | ✓ VERIFIED | All 8 tables present with correct columns/ENUMs/indexes; triggers and generated column present and idempotent (DROP-IF-EXISTS / describeTable guards). |
| `apps/dgfy-migration-runner/src/schemaContracts/dgfyBusinessContract.js` | Updated contract accepting the 8 new tables, `stock_movements` still rejected | ✓ VERIFIED | Confirmed: `products`/`shifts` removed from `rejectedTables`; all 8 tables added to `tables{}` with matching columns/indexes/FKs; `stock_movements` remains rejected. |
| 8 files under `apps/dgfy-api/src/models/Tenant/` | Product, ProductFolder, InventoryMovement, Booking, BookingCapacity, Shift, CashDrawerEvent, ComplianceModeState | ✓ VERIFIED | All 8 files exist; registered in `tenantConnector.js`'s `modelDefiners` map. |
| `modules/products/`, `modules/inventory/`, `modules/booking/`, `modules/shifts/`, `modules/compliance/` | 5 complete Clean-Architecture modules (routes/controllers/usecases/repositories/entities) | ✓ VERIFIED (structure), ✗ FAILED (2 internal correctness gaps in compliance) | All layering present and consistent with `modules/businesses` shape; compliance module has the two Critical defects (CR-01/CR-02) documented above. |
| `apps/dgfy-api/src/routes/index.js` (composition root) | All 5 modules built/mounted, reusing shared instances | ✓ VERIFIED | Confirmed by direct read + passing `commerceModulesMount.test.js`. |
| Unit test files (5) + integration tests (2) | productUseCases, inventoryMovementUseCases, shiftUseCases, bookingUseCases, complianceGate unit tests; commerceModulesMount + bookingCapacity integration tests | ✓ VERIFIED (exist, run, pass) | 73/73 module unit tests + 6/6 mount integration test pass in this environment; `bookingCapacity.test.js` exists but is opt-in (`RUN_BOOKING_CAPACITY_INTEGRATION=true`) and skips cleanly without a live MySQL instance. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `routes/index.js` | 5 `buildXModule()` factories | shared `tenantConnector`/`businessRepository`/`businessDatabaseRegistryRepository` injection | ✓ WIRED | Confirmed by direct read — no second/divergent instance constructed. |
| `bookingRepository` | `Booking` + `BookingCapacity` models | `TenantConnector.getModels()`; atomic guard + insert share one `sequelize.transaction()` | ✓ WIRED | Confirmed by direct read of `createBooking()`/`cancelBooking()`. |
| `shiftRepository` | raw MySQL unique-index violation on `active_terminal_cashier_key` | `isUniqueConstraintViolation()` duck-type -> `DuplicateOpenShiftError` (409) | ✓ WIRED | Confirmed present; contrast with compliance's unguarded path (gap). |
| `complianceModeStateRepository` | `compliance_mode_state` table | `findOne()`-then-`create()`/`update()` (no atomic guard) | ✗ NOT_WIRED (atomically) | CR-01 — see gaps. |
| `assertComplianceGate` | `evaluateComplianceDecision()` | ported policy engine, `compliant_active` branch | ⚠️ PARTIAL | Port is wired and callable (D-05 deviation correct), but the decision branch does not consult most of its own computed checklist signals — CR-02, see gaps. |
| `shifts` module | `assertComplianceGate` | injected via `buildShiftsModule({ assertComplianceGate })`, NOT invoked | ✓ WIRED (as designed) | Confirmed: available for injection, not called this phase, matching the explicit prohibition. |

### Data-Flow Trace (Level 4)

Not applicable in the traditional sense (no frontend/UI in this phase) — data flow was instead traced through the transactional write paths above (booking capacity guard, inventory stock-sync, shift reconciliation), all confirmed to read/write real DB-backed Sequelize models via `TenantConnector.getModels()`, not static/hardcoded values.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All 5 module unit test suites pass | `jest tests/unit/modules/{products,compliance,shifts,booking,inventory}/*.test.js` | 73/73 tests passed | ✓ PASS |
| Commerce composition-root mount smoke test | `jest tests/integration/commerce/commerceModulesMount.test.js` | 6/6 tests passed (all 5 routes return 401 not 404 when unauthenticated) | ✓ PASS |
| Full dgfy-api test suite (regression check) | `jest` (full run) | 239/239 non-skipped tests passed, 19/36 suites run (remainder pre-existing opt-in integration suites) | ✓ PASS |
| Full migration-runner test suite (regression check) | `jest` (full run) | 308/308 non-skipped tests passed, 23/26 suites run | ✓ PASS |
| D-05 compliance regression test | `jest tests/unit/modules/compliance/complianceGate.test.js` | 6/6 tests passed, including explicit "no DOCUMENT_CONTEXT_NOT_ALLOWED deny path" assertion | ✓ PASS |
| Real-MySQL booking-capacity concurrency proof | `RUN_BOOKING_CAPACITY_INTEGRATION=true jest tests/integration/booking/bookingCapacity.test.js` | Not run — no live MySQL reachable in this environment | ? SKIP |
| Dedicated unit test for the new commerce-foundation migration file | `jest tests/dgfyBusinessSchema.test.js` | 24/24 tests passed, but confirmed (via grep) none reference `20260712100000-create-commerce-foundation.cjs` | ✓ PASS (existing suite), ⚠️ gap noted (WR-06, not a new finding) |

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes found and none declared in this phase's PLAN/SUMMARY files. Skipped — no probes to run.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| PRD-01 | 08-03 | Product category (food/service/retail) on Product | ✓ SATISFIED | Migration + model + passing unit tests. |
| PRD-02 | 08-03 | Basic Inventory vs. non-stock per Product; per-line `stock_effect_type` deferred to Phase 9 | ✓ SATISFIED | `inventory_mode` ENUM present; no `stock_effect_type` on Product (D-07 honored, confirmed). |
| PRD-03 | 08-03 | Group Products into folders | ✓ SATISFIED | `product_folders` table + module; flat (no `parent_id`) confirmed by direct grep of model/migration. |
| PRD-04 | 08-01/08-04 | Append-only Inventory Movement ledger | ✓ SATISFIED (app layer); ⚠️ DB-trigger unexercised | See truth #2 above. |
| PRD-05 | 08-01 | Genuinely new `dgfy_business_*` tables, never FK'd to legacy `items`/`PosTransactionLine` | ✓ SATISFIED | Confirmed via migration read + `rejectedTables` contract + zero `backend/` writes across the full phase commit range. |
| BOK-01 | 08-03 | Mark a Service Product bookable with slot duration + branch capacity | ✓ SATISFIED | `is_bookable`/`slot_duration_minutes`/`concurrent_capacity` columns + `buildSetProductBookableUseCase`, unit-tested. |
| BOK-02 | 08-07 | Booking blocks once branch capacity reached, no individual staff calendar | ✓ SATISFIED (code+test); ⚠️ real-concurrency proof unexercised | See truth #3 above. |
| BOK-03 | 08-07 | Fulfilled Booking links to the Availment that completes it | ✓ SATISFIED | Reserved nullable `availment_id`, no FK (Phase 9 owns Availment). |
| SFT-01 | 08-01/08-05 | One open shift per cashier+terminal, DB-level enforced | ✓ SATISFIED (code+test); ⚠️ real DB-constraint firing unexercised | See truth #4 above. |
| SFT-02 | 08-05 | Close shift with computed Expected-vs-Actual signed Difference | ✓ SATISFIED | Reconciliation formula shape anticipates Phase 9 inputs (all zero this phase); unit-tested. |
| SFT-03 | 08-01/08-05 | Every cash-drawer event (incl. no-sale pop) logged, append-only | ✓ SATISFIED (app layer); ⚠️ DB-trigger unexercised | See truth #2/#4 above. |
| FSC-01 | 08-02/08-06 | Tenant/branch compliance-mode state | ✗ BLOCKED | CR-01 — see gaps. |
| FSC-02 | 08-06/08-08 | One shared compliance gate port, not duplicated per surface | ✗ BLOCKED | CR-02 — see gaps. Note: the D-05 deviation itself (the phase's single most important decision) IS correctly implemented and tested; the gap is in the checklist-enforcement completeness the gate's own documentation claims. |

No orphaned requirements found — all 13 IDs (PRD-01..05, BOK-01..03, SFT-01..03, FSC-01..02) declared across the 8 plans match REQUIREMENTS.md's Phase 8 mapping exactly.

### Anti-Patterns Found

No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers, and no "not yet implemented"/"coming soon" strings found in any of the 65 files modified across the phase's full commit range (`5e50af37^..HEAD`). The reserved/unwired `inventoryEffectContracts.js` functions throw a documented, typed `DomainError` (501, `RESERVED_EFFECT_NOT_IMPLEMENTED`) rather than a bare stub — this is an intentional, documented contract-reservation pattern (D-06), not a stub anti-pattern.

The following WARNING/INFO-level findings from 08-REVIEW.md are confirmed present by this verification's own direct reads but are not re-listed as new gaps (per instructions) — they do not block the phase's core truths, unlike CR-01/CR-02:

| File | Finding | Severity | Impact |
|------|---------|----------|--------|
| `productUseCases.js`, `productFolderUseCases.js`, `inventoryMovementUseCases.js`, `shiftUseCases.js`, `complianceUseCases.js` | `guardBusinessAccess` fails open when `requestingAccountId` is falsy (WR-01) | Warning | Not reachable via current HTTP API (all controllers always supply `req.account.id`); a future direct/internal caller could bypass authorization. |
| `shiftRepository.js` and 6 sibling repositories | `withModel`/`withModels` maps every uncaught error (incl. FK/validation errors) to a misleading 503 (WR-02) | Warning | Client-caused errors surfaced as "database unreachable" instead of 400/404. |
| `productRepository.js`, `productFolderRepository.js`, `bookingRepository.js` | Single-row lookups (`findByPk`) not scoped by `business_id`, unlike sibling repositories (WR-03) | Warning | Relies solely on 1-DB-per-business; confirmed present by direct grep. |
| `shiftUseCases.js` | `openShift` doesn't pre-validate `cashierAccountId`/`terminalId` existence before the FK-constrained INSERT (WR-04) | Warning | Combines with WR-02 to surface a 503 instead of 400/404 for a bad ID. |
| `bookingRepository.js` | `cancelBooking()`'s `+1` capacity release has no upper bound against the slot's original capacity (WR-05) | Warning | Not reachable today under the single-writer contract; a future double-cancel path could silently exceed capacity. |
| `20260712100000-create-commerce-foundation.cjs` | No dedicated (even mocked) unit test for the new migration (WR-06) | Warning | Confirmed: `dgfyBusinessSchema.test.js` (24/24 passing) never references this migration file. |

### Human Verification Required

1. **Verify command against a real tenant DB**
   **Test:** Run the 08-01 migration against a real `dgfy_business_*` tenant, then run `verify`.
   **Expected:** `ok:true`, `rejected_tables_present` empty, 8 new tables present.
   **Why human:** No live MySQL reachable in this environment.

2. **Append-only trigger firing**
   **Test:** Attempt a raw SQL UPDATE/DELETE against an `inventory_movements` row and a `cash_drawer_events` row.
   **Expected:** Both rejected with SQLSTATE 45000.
   **Why human:** No live MySQL reachable; no unit test in this repo exercises the trigger SQL (WR-06).

3. **One-open-shift and booking-capacity real concurrency**
   **Test:** Open two shifts concurrently for the same (terminal_id, cashier_account_id); run `bookingCapacity.test.js` with `RUN_BOOKING_CAPACITY_INTEGRATION=true` against real MySQL.
   **Expected:** Second shift-open rejected via the unique index (409); booking test shows exactly 1 success, N-1 clean 409s, no oversell.
   **Why human:** Mocked-repository tests prove usecase-layer logic only, not real DB race conditions; no live MySQL available here.

### Gaps Summary

Of the 7 top-level truths verified, 5 are fully or code/test-verified (2 of those 5 carry a real-DB caveat routed to human verification, per this environment's lack of a live MySQL instance — consistent with this project's established Phase 4 precedent). The remaining 2 are genuine failures, both already surfaced at Critical/Blocker severity in 08-REVIEW.md and independently confirmed here by direct code reads:

1. **CR-01 (FSC-01):** The compliance-mode-state write path has a TOCTOU race, and the DB unique index cannot back the "one row per business/branch" invariant at all when `branch_id IS NULL` — the common case. Concurrent evidence submissions can silently create duplicate state rows, after which the compliance gate's read path can non-deterministically flip between different states for the same business.
2. **CR-02 (FSC-02):** The compliant_active gate branch ignores 5 of 7 evidence-derived readiness signals it itself computes, directly contradicting its own documented guarantee. The D-05 deviation (the phase's single most important, explicitly user-confirmed decision) is correctly implemented and proven by a passing dedicated test — the gap is specifically in checklist-enforcement completeness, not in the Omni/Fiscal behavior D-05 mandated.

Both gaps sit in the compliance module (08-06-PLAN.md) and share a common root cause pattern: the compliance module's write-path and decision-path were built to the documented shape but did not receive the same atomic-guard/full-checklist rigor applied elsewhere in this phase (booking's atomic UPDATE, shifts' duck-typed unique-constraint mapping). A closure plan for 08-06 should address both CR-01 and CR-02 together, since they are both isolated to `modules/compliance` and were already scoped and given concrete fixes in 08-REVIEW.md.

All other modules (products, inventory, booking, shifts, and the composition root) show no Critical-level gaps and are backed by passing unit/integration tests plus direct code confirmation of their key must-haves.

---

_Verified: 2026-07-12T14:30:28Z_
_Verifier: Claude (gsd-verifier)_
