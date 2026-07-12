---
phase: 08-commerce-foundation-product-catalog-booking-shift-cash-drawe
verified: 2026-07-12T16:10:00Z
status: gaps_found
score: 6/7 must-haves verified
behavior_unverified: 2
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 5/7
  gaps_closed:
    - "FSC-01: A tenant/branch carries exactly one compliance_mode_state row per (business_id, branch_id) — the D-01/D-02 tenant-scoped state invariant (CR-01, original verification)."
  gaps_remaining:
    - "FSC-02: The single shared compliance gate port (assertComplianceGate) actually evaluates eligibility against the full evidence-derived readiness checklist it documents itself as enforcing — STILL FAILING, via a newly-introduced fail-open/fail-closed inconsistency inside the 08-09 gap-closure's own deliverable."
  regressions: []
gaps:
  - truth: "FSC-02: The single shared compliance gate port (assertComplianceGate) actually evaluates eligibility against the full evidence-derived readiness checklist it computes and documents itself as enforcing, not duplicated/weakened per surface, and never silently assumes completeness for an omitted signal."
    status: failed
    reason: "The 08-09 gap-closure DID wire evaluateComplianceDecision()'s compliant_active POS branch to consult checklist.ready_for_compliant_activation (confirmed present at policyEngine.js, and proven correct for the ALL-OMITTED and ALL-PRESENT-explicit-true/false cases by complianceChecklistGating.test.js, 9/9 passing). However, evaluateComplianceChecklist() itself (policyEngine.js:383-398, confirmed by direct read) computes the seven evidence-derived signals with two DIFFERENT default policies: 5 signals (fiscalAccumulatorStreamReady, auditLogAppendOnlyEnforced, paymentHandoffPolicyReady, submissionArtifactsReady, encryptionPolicyPrerequisitesReady) use the `!== false` idiom — an omitted/undefined evidence field is silently treated as SATISFIED — while only 2 signals (rmoFilingReadinessReady, fiscalTerminalRegistrationReady) use `=== true` — an omitted field is correctly treated as UNSATISFIED. I independently reproduced this by executing evaluateComplianceDecision() directly (not just reading the code) with a partial evidence bundle that supplies ONLY the two fail-closed signals ({ rmo_filing_readiness: {ready:true}, fiscal_terminal_registration: {ready:true} }) and omits the other five entirely: the call returned decision='allow', reason_code='ALLOWED', checklist.ready_for_compliant_activation=true — i.e. a compliant_active business whose fiscal-accumulator-stream readiness, audit-log append-only enforcement, payment-handoff policy, submission-artifact readiness, and encryption prerequisites were NEVER asserted still gets ALLOW for POS_CHECKOUT. This directly contradicts complianceGate.js's own header comment (line 41, confirmed by direct read): 'the gate never silently assumes completeness for any of the seven signals.' The existing test suite (complianceChecklistGating.test.js) does not catch this because every single-signal-knockout test starts from buildFullEvidence() (all seven fields explicitly true) and flips exactly one to false — it never tests a PARTIAL bundle where a fail-open field is simply absent. This is CR-01 in the fresh 08-REVIEW.md (Critical/Blocker), filed against the 08-09 gap-closure's own deliverable, and it is confirmed here both by direct code read and by direct code execution (not by trusting the review or the SUMMARY)."
    artifacts:
      - path: "apps/dgfy-api/src/modules/compliance/policy/policyEngine.js"
        issue: "evaluateComplianceChecklist() (~lines 383-398) uses `!== false` (fail-open on omission) for 5 of 7 evidence-derived readiness signals and `=== true` (fail-closed on omission) for only 2; this inconsistency lets a partial evidence bundle silently pass ready_for_compliant_activation, defeating the exact enforcement the 08-09 CR-02 gap-closure (Task 3) was meant to add."
      - path: "apps/dgfy-api/src/modules/compliance/usecases/complianceGate.js"
        issue: "Header comment (line 41) asserts 'the gate never silently assumes completeness for any of the seven signals' — a guarantee the code does not uniformly provide, since 5 of 7 signals still assume completeness on omission."
      - path: "apps/dgfy-api/tests/unit/modules/compliance/complianceChecklistGating.test.js"
        issue: "Covers full-bundle-minus-one-field and fully-empty-bundle cases only; has no test for a partial bundle that supplies just the 2 fail-closed fields and omits the 5 fail-open fields, so the bypass path is untested and will not regress-fail."
    missing:
      - "Make all seven signals fail closed consistently: change the 5 `!== false` checks to `=== true` (or equivalent explicit-boolean coercion) in evaluateComplianceChecklist()."
      - "Add a regression test asserting a partial evidence bundle (only rmo_filing_readiness and fiscal_terminal_registration set to true, the other five fields omitted) yields REQUIRES_SETUP, not ALLOW."
---

# Phase 8: Commerce Foundation — Product Catalog, Booking, Shift & Cash Drawer, Compliance Gating Verification Report

**Phase Goal:** Businesses can define what they sell and service (Products, folders, Basic Inventory, bookable Services) and staff can run accountable cash shifts, with a tenant/branch compliance-mode gate in place — establishing every downstream Checkout/Storefront dependency (product_id, shift-open precondition, compliance gate contract) in one phase, before Checkout is written against it. No new table references the legacy IMS-shared items/PosTransactionLine tables.

**Verified:** 2026-07-12T16:10:00Z
**Status:** gaps_found
**Re-verification:** Yes — after the 08-09 gap-closure plan (CR-01/CR-02 per the original 08-VERIFICATION.md). One of the two previously-failed truths (FSC-01) is now closed and independently confirmed. The other (FSC-02) remains failed, for a different, newly-introduced reason surfaced by a fresh code review (08-REVIEW.md) performed after the gap-closure landed.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1/PRD-01,02,03,05: Business owner can create a Product (food/service/retail), group into folders, choose basic_inventory/non_stock, on genuinely new `dgfy_business_*` tables, never FK'd to legacy `items`/`PosTransactionLine` | ✓ VERIFIED | Unchanged since original verification (no files touched by 08-09, confirmed via `git show --stat` on all four 08-09 commits — only `modules/compliance` + compliance schema files changed). `productUseCases.test.js` (16 tests) still passes in this run. |
| 2 | SC2/PRD-04: Every stock-count change is recorded as an append-only Inventory Movement row that cannot be mutated after insert | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Unchanged since original verification. App-layer fully present and unit-tested (11/11 `inventoryMovementUseCases.test.js` passing in this run); DB-layer `BEFORE UPDATE`/`BEFORE DELETE` trigger present in the 08-01 migration but unexercised (no live MySQL reachable here). See human_verification. |
| 3 | SC3/BOK-01,02,03: Business owner can mark a Service Product bookable (slot duration + branch-level concurrent capacity); Booking blocks once capacity is reached; a fulfilled Booking links to the Availment that completes it | ✓ VERIFIED (code+test), with a real-concurrency caveat | Unchanged since original verification. `bookingUseCases.test.js` (13/13) and `commerceModulesMount.test.js` (6/6) pass in this run. Real-MySQL concurrency proof (`bookingCapacity.test.js`) remains opt-in and unexercised here — see behavior_unverified_items. |
| 4 | SC4/SFT-01,02,03: Staff can open a shift with a declared float (one open shift per cashier+terminal, DB-enforced), close it with a computed Expected-vs-Actual Difference, and every cash-drawer event (incl. no-sale pop) is logged | ✓ VERIFIED (code+test), with a real-DB caveat | Unchanged since original verification. `shiftUseCases.test.js` (19/19) passes in this run. Real DB unique-index firing under concurrent writes remains unexercised — see human_verification. |
| 5 | SC5/FSC-01: A tenant/branch carries exactly one `compliance_mode_state` row per (business_id, branch_id), including when `branch_id IS NULL` | ✓ VERIFIED (closed by 08-09) | Independently re-derived, not taken on the SUMMARY's word. New migration `20260712140000-harden-compliance-mode-state-uniqueness.cjs` (read directly) adds a STORED generated column `branch_scope_key = COALESCE(branch_id, 0)` and a new unique index `unique_compliance_mode_state_business_branch_scope` on `(business_id, branch_scope_key)` — this makes the invariant DB-enforceable even for NULL branches (MySQL cannot treat two `0`s as distinct, unlike two `NULL`s). Confirmed the already-shipped `20260712100000-create-commerce-foundation.cjs` is byte-for-byte untouched (`git diff --stat 5e50af37^..HEAD` shows only the original creation commit touched it). Confirmed schema-contract (`dgfyBusinessContract.js`) and Tenant model (`ComplianceModeState.js`) both reference the new column/index name, old name removed. `ComplianceModeStateRepository.upsertState()` now uses `ComplianceModeState.findOrCreate()` (grepped, confirmed present) instead of the previous plain `findOne()`-then-`create()`/`update()` TOCTOU; a unique-constraint violation is duck-typed into `DuplicateComplianceModeStateError`, mapped to a clean 409 in both write-path usecases (confirmed by grep + read). `recordVerification()` now runs inside `sequelize.transaction()` with `lock: transaction.LOCK.UPDATE` (confirmed by direct read). `complianceModeStateRepository.test.js` (10/10) ran and passed in this session (not just cited from SUMMARY). |
| 6 | SC5/FSC-02: Checkout/Shift/receipt-issuance are gated through one shared compliance policy-engine gate port that actually enforces the paperwork-readiness signals it computes and documents, never silently assuming completeness for an omitted signal | ✗ FAILED (still, for a new reason) | The 08-09 gap-closure DID wire the `compliant_active` decision branch to `checklist.ready_for_compliant_activation` (confirmed present in policyEngine.js) and DID preserve the D-05 deviation (`complianceGate.test.js` 6/6 passing in this run). But I independently executed `evaluateComplianceDecision()` with a partial evidence bundle (only the 2 fail-closed signals populated, the other 5 omitted) and it returned `ALLOW` / `ready_for_compliant_activation: true` — proving `evaluateComplianceChecklist()`'s inconsistent `!== false` (5 signals) vs. `=== true` (2 signals) defaults produce exactly the "silently assumes completeness" bypass the gate's own header comment claims is eliminated. This is CR-01 in the fresh 08-REVIEW.md; confirmed here by both direct code read (policyEngine.js:383-398) and direct code execution, not by trusting the review or the SUMMARY. See gaps. |
| 7 | Composition-root wiring: all 5 commerce modules built with the SAME shared `tenantConnector`/`businessRepository`/`businessDatabaseRegistryRepository`, mounted behind `authenticateAccount`; `assertComplianceGate` injected-but-unwired into shifts | ✓ VERIFIED | Unchanged since original verification (no files touched by 08-09). `commerceModulesMount.test.js` (6/6) and the full `dgfy-api` suite (258/258 non-skipped tests, 21/38 suites run) pass in this run — no regressions from the gap-closure. |

**Score:** 6/7 truths verified (2 present, behavior-unverified — see human_verification; 1 of the above 7 rows is a FAILED gap, not counted toward either verified or behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/dgfy-migration-runner/src/migrations/schema/20260712140000-harden-compliance-mode-state-uniqueness.cjs` | New forward-dated migration hardening compliance_mode_state uniqueness for NULL branches | ✓ VERIFIED | Read directly: idempotent up()/down(), STORED generated column + unique index, guarded with `describeTable`/`showIndex` checks. |
| `apps/dgfy-migration-runner/src/schemaContracts/dgfyBusinessContract.js` (compliance_mode_state entry) | Updated to `branch_scope_key` column + new index name | ✓ VERIFIED | Grepped and confirmed. |
| `apps/dgfy-api/src/models/Tenant/ComplianceModeState.js` | Updated indexes metadata; `branch_scope_key` NOT a writable attribute | ✓ VERIFIED | Grepped and confirmed; `branch_scope_key` absent from writable attribute list. |
| `apps/dgfy-api/src/modules/compliance/repositories/complianceModeStateRepository.js` | Atomic `findOrCreate()` write path + `DuplicateComplianceModeStateError` | ✓ VERIFIED | Grepped and confirmed; `isUniqueConstraintViolation()` present; error added to `withModel()`'s no-double-wrap list. |
| `apps/dgfy-api/src/modules/compliance/policy/policyEngine.js` | `compliant_active` branch gates ALLOW on `checklist.ready_for_compliant_activation` | ⚠️ WIRED BUT HOLLOW UPSTREAM | The wiring itself is correct and tested; the checklist function it depends on (`evaluateComplianceChecklist()`) computes 5 of 7 inputs with a fail-open default, so the correctly-wired gate still passes a false "ready" signal through in the partial-evidence case. See gaps. |
| `apps/dgfy-api/src/modules/compliance/usecases/complianceGate.js` | Header comment updated to describe the guarantee accurately | ✗ STILL INACCURATE | Line 41 claims "the gate never silently assumes completeness for any of the seven signals" — demonstrably false per the reproduction above. |
| `apps/dgfy-api/tests/unit/modules/compliance/complianceModeStateRepository.test.js` | New mocked unit test (CR-01/FSC-01) | ✓ VERIFIED | 10/10 passing, run directly in this session. |
| `apps/dgfy-api/tests/unit/modules/compliance/complianceChecklistGating.test.js` | New unit test (CR-02/FSC-02) | ⚠️ INCOMPLETE COVERAGE | 9/9 passing, but every case starts from a fully-explicit evidence bundle and flips one field — no partial/omitted-field case is tested, so it does not catch the fail-open bypass. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `complianceModeStateRepository.upsertState()` | `compliance_mode_state` table | `findOrCreate()` guarded by `unique_compliance_mode_state_business_branch_scope` | ✓ WIRED | Confirmed by direct read; closes the CR-01 TOCTOU race and the NULL-branch uniqueness gap. |
| `assertComplianceGate` -> `evaluateComplianceDecision()` | `compliant_active` POS branch | `checklist.ready_for_compliant_activation` | ⚠️ WIRED, BUT INPUT IS UNRELIABLE | The decision branch correctly reads the roll-up flag; the roll-up flag itself is computed from 5 fail-open + 2 fail-closed signals, so "wired" does not mean "enforces" for the partial-evidence case. Reproduced directly by executing the code with a partial evidence bundle → `ALLOW`. |
| `shifts` module | `assertComplianceGate` | injected, not invoked (Phase 9 wiring) | ✓ WIRED (as designed) | Unchanged; confirmed by direct read. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Compliance unit suites (repository + checklist-gating + D-05 regression) | `node --experimental-vm-modules node_modules/.bin/jest --config jest.config.cjs --runInBand tests/unit/modules/compliance/{complianceModeStateRepository,complianceChecklistGating,complianceGate}.test.js` | 25/25 tests passed | ✓ PASS |
| Full dgfy-api suite (regression check) | `node --experimental-vm-modules node_modules/.bin/jest --config jest.config.cjs --runInBand` | 258/258 non-skipped tests passed, 21/38 suites run (remainder pre-existing opt-in integration suites) | ✓ PASS |
| Full migration-runner suite (regression check) | `node --experimental-vm-modules node_modules/.bin/jest --config jest.config.cjs --runInBand` | 308/308 non-skipped tests passed, 23/26 suites run | ✓ PASS |
| **Independent reproduction of CR-01 (checklist fail-open bypass)** | Direct `node` invocation of `evaluateComplianceDecision()` with a partial evidence bundle (only `rmo_filing_readiness`/`fiscal_terminal_registration` populated, other 5 fields omitted), fully-ready profile/settings/artifacts/peripherals | `decision: allow`, `reason_code: ALLOWED`, `checklist.ready_for_compliant_activation: true` | ✗ FAIL (confirms the gap — this SHOULD have returned REQUIRES_SETUP) |
| Untouched-migration regression check | `git diff --stat 5e50af37^..HEAD -- 20260712100000-create-commerce-foundation.cjs` | Only the original creation commit (`5e50af37`) touched the file | ✓ PASS |
| 08-09 commits scoped to `modules/compliance` only | `git show --stat` on all four 08-09 commits | Only compliance module/schema/test files + SUMMARY/PLAN docs touched — no products/inventory/booking/shifts/composition-root files | ✓ PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes found and none declared in this phase's PLAN/SUMMARY files. Skipped — no probes to run.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| PRD-01 | 08-03 | Product category (food/service/retail) on Product | ✓ SATISFIED | Unchanged; not touched by 08-09. |
| PRD-02 | 08-03 | Basic Inventory vs. non-stock per Product; per-line stock_effect_type deferred to Phase 9 (D-07) | ✓ SATISFIED | Unchanged; not touched by 08-09. |
| PRD-03 | 08-03 | Group Products into folders | ✓ SATISFIED | Unchanged; not touched by 08-09. |
| PRD-04 | 08-01/08-04 | Append-only Inventory Movement ledger | ✓ SATISFIED (app layer); ⚠️ DB-trigger unexercised | Unchanged; not touched by 08-09. |
| PRD-05 | 08-01 | Genuinely new `dgfy_business_*` tables, never FK'd to legacy tables | ✓ SATISFIED | Unchanged; not touched by 08-09. |
| BOK-01 | 08-03 | Mark a Service Product bookable with slot duration + branch capacity | ✓ SATISFIED | Unchanged; not touched by 08-09. |
| BOK-02 | 08-07 | Booking blocks once branch capacity reached | ✓ SATISFIED (code+test); ⚠️ real-concurrency proof unexercised | Unchanged; not touched by 08-09. |
| BOK-03 | 08-07 | Fulfilled Booking links to the Availment that completes it | ✓ SATISFIED | Unchanged; not touched by 08-09. |
| SFT-01 | 08-01/08-05 | One open shift per cashier+terminal, DB-level enforced | ✓ SATISFIED (code+test); ⚠️ real DB-constraint firing unexercised | Unchanged; not touched by 08-09. |
| SFT-02 | 08-05 | Close shift with computed Expected-vs-Actual signed Difference | ✓ SATISFIED | Unchanged; not touched by 08-09. |
| SFT-03 | 08-01/08-05 | Every cash-drawer event logged, append-only | ✓ SATISFIED (app layer); ⚠️ DB-trigger unexercised | Unchanged; not touched by 08-09. |
| FSC-01 | 08-02/08-06/08-09 | Tenant/branch compliance-mode state, exactly one row per (business_id, branch_id) | ✓ SATISFIED (now closed) | 08-09's migration + atomic `findOrCreate` write path independently confirmed via direct read, grep, and passing tests. |
| FSC-02 | 08-06/08-08/08-09 | One shared compliance gate port, not duplicated per surface, never silently assumes completeness | ✗ BLOCKED (still) | Gate is wired to consult the checklist, but the checklist itself fails open for 5 of 7 signals — independently reproduced by direct code execution. REQUIREMENTS.md marks FSC-02 `[x] Complete`, which this verification contradicts; that checkbox should not be trusted until this gap closes. |

No orphaned requirements found — all 13 IDs (PRD-01..05, BOK-01..03, SFT-01..03, FSC-01..02) declared across the 9 plans (including 08-09) match REQUIREMENTS.md's Phase 8 mapping.

**Note on REQUIREMENTS.md:** REQUIREMENTS.md currently marks FSC-02 as `[x]` complete (line 113) and the Phase 8 coverage table marks it "Complete" (line 230). This verification finds that claim false at the code level (see FSC-02 gap above) — REQUIREMENTS.md's checkbox should not be updated to Complete until the checklist fail-open defect is fixed and a partial-evidence regression test is added.

### Anti-Patterns Found

No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers found in any of the 9 files the 08-09 gap-closure modified (grepped directly).

The fresh 08-REVIEW.md also surfaced a second Critical finding (its CR-02, distinct from the CR-01 covered above) that is **not** part of this phase's stated must-haves/success-criteria and is therefore reported here as a WARNING rather than a gate on phase status, but is worth flagging because of its severity classification in the review:

| File | Finding | Severity (per 08-REVIEW.md) | Impact |
|------|---------|----------|--------|
| `productController.js`, `productFolderController.js`, `complianceController.js` (camelCase `businessId`) vs. `inventoryMovementController.js`, `shiftController.js`, `bookingController.js` (snake_case `business_id`) | Cross-module request-field naming inconsistency for the `businessId`/`business_id` key specifically (every other field is consistently snake_case on the wire in all five modules) | Critical (per review) | A client built against one module's convention will get a 400 `"businessId is required."` on the other four modules' endpoints. Not one of Phase 8's declared must-haves/success-criteria, but is a real cross-module contract defect that a future Storefront/Checkout client integration (Phase 9) would hit immediately. Recommend a follow-up fix before Phase 9 client code is written against these five endpoints. |

The following WARNING/INFO-level findings from 08-REVIEW.md are unchanged from the original verification pass (not re-derived here since they are outside this re-verification's failed-item scope, and none of the touched files in 08-09 are among them):

| File | Finding | Severity |
|------|---------|----------|
| `guardBusinessAccess` fails open when `requestingAccountId` is falsy (WR-01, review) | Not reachable via current HTTP API | Warning |
| `withModel`/`withModels` maps most uncaught errors to a misleading 503 (WR-01, review, formerly WR-02) | Client-caused errors surfaced as "database unreachable" | Warning |
| `productRepository.js`/`productFolderRepository.js`/`bookingRepository.js` single-row lookups not scoped by `business_id` | Relies on 1-DB-per-business | Warning |
| `ProductFolderRepository.create()` doesn't duck-type its unique-name violation (new WR-02 in the fresh review) | Concurrent duplicate folder name surfaces as misleading 503 instead of 409 | Warning |
| No dedicated unit test for the 08-01 migration file | Confirmed still true | Warning |

### Human Verification Required

1. **Verify command against a real tenant DB**
   **Test:** Run the 08-01 + 08-09 migrations against a real `dgfy_business_*` tenant, then run `verify`.
   **Expected:** `ok:true`, 8+1 tables/columns present, `branch_scope_key` populated correctly.
   **Why human:** No live MySQL reachable in this environment.

2. **Append-only trigger firing**
   **Test:** Attempt a raw SQL UPDATE/DELETE against an `inventory_movements` row and a `cash_drawer_events` row.
   **Expected:** Both rejected with SQLSTATE 45000.
   **Why human:** No live MySQL reachable; no unit test in this repo exercises the trigger SQL.

3. **One-open-shift, booking-capacity, and compliance-mode-state real concurrency**
   **Test:** Open two shifts concurrently for the same (terminal_id, cashier_account_id); run `bookingCapacity.test.js` with `RUN_BOOKING_CAPACITY_INTEGRATION=true` against real MySQL; submit two concurrent compliance-evidence writes for the same business with `branch_id IS NULL`.
   **Expected:** Second shift-open rejected via unique index (409); booking test shows exactly 1 success, no oversell; second compliance-evidence write yields a clean 409 via `unique_compliance_mode_state_business_branch_scope`, not a duplicate row.
   **Why human:** No live MySQL available in this environment to fire real DB-level constraints/races.

### Gaps Summary

Of the 7 top-level truths, 6 are fully verified (2 of those carry a real-DB caveat routed to human verification, consistent with this project's established precedent for a MySQL-less environment). The remaining truth — **FSC-02** — is still a genuine, independently-reproduced failure, even after the 08-09 gap-closure plan explicitly targeted it:

**FSC-01 is genuinely closed.** The 08-09 gap-closure's migration, schema-contract sync, model sync, atomic `findOrCreate()` write path, duck-typed 409 conflict mapping, and transaction+row-lock hardening of `recordVerification()` were all independently confirmed by direct code read, grep, and by actually running the new unit test file (10/10 passing) rather than trusting the SUMMARY's claim.

**FSC-02 is NOT genuinely closed**, despite 08-09-SUMMARY.md's claim that "FSC-01 and FSC-02 are now both fully closed at the code/test level." The gap-closure correctly wired `evaluateComplianceDecision()`'s `compliant_active` branch to consult `checklist.ready_for_compliant_activation`, and this wiring is proven correct by 9/9 passing tests for the cases those tests cover (fully-ready ALLOW, single-signal-flip-to-false REQUIRES_SETUP, fully-empty-bundle REQUIRES_SETUP, D-05 preserved). But the upstream function that produces that roll-up flag, `evaluateComplianceChecklist()`, computes 5 of its 7 inputs with a `!== false` (fail-open-on-omission) default and only 2 with `=== true` (fail-closed-on-omission) — an inconsistency the test suite never exercises because every test case supplies an explicit boolean for all seven fields. I independently reproduced the resulting bypass by executing the real code with a partial evidence bundle: a `compliant_active` business that only ever asserts the two fail-closed signals gets `ALLOW` for `POS_CHECKOUT`, exactly the "silently assumes completeness" failure mode `complianceGate.js`'s own header comment (added by this same gap-closure) claims has been eliminated. This is CR-01 in the fresh, post-gap-closure 08-REVIEW.md, and it sits inside the gap-closure's own new code — a regression risk introduced by, not left over from, 08-06-PLAN.md.

Because FSC-02 is one of this phase's five stated ROADMAP success criteria and one of its 13 tracked requirement IDs, this is a BLOCKER: the phase goal ("a tenant/branch carries a compliance-mode state ... checked through one shared policy-engine gate port ... wired into Checkout, Shift, and receipt issuance in Phase 9") is not yet safely satisfied — Phase 9 would inherit a gate that can be silently bypassed by any caller that doesn't populate all five fail-open evidence fields, which the fields' own naming ("payment_handoff_policy_ready", "encryption_policy_prerequisites_ready", etc.) makes look optional rather than mandatory.

**Recommended fix (small, isolated, does not require a new gap-closure plan restart):** change the 5 fail-open signals in `evaluateComplianceChecklist()` (policyEngine.js:383-390) from `!== false` to `=== true` (or explicit strict-boolean coercion), and add one regression test asserting a partial-evidence bundle (only the 2 currently-fail-closed fields populated) yields `REQUIRES_SETUP`. This exactly matches the fix 08-REVIEW.md's CR-01 already proposes; no design decision is required since Option A (full checklist enforcement) was already chosen and implemented for the wiring layer — this is purely correcting the checklist's own default-value consistency.

---

_Verified: 2026-07-12T16:10:00Z_
_Verifier: Claude (gsd-verifier)_
