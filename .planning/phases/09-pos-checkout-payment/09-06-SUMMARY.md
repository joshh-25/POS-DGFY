# Phase 09 Plan 06 — Finalize Availment Orchestration & Compliance-Evidence Store — COMPLETED

**Executed:** 2026-07-13
**Executor:** Claude (Sonnet 5)
**Status:** SUCCESS — All acceptance criteria verified

---

## Objective Achieved

Built the `finalizeAvailment` orchestration usecase — the one usecase in Phase 9 with no exact analog — plus the interim D-23 compliance-evidence attestation store it reads for `compliant_active` checkout, wired into the controller/routes/module, and an integration test proving the full finalize path with mocked ports. This closes CHK-02, CHK-04, CHK-05, CHK-06, FSC-03, and the fiscal-evidence half of D-21/D-24.

---

## Artifacts Delivered

### 1. Compliance-evidence attestation store (D-23)

**`apps/dgfy-api/src/modules/availments/repositories/complianceEvidenceRepository.js`** — mirrors `ComplianceModeStateRepository`'s tenant-DB scaffold exactly:
- `TenantDatabaseUnavailableError` / `DuplicateComplianceEvidenceError` domain error classes
- `resolveDatabaseName` requires the registry row `active` AND `verified_at`
- `resolveModel` → `tenantConnector.getModels(db).ComplianceEvidence` (never a direct model-factory import)
- `getForBusinessBranch(businessId, branchId=null)` → the attested row or `null`
- `upsert(businessId, branchId, { evidenceBundle, attestedByActorType, attestedAt })` — atomic `findOrCreate` + patch, relying on the DB's `(business_id, branch_scope_key)` unique index (branch_scope_key is DB-generated, never written here)

**`apps/dgfy-api/src/modules/availments/usecases/complianceEvidenceUseCases.js`**:
- `buildAttestComplianceEvidenceUseCase({ repository, businessRepository })` — owner-gated operator endpoint (mirrors `hasManualDiscountPermission`'s owner-only shape); persists the operator-attested `{ settings, artifacts, peripherals, evidence }` bundle. `compliance_profile` is deliberately excluded — the gate loads that directly from the persisted `compliance_mode_state` row, never from this store.
- `assembleEvidenceBundle(evidenceRow)` — pure mapper: `null`/malformed input → `{ artifacts: [], peripherals: [], settings: {}, evidence: {} }`; a real row maps its `evidence_bundle` JSON straight through. Correct default for a `non_compliant_active` business (never reaches the gate's checklist branch) and a safe fail-closed default for an unattested `compliant_active` business (REQUIRES_SETUP rather than a silent ALLOW).

### 2. `buildFinalizeAvailmentUseCase` + wiring

**`apps/dgfy-api/src/modules/availments/usecases/availmentUseCases.js`** — the finalize orchestration, in order:
1. Validate input (`businessId`, `availmentId`, `paymentMethod` ∈ {cash, gcash, credit_card}, `terminalId`, `cashierAccountId`) + active-member access.
2. Load the draft availment (`repository.findById`) with its non-cancelled lines and recorded `availment_discounts` rows; reject if not draft, already finalized, or has zero active lines.
3. Recompute server-side via `money.js` — gross/net subtotal from stored line data, per-discount-row amount (SC/PWD rows resolved against the VAT-exclusive net base per D-07/D-20; every other discount type against the gross VAT-inclusive subtotal per D-05, independently, never cascaded), aggregate totals via `computeAvailmentTotals`, and cash change via `computeChange` — a client-supplied `total`/`change`/`discount_amount` is never even read from `input`. Cash with `cash_received < total` is rejected here, before the compliance gate is ever called.
4. Read the D-23 evidence attestation (`complianceEvidenceRepository.getForBusinessBranch`) and assemble the bundle; for non-cash payment, set `context.payment_handoff_mode: 'external'` (avoids a spurious BSP DENY per D-10's record-only payments).
5. Call `assertComplianceGate({ operation: 'pos.checkout', requestedDocumentContext, artifacts, peripherals, settings, evidence, context })`. A thrown `DomainError` (403 DENY / 409 REQUIRES_SETUP) is forwarded verbatim as `ApplicationResult.failure` — its `details.decision.checklist`/`activation_blockers` already carry the missing-signal detail, so staff see exactly what's missing. A fiscal request is never retried as non_fiscal (D-24).
6. Bind the open shift via `shiftRepository.findOpenShift(businessId, { terminalId, cashierAccountId })`; reject with a 409 `NO_OPEN_SHIFT` conflict if none exists (CHK-06).
7. Build the receipt payload (D-14 fields) with one **distinct line per recorded discount row** (its own server-computed amount, never folded into an aggregate) and `decision.receipt_contract.document_type`.
8. `repository.finalizePersist(...)` — one transaction covering availment/payment/receipt plus the per-line inventory sale effects; a non-success sale-effect result inside that transaction makes `finalizePersist` throw, which this usecase propagates unmodified (WARNING-1: nothing commits).
9. After the DB commit, best-effort `deviceBridgeClient.printReceipt(...)`; any non-ok/thrown result becomes a `print_warning` field on an otherwise-successful result — never a rollback (D-22).

**Wiring** (`apps/dgfy-api/src/modules/availments/index.js`): `buildAvailmentsModule` now constructs a `ComplianceEvidenceRepository` alongside `AvailmentRepository`, and its `useCases` map gains `attestComplianceEvidence` and a fully-wired `finalizeAvailment` (previously `null`).

**Controller/routes** (`availmentController.js`, `routes.js`): added `attestComplianceEvidence` transport method + `POST /v1/availments/compliance-evidence` route (behind `authenticateAccount`); `finalize`'s whitelisted input gained `cashier_account_id` (needed for the CHK-06 shift lookup — still never total/change/discount_amount).

### 3. Integration test

**`apps/dgfy-api/tests/integration/availments/finalize.test.js`** — `buildFinalizeAvailmentUseCase` exercised with every port mocked (no live MySQL), 7 cases, all passing:
1. Happy path — asserts a bogus client-supplied `total`/`change`/`discount_amount` has zero effect; server computes `112.0000` total / `188.0000` change from a 1-line VAT-inclusive availment.
2. CHK-06 — `findOpenShift` resolves `null` → 409 `NO_OPEN_SHIFT`, `finalizePersist` never called.
3. Cash-insufficient — `cash_received < total` → 400 `CASH_INSUFFICIENT`, and `assertComplianceGate` is never even called.
4. D-24 — mocked gate throws a `DomainError` 409 REQUIRES_SETUP carrying `checklist.missing_setting_keys`/`activation_blockers`; asserts the failure surfaces those details verbatim, the gate was called with the **original** `fiscal` context (no downgrade attempt), and nothing persists.
5. D-22 — `printReceipt` resolves `{ ok:false, warning:'print_failed' }` → result is still `success` with `print_warning: 'print_failed'`, and the receipt row from `finalizePersist` is present in the response.
6. D-14 — a `manual` discount row (`amount: '20.0000'`, staff id + reason) reduces `112.0000` → `92.0000`, and `receipt.payload.discounts` contains exactly one distinct line with that discount's own `amount_formatted`.
7. WARNING-1 — `finalizePersist` mocked to throw (simulating an insufficient-stock sale-effect failure inside its transaction) → the usecase call rejects, and `deviceBridgeClient.printReceipt` is never invoked.

---

## Verification Results

### Task 1 (`<verify>`)
```
$ node --experimental-vm-modules --check src/modules/availments/repositories/complianceEvidenceRepository.js \
  && node --experimental-vm-modules --check src/modules/availments/usecases/complianceEvidenceUseCases.js
(no output — both parse)
```

### Task 2 (`<verify>`)
```
$ node --experimental-vm-modules --check src/modules/availments/usecases/availmentUseCases.js \
  && node --experimental-vm-modules --check src/modules/availments/index.js \
  && grep -c "findOpenShift\|assertComplianceGate\|finalizePersist\|printReceipt" src/modules/availments/usecases/availmentUseCases.js
13
```
(both files parse; grep count 13 ≥ required 4)

### Task 3 (`<verify>`)
```
$ npm test -- tests/integration/availments/finalize.test.js
PASS tests/integration/availments/finalize.test.js
  finalize.test.js — buildFinalizeAvailmentUseCase (09-06)
    ✓ happy path: recomputes totals server-side and ignores a client-supplied total/change/discount
    ✓ CHK-06: rejects with a conflict when no open shift exists for the cashier/terminal, never persists
    ✓ rejects a cash payment whose cash_received is less than the computed total, before the gate is even called
    ✓ D-24: a REQUIRES_SETUP gate response hard-fails a fiscal checkout and never downgrades to non_fiscal
    ✓ D-22: a device-bridge print failure still succeeds with a print_warning, and the receipt is persisted
    ✓ D-14: a recorded manual discount reduces the server-computed total and appears as its own distinct receipt line
    ✓ WARNING-1: an insufficient-stock sale-effect failure inside finalizePersist propagates so nothing is persisted

Test Suites: 1 passed, 1 total
Tests:       7 passed, 7 total
```

### Overall plan `<verification>`
```
$ npm test -- tests/unit/modules/availments tests/integration/availments tests/integration/commerce
Test Suites: 4 passed, 4 total
Tests:       90 passed, 90 total

$ npm run check:compat-boundary
[CompatBoundaryGuardrail] OK. Checked 9 modules and 26 entities/usecases files.

$ npm test   (full apps/dgfy-api suite, sanity check for regressions from the tenantConnector fix)
Test Suites: 17 skipped, 29 passed, 29 of 46 total
Tests:       191 skipped, 359 passed, 550 total
```
(Skipped suites are the pre-existing live-MySQL-gated integration suites; unaffected by this plan.)

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Phase 9 tenant models were never registered in `TenantConnector.getModels()`**
- **Found during:** Task 2, while tracing `repository.findById`/`finalizePersist` code paths before writing the finalize usecase.
- **Issue:** `Availment`, `AvailmentItem`, `AvailmentDiscount`, `Payment`, `Receipt`, and `ComplianceEvidence` model files existed (created by 09-01) but `apps/dgfy-api/src/infra/tenantConnector.js`'s `modelDefiners` map — the single reachable registry `getModels()` uses — never listed them. Every `availments`-module repository call against a real tenant DB would have resolved `tenantConnector.getModels(db).Availment` (etc.) to `undefined` and crashed with "Cannot read properties of undefined (reading 'findOne')" — exactly RESEARCH's documented Pitfall 2. This is a correctness-blocking gap for the entire module, not specific to finalize.
- **Fix:** Imported the six model factories and added them to the `modelDefiners` map + updated the `getModels()` JSDoc `@returns`.
- **Files modified:** `apps/dgfy-api/src/infra/tenantConnector.js`
- **Verification:** `node --experimental-vm-modules --check src/infra/tenantConnector.js`; full `npm test` afterward showed zero regressions (359 passed).
- **Committed in:** `486ca882` (standalone catch-up commit, before Task 1's own commit)

**2. [Rule 1 - Bug] `useCases.getById` was called by the 09-05 controller/routes but never built or wired**
- **Found during:** Task 2, while reading the existing controller to confirm the finalize whitelist.
- **Issue:** `availmentController.js`'s `getById` method (09-05) already called `useCases.getById(...)`, and `routes.js` already registered `GET /v1/availments/:id` — but `buildAvailmentsModule`'s `useCases` map never included a `getById` entry, and no `buildGetByIdUseCase` existed in `availmentUseCases.js`. That route would have thrown `TypeError: useCases.getById is not a function` at runtime.
- **Fix:** Added `buildGetByIdUseCase({ repository, businessRepository })` (active-member-gated read, mirrors the existing duck-typed error mapping) and wired it into `buildAvailmentsModule`'s useCases map.
- **Files modified:** `apps/dgfy-api/src/modules/availments/usecases/availmentUseCases.js`, `apps/dgfy-api/src/modules/availments/index.js`
- **Verification:** File parses; `npm test -- tests/unit/modules/availments` still green (no existing test asserted the prior broken state).
- **Committed in:** `a05ce43f` (Task 2 commit)

**3. [Rule 3 - Blocking] Controller-naming architecture guardrail rejected `availmentController.js`**
- **Found during:** Attempting to commit the 09-05 catch-up (controller/routes/usecases files that existed uncommitted in the working tree from a prior execution session — see Issues Encountered below).
- **Issue:** The pre-commit `check:architecture:dgfy-api` guardrail requires every `apps/dgfy-api` controller filename to end in `Handlers.js` unless explicitly allowlisted — but every other `apps/dgfy-api` module (products, inventory, shifts, compliance, booking, accounts, businesses) is allowlisted to use the project's own locked `*Controller.js` Clean-Architecture naming instead. `availmentController.js` was missing from that allowlist, blocking the commit.
- **Fix:** Added `'../apps/dgfy-api/src/modules/availments/controllers/availmentController.js'` to `ARCHITECTURE_CONTROLLER_NAMING_ALLOWLIST` in `src/config/architectureGuardrailsAllowlist.js`, following the exact same pattern/comment style as every prior Phase 8/9 entry.
- **Files modified:** `apps/dgfy-api/src/config/architectureGuardrailsAllowlist.js`
- **Verification:** `check:architecture:dgfy-api` passed on retry ("Checked 9 modules and 88 code files").
- **Committed in:** `a05ce43f` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (1 missing critical, 1 bug, 1 blocking).
**Impact on plan:** All three were necessary for the module to function/commit correctly and were caught opportunistically while executing this plan's own two files-in-scope (`availmentUseCases.js`, `index.js`) and their prerequisites. No scope creep — no new tables, endpoints, or architectural changes were introduced.

---

## Issues Encountered

**Prior-plan work existed uncommitted in the working tree.** Before starting this plan, `git status` showed that 09-01's tenant models + migration, 09-02's `money.js` + tests, and 09-05's controller/routes/usecases + tests all existed as untracked/modified files in the working tree — none had been committed by their originating execution sessions, even though their SUMMARY.md files describe them as delivered and verified. Since this plan's own files (`availmentUseCases.js`, `index.js`, `availmentController.js`, `routes.js`) are the exact same files 09-05 had already created, I committed the prior plans' work as their own clearly-attributed catch-up commits (`42ae30f4` docs(09-01) models+migration, `486ca882` fix(09-01) tenantConnector registration, `8af252fd` feat(09-02) money.js) before layering my own Task 1/2/3 commits on top, so git history correctly attributes each plan's work rather than folding it all into 09-06.

---

## Threat Model Verification

| Threat ID | Category | Mitigation | Status |
|-----------|----------|-----------|--------|
| T-09-06-01 | Tampering (client-dictated total/change) | `finalizeAvailment` never destructures `total`/`change`/`discount_amount` from input; all amounts recomputed via `money.js` from stored line data + discount rows. Asserted directly in finalize.test.js's happy-path test (bogus client values proven to have zero effect). | ✅ Verified |
| T-09-06-02 | Elevation of Privilege (fiscal receipt without evidence) | `assertComplianceGate` called with `operation:'pos.checkout'` + the assembled evidence bundle; REQUIRES_SETUP/DENY hard-fails the sale (D-24) — no downgrade path exists in the code. Asserted in finalize.test.js's D-24 case (gate called with the original `fiscal` context, `finalizePersist` never invoked). | ✅ Verified |
| T-09-06-03 | Repudiation (selling with no open shift) | `shiftRepository.findOpenShift` must resolve a row or finalize rejects with a 409 (CHK-06); backed by Phase 8's DB-level one-open-shift invariant. Asserted in finalize.test.js's CHK-06 case. | ✅ Verified |
| T-09-06-04 | Tampering (double-charge on print retry) | DB commit (`finalizePersist`) precedes the best-effort print; a print failure only sets `print_warning` and never re-runs the sale. `AvailmentRepository.finalizePersist` row-locks the availment and rejects a non-draft status (double-finalize guard, from 09-04). Asserted in finalize.test.js's D-22 case (receipt persists regardless of print outcome). | ✅ Verified |
| T-09-06-05 | Info Disclosure (cross-tenant finalize) | `businessRepository.findById`/`requireMembership` guard access before any tenant-DB read; `repository`/`shiftRepository`/`complianceEvidenceRepository` all resolve business-scoped tenant databases via the shared `resolveDatabaseName` (active+verified) scaffold. | ✅ Verified (structural — unchanged from 09-04's repository pattern) |
| T-09-06-SC | Tampering (npm installs) | No new packages installed this plan. | ✅ N/A |

---

## Design Decisions Honored

- **CHK-02/D-09 (server-side authority):** every amount — subtotal, VAT, discounts, total, change — is recomputed from stored `availment_items`/`availment_discounts` rows; the finalize input shape never even reads a client total/change/discount field.
- **D-05 (independent discount stacking):** each recorded discount row is resolved independently against its correct base (gross VAT-inclusive subtotal for promo/manual, VAT-exclusive net for SC/PWD) — never cascaded off a prior discount's result.
- **D-07/D-20 (SC/PWD VAT-exempt, 20% off net):** an SC/PWD discount row with no explicit amount/percent defaults to the statutory `computeScPwdDiscount(netSubtotal)`; an explicit override is still re-based against net, never gross.
- **D-14 (receipt content):** every recorded discount renders as its own distinct receipt-payload line (type, code/reason/staff-id/SC-PWD-ID as applicable, and its own server-computed `amount_formatted`) — never folded into a single aggregate discount figure.
- **D-15/D-21 (compliance gate + evidence bundle):** the gate is called from inside the usecase body (never middleware) with the D-23 evidence bundle attached; a `compliant_active` business's checklist requirement is satisfied transparently by always attempting to load and forward the attestation (empty defaults when none exists), regardless of state — the gate itself decides whether the checklist applies.
- **D-17 (single-writer inventory):** `finalizeAvailment` never writes `inventory_movements` directly; it passes `saleEffectLines` + the injected `recordSaleEffect` through to `repository.finalizePersist`, which invokes it inside the same transaction (ADR-0029 intact).
- **D-22 (record-then-warn print):** the DB transaction commits before any print attempt; a failed/thrown print result surfaces as `print_warning` on an otherwise-successful `ApplicationResult`, never a rollback.
- **D-23 (interim attestation store, option B):** `ComplianceEvidenceRepository` + `assembleEvidenceBundle` implement exactly the minimal per-(business, branch) JSON-blob attestation RESEARCH recommended — no new artifacts/peripherals/settings subsystem tables, `compliance_profile` intentionally excluded (sourced by the gate from `compliance_mode_state` instead).
- **D-24 (fiscal hard-fail, no downgrade):** a REQUIRES_SETUP/DENY gate response is forwarded as a failure with the original `requestedDocumentContext` preserved; there is no code path that retries with `non_fiscal`.

---

## Next Phase Readiness

- `finalizeAvailment` is fully wired at the module level (`buildAvailmentsModule().useCases.finalizeAvailment`) and ready for composition-root mounting.
- **Not yet done (later plan's scope, per this plan's `files_modified` list):** mounting `createAvailmentRoutes(...)` under `/availments` in `apps/dgfy-api/src/routes/index.js` — the availments module is still unreachable via HTTP until that composition-root wiring lands (tracked for 09-07 per 09-05-SUMMARY.md's "Next Steps" and RESEARCH's Wave-0 mount-test target).
- The six Phase 9 tenant models are now correctly registered in `tenantConnector.getModels()` (this plan's Rule 2 fix), so any tenant DB with the 09-01 migration applied can now actually resolve `Availment`/`Payment`/`Receipt`/`ComplianceEvidence`, etc. — a real-MySQL end-to-end UAT run (not just mocked-port tests) should now be possible once 09-07 mounts the routes.
- All 7 finalize.test.js cases are green with mocked ports; a live-MySQL integration pass through `repository.finalizePersist`'s actual transaction/rollback behavior (as opposed to this plan's mocked `repository.finalizePersist`) remains untested — appropriate scope for a later UAT/verification pass, consistent with Phase 8's precedent of gating live-DB tests separately.

---

**Delivered by:** Claude (Sonnet 5)
**Session:** 2026-07-13
**Plan ID:** 09-06
**Phase:** 09-pos-checkout-payment
