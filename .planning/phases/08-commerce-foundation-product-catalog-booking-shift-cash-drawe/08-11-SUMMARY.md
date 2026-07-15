---
phase: 08-commerce-foundation-product-catalog-booking-shift-cash-drawe
plan: 11
subsystem: compliance
tags: [compliance, policy-engine, fiscal, authorization, gap-closure]

# Dependency graph
requires:
  - phase: 08-commerce-foundation-product-catalog-booking-shift-cash-drawe
    provides: "08-09/08-10 compliance-mode state machine, policy engine, and review use case (FSC-01/FSC-02 predecessor gap-closures)"
provides:
  - "buildReviewComplianceStateUseCase demotes compliance_mode_state.state to non_compliant_active on BOTH 'rejected' and 'revoked' review outcomes, closing a fail-open authorization bypass"
  - "Regression test proving a revoked/rejected compliant_active business no longer reaches ALLOW for Fiscal POS_CHECKOUT"
affects: [09-pos-checkout-payment, compliance-gate-consumers]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "State-demotion as single source of truth: reviewComplianceState demotes the state column rather than plumbing verification_status into the policy engine/gate"

key-files:
  created:
    - apps/dgfy-api/tests/unit/modules/compliance/complianceReviewDemotion.test.js
  modified:
    - apps/dgfy-api/src/modules/compliance/usecases/complianceUseCases.js

key-decisions:
  - "Demotion to non_compliant_active on reject/revoke is unconditional — the API is NOT extended to require an explicit newState for reject/revoke (option rejected by user this session)"
  - "State-demotion is the chosen single source of truth: no parallel verification_status branch added to complianceGate.js or evaluateComplianceDecision()"

patterns-established:
  - "Reject/revoke review outcomes always route through repository.upsertState() (same call the verified path already used), so finalRow always reflects the post-review state rather than only verification metadata"

requirements-completed: [FSC-01]

coverage:
  - id: D1
    description: "buildReviewComplianceStateUseCase demotes compliance_mode_state.state to non_compliant_active for BOTH 'revoked' and 'rejected' review outcomes, with no newState required from the caller"
    requirement: "FSC-01"
    verification:
      - kind: unit
        ref: "apps/dgfy-api/tests/unit/modules/compliance/complianceReviewDemotion.test.js#FSC-01: reject/revoke demotes compliance_mode_state to non_compliant_active > verificationStatus=revoked demotes state to non_compliant_active with no client-supplied newState"
        status: pass
      - kind: unit
        ref: "apps/dgfy-api/tests/unit/modules/compliance/complianceReviewDemotion.test.js#FSC-01: reject/revoke demotes compliance_mode_state to non_compliant_active > verificationStatus=rejected demotes state to non_compliant_active with no client-supplied newState"
        status: pass
    human_judgment: false
  - id: D2
    description: "A demoted (non_compliant_active) tenant is fail-closed for Fiscal POS_CHECKOUT (DENY, NON_COMPLIANT_FISCAL_DOCUMENT_BLOCKED) while non_fiscal POS_CHECKOUT for the same tenant still ALLOWs (D-05 preserved)"
    requirement: "FSC-01"
    verification:
      - kind: unit
        ref: "apps/dgfy-api/tests/unit/modules/compliance/complianceReviewDemotion.test.js#FSC-01: a demoted (non_compliant_active) tenant is fail-closed for Fiscal POS_CHECKOUT > fiscal POS_CHECKOUT is blocked (decision !== ALLOW, reason_code NON_COMPLIANT_FISCAL_DOCUMENT_BLOCKED)"
        status: pass
      - kind: unit
        ref: "apps/dgfy-api/tests/unit/modules/compliance/complianceReviewDemotion.test.js#FSC-01: a demoted (non_compliant_active) tenant is fail-closed for Fiscal POS_CHECKOUT > non_fiscal POS_CHECKOUT still resolves to ALLOW (D-05 preserved for the demoted state)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Full dgfy-api regression suite stays green after the fix — no fewer than 259 non-skipped passing tests, zero failures"
    verification:
      - kind: unit
        ref: "cd apps/dgfy-api && node --experimental-vm-modules node_modules/.bin/jest --config jest.config.cjs --runInBand (263 passed, 191 skipped, 0 failed)"
        status: pass
    human_judgment: false

duration: 10min
completed: 2026-07-13
status: complete
---

# Phase 08 Plan 11: FSC-01 Compliance Review Demotion Summary

**Reviewing a compliant_active business as 'revoked' or 'rejected' now unconditionally demotes compliance_mode_state.state to non_compliant_active, closing a fail-open bypass that let Fiscal POS_CHECKOUT stay ALLOWed after a paperwork revocation.**

## Performance

- **Duration:** ~10 min
- **Completed:** 2026-07-13
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments

- Closed FSC-01 (the single BLOCKING gap in 08-VERIFICATION.md): `buildReviewComplianceStateUseCase` previously only wrote `compliance_mode_state.state` when `verificationStatus === 'verified'`; for `'rejected'`/`'revoked'` it patched only verification metadata and left `state` untouched — a fail-open authorization bypass, since `evaluateComplianceDecision()` branches exclusively on the `state` column.
- Both `'rejected'` and `'revoked'` outcomes now call `repository.upsertState(businessId, branchId, { state: COMPLIANCE_MODE_STATE.NON_COMPLIANT_ACTIVE })` unconditionally — no `newState` required from the caller (matches the user's locked decision this session).
- Added a dedicated regression test (`complianceReviewDemotion.test.js`) that pins both ends of the key link: the usecase-level demotion (upsertState called with the demoted state; `result.data.compliance.state === non_compliant_active`; `recordVerification` still called with the correct `verification_status`) AND the downstream policy-engine outcome (demoted tenant + Fiscal POS_CHECKOUT → DENY `NON_COMPLIANT_FISCAL_DOCUMENT_BLOCKED`; demoted tenant + non-fiscal POS_CHECKOUT → ALLOW, preserving D-05).
- Confirmed RED against the pre-fix code (upsertState never called for reject/revoke; `compliance.state` stayed `compliant_active`) before implementing the fix, then confirmed GREEN after.
- Corrected the JSDoc on `buildReviewComplianceStateUseCase` — it no longer claims reject/revoke leaves state untouched/ignores `newState` with no demotion; it now documents the unconditional demotion and why (fail-closed default per D-02/D-05).
- Verified state-demotion remains the single source of truth: no parallel `verification_status` branch was added to `complianceGate.js` or `evaluateComplianceDecision()` — the gate's existing state-based branching was already sufficient once the state is correctly demoted.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add the reject/revoke demotion regression test that reproduces the fail-open bypass (RED)** - `e173f58c` (test)
2. **Task 2: Demote state to non_compliant_active on reject/revoke + correct the JSDoc (GREEN)** - `323854ec` (fix)

_TDD flow: RED (test commit) confirmed to fail against the pre-fix use case, then GREEN (fix commit) confirmed to pass — no REFACTOR commit needed, the fix was a minimal, already-clean change._

## Files Created/Modified

- `apps/dgfy-api/tests/unit/modules/compliance/complianceReviewDemotion.test.js` - New regression test: usecase-half (reject/revoke demotion assertions for both outcomes) + policy-engine-half (fail-closed Fiscal gate outcome on the demoted state, D-05 preserved for non-fiscal)
- `apps/dgfy-api/src/modules/compliance/usecases/complianceUseCases.js` - `buildReviewComplianceStateUseCase`: reject/revoke branch now calls `repository.upsertState(businessId, branchId, { state: COMPLIANCE_MODE_STATE.NON_COMPLIANT_ACTIVE })` instead of leaving `finalRow` as the `recordVerification` result; JSDoc corrected to describe the unconditional demotion

## Decisions Made

- Demotion target is always `COMPLIANCE_MODE_STATE.NON_COMPLIANT_ACTIVE` for reject/revoke — no explicit `newState` is required or consulted for these two outcomes (user-locked decision, not extending the review API's contract).
- State-demotion is the single source of truth for the gate's authorization decision; `complianceGate.js`/`evaluateComplianceDecision()` were intentionally left untouched — correctly demoting the state column is sufficient because the gate already branches on it.

## Deviations from Plan

None - plan executed exactly as written. Both tasks matched their `<action>`/`<verify>`/`<acceptance_criteria>` blocks precisely; no Rule 1-4 auto-fixes were needed beyond the plan's own scope (a minor unused-variable cleanup — no longer storing the unused `recordVerification` return value in a local — was folded directly into Task 2's edit, not a separate deviation).

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- FSC-01 closed; Phase 9 (POS Checkout & Payment) now inherits a compliance gate that cannot be silently bypassed by a stale `compliant_active` state after a revocation.
- Full dgfy-api suite: 263 passing (baseline 259 + 4 new), 191 intentionally skipped (real-MySQL integration tests), zero failures.
- Remaining open items from 08-VERIFICATION.md going into Phase 8 close-out: CR-02 (`bookingRepository.cancelBooking()`) and CR-03 (`shiftRepository.closeShift()`) lock-race hardening — tracked separately as 08-12 per STATE.md.

---
*Phase: 08-commerce-foundation-product-catalog-booking-shift-cash-drawe*
*Completed: 2026-07-13*

## Self-Check: PASSED

- FOUND: apps/dgfy-api/tests/unit/modules/compliance/complianceReviewDemotion.test.js
- FOUND: apps/dgfy-api/src/modules/compliance/usecases/complianceUseCases.js
- FOUND commit: e173f58c
- FOUND commit: 323854ec
