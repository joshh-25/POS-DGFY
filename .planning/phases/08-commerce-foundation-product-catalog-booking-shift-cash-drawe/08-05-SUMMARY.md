---
phase: 08-commerce-foundation-product-catalog-booking-shift-cash-drawe
plan: 05
subsystem: api
tags: [sequelize, mysql, tenant-connector, clean-architecture, cash-reconciliation, append-only-ledger, generated-column]

requires:
  - phase: 08-commerce-foundation-product-catalog-booking-shift-cash-drawe
    provides: "08-02's Shift/CashDrawerEvent Tenant model factories (with Shift.isOpen() and the DB-generated active_terminal_cashier_key unique index already registered) and TenantConnector.getModels() resolution for both models"
provides:
  - "modules/shifts: buildShiftsModule({ tenantConnector, businessDatabaseRegistryRepository, businessRepository, staleThresholdMinutes?, assertComplianceGate? }) -> { repository, cashDrawerEventRepository, useCases }"
  - "shiftRepository.openShift(): DB-generated-column one-open-shift invariant (D-12) mapped to a clean 409 (DuplicateOpenShiftError), never a raw 500"
  - "shiftRepository.closeShift(): persists a usecase-computed Expected-vs-Actual reconciliation (opening float + Phase-9 sales/refund/payin/payout inputs, all 0 this phase) and signed cash_variance_amount, in one transaction with the 'close' cash-drawer event"
  - "cashDrawerEventRepository: append-only (create/findAll/findOne only) cash-drawer ledger, logging open/close/no_sale_pop events; joins a caller-supplied transaction via an optional {transaction} option"
  - "createShiftRoutes(useCases, { authenticateAccount }): POST /shifts, POST /shifts/:id/close, POST /shifts/:id/no-sale-pop, GET /shifts"
  - "ShiftEntity.isOpen()/isStale(thresholdMinutes) domain helpers; listShifts usecase flags stale shifts (D-11) without ever auto-closing them"
affects: [08-08]

tech-stack:
  added: []
  patterns:
    - "Reconciliation formula shaped to accept Phase-9 inputs without restructuring: computeExpectedCash({openingFloatAmount, salesCash=0, refundsCash=0, payIns=0, payOuts=0}) — exported as a pure, independently-testable usecase-layer helper (shiftUseCases.js), not embedded in the repository"
    - "Repository-level DB-unique-constraint-violation duck-typing (isUniqueConstraintViolation: checks error.name==='SequelizeUniqueConstraintError' plus raw MySQL ER_DUP_ENTRY/errno 1062 on error.original/error.parent) mapped to a named domain-shaped error (DuplicateOpenShiftError) the usecase layer duck-types on by .name, mirroring the existing TenantDatabaseUnavailableError convention"
    - "A dedicated append-only collaborator repository (CashDrawerEventRepository) is injected into the owning repository (ShiftRepository) rather than that repository writing the ledger table directly — the owning repository's transaction is shared into the collaborator's create() via an optional {transaction} parameter so both writes commit/rollback atomically"
    - "Operator-configurable threshold resolution lives at the module composition boundary (index.js's resolveStaleThresholdMinutes: explicit override > env var > last-resort default), never inline in the usecase or entity layers, and never a literal argument baked into the usecase call site"

key-files:
  created:
    - apps/dgfy-api/src/modules/shifts/repositories/shiftRepository.js
    - apps/dgfy-api/src/modules/shifts/repositories/cashDrawerEventRepository.js
    - apps/dgfy-api/src/modules/shifts/entities/shiftEntity.js
    - apps/dgfy-api/src/modules/shifts/usecases/shiftUseCases.js
    - apps/dgfy-api/src/modules/shifts/controllers/shiftController.js
    - apps/dgfy-api/src/modules/shifts/routes.js
    - apps/dgfy-api/src/modules/shifts/index.js
    - apps/dgfy-api/src/modules/shifts/README.md
    - apps/dgfy-api/tests/unit/modules/shifts/shiftUseCases.test.js
  modified:
    - apps/dgfy-api/src/config/architectureGuardrailsAllowlist.js

key-decisions:
  - "closeShift's reconciliation math (computeExpectedCash + signed variance) is computed in the usecase layer, not the repository — the repository (shiftRepository.closeShift) is a pure persistence adapter that accepts already-computed expectedCashAmount/cashVarianceAmount. This keeps the reconciliation formula unit-testable in isolation (no DB/transaction mocking needed) and matches the plan's own task wording (\"usecases ... closeShift (computes expected/variance via a reconciliation helper)\")."
  - "staleThresholdMinutes resolution (explicit override -> SHIFT_STALE_THRESHOLD_MINUTES env var -> 60-minute fallback) lives in buildShiftsModule() (index.js), the module's own composition boundary — not inside buildListShiftsUseCase or ShiftEntity.isStale(), which both accept the already-resolved number as a plain parameter. This keeps the 'operator-configurable, never hardcoded' requirement (D-11) satisfied while keeping the usecase/entity layers free of env-var/config concerns."
  - "Rule 3 auto-fix: added a minimal index.js (re-exporting Task 1's repository/entity/usecase pieces) and README.md in Task 1's commit — apps/dgfy-api's pre-commit architecture guardrail requires every module directory to carry both files from its first commit (identical fix already applied in 08-04-SUMMARY.md for modules/inventory); Task 2 extended the same index.js with buildShiftsModule() rather than creating a second file."

requirements-completed: [SFT-01, SFT-02, SFT-03]

coverage:
  - id: D1
    description: "Staff can open a shift with a declared opening_float_amount; a second open for the same (terminal_id, cashier_account_id) is rejected as a clean 409 DomainError — the DB unique-index violation on active_terminal_cashier_key is caught inside a transaction and mapped, never surfaced as a 500"
    requirement: "SFT-01"
    verification:
      - kind: unit
        ref: "tests/unit/modules/shifts/shiftUseCases.test.js#buildOpenShiftUseCase > opens a shift with a declared opening_float_amount"
        status: pass
      - kind: unit
        ref: "tests/unit/modules/shifts/shiftUseCases.test.js#buildOpenShiftUseCase > maps a duplicate-open-shift repository error to a clean 409 conflict"
        status: pass
    human_judgment: false
  - id: D2
    description: "Staff can close a shift with an entered closing_cash_amount; the system computes expected_cash_amount and a signed cash_variance_amount via a formula shaped to accept Phase 9 sales/refund/payin/payout inputs (all zero this phase, expected == opening float)"
    requirement: "SFT-02"
    verification:
      - kind: unit
        ref: "tests/unit/modules/shifts/shiftUseCases.test.js#computeExpectedCash (reconciliation formula shape, D-10) > expected cash equals the opening float when all Phase-9 inputs are 0/omitted"
        status: pass
      - kind: unit
        ref: "tests/unit/modules/shifts/shiftUseCases.test.js#buildCloseShiftUseCase > computes a signed positive/negative variance"
        status: pass
    human_judgment: false
  - id: D3
    description: "Every cash-drawer event including a no-sale drawer pop is written to the append-only cash_drawer_events ledger; the repository exposes no update/delete method"
    requirement: "SFT-03"
    verification:
      - kind: unit
        ref: "tests/unit/modules/shifts/shiftUseCases.test.js#buildRecordNoSalePopUseCase > logs a no-sale drawer pop event against an open shift"
        status: pass
      - kind: other
        ref: "manual code review: cashDrawerEventRepository.js exposes only create/findAll/findOne — no update/delete/destroy method exists anywhere on the class"
        status: pass
    human_judgment: false
  - id: D4
    description: "A shift open past an operator-configurable staleness threshold is surfaced as stale via listShifts, but is never auto-closed; the threshold is not a hardcoded literal"
    requirement: "SFT-01"
    verification:
      - kind: unit
        ref: "tests/unit/modules/shifts/shiftUseCases.test.js#buildListShiftsUseCase (D-11 stale-flag-only, never auto-close) — 3 tests"
        status: pass
      - kind: other
        ref: "grep verify: shiftUseCases.js contains no 'autoclose'/'auto_close' text anywhere"
        status: pass
    human_judgment: false
  - id: D5
    description: "Module DI factory (buildShiftsModule), route factory (createShiftRoutes), and controller are self-contained and gate-ready (accept an optional, unwired assertComplianceGate) for Phase 9/08-08 mounting"
    requirement: "SFT-01"
    verification:
      - kind: other
        ref: "node -e smoke check: buildShiftsModule({...}) returns {useCases,...} and createShiftRoutes is a function"
        status: pass
      - kind: other
        ref: "node -e smoke check: createShiftRoutes({}, {}) throws referencing 'authenticateAccount' when the middleware is omitted"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-07-12
status: complete
---

# Phase 8 Plan 5: Shift & Cash Drawer Summary

**Shifts module: DB-generated-column one-open-shift invariant mapped to a clean 409, Expected-vs-Actual reconciliation shaped for Phase 9's sales/refund/payin/payout inputs, and an append-only cash-drawer ledger (incl. no-sale pops) — stale shifts flagged only, never auto-closed.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-07-12
- **Tasks:** 2/2 completed
- **Files modified:** 10 (9 created, 1 modified)

## Accomplishments

- `shiftRepository.openShift()` wraps the shift INSERT and its `open` cash-drawer event in one `sequelize.transaction()`, duck-typing the MySQL/Sequelize unique-constraint violation on the DB-generated `active_terminal_cashier_key` column (D-12, one shift per terminal+cashier) and rethrowing it as `DuplicateOpenShiftError` — the usecase layer maps this to a clean `409 CONFLICT`, never an unhandled 500 (T-08-05-01/SFT-01).
- `shiftUseCases.js`'s exported `computeExpectedCash({openingFloatAmount, salesCash=0, refundsCash=0, payIns=0, payOuts=0})` implements SFT-02's reconciliation formula exactly as shaped in `08-RESEARCH.md`'s Code Examples — all Phase-9 inputs default to 0 this phase, so `expected_cash_amount === opening_float_amount`, with the formula already parameterized to accept real values once Phase 9's checkout/refund/pay-event flows exist, without any restructuring.
- `cashDrawerEventRepository.js` is a standalone, append-only repository (`create`/`findAll`/`findOne` only — no `update`/`delete`/`destroy` method exists anywhere on the class) that `shiftRepository.js` injects as a collaborator; `create()` accepts an optional `{transaction}` so the shift-row write and its `open`/`close` event both commit or roll back together, while `recordNoSalePop` writes a standalone `no_sale_pop` event against an already-open shift (T-08-05-02/T-08-05-03/SFT-03).
- `ShiftEntity.isStale(thresholdMinutes, now)` and `buildListShiftsUseCase`'s stale-flag annotation implement D-11 exactly: a shift open past the configured threshold is surfaced as `is_stale: true` in the list response, and there is no code path anywhere in this module that transitions a shift's status without an explicit close call — verified both by unit tests and by the plan's own grep check confirming no `autoclose`/`auto_close` text exists in `shiftUseCases.js`.
- `buildShiftsModule()` (the module's composition boundary) resolves the operator-configurable stale threshold (explicit override → `SHIFT_STALE_THRESHOLD_MINUTES` env var → a 60-minute fallback) and accepts an optional, never-invoked `assertComplianceGate` (FSC-02) so Phase 9 can inject the real compliance gate into shift-open later without restructuring this factory. `createShiftRoutes` mounts `POST /shifts`, `POST /shifts/:id/close`, `POST /shifts/:id/no-sale-pop`, and `GET /shifts`, all behind the injected `authenticateAccount` middleware.

## Task Commits

1. **Task 1: Shift + cash-drawer repositories, entity, reconciliation usecases** - `df8c6c54` (feat)
2. **Task 2: Controller, routes, DI factory (gate-ready but unwired)** - `377d4774` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/dgfy-api/src/modules/shifts/repositories/shiftRepository.js` - One-open-shift invariant enforcement (D-12), reconciliation persistence, no-sale-pop logging; `DuplicateOpenShiftError`/`ShiftNotFoundError`/`ShiftNotOpenError` named error classes
- `apps/dgfy-api/src/modules/shifts/repositories/cashDrawerEventRepository.js` - Append-only cash-drawer ledger repository (create/findAll/findOne only), optional-transaction-joining `create()`
- `apps/dgfy-api/src/modules/shifts/entities/shiftEntity.js` - `ShiftEntity` with `isOpen()`/`isStale(thresholdMinutes)` domain helpers and `toPlain()`
- `apps/dgfy-api/src/modules/shifts/usecases/shiftUseCases.js` - `computeExpectedCash` (exported reconciliation helper), `buildOpenShiftUseCase`, `buildCloseShiftUseCase`, `buildRecordNoSalePopUseCase`, `buildListShiftsUseCase`
- `apps/dgfy-api/src/modules/shifts/controllers/shiftController.js` - Transport-only controller (open/close/no-sale-pop/list)
- `apps/dgfy-api/src/modules/shifts/routes.js` - `createShiftRoutes(useCases, {authenticateAccount})` — POST /shifts, POST /shifts/:id/close, POST /shifts/:id/no-sale-pop, GET /shifts
- `apps/dgfy-api/src/modules/shifts/index.js` - `buildShiftsModule()` DI factory + barrel re-exports
- `apps/dgfy-api/src/modules/shifts/README.md` - Module documentation (invariant, reconciliation formula, ledger, stale-flag behavior, endpoints, prohibitions)
- `apps/dgfy-api/tests/unit/modules/shifts/shiftUseCases.test.js` - 18 tests: reconciliation math, open/duplicate-open 409, close (found/not-found/already-closed/race), no-sale pop, stale-flag-only (3 cases)
- `apps/dgfy-api/src/config/architectureGuardrailsAllowlist.js` - Added `shiftController.js` to the `controllerNaming` allowlist (Task 2), alongside 08-03/08-04's existing entries

## Decisions Made

- **Reconciliation math lives in the usecase, not the repository** — `buildCloseShiftUseCase` reads the existing shift via `repository.findById()`, computes `expectedCashAmount`/`cashVarianceAmount` via the pure `computeExpectedCash()` helper, then passes both pre-computed values to `repository.closeShift()`, which persists them inside its own transaction alongside the `close` cash-drawer event. This keeps the formula unit-testable without mocking Sequelize transactions and matches the plan's task wording verbatim.
- **staleThresholdMinutes resolution is a module-composition concern** — `buildShiftsModule()`'s `resolveStaleThresholdMinutes()` (explicit override → `SHIFT_STALE_THRESHOLD_MINUTES` env var → 60-minute default) is the ONLY place that reads `process.env` or picks a fallback number; `buildListShiftsUseCase` and `ShiftEntity.isStale()` both simply accept the already-resolved number. Satisfies D-11's "operator-configurable, never hardcoded" requirement while keeping the usecase/entity layers free of env/config concerns (mirrors how `businessDatabaseRegistryRepository`/`tenantConnector` are resolved once at the module boundary elsewhere in this codebase).
- **Rule 3 auto-fix (blocking issue): added a minimal `index.js` + `README.md` in Task 1's commit** — apps/dgfy-api's pre-commit architecture guardrail (`check:architecture:dgfy-api`) requires every module directory to carry both files from its very first commit; without them, the commit failed with `[moduleStructure] ../apps/dgfy-api/src/modules/shifts missing required file index.js`/`README.md`. This exact situation and fix already happened in 08-04-SUMMARY.md for `modules/inventory` — mirrored the identical pattern (a minimal barrel `index.js` re-exporting Task 1's pieces, extended by Task 2 with the real `buildShiftsModule()` factory).
- **Rule 3 auto-fix (blocking issue): added `shiftController.js` to `architectureGuardrailsAllowlist.js`'s `controllerNaming` list** — apps/dgfy-api's Clean-Architecture `*Controller.js` naming convention differs from legacy `backend/`'s `*Handlers.js` convention that the shared guardrail script otherwise expects; 08-03/08-04 already added their own module's controllers to this same running allowlist, so this plan's entry was appended alongside the existing ones (per the parallel-execution note in this plan's prompt), not a new pattern.

## Deviations from Plan

None beyond the two Rule 3 auto-fixes documented above under "Decisions Made" (both blocking pre-commit-hook issues, not scope changes — no plan behavior was altered).

## Issues Encountered

None beyond the two pre-commit guardrail blockers resolved via Rule 3 (see "Decisions Made").

## User Setup Required

None - no external service configuration required. `SHIFT_STALE_THRESHOLD_MINUTES` is an optional env var operators may set later to override the 60-minute default; its absence does not block this plan's completion.

## Next Phase Readiness

- `modules/shifts` is fully self-contained (repository/entity/usecases/controller/routes/DI factory) and ready for 08-08 to mount `createShiftRoutes()` under `/shifts` in `apps/dgfy-api/src/routes/index.js`, following the same composition pattern already used for `modules/products`/`modules/inventory`.
- `buildShiftsModule()`'s `assertComplianceGate` parameter is accepted but unused this phase — Phase 9 can inject `modules/compliance`'s real `assertComplianceGate` into shift-open without any restructuring here.
- The reconciliation formula (`computeExpectedCash`) already accepts `salesCash`/`refundsCash`/`payIns`/`payOuts` as named parameters — Phase 9's checkout completion can pass real values through the same `buildCloseShiftUseCase` call shape once those flows exist.
- No blockers for 08-06/08-07/08-08.

---
*Phase: 08-commerce-foundation-product-catalog-booking-shift-cash-drawe*
*Completed: 2026-07-12*

## Self-Check: PASSED

- FOUND: `apps/dgfy-api/src/modules/shifts/repositories/shiftRepository.js`
- FOUND: `apps/dgfy-api/src/modules/shifts/repositories/cashDrawerEventRepository.js`
- FOUND: `apps/dgfy-api/src/modules/shifts/entities/shiftEntity.js`
- FOUND: `apps/dgfy-api/src/modules/shifts/usecases/shiftUseCases.js`
- FOUND: `apps/dgfy-api/src/modules/shifts/controllers/shiftController.js`
- FOUND: `apps/dgfy-api/src/modules/shifts/routes.js`
- FOUND: `apps/dgfy-api/src/modules/shifts/index.js`
- FOUND: `apps/dgfy-api/src/modules/shifts/README.md`
- FOUND: `apps/dgfy-api/tests/unit/modules/shifts/shiftUseCases.test.js`
- FOUND: `apps/dgfy-api/src/config/architectureGuardrailsAllowlist.js`
- FOUND commit: `df8c6c54` (Task 1)
- FOUND commit: `377d4774` (Task 2)
