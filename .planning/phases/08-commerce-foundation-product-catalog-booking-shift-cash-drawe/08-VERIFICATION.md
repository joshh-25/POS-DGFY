---
phase: 08-commerce-foundation-product-catalog-booking-shift-cash-drawe
verified: 2026-07-13T10:30:00Z
status: human_needed
score: 8/8 must-haves verified
behavior_unverified: 2
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 7/7
  gaps_closed:
    - "08-UAT.md Test 1 (severity: blocker) — 20260712100000-create-commerce-foundation.cjs failed to apply to a real dgfy_business_* tenant (lima-dgfy-dev) with MySQL error 1215, because shifts.terminal_id/shifts.cashier_account_id (and, independently discovered during the fix, compliance_mode_state.branch_id) declared ON DELETE/UPDATE CASCADE while also being base columns of a STORED generated column, which MySQL 8.0 forbids. Independently re-derived by direct code read (not by trusting 08-13-SUMMARY.md): grepped the migration file and confirmed all three FK blocks (shifts.terminal_id lines 305-306, shifts.cashier_account_id lines 317-318, compliance_mode_state.branch_id lines 424-425) now declare onDelete:'RESTRICT', onUpdate:'RESTRICT' with zero residual CASCADE in those blocks, while the 11 other legitimate CASCADE/SET NULL FKs elsewhere in the same file (bookings.product_id/branch_id, booking_capacity.product_id/branch_id, etc.) are untouched. Confirmed the two ported Tenant models (Shift.js, ComplianceModeState.js) were kept in sync with the same RESTRICT change. Ran the migration-runner package's full test suite directly in this session (not by trusting the SUMMARY's claimed count): 316/316 (308 passed + 8 cleanly-skipped, 0 failures) plus a 4/4-passing architecture check — matches 08-13-SUMMARY.md's claim exactly."
  gaps_remaining: []
  regressions: []
---

# Phase 8: Commerce Foundation — Product Catalog, Booking, Shift & Cash Drawer, Compliance Gating Verification Report

**Phase Goal:** Businesses can define what they sell and service (Products, folders, Basic Inventory, bookable Services) and staff can run accountable cash shifts, with a tenant/branch compliance-mode gate in place — establishing every downstream Checkout/Storefront dependency (product_id, shift-open precondition, compliance gate contract) in one phase, before Checkout is written against it. No new table references the legacy IMS-shared items/PosTransactionLine tables.

**Verified:** 2026-07-13T10:30:00Z
**Status:** human_needed
**Re-verification:** Yes — fifth verification pass, and the first after Wave 9's gap-closure plan (08-13), which fixed 08-UAT.md's Test 1 blocker (MySQL error 1215 on the commerce-foundation migration). This pass independently re-derives that the code-level fix is genuinely present and correct — not by trusting 08-13-SUMMARY.md's narrative — and additionally re-confirms, by direct code read, a real operational risk the fresh 08-REVIEW.md surfaced (WR-01: the fix has no self-heal path for a database that already partially applied the pre-fix migration, which is materially relevant because 08-UAT.md's own incident report shows the migration WAS partially run against the one real environment tested, lima-dgfy-dev, before it failed). All 5 previously-open human-verification items are re-assessed below: 2 were resolved with recorded developer decisions in 08-UAT.md, and 3 remain open (unavoidably — no live MySQL is reachable in this environment), with one of those three now carrying an materially important new caveat.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1/PRD-01,02,03,05: Business owner can create a Product (food/service/retail), group into folders, choose basic_inventory/non_stock, on genuinely new `dgfy_business_*` tables, never FK'd to legacy `items`/`PosTransactionLine` | ✓ VERIFIED | Unchanged; not touched by 08-13. `productUseCases.test.js` re-run in this session's full `dgfy-api` suite pass (267/267 non-skipped passing, matches prior pass's count exactly). |
| 2 | SC2/PRD-04: Every stock-count change is recorded as an append-only Inventory Movement row that cannot be mutated after insert | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Unchanged. App-layer fully present and unit-tested; DB-layer `BEFORE UPDATE`/`BEFORE DELETE` trigger present in the 08-01 migration (untouched by 08-13) but still unexercised — no live MySQL reachable in this environment. See Human Verification. |
| 3 | SC3/BOK-01,02,03: Business owner can mark a Service Product bookable; Booking blocks once capacity is reached; a fulfilled Booking links to the Availment that completes it; cancel-path row lock (CR-02, closed in the prior pass) intact | ✓ VERIFIED | Unchanged since prior pass; not touched by 08-13. `bookingRepository.test.js` re-run in this session's full suite pass, still 2/2 (folded into the 267 total). |
| 4 | SC4/SFT-01,02,03: Staff can open a shift with a declared float (one open shift per cashier+terminal, DB-enforced), close it with a computed Expected-vs-Actual Difference, every cash-drawer event is logged; close-path row lock (CR-03, closed in the prior pass) intact | ✓ VERIFIED, with the prior pass's flagged concern now explicitly resolved by developer decision | Base computation/logging/lock-race fix unchanged and re-confirmed this pass (full-suite `shiftRepository.test.js` still 2/2). The prior pass's flagged concern (unvalidated `sales_cash`/`refunds_cash`/`pay_ins`/`pay_outs` reconciliation inputs, fresh review's CR-02) is no longer an open question: **08-UAT.md Test 4 records an explicit developer decision — "(a) Accepted as intentional, temporary gap... no interim gap-closure plan needed"** — read directly from 08-UAT.md lines 33-36. |
| 5 | SC5/FSC-01: A tenant/branch's `compliance_mode_state` accurately reflects fiscal-paperwork readiness, including across the revoke/reject review lifecycle | ✓ VERIFIED, with the prior pass's flagged concern now explicitly resolved by developer decision | Unchanged since prior pass; not touched by 08-13. `complianceReviewDemotion.test.js` re-run in this session's full suite pass, still 4/4. The prior pass's flagged non-atomicity concern (fresh review's CR-03, `recordVerification()`/`upsertState()` as two independently-transactional calls) is no longer an open question: **08-UAT.md Test 5 records an explicit developer decision — "Accepted the current two-write sequence for Phase 8 sign-off... Explicitly tracked as a required backlog item (recordVerificationAndState())"** — read directly from 08-UAT.md lines 38-41. |
| 6 | SC5/FSC-02: Checkout/Shift/receipt-issuance are gated through one shared compliance policy-engine gate port that enforces paperwork-readiness signals without silently assuming completeness | ✓ VERIFIED | Unchanged since 08-10; not touched by 08-13. `complianceChecklistGating.test.js` re-run in this session's full suite pass. |
| 7 | Composition-root wiring: all 5 commerce modules built with the SAME shared `tenantConnector`/`businessRepository`/`businessDatabaseRegistryRepository`, mounted behind `authenticateAccount`; `assertComplianceGate` injected-but-unwired into shifts | ✓ VERIFIED | Unchanged; 08-13 touched only migration/model/test files (confirmed via `git show --stat dd467336 89f9b8f2`: zero composition-root or module use-case/controller files in either commit's diff). `commerceModulesMount.test.js` re-run as part of the full-suite pass. |
| 8 | **NEW this pass (SC1/SC4/SC5, previously the blocking UAT gap):** The full commerce-foundation schema-migration chain (`20260712100000` + `20260712140000`) applies to a real `dgfy_business_*` tenant database without MySQL error 1215, so SFT-01's and FSC-01's DB-level uniqueness invariants are actually enforceable on real MySQL, not just simulated | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED (code-level fix confirmed correct for a **fresh** database; live confirmation still outstanding, and carries a materially new caveat for the one real environment already attempted) | See "Migration Fix — Independent Verification" and "Human Verification" below. The referential-action fix itself is directly confirmed correct by code read and a full green test suite. What remains genuinely unverified in this environment is (a) an actual live-MySQL run, and (b) whether re-running against `lima-dgfy-dev` specifically — the one environment 08-UAT.md's Test 1 actually exercised — will succeed on the first attempt, given a newly-confirmed idempotency-guard gap (08-REVIEW.md's WR-01, independently re-derived below) that could reproduce the exact same error 1215 if that environment already has a partially-created `shifts` table left over from the failed UAT run. |

**Score:** 8/8 truths verified (2 present, behavior-unverified — see Human Verification). No FAILED truths remain. Both previously-flagged judgment-call concerns (unvalidated shift-close inputs, compliance-state non-atomicity) are now closed with recorded developer decisions rather than open verifier flags.

### Migration Fix — Independent Verification (not from 08-13-SUMMARY.md)

Direct code read of `apps/dgfy-migration-runner/src/migrations/schema/20260712100000-create-commerce-foundation.cjs`:

| Column | Line(s) | Before (per 08-UAT.md's root-cause report) | After (confirmed by direct grep in this session) |
|---|---|---|---|
| `shifts.terminal_id` | 305-306 | `onDelete: 'CASCADE', onUpdate: 'CASCADE'` | `onDelete: 'RESTRICT', onUpdate: 'RESTRICT'` |
| `shifts.cashier_account_id` | 317-318 | `onDelete: 'CASCADE', onUpdate: 'CASCADE'` | `onDelete: 'RESTRICT', onUpdate: 'RESTRICT'` |
| `compliance_mode_state.branch_id` | 424-425 | `onDelete: 'CASCADE', onUpdate: 'CASCADE'` | `onDelete: 'RESTRICT', onUpdate: 'RESTRICT'` |

Confirmed **no other FK in the file was touched** — the 11 other `onDelete`/`onUpdate` CASCADE/SET NULL pairs (lines 136-137, 174-175, 193-194, 224-225, 231-232, 268-269, 275-276, 373-374, 388-389) belong to `bookings`, `booking_capacity`, `inventory_movements`, `cash_drawer_events`, and `products.folder_id` — none of which feed a `STORED` generated column, matching the plan's explicit prohibition.

Confirmed `Shift.js` (lines 61-78) and `ComplianceModeState.js` (lines 69-74) mirror the same RESTRICT change, keeping the ported Tenant models drift-free.

Ran `cd apps/dgfy-migration-runner && npm test` directly in this session: **316/316 tests (308 passed, 8 cleanly-skipped, 0 failures)** plus a separate architecture check (4/4 passed) — matches 08-13-SUMMARY.md's claimed evidence exactly, independently reproduced rather than trusted.

Read the new `phase08CommerceFoundationSchema.test.js` (220 lines) in full: it is correctly gated behind `RUN_PHASE08_COMMERCE_FOUNDATION_SCHEMA_INTEGRATION=true` (skips cleanly with no live MySQL, confirmed by the console.log-and-skip branch actually firing in this session's `npm test` run), creates two disposable uniquely-suffixed databases, calls the real `runSchemaMigrate({})` command handler (not a mock), and asserts against `information_schema` for: the two generated columns + their unique indexes, all three FK referential actions (`RESTRICT`/`RESTRICT`, never `CASCADE`), and all four append-only triggers. This is a structurally sound regression test — it would have caught the original defect — but per this task's explicit instruction, it was not executed against live MySQL in this environment (no MySQL client installed here; the task brief instructs checking structure/static evidence, not a live run).

### A New, Independently-Confirmed Risk: WR-01 (fresh 08-REVIEW.md, re-derived by direct code read)

The post-08-13 `08-REVIEW.md` (0 critical / 2 warning / 1 info) flags that the in-place fix cannot self-heal a database that already has a partially-applied `shifts` or `compliance_mode_state` table from a prior failed run. I independently re-traced this by reading the actual guard logic rather than trusting the review's narrative:

```js
// line 289 (paraphrased from direct read)
if (!await tableExists('shifts')) {
  await queryInterface.createTable('shifts', { /* ...terminal_id/cashier_account_id now RESTRICT... */ });
}
// lines 344-345 (confirmed via direct read, sed -n '340,362p')
const shiftsTableDescription = await queryInterface.describeTable('shifts');
if (!shiftsTableDescription.active_terminal_cashier_key) {
  await queryInterface.sequelize.query(`ALTER TABLE shifts ADD COLUMN active_terminal_cashier_key ... STORED`);
}
```

**This is a real, currently-relevant risk, not a theoretical one.** MySQL DDL statements (`CREATE TABLE`, `ALTER TABLE`) each auto-commit individually — they are not rolled back by a later statement's failure within the same migration `up()` function (confirmed: no `queryInterface.sequelize.transaction()` wraps `up()` in this file). 08-UAT.md's own incident report states the migration failed on the `active_terminal_cashier_key` `ALTER TABLE` step specifically — which, per the file's table-creation order (product_folders → products → inventory_movements → bookings → booking_capacity → **shifts createTable, then its ALTER, which is where the failure occurred**), means `shifts.createTable()` (with the *old* CASCADE FKs, since that createTable executed and auto-committed *before* the fix existed) almost certainly already succeeded and persisted on `lima-dgfy-dev` — the exact environment 08-UAT.md's Test 1 ran against — before the migration threw.

If that is the case, simply re-running the now-fixed migration against `lima-dgfy-dev` will hit `tableExists('shifts') === true`, **skip** the `createTable` call that carries the RESTRICT fix, proceed straight to the unconditional-on-column-presence `ALTER TABLE ... ADD COLUMN active_terminal_cashier_key`, and reproduce **the identical MySQL error 1215** — because the pre-existing `shifts` table's `terminal_id`/`cashier_account_id` FKs are still `CASCADE` on disk, untouched by this source-file edit. The same reasoning applies to `compliance_mode_state.branch_id`/`branch_scope_key` if that table was also partially created (evidence suggests it was not — the failure point in table-creation order comes before `compliance_mode_state`'s `createTable` call — but this has not been independently confirmed against the live environment).

No `information_schema.referential_constraints`-based repair guard exists anywhere in either migration file for this scenario; `08-REVIEW.md`'s own check of `checksum.js`/`schema.js`/`storage.js` (independently spot-checked here by grepping for `checksum` in `schema.js` — no read/comparison call site found) confirms there is also no drift-detection mechanism that would surface this automatically. **This means 08-13-SUMMARY.md's "no blockers for Phase 9/10/11 migrations against a real business tenant from this specific defect class going forward" claim is accurate for a genuinely fresh database, but is not yet confirmed true for `lima-dgfy-dev` specifically** — the operator re-running UAT Test 1 there should first check whether `shifts` already exists in that schema and, if so, either drop it (and any tables created after it, if none — confirmed none per the creation-order analysis above) before re-running, or manually issue `ALTER TABLE shifts DROP FOREIGN KEY <name>, ADD CONSTRAINT ... FOREIGN KEY (terminal_id) REFERENCES terminal_identities(id) ON DELETE RESTRICT ON UPDATE RESTRICT` (and the equivalent for `cashier_account_id`) before the migration can proceed past the generated-column `ALTER`.

This is flagged as an explicit human-verification/decision item below (item 1, expanded) rather than silently assumed away.

### Required Artifacts (08-13 scope)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/dgfy-migration-runner/src/migrations/schema/20260712100000-create-commerce-foundation.cjs` | Three FKs (`shifts.terminal_id`, `shifts.cashier_account_id`, `compliance_mode_state.branch_id`) switched CASCADE→RESTRICT; no other FK touched | ✓ VERIFIED | Read directly; grep-confirmed lines 305-306/317-318/424-425 RESTRICT, 11 other CASCADE/SET NULL FKs elsewhere unchanged. |
| `apps/dgfy-migration-runner/src/migrations/schema/20260712140000-harden-compliance-mode-state-uniqueness.cjs` | Header comment corrected; `up()`/`down()` DDL byte-identical | ✓ VERIFIED | Header no longer claims `20260712100000` is "already-shipped"/"stays untouched" (confirmed by reading the corrected header); DDL functions unaffected (npm test's schema-related suites pass). |
| `apps/dgfy-api/src/models/Tenant/Shift.js` | `terminal_id`/`cashier_account_id` `onDelete`/`onUpdate` switched to RESTRICT | ✓ VERIFIED | Read directly, lines 61-78. |
| `apps/dgfy-api/src/models/Tenant/ComplianceModeState.js` | `branch_id` `onDelete`/`onUpdate` switched to RESTRICT | ✓ VERIFIED | Read directly, lines 69-74. |
| `apps/dgfy-migration-runner/tests/phase08CommerceFoundationSchema.test.js` | New real-MySQL-gated integration test proving the full chain applies cleanly | ✓ VERIFIED (structure); ⚠️ unexecuted against live MySQL (by design, per task brief) | Read in full (220 lines); correctly gated, skips cleanly (confirmed via this session's `npm test` output showing the skip-console.log branch fire), asserts the right invariants against `information_schema`. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `20260712100000`'s `shifts`/`compliance_mode_state` FK definitions | `ALTER TABLE ... ADD COLUMN ... STORED` for `active_terminal_cashier_key`/`branch_scope_key` | RESTRICT referential action (MySQL 8.0 requirement) | ✓ WIRED (fixed, fresh-DB path); ⚠️ UNCONFIRMED for a DB that already partially applied the pre-fix migration | Confirmed correct source-level wiring; the `tableExists('shifts')` guard means this fix only takes effect on a table created fresh AFTER this edit — see WR-01 analysis above. |
| `runSchemaMigrate({})` | commerce-foundation migration chain | `phase08CommerceFoundationSchema.test.js`'s real (non-mocked) call | ✓ WIRED (structurally); not executed live this session | Test imports and calls the real command handler, not a stub. |
| `shifts`/`ComplianceModeState` Tenant models | migration DDL | matching `onDelete`/`onUpdate` metadata | ✓ WIRED | Confirmed drift-free by direct read of both model files. |

### Data-Flow Trace (Level 4)

Not applicable in the traditional sense (migration/schema-layer fix). The equivalent trace here is the direct read of the guard-conditional structure (`tableExists` / `describeTable().active_terminal_cashier_key`) tracing how the fixed FK definition does or does not reach an already-existing table — documented above under "A New, Independently-Confirmed Risk."

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Migration module loads without throwing | `cd apps/dgfy-migration-runner && node -e "require('./src/migrations/schema/20260712100000-create-commerce-foundation.cjs')"` | Loaded OK, `meta.targetKind === 'business'`, `up`/`down` are functions | ✓ PASS |
| FK-action fix (targeted grep, not the plan's own buggy nested-brace regex — see 08-13-SUMMARY.md's documented deviation) | `grep -n "terminal_id\|cashier_account_id\|branch_id\|onDelete\|onUpdate"` across the migration file | 3 target blocks show RESTRICT/RESTRICT; 11 other blocks unchanged CASCADE/SET NULL | ✓ PASS |
| Migration-runner full suite (regression check, run once) | `cd apps/dgfy-migration-runner && npm test` | 316/316 (308 passed, 8 skipped, 0 failed) + architecture check 4/4 passed | ✓ PASS |
| `dgfy-api` full suite (regression check, run once) | `cd apps/dgfy-api && node --experimental-vm-modules node_modules/.bin/jest --config jest.config.cjs --runInBand` | 267/267 non-skipped passing (191 skipped opt-in integration), 0 failures — same count as the prior verification pass | ✓ PASS |
| Debt-marker scan on all 5 files touched by 08-13 | `grep -n -E "TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER"` across the 5 files | No matches | ✓ PASS |
| New test file skip-cleanly gate | Structural read + confirmed via `npm test`'s console output that the `describe.skip` branch (and its explanatory `console.log`) fires with no live MySQL configured | Skips cleanly, zero failures/hangs | ✓ PASS |
| Live migration run against real MySQL | N/A | Not executed — no MySQL client available in this environment; task brief explicitly scopes this session to static/structural evidence, not a live DB run | ? SKIP (routed to Human Verification) |

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes found and none declared in this phase's PLAN/SUMMARY files. Skipped — no probes to run.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| PRD-01 | 08-03 | Product category (food/service/retail) on Product | ✓ SATISFIED | Unchanged; not touched by 08-13. |
| PRD-02 | 08-03 | Basic Inventory vs. non-stock per Product | ✓ SATISFIED | Unchanged. |
| PRD-03 | 08-03 | Group Products into folders | ✓ SATISFIED | Unchanged. |
| PRD-04 | 08-01/08-04/08-13 | Append-only Inventory Movement ledger; migration now applies cleanly to a fresh real DB | ✓ SATISFIED (app layer + fresh-DB migration fix); ⚠️ DB-trigger firing + `lima-dgfy-dev`-specific re-run still unexercised | App layer unchanged. Migration-layer blocker independently confirmed fixed for a fresh DB this pass. |
| PRD-05 | 08-01/08-13 | Genuinely new `dgfy_business_*` tables; migration now applies cleanly | ✓ SATISFIED | Table definitions unchanged (only referential actions on 3 FKs changed); migration-chain blocker independently confirmed fixed for a fresh DB. |
| BOK-01 | 08-03 | Mark a Service Product bookable | ✓ SATISFIED | Unchanged. |
| BOK-02 | 08-07/08-12 | Booking blocks once branch capacity reached; cancel path lock intact | ✓ SATISFIED | Unchanged since prior pass; re-confirmed via this session's full-suite pass. |
| BOK-03 | 08-07 | Fulfilled Booking links to the Availment that completes it | ✓ SATISFIED | Unchanged. |
| SFT-01 | 08-01/08-05/08-13 | One open shift per cashier+terminal, DB-level enforced; migration now applies cleanly to a fresh real DB | ✓ SATISFIED (code+test+fresh-DB migration fix); ⚠️ real DB-constraint firing on `lima-dgfy-dev` specifically still unexercised (see WR-01) | Code path unchanged; migration-chain blocker independently confirmed fixed for a fresh DB. |
| SFT-02 | 08-05/08-12 | Close shift with computed Expected-vs-Actual signed Difference; close path lock intact | ✓ SATISFIED | Unvalidated-reconciliation-input concern from the prior pass now explicitly resolved via 08-UAT.md Test 4's recorded decision (accepted as intentional, deferred to Phase 9). |
| SFT-03 | 08-01/08-05/08-12 | Every cash-drawer event logged, append-only; close path lock intact | ✓ SATISFIED | Unchanged. |
| FSC-01 | 08-02/08-06/08-09/08-11/08-13 | Tenant/branch compliance-mode state reflecting fiscal-paperwork readiness across the full lifecycle; migration now applies cleanly | ✓ SATISFIED | Demotion logic unchanged since prior pass. Compliance-state non-atomicity concern from the prior pass now explicitly resolved via 08-UAT.md Test 5's recorded decision (accepted, tracked as required backlog item). Migration-chain blocker (the second, previously-unexercised instance in `compliance_mode_state.branch_id`) independently confirmed fixed for a fresh DB. REQUIREMENTS.md marks FSC-01 `[x]` Complete — accurate. |
| FSC-02 | 08-06/08-08/08-09/08-10 | One shared compliance gate port, not duplicated per surface, never silently assumes completeness | ✓ SATISFIED | Unchanged; not touched by 08-13. **REQUIREMENTS.md still marks FSC-02 `[ ]` with a stale gap note referencing the already-fixed fail-open checklist defect — this is the THIRD consecutive verification pass flagging this same unaddressed documentation-lag issue (first flagged after 08-10, repeated after 08-11/08-12, repeated again here). Recommend updating REQUIREMENTS.md's FSC-02 row to `[x]` Complete.** |

No orphaned requirements found — all 13 IDs (PRD-01..05, BOK-01..03, SFT-01..03, FSC-01..02) declared across the 13 plans match REQUIREMENTS.md's and ROADMAP.md's Phase 8 mapping exactly.

### Anti-Patterns Found

No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers found in any of the 5 files touched by 08-13 — grepped directly in this session.

The fresh 08-REVIEW.md (post-08-13, scoped to the 5 files 08-13 touched) reports 0 critical findings, 2 warnings, 1 info — status `issues_found` at the review-tool level, but neither warning rises to a phase-blocking defect against this phase's literal must-haves:

| Finding | Independently confirmed? | This verification's disposition |
|---|---|---|
| WR-01: in-place migration edit cannot self-heal a DB with a stale, partially-applied `shifts`/`compliance_mode_state` table from before the fix | Yes — re-derived independently by reading the `tableExists`/`describeTable` guard logic directly (see "A New, Independently-Confirmed Risk" above), and cross-referenced against 08-UAT.md's own incident report, which indicates this exact scenario is now plausible on `lima-dgfy-dev` | **WARNING, elevated to an explicit human-decision item (below)** — not because the code fix is wrong (it is correct for a fresh DB), but because the operator follow-up step implied by 08-13-SUMMARY.md ("re-run the migration against a real tenant") may not succeed on the first attempt against the specific environment already exercised, without first checking/repairing that environment's existing `shifts` table. |
| WR-02: new integration test only covers the fresh-DB path, not the stale-FK scenario WR-01 describes | Yes — confirmed by reading the full 220-line test file; no companion test constructs a pre-existing-CASCADE-`shifts` precondition | WARNING, non-blocking — the test that exists is correct and sufficient for its stated scope (proving the fresh-DB fix works); the gap is in coverage breadth, not correctness, and is a reasonable follow-up rather than a Phase 8 blocker. |
| IN-01: unused `error` binding in an empty catch block in the new test file | Not independently re-checked (info-severity, cosmetic) | INFO, non-blocking. |

The following WARNING/INFO-level findings carried from the prior pass's 08-REVIEW.md remain unchanged and non-blocking (not re-verified in depth this pass, since 08-13 did not touch any of those files): tenant-repository blanket error-masking (`withModel`/`withModels`), cross-module camelCase/snake_case naming inconsistency, booking cancel-path missing `status === 'fulfilled'` check, `recordNoSalePop()` missing a row lock, point-lookups not scoped by `business_id`, `ProductFolderRepository.create()` not duck-typing unique-name violations, `openShift` not validating `cashierAccountId` ownership, `folder_id` not validated before write, inconsistent numeric coercion, `submitComplianceEvidence`'s 3 sequential unguarded round-trips, duplicate `documentary_readiness` computation, unused `buildPreflightResult` export, no past-`slotStart` validation, magic-number minute/millisecond conversion.

### Human Verification Required

1. **[EXPANDED THIS PASS] Verify migrations against a real tenant DB — now with a stale-table precondition check first**
   **Test:** Before re-running the (now-fixed) migration against `lima-dgfy-dev`, first check whether `shifts` (and, less likely per the table-creation-order analysis above, `compliance_mode_state`) already exists in that tenant's schema from the earlier failed UAT attempt. If it exists: either (a) drop it (and confirm nothing depends on any rows already in it — unlikely, since the original run never got far enough to have live traffic) and re-run the full migration chain fresh, or (b) manually run `ALTER TABLE shifts DROP FOREIGN KEY <constraint_name>, ADD CONSTRAINT <name> FOREIGN KEY (terminal_id) REFERENCES terminal_identities(id) ON DELETE RESTRICT ON UPDATE RESTRICT` (and the equivalent for `cashier_account_id`) before re-running `runSchemaMigrate`. Then run `verify`.
   **Expected:** `ok:true`, tables/columns present, `branch_scope_key`/`active_terminal_cashier_key` populated correctly, no MySQL error 1215.
   **Why human:** No live MySQL reachable in this environment; also requires inspecting the actual current state of a specific named external environment (`lima-dgfy-dev`), which is an operator action, not a code-inspection question.

2. **Append-only trigger firing**
   **Test:** Attempt a raw SQL UPDATE/DELETE against an `inventory_movements` row and a `cash_drawer_events` row.
   **Expected:** Both rejected with SQLSTATE 45000.
   **Why human:** No live MySQL reachable; no unit test in this repo exercises the trigger SQL. Blocked on item 1 succeeding first (these tables don't exist until the migration applies).

3. **Real-concurrency reproduction of the row locks (CR-02/CR-03, closed in a prior pass)**
   **Test:** Against real MySQL under REPEATABLE READ, fire two concurrent `cancelBooking()` calls for the same booking id and two concurrent `closeShift()` calls for the same shift id.
   **Expected:** The second call in each pair blocks until the first commits, then observes the terminal status and is rejected — no double capacity release, no duplicate close event.
   **Why human:** Requires real transaction-isolation timing under concurrent load; the mocked unit tests confirm the lock option is requested and the reject-second-operation logic, not live serialization timing. Blocked on item 1 succeeding first.

4. **[NEW THIS PASS] Decision needed: how should the WR-01 stale-table risk be closed before this defect class is considered fully retired?**
   **Test:** Review the "A New, Independently-Confirmed Risk" analysis above and decide whether to (a) accept the current fix as sufficient once `lima-dgfy-dev`'s stale `shifts` table (if it exists) is manually repaired/dropped this one time, treating WR-01 as a one-off operational cleanup rather than a code gap, or (b) commission a small follow-up plan to add an idempotent FK-repair guard (inspecting `information_schema.referential_constraints` and re-creating the FK with RESTRICT if a stale table is ever encountered again in any future environment), per 08-REVIEW.md's own suggested fix.
   **Expected:** A decision recorded (mirroring the pattern already used for the two resolved judgment calls in 08-UAT.md Tests 4/5), plus, if (a) is chosen, confirmation that `lima-dgfy-dev`'s `shifts` table state was actually checked/repaired before re-attempting UAT Test 1.
   **Why human:** This is a risk-acceptance judgment about a specific external environment's current state, which this verifier cannot inspect, and about whether a one-off manual fix vs. a permanent code-level guard is the right investment for a defect class that (per the migration file's own now-added comments) is now well-understood and unlikely to recur in freshly-provisioned environments going forward.

### Gaps Summary

**No gaps remain against this phase's must-haves as literally worded.** 08-UAT.md's Test 1 blocker — the confirmed MySQL error 1215 on the commerce-foundation migration chain — is genuinely fixed at the code level for a fresh `dgfy_business_*` database: independently re-derived by direct code read of all three affected FK blocks (not by trusting 08-13-SUMMARY.md), confirmed zero collateral changes to the 11 other legitimate CASCADE/SET NULL FKs in the same file, confirmed the two ported Tenant models stay drift-free, and confirmed the migration-runner's full test suite (316/316, 0 failures) and the `dgfy-api` suite (267/267, 0 failures, unchanged from the prior pass) both stay green. The new real-MySQL-gated regression test's structure was read in full and is correct and sufficient for its stated scope.

The two previously-open judgment-call items (unvalidated shift-close reconciliation inputs; compliance-state non-atomicity) are no longer open verifier flags — both now have explicit, recorded developer decisions in 08-UAT.md (Tests 4 and 5), exactly the escalation-gate outcome this project's process is designed to produce.

**One new, independently-confirmed risk (08-REVIEW.md's WR-01) is surfaced rather than silently absorbed into a clean pass:** the fix's in-place-edit approach has no self-heal path for a database that already has a partially-applied `shifts` table from the pre-fix migration version — and 08-UAT.md's own incident report is itself evidence that `lima-dgfy-dev`, the one real environment already tested, plausibly has exactly that stale state (MySQL DDL auto-commits `CREATE TABLE` independently of a later `ALTER TABLE` failure in the same script). This means the natural next step — "just re-run the migration now that it's fixed" — may not succeed on the first attempt against that specific environment without a manual precondition check first. This does not reopen any of this phase's literal must-haves (which are correctly scoped to a fresh database, and are satisfied), but it is exactly the kind of gap between "SUMMARY.md says fixed" and "genuinely fixed everywhere it needs to be" that this verification process exists to catch, so it is routed to an explicit human-decision item (item 4) rather than passed silently.

Because no truth is FAILED and no artifact/key-link is MISSING/STUB/NOT_WIRED, this phase does not meet the `gaps_found` bar. Because live-MySQL-dependent human verification items remain (items 1-3, item 1 now expanded with the stale-table precondition check) AND one new judgment-call item requires an explicit human decision (item 4), status is `human_needed`, not `passed`.

---

_Verified: 2026-07-13T10:30:00Z_
_Verifier: Claude (gsd-verifier)_
