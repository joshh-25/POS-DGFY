---
phase: 08-commerce-foundation-product-catalog-booking-shift-cash-drawe
verified: 2026-07-13T00:35:00Z
status: gaps_found
score: 7/7 must-haves verified
behavior_unverified: 1
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 6/7
  gaps_closed:
    - "FSC-02: evaluateComplianceChecklist() now fails closed uniformly on all seven evidence-derived readiness signals (five `!== false` defaults changed to `=== true`); a compliant_active POS_CHECKOUT with a partial evidence bundle (only rmo_filing_readiness + fiscal_terminal_registration supplied) now returns REQUIRES_SETUP / COMPLIANT_MODE_FAIL_CLOSED with checklist.ready_for_compliant_activation === false, independently re-derived by direct code execution, not by trusting 08-10-SUMMARY.md."
  gaps_remaining: []
  regressions: []
gaps:
  - truth: "FSC-01: A tenant/branch's compliance_mode_state accurately reflects whether required fiscal paperwork is currently present and verified — the ROADMAP SC5 text this phase claims to satisfy ('A tenant/branch carries a compliance-mode state reflecting whether required fiscal paperwork is present and verified')."
    status: failed
    reason: "Newly surfaced by the fresh, post-08-10 08-REVIEW.md (its CR-01, Critical) and independently confirmed here by direct code read (not by trusting the review). buildReviewComplianceStateUseCase (complianceUseCases.js:274-329) only writes compliance_mode_state.state when verificationStatus === 'verified' (line 308-310: `finalRow = verificationStatus === VERIFIED ? await repository.upsertState(...) : verified`). For 'rejected'/'revoked' outcomes, only verification_status/verified_by_actor_type/verified_at metadata is patched via recordVerification() -- state is left completely untouched. I independently confirmed this is HTTP-reachable, not theoretical: routes.js:31 wires `POST /compliance/review` to complianceController.review(), which calls this exact usecase with no state-transition path for reject/revoke. I also independently confirmed complianceGate.js's tenant construction (lines 121-130) never reads or forwards verification_status into evaluateComplianceDecision() at all -- it only passes `stateRow?.state`. So a business that reached compliant_active, is later reviewed and marked 'revoked' (e.g. a forged BIR accreditation is discovered), keeps `state: compliant_active` forever after that review call, and evaluateComplianceDecision() -- which branches exclusively on `modeState`, never on verification_status -- keeps returning ALLOW for Fiscal-context POS_CHECKOUT. This is the same fail-open authorization-bypass class this very re-verification session just finished closing for FSC-02 (silently trusting stale/incomplete evidence), just in the state-machine layer instead of the evidence-checklist layer. REQUIREMENTS.md marks FSC-01 `[x]` Complete; this evidence contradicts that for the revoke/reject lifecycle."
    artifacts:
      - path: "apps/dgfy-api/src/modules/compliance/usecases/complianceUseCases.js"
        issue: "buildReviewComplianceStateUseCase (lines 274-329) ignores `newState` and never demotes `compliance_mode_state.state` for 'rejected'/'revoked' verification outcomes -- only verification metadata changes."
      - path: "apps/dgfy-api/src/modules/compliance/usecases/complianceGate.js"
        issue: "Tenant object built for evaluateComplianceDecision() (lines 121-130) never carries verification_status -- the gate has no plumbing to even know a review outcome was 'revoked', regardless of what complianceUseCases.js does."
      - path: "apps/dgfy-api/src/modules/compliance/policy/policyEngine.js"
        issue: "evaluateComplianceDecision() (lines 747-1066) branches exclusively on `tenant.compliance_mode_state` (the `state` column); never consults verification_status, so even a plumbing fix in complianceGate.js alone would not be sufficient without a corresponding branch here."
    missing:
      - "Decide and implement the correct state-machine transition for a 'rejected'/'revoked' review outcome (e.g. demote to non_compliant_active or compliant_pending) inside buildReviewComplianceStateUseCase, consistent with whatever design D-04 intends for this case, and/or thread verification_status into complianceGate.js's tenant object and branch on it in evaluateComplianceDecision()."
      - "Add a regression test: a compliant_active business reviewed with verificationStatus='revoked' must no longer reach ALLOW for a Fiscal POS_CHECKOUT afterward."
---

# Phase 8: Commerce Foundation — Product Catalog, Booking, Shift & Cash Drawer, Compliance Gating Verification Report

**Phase Goal:** Deliver the Commerce Domain foundation — Product Catalog (with folders, inventory-mode, bookable configuration), append-only Inventory ledger, Booking (create/cancel with atomic capacity enforcement), Shifts & Cash Drawer (open/close with Expected-vs-Actual reconciliation), and the tenant-scoped Compliance mode-state machine + shared gate port — all 5 modules wired into the dgfy-api composition root and booting cleanly together.

**Verified:** 2026-07-13T00:35:00Z
**Status:** gaps_found
**Re-verification:** Yes — this is the third verification pass. First pass (2026-07-12, initial): 5/7. Second pass (2026-07-12, after 08-09): 6/7, FSC-02 still failing on a fail-open checklist-default inconsistency. This third pass verifies the 08-10 gap-closure plan, which targeted exactly that FSC-02 failure. **FSC-02 is now genuinely closed, independently confirmed by direct code execution, not by trusting 08-10-SUMMARY.md's claims.** However, a fresh code review performed after 08-10 landed (08-REVIEW.md) surfaced a NEW Critical-severity finding (its CR-01, distinct from the original verification's CR-01 naming) that this pass judges DOES falsify FSC-01's literal roadmap text (state does not reliably "reflect" current paperwork status across the revoke/reject lifecycle) — this is reported as a new gap below, so overall status remains `gaps_found` even though the specific truth this re-verification was chartered to check (FSC-02) is closed.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1/PRD-01,02,03,05: Business owner can create a Product (food/service/retail), group into folders, choose basic_inventory/non_stock, on genuinely new `dgfy_business_*` tables, never FK'd to legacy `items`/`PosTransactionLine` | ✓ VERIFIED | Unchanged since prior verification passes; no files in this module were touched by 08-09 or 08-10 (confirmed: 08-10's two commits only touch `policyEngine.js` and `complianceChecklistGating.test.js`). `productUseCases.test.js` re-run in this session as part of the full-suite regression (259/259 passing). |
| 2 | SC2/PRD-04: Every stock-count change is recorded as an append-only Inventory Movement row that cannot be mutated after insert | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Unchanged. App-layer fully present and unit-tested (part of the 259/259 full-suite pass this session); DB-layer `BEFORE UPDATE`/`BEFORE DELETE` trigger present in the 08-01 migration but unexercised (no live MySQL reachable in this environment). See human_verification. |
| 3 | SC3/BOK-01,02,03: Business owner can mark a Service Product bookable (slot duration + branch-level concurrent capacity); Booking blocks once capacity is reached; a fulfilled Booking links to the Availment that completes it | ✓ VERIFIED (code+test, create path), with a real-concurrency caveat and a newly-flagged cancel-path race (see Anti-Patterns) | Unchanged core verification; `bookingUseCases.test.js` and `commerceModulesMount.test.js` re-run in this session's full-suite pass (259/259). The create-side atomic-guard oversell prevention (the literal BOK-02 requirement text) remains intact and tested. A newly surfaced code-review finding (CR-02, see Anti-Patterns) affects the *cancel* path specifically, not the create-path guarantee BOK-02 as worded actually promises — routed as a WARNING, not a gap, per this verification's judgment call (see below). |
| 4 | SC4/SFT-01,02,03: Staff can open a shift with a declared float (one open shift per cashier+terminal, DB-enforced), close it with a computed Expected-vs-Actual Difference, and every cash-drawer event (incl. no-sale pop) is logged | ✓ VERIFIED (code+test, base functionality), with a real-DB caveat and a newly-flagged close-path race (see Anti-Patterns) | Unchanged core verification; `shiftUseCases.test.js` re-run in this session's full-suite pass (259/259). The base Expected-vs-Actual computation and append-only logging (the literal SFT-02/SFT-03 requirement text) remain intact and tested. A newly surfaced code-review finding (CR-03, see Anti-Patterns) affects concurrent double-close specifically, not the base computation/logging guarantee SFT-02/SFT-03 as worded actually promise — routed as a WARNING, not a gap (see below). |
| 5 | SC5/FSC-01: A tenant/branch carries exactly one `compliance_mode_state` row per (business_id, branch_id), including when `branch_id IS NULL` | ✓ VERIFIED (closed by 08-09) | Unchanged since second pass; the uniqueness invariant itself remains correctly enforced (generated `branch_scope_key` column + unique index, `findOrCreate()` atomic write path). **However, see the NEW gap below** — this same requirement ID's broader roadmap text ("reflecting whether required fiscal paperwork is present and verified") is now judged FAILED for a different reason (the revoke/reject lifecycle), independently confirmed by direct code read in this session. |
| 6 | SC5/FSC-02: Checkout/Shift/receipt-issuance are gated through one shared compliance policy-engine gate port that actually enforces the paperwork-readiness signals it computes and documents, never silently assuming completeness for an omitted signal | ✓ VERIFIED (closed by 08-10) | **Independently re-derived by direct code execution in this session, not by trusting 08-10-SUMMARY.md.** Confirmed `grep -c '!== false' policyEngine.js` returns 0 (zero fail-open defaults remain among the seven evidence-derived signals). Wrote and ran a standalone reproduction script (outside the test file, using the raw exported `evaluateComplianceDecision()`) with a compliant_active POS_CHECKOUT and a partial evidence bundle supplying ONLY `rmo_filing_readiness`/`fiscal_terminal_registration` and omitting the other five signals: result was `decision: "requires_setup"`, `reason_code: "COMPLIANT_MODE_FAIL_CLOSED"`, `checklist.ready_for_compliant_activation: false` — exactly the fix's claimed behavior, NOT the prior ALLOW bypass. Also independently re-ran the D-05 deviation check (fully-ready compliant_active + fiscal -> ALLOW; + non_fiscal -> ALLOW) via the same standalone script: both correctly return ALLOW, confirming D-05 was not weakened by the fix. Ran the three-file compliance jest suite directly (26/26 passing) and the full `dgfy-api` suite directly (259/259 passing, 0 failures) — both match 08-10-SUMMARY.md's claims, confirmed by actually executing them, not by reading the SUMMARY. |
| 7 | Composition-root wiring: all 5 commerce modules built with the SAME shared `tenantConnector`/`businessRepository`/`businessDatabaseRegistryRepository`, mounted behind `authenticateAccount`; `assertComplianceGate` injected-but-unwired into shifts | ✓ VERIFIED | Unchanged; 08-10 touched only `policyEngine.js` and one test file (confirmed via `git show --stat` on both 08-10 commits: 13 lines added to the test file, 5 insertions/5 deletions to policyEngine.js). `commerceModulesMount.test.js` re-run as part of the 259/259 full-suite pass. |

**Score:** 7/7 truths verified at the specific-derived-truth level (1 present, behavior-unverified — see human_verification). **A NEW gap was independently found and added below (not one of these 7 rows) — see Gaps.**

### Required Artifacts (08-10 scope)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/dgfy-api/src/modules/compliance/policy/policyEngine.js` (`evaluateComplianceChecklist`) | Five `!== false` defaults changed to `=== true` | ✓ VERIFIED | Read directly: lines 383-390 all use `=== true` (`fiscalAccumulatorStreamReady`, `auditLogAppendOnlyEnforced`, `paymentHandoffPolicyReady`, `submissionArtifactsReady`, `encryptionPolicyPrerequisitesReady`); lines 394/398 (`rmoFilingReadinessReady`, `fiscalTerminalRegistrationReady`) already `=== true`, untouched. `grep -c '!== false'` on the whole file returns 0. |
| `apps/dgfy-api/tests/unit/modules/compliance/complianceChecklistGating.test.js` | New partial-evidence regression test | ✓ VERIFIED | Read directly: new `test('partial evidence bundle: ...')` present in the CR-02/FSC-02 describe block (line 186), asserts REQUIRES_SETUP + not ALLOW + `ready_for_compliant_activation === false` + reason_code `COMPLIANT_MODE_FAIL_CLOSED`. Ran the file directly: 10/10 passing (was 9/9). |
| `apps/dgfy-api/src/modules/compliance/usecases/complianceGate.js` (header comment) | Accurate statement of the "never silently assumes completeness" guarantee | ✓ VERIFIED (now accurate) | Read directly: line 41's claim is now true given the `=== true` roll-up in `ready_for_compliant_activation` (line 693-706 ANDs all seven signals). Left unedited by 08-10 per plan instructions (it was already accurate post-fix); confirmed unchanged. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `evaluateComplianceChecklist()` | `checklist.ready_for_compliant_activation` | Seven-signal AND roll-up (lines 693-706) | ✓ WIRED | Read directly: all seven signals now use consistent `=== true`/boolean-strict derivation; the roll-up ANDs all seven. |
| `assertComplianceGate` -> `evaluateComplianceDecision()` | `compliant_active` POS branch | `checklist.ready_for_compliant_activation` | ✓ WIRED, INPUT NOW RELIABLE | Independently executed with a partial evidence bundle (see Truth #6 above) -- confirmed REQUIRES_SETUP, not ALLOW. The 08-09 wiring itself was untouched by 08-10 (confirmed by commit diff scope). |
| `shifts` module | `assertComplianceGate` | injected, not invoked (Phase 9 wiring) | ✓ WIRED (as designed) | Unchanged; confirmed by direct read. |
| `POST /compliance/review` -> `buildReviewComplianceStateUseCase` | `compliance_mode_state.state` | `newState` param, only for `verificationStatus === 'verified'` | ✗ NOT WIRED for reject/revoke | **New finding.** Confirmed by direct read: for `rejected`/`revoked` outcomes, `state` is never updated -- only verification metadata. Confirmed the endpoint is live/reachable (`routes.js:31`), not a Phase-9-deferred stub. See Gaps. |

### Data-Flow Trace (Level 4)

Not applicable in the traditional sense (this is a backend policy-engine/repository phase, not a UI-rendering phase). The equivalent trace performed here is the direct-execution reproduction described under Truth #6 and the Behavioral Spot-Checks below, tracing evidence-bundle input through `evaluateComplianceChecklist()` -> `ready_for_compliant_activation` -> `evaluateComplianceDecision()`'s branch -> the returned `decision`/`reason_code`.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Independent reproduction of FSC-02 fix (partial evidence bundle) | Standalone `node` script directly importing `evaluateComplianceDecision()` from `policyEngine.js` (not the jest test file) with a compliant_active POS_CHECKOUT and an evidence object containing only `rmo_filing_readiness`/`fiscal_terminal_registration` | `decision: "requires_setup"`, `reason_code: "COMPLIANT_MODE_FAIL_CLOSED"`, `ready_for_compliant_activation: false` | ✓ PASS (fix confirmed) |
| Independent reproduction of D-05 preservation | Same standalone script, fully-ready evidence bundle, `requested_document_context` = `fiscal` and `non_fiscal` in turn | Both return `decision: "allow"`, `reason_code: "ALLOWED"` | ✓ PASS |
| `grep -c '!== false'` on `policyEngine.js` | `grep -c '!== false' src/modules/compliance/policy/policyEngine.js` | `0` | ✓ PASS |
| Compliance unit suites (repository + checklist-gating + D-05 regression) | `node --experimental-vm-modules node_modules/.bin/jest --config jest.config.cjs --runInBand tests/unit/modules/compliance/{complianceModeStateRepository,complianceChecklistGating,complianceGate}.test.js` | 26/26 tests passed | ✓ PASS |
| Full `dgfy-api` suite (regression check, run once) | `node --experimental-vm-modules node_modules/.bin/jest --config jest.config.cjs --runInBand` | 259/259 non-skipped tests passed, 21/38 suites run (191 skipped opt-in integration suites, matches prior baseline) | ✓ PASS |
| Full `dgfy-migration-runner` suite (regression check, run once) | `node --experimental-vm-modules node_modules/.bin/jest --config jest.config.cjs --runInBand` | 308/308 non-skipped tests passed, 23/26 suites run | ✓ PASS |
| 08-10 commit scope confirmation | `git show --stat` on `8be19aef` and `b011a506` | Test commit: +13 lines to `complianceChecklistGating.test.js` only. Fix commit: 5 insertions/5 deletions to `policyEngine.js` only. | ✓ PASS (matches the plan's declared minimal scope) |

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes found and none declared in this phase's PLAN/SUMMARY files. Skipped — no probes to run.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| PRD-01 | 08-03 | Product category (food/service/retail) on Product | ✓ SATISFIED | Unchanged; not touched by 08-09/08-10. |
| PRD-02 | 08-03 | Basic Inventory vs. non-stock per Product | ✓ SATISFIED | Unchanged; not touched by 08-09/08-10. |
| PRD-03 | 08-03 | Group Products into folders | ✓ SATISFIED | Unchanged; not touched by 08-09/08-10. |
| PRD-04 | 08-01/08-04 | Append-only Inventory Movement ledger | ✓ SATISFIED (app layer); ⚠️ DB-trigger unexercised | Unchanged; not touched by 08-09/08-10. |
| PRD-05 | 08-01 | Genuinely new `dgfy_business_*` tables | ✓ SATISFIED | Unchanged; not touched by 08-09/08-10. |
| BOK-01 | 08-03 | Mark a Service Product bookable | ✓ SATISFIED | Unchanged; not touched by 08-09/08-10. |
| BOK-02 | 08-07 | Booking blocks once branch capacity reached (create path) | ✓ SATISFIED (as literally worded); ⚠️ WARNING — see CR-02 (cancel-path race, not covered by this requirement's literal text) | Create-path guard unchanged, tested. New cancel-path double-release race flagged as follow-up, not a blocker for this requirement as worded. |
| BOK-03 | 08-07 | Fulfilled Booking links to the Availment that completes it | ✓ SATISFIED | Unchanged; not touched by 08-09/08-10. |
| SFT-01 | 08-01/08-05 | One open shift per cashier+terminal, DB-level enforced | ✓ SATISFIED (code+test); ⚠️ real DB-constraint firing unexercised | Unchanged; not touched by 08-09/08-10. |
| SFT-02 | 08-05 | Close shift with computed Expected-vs-Actual signed Difference | ✓ SATISFIED (as literally worded); ⚠️ WARNING — see CR-03 (concurrent double-close race, not covered by this requirement's literal text) | Base computation unchanged, tested. New close-path race flagged as follow-up, not a blocker. |
| SFT-03 | 08-01/08-05 | Every cash-drawer event logged, append-only | ✓ SATISFIED (app layer); ⚠️ DB-trigger unexercised; ⚠️ WARNING — see CR-03 (double-close can write two 'close' events) | See CR-03; the double-write concern touches this requirement's "every event logged" spirit more directly than SFT-02, but is still a narrow double-submit race, not the base logging mechanism, so kept as a WARNING rather than a gap. |
| FSC-01 | 08-02/08-06/08-09 | Tenant/branch compliance-mode state, exactly one row per (business_id, branch_id), reflecting whether required fiscal paperwork is present and verified | ✗ BLOCKED (new finding) | Uniqueness invariant remains satisfied (closed by 08-09). But the broader "reflecting whether ... present and verified" guarantee FAILS for the revoke/reject review-outcome lifecycle -- independently confirmed by direct code read and HTTP-route confirmation in this session. See Gaps. REQUIREMENTS.md marks FSC-01 `[x]` Complete; this verification contradicts that for the revoke/reject case. |
| FSC-02 | 08-06/08-08/08-09/08-10 | One shared compliance gate port, not duplicated per surface, never silently assumes completeness | ✓ SATISFIED (now closed) | Independently reproduced by direct code execution against a partial evidence bundle in this session (not by trusting 08-10-SUMMARY.md): returns REQUIRES_SETUP, not ALLOW. REQUIREMENTS.md currently marks FSC-02 `[ ]` (gaps found) -- this verification confirms the gap that checkbox references is now closed and the checkbox/coverage-table entry should be updated to Complete. |

No orphaned requirements found — all 13 IDs (PRD-01..05, BOK-01..03, SFT-01..03, FSC-01..02) declared across the 10 plans (including 08-09, 08-10) match REQUIREMENTS.md's Phase 8 mapping.

**Note on REQUIREMENTS.md:** REQUIREMENTS.md currently marks FSC-02 as `[ ]` with a gap note referencing the fail-open checklist defect. This verification confirms that specific defect is fixed and FSC-02's checkbox can be updated to `[x]` Complete. However, REQUIREMENTS.md marks FSC-01 as `[x]` Complete, which this verification now contradicts for a different, newly-discovered reason (the revoke/reject state-demotion gap) — FSC-01's checkbox should be reverted to unchecked (or annotated with a gap note) until that gap closes, mirroring exactly how FSC-02 was annotated after the original verification found its gap.

### Anti-Patterns Found

No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers found in the two files 08-10 modified (`policyEngine.js`, `complianceChecklistGating.test.js`) — grepped directly.

The fresh 08-REVIEW.md (produced after 08-10 landed) surfaced two further Critical-severity findings in the SAME missing-row-lock-race family as the newly-added FSC-01 gap above. Both were independently re-confirmed here by direct code read. Per this verification's judgment (see reasoning in the Gaps Summary below), neither falsifies the *literal* text of the requirement ID it's nearest to, so both are reported as WARNINGS rather than blocking gaps — but both are severe enough to warrant a dedicated follow-up gap-closure plan before Phase 9 builds directly on these two modules.

| File | Finding | Severity (per 08-REVIEW.md) | Independently confirmed? | Impact |
|------|---------|----------|---|---------|
| `bookingRepository.js:266-295` (`cancelBooking`) | Missing-lock race: concurrent cancels of the SAME booking can both pass the "not already cancelled" guard read before either commits, double-incrementing `slots_remaining` | Critical | Yes — read directly; confirmed the guard read (`Booking.findByPk(Number(id), { transaction })`) has no `lock` option, unlike the atomic guarded UPDATE used on the create path | Capacity accounting can silently inflate after a race window (double-submit cancel, retried request), indirectly allowing more bookings than intended physical capacity in the future — not an immediate oversell on create, but corrupts the counter the create-path guard relies on. |
| `shiftRepository.js:251-293` (`closeShift`) | Missing-lock race: concurrent shift-close calls can both pass the `status !== 'open'` guard before either commits, producing two `'close'` cash-drawer-event rows and a lost-update on reconciliation numbers | Critical | Yes — read directly; confirmed `Shift.findOne({ where, transaction })` has no `lock` option | A double-submit close (common in POS UIs) can silently corrupt the Expected-vs-Actual reconciliation figures and write a duplicate ledger event, undermining auditability without surfacing an error to either caller. |

The following WARNING/INFO-level findings from 08-REVIEW.md are informational and outside must-have scope (unchanged from prior passes or newly listed, none block phase status):

| File | Finding | Severity |
|------|---------|----------|
| `productController.js`/`productFolderController.js`/`complianceController.js` camelCase `businessId` vs. `inventoryMovementController.js`/`shiftController.js`/`bookingController.js` snake_case `business_id` | Cross-module request-field naming inconsistency | Critical (per review); reported here as info since it's a client-integration ergonomics issue, not a functional/security defect, and doesn't map to any stated must-have truth |
| `guardBusinessAccess` fails open when `requestingAccountId` is falsy | Not reachable via current HTTP API | Warning |
| `withModel`/`withModels` maps most uncaught errors to a misleading 503 | Client-caused errors surfaced as "database unreachable" | Warning |
| `productRepository.js`/`productFolderRepository.js`/`bookingRepository.js` single-row lookups not scoped by `business_id` | Relies on 1-DB-per-business | Warning |
| `ProductFolderRepository.create()` doesn't duck-type its unique-name violation | Concurrent duplicate folder name surfaces as misleading 503 instead of 409 | Warning |
| `openShift` never validates `cashierAccountId` belongs to the requester | Any staff/owner can attribute a shift to an arbitrary valid staff id | Warning |
| `folder_id` never validated against an existing folder before write | Invalid `folder_id` surfaces as raw 500 instead of a clean validation error | Warning |
| Inconsistent numeric coercion in `productUseCases.js` vs. rest of phase | Numeric-string payload rejected here, accepted elsewhere | Warning |
| `documentary_readiness` computed twice in the same checklist object | Drift risk if only one copy is edited later | Info |
| `buildPreflightResult` exported with no caller this phase | Scaffolding for Phase 9, undocumented cross-reference | Info |
| No validation that a booking's `slotStart` is not in the past | May be intentional (staff backfill) | Info |

### Human Verification Required

1. **Verify command against a real tenant DB**
   **Test:** Run the 08-01 + 08-09 migrations against a real `dgfy_business_*` tenant, then run `verify`.
   **Expected:** `ok:true`, tables/columns present, `branch_scope_key` populated correctly.
   **Why human:** No live MySQL reachable in this environment.

2. **Append-only trigger firing**
   **Test:** Attempt a raw SQL UPDATE/DELETE against an `inventory_movements` row and a `cash_drawer_events` row.
   **Expected:** Both rejected with SQLSTATE 45000.
   **Why human:** No live MySQL reachable; no unit test in this repo exercises the trigger SQL.

3. **One-open-shift, booking-capacity, and compliance-mode-state real concurrency**
   **Test:** Open two shifts concurrently for the same (terminal_id, cashier_account_id); run `bookingCapacity.test.js` with `RUN_BOOKING_CAPACITY_INTEGRATION=true` against real MySQL; submit two concurrent compliance-evidence writes for the same business with `branch_id IS NULL`.
   **Expected:** Second shift-open rejected via unique index (409); booking test shows exactly 1 success, no oversell; second compliance-evidence write yields a clean 409, not a duplicate row.
   **Why human:** No live MySQL available in this environment to fire real DB-level constraints/races.

4. **CR-02/CR-03 real-concurrency reproduction (new, from this pass's code review)**
   **Test:** Against a real MySQL instance under REPEATABLE READ, fire two concurrent `cancelBooking()` calls for the same booking id, and two concurrent `closeShift()` calls for the same shift id.
   **Expected (current, buggy behavior to confirm):** `slots_remaining` is incremented twice for one logical cancel; two `'close'` cash_drawer_events rows are written for one logical shift close, with a lost-update on the reconciliation figures.
   **Why human:** Requires real transaction-isolation timing under concurrent load; not reproducible via the mocked unit tests in this repo, and no live MySQL is reachable in this environment.

### Gaps Summary

**FSC-02 is genuinely closed.** This was the specific, chartered purpose of this re-verification pass. I did not trust 08-10-SUMMARY.md's claim — I independently confirmed `grep -c '!== false'` returns 0 in `policyEngine.js`, wrote and executed a standalone reproduction script (not the project's own test file) against the raw `evaluateComplianceDecision()` export with a partial evidence bundle, and got `REQUIRES_SETUP`/`COMPLIANT_MODE_FAIL_CLOSED`/`ready_for_compliant_activation: false` — exactly the fix's claim, not the prior ALLOW bypass. I also independently re-ran the D-05 preservation check via the same standalone script and confirmed both `fiscal` and `non_fiscal` contexts still ALLOW for a fully-ready `compliant_active` business. I ran the compliance suite (26/26) and the full `dgfy-api` (259/259) and `dgfy-migration-runner` (308/308) suites directly in this session, matching 08-10-SUMMARY.md's claimed counts. The 08-10 commits' diff scope (`git show --stat`) confirms the change was exactly as narrow as the plan specified: 13 lines added to one test file, 5 insertions/5 deletions to `policyEngine.js`. **No regression found.**

**A NEW gap was independently found and is reported here** (not part of the 7 previously-tracked truths, and not what 08-10 was chartered to fix): the fresh 08-REVIEW.md's CR-01 (revoking/rejecting compliance evidence does not demote `compliance_mode_state.state`). I judged this DOES falsify the literal roadmap/REQUIREMENTS.md text for FSC-01 ("A tenant/branch has a compliance-mode state reflecting whether required fiscal paperwork is present and verified") because: (1) it is HTTP-reachable today via `POST /compliance/review`, not a Phase-9-deferred capability; (2) I independently confirmed by direct code read that `complianceGate.js`'s tenant construction never even carries `verification_status` into the decision, so the gate has no way to know a review outcome was 'revoked' regardless of what the usecase does; (3) it is the exact same class of fail-open authorization bypass this session's other truth (FSC-02) was just proven closed for, just one layer up in the state machine instead of the evidence checklist; (4) REQUIREMENTS.md currently marks FSC-01 `[x]` Complete, which this evidence directly contradicts for the revoke/reject lifecycle.

**Two further Critical findings (CR-02, CR-03) were judged as WARNINGS, not blocking gaps**, because the literal REQUIREMENTS.md/ROADMAP text for BOK-02 ("blocks a Booking once branch-level capacity ... is reached") and SFT-02 ("computes Expected cash ... against a cashier-entered Actual count, with a signed Difference") are both about the base create/close functional correctness, which remains intact and tested — the missing-lock races are in the CANCEL and repeated-CLOSE paths specifically, narrower concurrent-double-submit edge cases the literal requirement text does not explicitly cover. They are nonetheless Critical-severity, in the same missing-row-lock-race family as the FSC-01 gap, and are strongly recommended for a follow-up gap-closure plan before Phase 9 (Checkout) builds directly on the booking/shift modules under real concurrent load.

Because this new gap (FSC-01's revoke/reject lifecycle) touches a requirement ID this phase claims to satisfy, and represents a real, reachable, security-relevant authorization defect (not a hypothetical or deferred-to-Phase-9 concern), **overall status remains `gaps_found`** even though the specific truth (FSC-02) this re-verification pass was chartered to check is genuinely closed.

**Recommended next step:** A focused gap-closure plan (analogous to 08-09/08-10) for the newly-found FSC-01 gap: decide the correct state-machine transition on 'rejected'/'revoked' review outcomes (a design decision, likely demote to `non_compliant_active`), implement it in `buildReviewComplianceStateUseCase`, and add a regression test proving a revoked compliant_active business no longer reaches ALLOW for Fiscal POS_CHECKOUT. CR-02/CR-03 (booking-cancel and shift-close missing-lock races) are recommended as a second, parallel follow-up given their severity and direct relevance to Phase 9's concurrent-load assumptions, even though they do not block this phase's stated must-haves as literally worded.

---

_Verified: 2026-07-13T00:35:00Z_
_Verifier: Claude (gsd-verifier)_
