---
phase: 08-commerce-foundation-product-catalog-booking-shift-cash-drawe
plan: 12
subsystem: api
tags: [sequelize, mysql, row-locking, concurrency, booking, shifts, cash-drawer]

# Dependency graph
requires:
  - phase: 08-commerce-foundation-product-catalog-booking-shift-cash-drawe (08-07, 08-05)
    provides: bookingRepository.cancelBooking and shiftRepository.closeShift original implementations
provides:
  - "cancelBooking's guard read is row-locked (lock: transaction.LOCK.UPDATE), serializing concurrent cancels of the same booking"
  - "closeShift's guard read is row-locked (lock: transaction.LOCK.UPDATE), serializing concurrent closes of the same shift"
  - "Mocked unit tests pinning both source locks and the reject-second-operation behavior"
affects: [09-checkout, 08-security-audit]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "FOR UPDATE row-lock on read-then-act guard reads inside sequelize.transaction() — same discipline as the atomic guarded UPDATE used on the booking create path (D-08 / Pattern D), now extended to the cancel and close guard reads"

key-files:
  created:
    - apps/dgfy-api/tests/unit/modules/booking/bookingRepository.test.js
    - apps/dgfy-api/tests/unit/modules/shifts/shiftRepository.test.js
  modified:
    - apps/dgfy-api/src/modules/booking/repositories/bookingRepository.js
    - apps/dgfy-api/src/modules/shifts/repositories/shiftRepository.js

key-decisions:
  - "Row-lock fix only — no schema change, no behavior change on the happy path, matching the plan's DECISION to close both CR-02/CR-03 lock races in this round"
  - "Mocked sequelize.transaction stub must expose sequelize.literal() too, since cancelBooking's mirror +1 capacity release calls sequelize.literal — mirrors the compliance repository test convention but required one extra mock method not present in that reference file"

patterns-established:
  - "Guard-read row locking: `Model.findX(where, { transaction, lock: transaction.LOCK.UPDATE })` before any read-then-act status check inside a transaction, so concurrent double-submits serialize and the loser sees the terminal state instead of racing the writer"

requirements-completed: [BOK-02, SFT-02, SFT-03]

coverage:
  - id: D1
    description: "cancelBooking's guard read is row-locked; concurrent cancels serialize; a second cancel of an already-cancelled booking throws BookingAlreadyCancelledError without re-incrementing capacity (CR-02)"
    requirement: "BOK-02"
    verification:
      - kind: unit
        ref: "apps/dgfy-api/tests/unit/modules/booking/bookingRepository.test.js#CR-02: cancelBooking serializes its guard read with a row lock"
        status: pass
    human_judgment: false
  - id: D2
    description: "closeShift's guard read is row-locked; concurrent closes serialize; a second close of an already-closed shift throws ShiftNotOpenError without writing a duplicate 'close' cash_drawer_event or losing a reconciliation update (CR-03)"
    requirement: "SFT-02"
    verification:
      - kind: unit
        ref: "apps/dgfy-api/tests/unit/modules/shifts/shiftRepository.test.js#CR-03: closeShift serializes its guard read with a row lock"
        status: pass
    human_judgment: false
  - id: D3
    description: "Full dgfy-api jest suite stays green after both fixes (no regressions in the append-only cash-drawer logging / reconciliation math)"
    requirement: "SFT-03"
    verification:
      - kind: unit
        ref: "cd apps/dgfy-api && node --experimental-vm-modules node_modules/.bin/jest --config jest.config.cjs --runInBand (267 passing, 0 failures)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Live MySQL FOR UPDATE serialization timing under real concurrent load (the mocked unit tests only assert the lock option is requested and the second-operation rejection path, not live isolation timing)"
    verification: []
    human_judgment: true
    rationale: "Per 08-VERIFICATION.md item 4, real concurrent-transaction serialization timing against live MySQL cannot be proven by mocked unit tests and is explicitly routed to human/integration verification, consistent with this project's existing human-UAT-against-real-MySQL pattern (Phase 4)."

duration: 15min
completed: 2026-07-13
status: complete
---

# Phase 08 Plan 12: Row-Lock Booking Cancel and Shift Close Guard Reads Summary

**Added `FOR UPDATE` row locks (`lock: transaction.LOCK.UPDATE`) to `bookingRepository.cancelBooking` and `shiftRepository.closeShift` guard reads, closing CR-02/CR-03, with new mocked unit tests pinning the source lock and reject-second-operation behavior; full 267-test dgfy-api suite stays green.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-13T08:07:00+08:00 (approx, following 08-11)
- **Completed:** 2026-07-13T08:11:20+08:00
- **Tasks:** 2 completed
- **Files modified:** 4 (2 source, 2 new test files)

## Accomplishments
- `cancelBooking`'s guard read (`Booking.findByPk`) now requests `lock: transaction.LOCK.UPDATE`, so two concurrent cancels of the same booking serialize; the second sees `status === 'cancelled'` and throws `BookingAlreadyCancelledError` without a second `slots_remaining + 1` (CR-02 closed).
- `closeShift`'s guard read (`Shift.findOne`) now requests `lock: transaction.LOCK.UPDATE`, so two concurrent closes of the same shift serialize; the second sees `status !== 'open'` and throws `ShiftNotOpenError` without writing a duplicate `'close'` cash_drawer_event or losing a reconciliation update (CR-03 closed).
- Two new mocked unit test files (no live MySQL), each confirmed RED before the source fix and GREEN after, mirroring `complianceModeStateRepository.test.js`'s mocking convention.
- Full dgfy-api jest suite re-run after both fixes: 267 passing, 0 failing (baseline ≥259 satisfied).

## Task Commits

Each task was committed atomically:

1. **Task 1: Row-lock the cancelBooking guard read + regression test (CR-02)** - `a0293a60` (fix)
2. **Task 2: Row-lock the closeShift guard read + regression test (CR-03)** - `43d0b17c` (fix)

**Plan metadata:** commit created immediately after this SUMMARY is written (see below).

_Note: These were TDD tasks — RED confirmed inline before each fix; each commit bundles the already-passing test + fix (single feat/fix commit per task, not split test→feat, since the plan's `<action>` directs "run once and CONFIRM RED, then make the fix, re-run: both cases now pass" as one authoring pass, not a strict two-commit RED/GREEN cycle)._

## Files Created/Modified
- `apps/dgfy-api/src/modules/booking/repositories/bookingRepository.js` - `cancelBooking`'s guard read gains `lock: transaction.LOCK.UPDATE`; doc comment updated to explain the serialization guarantee
- `apps/dgfy-api/src/modules/shifts/repositories/shiftRepository.js` - `closeShift`'s guard read gains `lock: transaction.LOCK.UPDATE`; doc comment updated to explain the serialization guarantee
- `apps/dgfy-api/tests/unit/modules/booking/bookingRepository.test.js` - new mocked unit test: first-cancel lock-present + single capacity release + status 'cancelled'; second-cancel `BookingAlreadyCancelledError` + capacity-update-not-called
- `apps/dgfy-api/tests/unit/modules/shifts/shiftRepository.test.js` - new mocked unit test: first-close lock-present + status 'closed' + single 'close' event; second-close `ShiftNotOpenError` + cash-drawer-create-not-called

## Decisions Made
- Surgical, minimal-scope fix only (one added option per guard read) — no schema change, no change to the create-path atomic guarded UPDATE, the reconciliation math, or the append-only logging mechanism, matching the plan's prohibitions exactly.
- The mocked `sequelize` stub in `bookingRepository.test.js` needed a `literal` jest.fn() in addition to the `transaction` stub (the reference `complianceModeStateRepository.test.js` convention didn't need this since that repository never calls `sequelize.literal`) — added so the pre-existing `slots_remaining + 1` mirror-release code path could execute without throwing an unrelated `TypeError`.

## Deviations from Plan

None - plan executed exactly as written. Both guard reads were fixed with the single specified option (`lock: transaction.LOCK.UPDATE`); no create-path, reconciliation-math, or append-only-logging behavior was touched; no other Phase 08 module or the composition root was modified.

## Issues Encountered
- Initial RED run of `bookingRepository.test.js`'s first-cancel test failed with an unrelated `TenantDatabaseUnavailableError` instead of the expected lock-assertion failure, because the test's `sequelize` mock was missing a `literal()` method that `cancelBooking`'s mirror capacity-release call depends on. Added `sequelize.literal: jest.fn(...)` to the mock so the RED failure correctly isolated to the lock assertion (`options.lock` undefined) before the fix, then GREEN after.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Both Critical concurrency gaps (CR-02, CR-03) flagged by 08-REVIEW.md and 08-VERIFICATION.md are closed before Phase 9 (Checkout) builds on the booking and shift modules under real concurrent load.
- Remaining verification gap (per 08-VERIFICATION.md item 4): live MySQL `FOR UPDATE` serialization timing under real concurrent transactions has not been exercised against a live database in this plan — mocked unit tests only assert the lock option is requested and the second-operation rejection path. Recommend covering this in a future integration/UAT pass against real MySQL (mirroring Phase 4's human-UAT-against-real-MySQL precedent), not blocking for Phase 8 sign-off.
- No other Phase 08 gaps outstanding as of this plan; FSC-01 was closed in 08-11, FSC-02 in 08-10.

---
*Phase: 08-commerce-foundation-product-catalog-booking-shift-cash-drawe*
*Completed: 2026-07-13*

## Self-Check: PASSED

All created/modified files confirmed present on disk:
- apps/dgfy-api/src/modules/booking/repositories/bookingRepository.js — FOUND
- apps/dgfy-api/src/modules/shifts/repositories/shiftRepository.js — FOUND
- apps/dgfy-api/tests/unit/modules/booking/bookingRepository.test.js — FOUND
- apps/dgfy-api/tests/unit/modules/shifts/shiftRepository.test.js — FOUND
- .planning/phases/08-commerce-foundation-product-catalog-booking-shift-cash-drawe/08-12-SUMMARY.md — FOUND

All task commits confirmed present in git log:
- a0293a60 (Task 1: CR-02 fix) — FOUND
- 43d0b17c (Task 2: CR-03 fix) — FOUND
