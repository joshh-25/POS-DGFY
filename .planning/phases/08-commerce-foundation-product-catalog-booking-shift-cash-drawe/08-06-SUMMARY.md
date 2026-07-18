---
phase: 08-commerce-foundation-product-catalog-booking-shift-cash-drawe
plan: 06
subsystem: compliance
tags: [policy-engine, state-machine, fiscal-compliance, gate-port, express, sequelize]

requires:
  - phase: 08-commerce-foundation-product-catalog-booking-shift-cash-drawe
    provides: "08-02's ComplianceModeState Tenant model (models/Tenant/ComplianceModeState.js) registered in TenantConnector.getModels(), with the allowsFiscalChoice() domain-helper precedent this plan's entity mirrors"
provides:
  - "modules/compliance/policy/{constants.js,policyPacks.js,policyEngine.js}: full port of legacy's compliance policy engine (D-02/D-03) with exactly one deliberate deviation (D-05) — compliant_active allows BOTH fiscal and non_fiscal document contexts"
  - "assertComplianceGate({businessId, branchId?, operation, requestedDocumentContext, artifacts?, peripherals?, settings?, evidence?}) — the FSC-02 shared gate port, Phase 9's hand-off contract, mapping ALLOW/DENY/REQUIRES_SETUP to return/403/409"
  - "buildComplianceModule({tenantConnector, businessDatabaseRegistryRepository, businessRepository}) -> {repository, useCases, assertComplianceGate}"
  - "Manual compliance-mode review/transition path (D-04): getComplianceState, submitComplianceEvidence (staff-or-owner), reviewComplianceState (owner + verifierActorType required)"
  - "createComplianceRoutes(useCases, {authenticateAccount}) — GET /compliance/state, POST /compliance/evidence, POST /compliance/review (unmounted this phase, 08-08's scope)"
affects: [09]

tech-stack:
  added: []
  patterns:
    - "Pure-function policy engine module (policy/policyEngine.js) with zero I/O and zero model imports — the tenant-scoped state row is loaded and assembled into the engine's `tenant` context object entirely inside usecases/complianceGate.js, keeping the ported engine trivially unit-testable without mocking Sequelize"
    - "Gate port as an injected use-case function (buildAssertComplianceGate({repository}) -> assertComplianceGate(input)), matching research Pattern A — called from inside a usecase body, never middleware, never per-call-site duplicated logic"
    - "D-05 deviation implemented as a single deletion (not a rewrite): the compliant_active branch's deny-on-non-fiscal block is omitted entirely from the ported engine, everything else (including the large evaluateComplianceChecklist helper) ports unchanged"

key-files:
  created:
    - apps/dgfy-api/src/modules/compliance/policy/constants.js
    - apps/dgfy-api/src/modules/compliance/policy/policyPacks.js
    - apps/dgfy-api/src/modules/compliance/policy/policyEngine.js
    - apps/dgfy-api/src/modules/compliance/repositories/complianceModeStateRepository.js
    - apps/dgfy-api/src/modules/compliance/entities/complianceEntity.js
    - apps/dgfy-api/src/modules/compliance/usecases/complianceUseCases.js
    - apps/dgfy-api/src/modules/compliance/usecases/complianceGate.js
    - apps/dgfy-api/src/modules/compliance/controllers/complianceController.js
    - apps/dgfy-api/src/modules/compliance/routes.js
    - apps/dgfy-api/src/modules/compliance/index.js
    - apps/dgfy-api/src/modules/compliance/README.md
    - apps/dgfy-api/tests/unit/modules/compliance/complianceGate.test.js
  modified:
    - apps/dgfy-api/src/config/architectureGuardrailsAllowlist.js

key-decisions:
  - "Ported the ENTIRE compliancePolicyEngine.js (including the ~350-line evaluateComplianceChecklist helper, resolveReceiptContract, buildDecision, buildPreflightResult) rather than only the top-level branches the plan's read_first excerpts quoted — the compliant_active branch's checklist-completeness path (settings/artifacts/peripherals completeness) calls evaluateComplianceChecklist, so a faithful D-03 'full policy-pack depth' port requires the whole file, not just evaluateComplianceDecision's outer branches."
  - "DOCUMENT_CONTEXTS and POS_OPERATIONS (defined inline in legacy's compliancePolicyEngine.js, not exported from complianceConstants.js) are hoisted into constants.js per the plan's own read_first citation, so policyEngine.js imports them rather than redefining local copies — one source of truth for the D-05 requestedDocumentContext vocabulary."
  - "reviewComplianceState requires the caller to be an active business owner (role: 'owner') rather than a dedicated tenant_master_admin/platform_admin role, because no such role exists yet in this system's Accounts/Businesses APIs (landlord business_memberships only has 'owner'/'member'). verifierActorType is still a required, validated, first-class input recorded verbatim on the row — a future phase can tighten the access-control check alone without changing the input's shape."
  - "submitComplianceEvidence treats complianceProfile as a full-replacement object (not a partial/deep-merge) — simpler, predictable write semantics; the plan left the exact evidence-submission shape to discretion."
  - "assertComplianceGate accepts artifacts/peripherals/settings/evidence as optional pass-through inputs (default empty) since no artifact/peripheral/settings persistence tables exist yet this phase (out of scope) — a compliant_active business with no submitted checklist evidence correctly falls through to REQUIRES_SETUP rather than the gate silently assuming completeness, verified manually end-to-end (see Issues Encountered)."
  - "Removed the literal string 'DOCUMENT_CONTEXT_NOT_ALLOWED' from policyEngine.js's own doc comments (paraphrased as 'a dedicated document context not allowed deny reason code') — the plan's own verify command and the test's source-grep assertion check for total absence of that string anywhere in the file, including comments."

patterns-established:
  - "Tenant-scoped repository resolving its model via tenantConnector.getModels(databaseName).ComplianceModeState (mirrors shiftRepository.js's most-recent convention, not the older direct-model-factory-import style in locationRepository.js)."
  - "Gate-port builder pattern: buildAssertComplianceGate({repository}) returns a bound assertComplianceGate function — the shape 08-08's composition root and Phase 9 will inject into other modules (e.g. buildShiftsModule({assertComplianceGate}))."

requirements-completed: [FSC-01, FSC-02]

coverage:
  - id: D1
    description: "Ported policy engine (constants.js/policyPacks.js/policyEngine.js) with the D-05 deviation: compliant_active allows both fiscal and non_fiscal document contexts; non_compliant_active/compliant_pending branches port unchanged"
    requirement: "FSC-01"
    verification:
      - kind: unit
        ref: "apps/dgfy-api/tests/unit/modules/compliance/complianceGate.test.js — 5 decision-truth-table tests (compliant_active+non_fiscal/fiscal -> ALLOW, non_compliant_active+fiscal -> DENY, compliant_pending+fiscal -> REQUIRES_SETUP, non_compliant_active+non_fiscal -> ALLOW), all passing"
        status: pass
      - kind: unit
        ref: "apps/dgfy-api/tests/unit/modules/compliance/complianceGate.test.js — 'the ported engine source contains no DOCUMENT_CONTEXT_NOT_ALLOWED deny path for compliant_active' (source-grep assertion), passing"
        status: pass
    human_judgment: false
  - id: D2
    description: "Tenant-scoped compliance-mode state machine: getForBusinessBranch/upsertState/recordVerification repository methods, ComplianceEntity with allowsFiscalChoice(), manual evidence-submission/review usecases (D-04)"
    requirement: "FSC-01"
    verification:
      - kind: manual_procedural
        ref: "ad hoc node -e script exercising getComplianceState -> submitComplianceEvidence -> reviewComplianceState end-to-end against a mocked in-memory repository: initial state non_compliant_active, evidence submission sets verification_status=pending_review, review with verifierActorType=tenant_master_admin + verificationStatus=verified + newState=compliant_active transitions state and sets allows_fiscal_choice=true — all assertions confirmed"
        status: pass
    human_judgment: false
  - id: D3
    description: "assertComplianceGate({businessId, operation, requestedDocumentContext, ...}) — the FSC-02 shared gate port, mapping ALLOW/DENY/REQUIRES_SETUP decisions to return/403/409, honoring the full D-03 checklist depth (not just D-05's state-level check)"
    requirement: "FSC-02"
    verification:
      - kind: unit
        ref: "Task 2 verify: node -e smoke check confirming buildComplianceModule returns {repository, useCases, assertComplianceGate} with assertComplianceGate as a function"
        status: pass
      - kind: manual_procedural
        ref: "ad hoc node -e script: gate call for a compliant_active business with no checklist evidence supplied correctly throws 409 COMPLIANCE_PROFILE_INCOMPLETE (not a false ALLOW); gate call for non_compliant_active+fiscal correctly throws 403 NON_COMPLIANT_FISCAL_DOCUMENT_BLOCKED"
        status: pass
    human_judgment: false
  - id: D4
    description: "createComplianceRoutes(useCases, {authenticateAccount}) — transport-only controller + route factory, throws without authenticateAccount, GET/POST endpoints behind auth"
    requirement: "FSC-02"
    verification:
      - kind: unit
        ref: "Task 2 verify: node -e smoke check confirming createComplianceRoutes({}, {}) throws mentioning authenticateAccount when the middleware is omitted"
        status: pass
    human_judgment: false

duration: 35min
completed: 2026-07-12
status: complete
---

# Phase 8 Plan 6: Compliance State Machine and Gate Port Summary

**Ported the full legacy BIR/NPC/BSP compliance policy engine into `modules/compliance` with exactly one deliberate deletion (D-05: compliant_active now allows both fiscal and non_fiscal document contexts instead of forcing Fiscal-only), plus the tenant-scoped state machine and the `assertComplianceGate` port that Phase 9 will wire into Checkout/Shift/receipt call sites.**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-07-12
- **Tasks:** 2/2 completed
- **Files modified:** 13 (12 created, 1 modified)

## Accomplishments

- Ported `policy/constants.js` (8 frozen enum objects from legacy `complianceConstants.js`, verbatim) plus `DOCUMENT_CONTEXTS`/`POS_OPERATIONS` hoisted from the engine file into one shared source of truth.
- Ported `policy/policyPacks.js` whole (D-03: full BIR/NPC/BSP policy-pack depth — versioned packs, required settings/profile-fields/artifacts per regulator, peripheral-class checks).
- Ported `policy/policyEngine.js` from `compliancePolicyEngine.js` — the entire file (including the ~350-line `evaluateComplianceChecklist` helper, receipt-contract resolution, and preflight-result building), with exactly ONE deletion: the `compliant_active` branch's deny-on-non-fiscal block (D-05). The `non_compliant_active` and `compliant_pending` branches, already correct in legacy, port unchanged.
- Wrote `complianceGate.test.js` — 6 tests: the full D-05 truth table (5 decision cases) plus a source-grep assertion proving the ported engine carries no denial path keyed on document context for `compliant_active`. All passing.
- Built the tenant-scoped state machine: `complianceModeStateRepository.js` (`getForBusinessBranch`/`upsertState`/`recordVerification`, mirroring `shiftRepository.js`'s scaffold), `complianceEntity.js` (`allowsFiscalChoice()` domain helper), and `complianceUseCases.js` (`getComplianceState`, `submitComplianceEvidence`, `reviewComplianceState` — D-04's manual-only review/transition path, automation explicitly not built).
- Built `complianceGate.js`'s `buildAssertComplianceGate({repository})` — the FSC-02 hand-off contract, loading the tenant's state row and mapping the ported engine's ALLOW/DENY/REQUIRES_SETUP decisions to a return value / 403 / 409 respectively.
- Built the transport layer (`complianceController.js`, `routes.js`) and `index.js`'s `buildComplianceModule({...}) -> {repository, useCases, assertComplianceGate}` DI factory — unmounted this phase (08-08's scope).
- Verified end-to-end via an ad hoc script: the full evidence-submission -> review -> state-transition -> gate-decision flow behaves correctly, including the gate correctly rejecting a `compliant_active` business with no checklist evidence (409, not a false ALLOW) — proving the D-03 checklist depth is honored, not just the D-05 state-level check.

## Task Commits

1. **Task 1: Port policy constants, packs, and engine — WITH the D-05 deviation** - `914ce419` (feat)
2. **Task 2: State-machine repository/usecases + gate port + controller/routes/DI factory** - `acca1401` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/dgfy-api/src/modules/compliance/policy/constants.js` - 8 frozen enums ported verbatim from legacy `complianceConstants.js`, plus `DOCUMENT_CONTEXTS`/`POS_OPERATIONS`
- `apps/dgfy-api/src/modules/compliance/policy/policyPacks.js` - whole-file port of the versioned BIR/NPC/BSP policy-pack structure
- `apps/dgfy-api/src/modules/compliance/policy/policyEngine.js` - ported `evaluateComplianceDecision` + full checklist/receipt-contract/preflight support, with the D-05 deletion
- `apps/dgfy-api/src/modules/compliance/repositories/complianceModeStateRepository.js` - tenant-scoped CRUD adapter (getForBusinessBranch/upsertState/recordVerification)
- `apps/dgfy-api/src/modules/compliance/entities/complianceEntity.js` - `ComplianceEntity` with `allowsFiscalChoice()`
- `apps/dgfy-api/src/modules/compliance/usecases/complianceUseCases.js` - getComplianceState/submitComplianceEvidence/reviewComplianceState
- `apps/dgfy-api/src/modules/compliance/usecases/complianceGate.js` - `buildAssertComplianceGate({repository})`, the FSC-02 hand-off contract
- `apps/dgfy-api/src/modules/compliance/controllers/complianceController.js` - transport-only controller
- `apps/dgfy-api/src/modules/compliance/routes.js` - `createComplianceRoutes(useCases, {authenticateAccount})`
- `apps/dgfy-api/src/modules/compliance/index.js` - `buildComplianceModule({...}) -> {repository, useCases, assertComplianceGate}`
- `apps/dgfy-api/src/modules/compliance/README.md` - module documentation (D-05 rationale, D-04 owner-gating rationale, endpoints, prohibitions)
- `apps/dgfy-api/tests/unit/modules/compliance/complianceGate.test.js` - D-05 regression suite (6 tests)
- `apps/dgfy-api/src/config/architectureGuardrailsAllowlist.js` - added `complianceController.js` to the `controllerNaming` allowlist (alongside products/inventory/shifts entries from prior plans in this wave)

## Decisions Made

See `key-decisions` in frontmatter for the full list. Highlights:
- Ported the entire `compliancePolicyEngine.js` file (not just the branches the plan's read_first excerpts quoted) because the `compliant_active` checklist-completeness path depends on the full `evaluateComplianceChecklist` helper — a genuinely faithful D-03 "full policy-pack depth" port requires it.
- `reviewComplianceState` gates on business-owner membership rather than a dedicated `tenant_master_admin`/`platform_admin` role, since no such role exists yet in this system's Accounts/Businesses APIs — `verifierActorType` remains a required, validated, first-class input recorded on the row so a future phase can tighten only the access-control check.

## Deviations from Plan

None beyond the discretionary implementation choices already documented in `key-decisions` (evidence submission is full-replacement not partial-merge; owner-gated review pending a future dedicated admin role) — both are within the plan's explicitly stated "Claude's discretion" latitude for exact endpoint/parameter shapes, and neither changes the D-05/D-04 behavioral contract the plan mandates.

## Issues Encountered

- The plan's Task 1 verify command (`grep -n "DOCUMENT_CONTEXT_NOT_ALLOWED"`) and the test's source-grep assertion both check for total absence of that literal string anywhere in `policyEngine.js`, including doc comments. My first draft's D-05 explanation comments referenced the reason code by its literal string and failed both checks; reworded to paraphrase it ("a dedicated document context not allowed deny reason code") without losing the documentation value. Verified both the shell grep and the jest test pass after the rewording.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `assertComplianceGate({businessId, branchId?, operation, requestedDocumentContext, artifacts?, peripherals?, settings?, evidence?})` is the stable, documented Phase 9 hand-off contract — Phase 9 wires it into Checkout, Shift-open, and receipt-issuance call sites without needing to change this function's shape.
- `buildComplianceModule({tenantConnector, businessDatabaseRegistryRepository, businessRepository})` returns `{repository, useCases, assertComplianceGate}`, ready for 08-08's composition root to construct alongside the other four Phase 8 modules and inject `assertComplianceGate` into `buildShiftsModule({assertComplianceGate})` per `shifts/index.js`'s already-accepted optional parameter.
- No artifact/peripheral/settings persistence exists yet (out of scope this phase) — Phase 9 (or a later gap-closure) will need to decide where that checklist evidence is stored and passed into `assertComplianceGate`'s optional `artifacts`/`peripherals`/`settings`/`evidence` inputs; the gate correctly fails closed (`REQUIRES_SETUP`) in their absence today, which is safe but means a `compliant_active` business cannot actually pass a POS-operation gate check until that persistence exists.
- No blockers for 08-07/08-08.

---
*Phase: 08-commerce-foundation-product-catalog-booking-shift-cash-drawe*
*Completed: 2026-07-12*

## Self-Check: PASSED

- FOUND: `apps/dgfy-api/src/modules/compliance/policy/constants.js`
- FOUND: `apps/dgfy-api/src/modules/compliance/policy/policyPacks.js`
- FOUND: `apps/dgfy-api/src/modules/compliance/policy/policyEngine.js`
- FOUND: `apps/dgfy-api/src/modules/compliance/repositories/complianceModeStateRepository.js`
- FOUND: `apps/dgfy-api/src/modules/compliance/entities/complianceEntity.js`
- FOUND: `apps/dgfy-api/src/modules/compliance/usecases/complianceUseCases.js`
- FOUND: `apps/dgfy-api/src/modules/compliance/usecases/complianceGate.js`
- FOUND: `apps/dgfy-api/src/modules/compliance/controllers/complianceController.js`
- FOUND: `apps/dgfy-api/src/modules/compliance/routes.js`
- FOUND: `apps/dgfy-api/src/modules/compliance/index.js`
- FOUND: `apps/dgfy-api/src/modules/compliance/README.md`
- FOUND: `apps/dgfy-api/tests/unit/modules/compliance/complianceGate.test.js`
- FOUND: `apps/dgfy-api/src/config/architectureGuardrailsAllowlist.js`
- FOUND commit: `914ce419` (Task 1)
- FOUND commit: `acca1401` (Task 2)
