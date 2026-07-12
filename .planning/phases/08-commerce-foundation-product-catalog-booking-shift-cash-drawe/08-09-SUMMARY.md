---
phase: 08-commerce-foundation-product-catalog-booking-shift-cash-drawe
plan: 09
subsystem: compliance
tags: [sequelize, mysql, generated-column, findOrCreate, policy-engine, gap-closure]

# Dependency graph
requires:
  - phase: 08-06
    provides: "modules/compliance (policy engine port, compliance-mode state machine, assertComplianceGate port, D-05 deviation)"
provides:
  - "DB-enforceable one-row-per-(business_id, branch_id) compliance_mode_state invariant, including branch_id IS NULL, via a STORED generated column + unique index"
  - "Atomic ComplianceModeStateRepository.upsertState() write path (findOrCreate, not findOne-then-create) with a clean 409 conflict mapping"
  - "compliant_active POS-gate branch that enforces the FULL evidence-derived checklist (all 7 readiness signals), not just profile/settings/artifacts/peripherals"
affects: [09-checkout, phase-9-compliance-gate-wiring]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "STORED generated column COALESCE(nullable_fk, 0) as a MySQL uniqueness workaround for a nullable FK column (mirrors shifts.active_terminal_cashier_key)"
    - "Sequelize findOrCreate() + duck-typed unique-constraint-violation -> custom Error -> usecase 409 mapping (mirrors shiftRepository.js's DuplicateOpenShiftError)"
    - "Reuse an already-assembled activation_blockers[0] reason code instead of duplicating a per-signal reason-code mapping table in the decision branch"

key-files:
  created:
    - apps/dgfy-migration-runner/src/migrations/schema/20260712140000-harden-compliance-mode-state-uniqueness.cjs
    - apps/dgfy-api/tests/unit/modules/compliance/complianceModeStateRepository.test.js
    - apps/dgfy-api/tests/unit/modules/compliance/complianceChecklistGating.test.js
  modified:
    - apps/dgfy-migration-runner/src/schemaContracts/dgfyBusinessContract.js
    - apps/dgfy-api/src/models/Tenant/ComplianceModeState.js
    - apps/dgfy-api/src/modules/compliance/repositories/complianceModeStateRepository.js
    - apps/dgfy-api/src/modules/compliance/usecases/complianceUseCases.js
    - apps/dgfy-api/src/modules/compliance/policy/policyEngine.js
    - apps/dgfy-api/src/modules/compliance/usecases/complianceGate.js

key-decisions:
  - "Used a STORED generated column (branch_scope_key = COALESCE(branch_id, 0)) rather than a branch_id=0 sentinel — a literal sentinel would violate branch_id's FK into locations.id, since 0 is never a valid locations.id."
  - "Reused checklist.activation_blockers[0]'s already-assembled reason code/message in the new compliant_active guard rather than duplicating a per-signal mapping table — by construction, any blocker remaining at that point in the branch is one of the 7 evidence-derived signals (profile/settings/artifacts/peripherals are already proven complete by the four checks above it)."

patterns-established:
  - "Additive forward-dated migrations for schema gap-closures — never edit an already-shipped migration file (matches 20260711143000's precedent)."

requirements-completed: [FSC-01, FSC-02]

coverage:
  - id: D1
    description: "compliance_mode_state DB-enforces one row per (business_id, branch_id) even when branch_id IS NULL, via a STORED generated column + new unique index; already-shipped migration untouched."
    requirement: "FSC-01"
    verification:
      - kind: unit
        ref: "apps/dgfy-migration-runner/tests/dgfyBusinessSchema.test.js (24/24, contract stays internally consistent)"
        status: pass
      - kind: other
        ref: "grep -q branch_scope_key / unique_compliance_mode_state_business_branch_scope across migration/contract/model; git diff --stat on 20260712100000-create-commerce-foundation.cjs is empty"
        status: pass
    human_judgment: true
    rationale: "Firing the real MySQL unique constraint (two concurrent NULL-branch inserts colliding) requires a live dgfy_business_* tenant database, not reachable in this environment — routed to human verification per this phase's established precedent (08-VERIFICATION.md)."
  - id: D2
    description: "ComplianceModeStateRepository.upsertState() writes atomically via findOrCreate() and maps a duck-typed unique-constraint violation to DuplicateComplianceModeStateError -> a clean 409 CONFLICT in both write-path usecases, never a misleading 503."
    requirement: "FSC-01"
    verification:
      - kind: unit
        ref: "apps/dgfy-api/tests/unit/modules/compliance/complianceModeStateRepository.test.js (10/10)"
        status: pass
    human_judgment: false
  - id: D3
    description: "compliant_active POS-operation gate branch consults the full evidence-derived checklist (all 7 readiness signals) before ALLOW, mapping each unmet signal to its own REQUIRES_SETUP reason code; complianceGate.js header comment corrected to match."
    requirement: "FSC-02"
    verification:
      - kind: unit
        ref: "apps/dgfy-api/tests/unit/modules/compliance/complianceChecklistGating.test.js (9/9)"
        status: pass
    human_judgment: false
  - id: D4
    description: "D-05 deviation not regressed: complianceGate.test.js's 6 existing assertions (incl. the source-scan for the absent legacy deny reason code) still pass unchanged."
    verification:
      - kind: unit
        ref: "apps/dgfy-api/tests/unit/modules/compliance/complianceGate.test.js (6/6)"
        status: pass
    human_judgment: false

duration: 22min
completed: 2026-07-12
status: complete
---

# Phase 8 Plan 09: Compliance Gap-Closure (CR-01/CR-02) Summary

**DB-enforceable compliance_mode_state uniqueness for NULL branches + atomic findOrCreate upsert with 409 mapping, and a compliant_active POS gate that now enforces all 7 evidence-derived readiness signals instead of only 4.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-07-12T14:45:00Z
- **Completed:** 2026-07-12T15:07:16Z
- **Tasks:** 3
- **Files modified:** 9 (3 created, 6 modified)

## Accomplishments

- Closed CR-01 (FSC-01): added a forward-dated migration
  (`20260712140000-harden-compliance-mode-state-uniqueness.cjs`) that adds a
  STORED generated column `branch_scope_key = COALESCE(branch_id, 0)` and a
  new unique index `unique_compliance_mode_state_business_branch_scope` on
  `(business_id, branch_scope_key)`, superseding the old
  `(business_id, branch_id)` index that could not enforce uniqueness when
  `branch_id IS NULL` (MySQL treats every NULL as distinct). Schema
  contract and Tenant model kept in sync; the already-shipped
  `20260712100000-create-commerce-foundation.cjs` is untouched (verified via
  `git diff --stat` showing zero changes).
- Closed CR-01's app-layer half: `ComplianceModeStateRepository.upsertState()`
  now writes via `findOrCreate()` instead of a plain
  `findOne()`-then-`create()`/`update()` TOCTOU race, relying on the new DB
  unique index to serialize concurrent first writes. Added
  `DuplicateComplianceModeStateError` + a duck-typed
  `isUniqueConstraintViolation()` helper (mirrors `shiftRepository.js`'s
  `DuplicateOpenShiftError` pattern); `complianceUseCases.js` now maps this
  error to a clean 409 CONFLICT in both write-path catches (submit
  evidence, review/verify) instead of a misleading 503.
  `recordVerification()` was also hardened with a `sequelize.transaction()`
  + row lock (`SELECT ... FOR UPDATE`) around its read-modify-write.
- Closed CR-02 (FSC-02): `policyEngine.js`'s `compliant_active`
  POS-operation branch now gates the final ALLOW on
  `checklist.ready_for_compliant_activation` — the roll-up of all 7
  evidence-derived readiness signals (`fiscal_accumulator_stream_ready`,
  `audit_log_append_only_enforced`, `payment_handoff_policy_ready`,
  `encryption_policy_prerequisites_ready`, documentary/submission-artifact
  readiness, RMO 24-2023 filing readiness, fiscal terminal registration) —
  not just the four previously-checked sections (profile/settings/
  artifacts/peripherals). An unmet signal now returns `REQUIRES_SETUP` with
  its own already-assembled reason code (from
  `checklist.activation_blockers[0]`), e.g. `RMO_FILING_EVIDENCE_REQUIRED`,
  `FISCAL_TERMINAL_REGISTRATION_REQUIRED`. `complianceGate.js`'s header
  comment was corrected to describe the guarantee the code now actually
  provides.
- D-05 preserved: `complianceGate.test.js`'s 6 existing assertions
  (including the source-scan proving the legacy
  `DOCUMENT_CONTEXT_NOT_ALLOWED` deny reason code is absent from
  `policyEngine.js`) all still pass unchanged; `compliant_active` continues
  to ALLOW both `fiscal` and `non_fiscal` document contexts once the
  checklist is fully ready.

## Task Commits

Each task was committed atomically:

1. **Task 1: Make the one-row-per-business/branch invariant DB-enforceable for the branch_id IS NULL case (CR-01 schema)** - `1a2c3f10` (feat)
2. **Task 2: Atomic upsert via findOrCreate + duck-typed 409 conflict mapping (CR-01 code)** - `2d48da9a` (feat)
3. **Task 3: Enforce the full evidence-derived checklist in the compliant_active POS gate + truthful gate doc (CR-02)** - `9f437227` (feat)

_No TDD tasks in this plan — all three tasks are `type="auto"` (not `tdd="true"`)._

## Files Created/Modified

- `apps/dgfy-migration-runner/src/migrations/schema/20260712140000-harden-compliance-mode-state-uniqueness.cjs` - New forward-dated migration: STORED generated column `branch_scope_key` + `unique_compliance_mode_state_business_branch_scope` unique index, idempotent up/down.
- `apps/dgfy-migration-runner/src/schemaContracts/dgfyBusinessContract.js` - `compliance_mode_state` entry updated: `branch_scope_key` column added; `indexes[]`/`uniqueConstraints[]` reference the new index name.
- `apps/dgfy-api/src/models/Tenant/ComplianceModeState.js` - `indexes` metadata updated to the new index/column; doc comment explains the NULL-branch enforceability fix; `branch_scope_key` is deliberately NOT a model attribute.
- `apps/dgfy-api/src/modules/compliance/repositories/complianceModeStateRepository.js` - `upsertState()` rewritten to use `findOrCreate()`; added `DuplicateComplianceModeStateError` + `isUniqueConstraintViolation()`; `recordVerification()` hardened with a transaction + row lock; `withModel()`'s no-double-wrap guard extended.
- `apps/dgfy-api/src/modules/compliance/usecases/complianceUseCases.js` - Added `isDuplicateComplianceModeStateError()` + `duplicateComplianceStateError()` (409 CONFLICT mapper); wired into both write-path catch blocks.
- `apps/dgfy-api/src/modules/compliance/policy/policyEngine.js` - `compliant_active` POS branch gates final ALLOW on `checklist.ready_for_compliant_activation`, returning `REQUIRES_SETUP` with the first unmet signal's reason code otherwise. D-05 comment/behavior untouched.
- `apps/dgfy-api/src/modules/compliance/usecases/complianceGate.js` - Header comment corrected to describe the full-checklist guarantee the gate now provides (no runtime code change).
- `apps/dgfy-api/tests/unit/modules/compliance/complianceModeStateRepository.test.js` - New (10 tests): findOrCreate keying (incl. `branch_id === null`), duplicate-error mapping (both from `findOrCreate` and the follow-up `record.update()`), `branch_scope_key` never written, `getForBusinessBranch` regression guard, usecase-level 409 mapping assertion.
- `apps/dgfy-api/tests/unit/modules/compliance/complianceChecklistGating.test.js` - New (9 tests): fully-ready ALLOW baseline, one `REQUIRES_SETUP` case per evidence-derived signal (RMO filing, fiscal terminal registration, audit append-only, payment handoff, encryption prerequisites), the empty-evidence `REQUIRES_SETUP` guard, and the D-05 fiscal/non_fiscal ALLOW pair under the new gating.

## Decisions Made

- Used a STORED generated column (`branch_scope_key = COALESCE(branch_id, 0)`) instead of writing a literal `branch_id = 0` sentinel — a sentinel would violate `branch_id`'s FK into `locations.id`, since `0` is never a valid `locations.id`. This mirrors the exact pattern this phase's own `shifts.active_terminal_cashier_key` generated column already uses.
- Reused `checklist.activation_blockers[0]`'s already-assembled reason code/message in the new CR-02 guard rather than duplicating a per-signal mapping table in the decision branch. This is safe by construction: the four checks immediately above the new guard (`profile_complete`, `settings_complete`, `artifacts_complete`, `peripherals_complete`) already returned early if any of them were incomplete, so any `activation_blockers` entry still present at that point in the code path is necessarily one of the 7 evidence-derived signals, not a profile/settings/artifacts/peripherals blocker.

## Deviations from Plan

None - plan executed exactly as written. All three tasks' `<action>`/`<verify>`/`<acceptance_criteria>` blocks were followed as specified; no Rule 1-4 auto-fixes were needed.

## Issues Encountered

- The plan's `<verify>` blocks specify `npx jest ...` directly, which fails with "Cannot use import statement outside a module" because this repo's compliance/migration-runner test suites are ESM and require `node --experimental-vm-modules node_modules/.bin/jest --config jest.config.cjs --runInBand` (the exact invocation each package's own `npm test` script uses, and the same invocation 08-06-PLAN.md's own `<verify>` block used). Ran the correct invocation instead; all tests pass. Not a deviation from the plan's intent — same test files, same assertions, correct runner flags.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- FSC-01 and FSC-02 are now both fully closed at the code/test level; `08-VERIFICATION.md`'s two remaining BLOCKER gaps in `modules/compliance` are resolved.
- Human verification still required (routed, not part of this plan, consistent with this phase's established precedent): apply migration `20260712140000` against a live `dgfy_business_*` tenant and confirm two concurrent evidence submissions for the same business with `branch_id` NULL yield exactly one `compliance_mode_state` row (the second attempt returns 409).
- `assertComplianceGate`'s signature and decision-mapping contract (established in 08-06) is unchanged by this closure — Phase 9's hand-off contract remains stable; Phase 9's checkout/shift/receipt call sites will now receive the fully-enforced `compliant_active` gating behavior when they wire the gate in.
- No other Phase 08 module (products, inventory, booking, shifts) or the composition root was touched — this closure was isolated entirely to `modules/compliance` and the compliance schema, per the plan's prohibitions.

---
*Phase: 08-commerce-foundation-product-catalog-booking-shift-cash-drawe*
*Completed: 2026-07-12*

## Self-Check: PASSED

All 9 files claimed as created/modified were verified present on disk, and all 4 commit hashes (`1a2c3f10`, `2d48da9a`, `9f437227`, `8d49d096`) were verified present in `git log --oneline --all`.
