---
phase: 09-pos-checkout-payment
fixed_at: 2026-07-14T02:26:26Z
review_path: .planning/phases/09-pos-checkout-payment/09-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
---

# Phase 09: Code Review Fix Report

**Fixed at:** 2026-07-14T02:26:26Z
**Source review:** .planning/phases/09-pos-checkout-payment/09-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 7 (2 critical, 5 warning — `fix_scope: critical_warning`)
- Fixed: 7
- Skipped: 0

## Fixed Issues

### CR-01: ENUM-backed inputs reach the DB unvalidated and get masked as a 503 "tenant database unreachable" instead of a 400

**Files modified:** `apps/dgfy-api/src/modules/availments/usecases/availmentUseCases.js`
**Commit:** `3b3bf0d2`
**Applied fix:** Generalized the existing `FULFILLMENT_MODES.includes(...)` allowlist pattern
(11-REVIEW.md CR-01) to the three sibling ENUM-backed inputs introduced in this phase: added
`DISCOUNT_TYPES`, `STOCK_EFFECT_TYPES`, and `DOCUMENT_CONTEXT_VALUES` frozen allowlist constants,
and inserted `.includes(...)` checks (returning `ApplicationResult.failure(validationError(...))`
on a miss) in `buildApplyDiscountUseCase` (discountType), `buildAddLineUseCase` /
`buildUpdateLineUseCase` (stockEffectType override), and `buildFinalizeAvailmentUseCase`
(requestedDocumentContext) — all BEFORE the value reaches `repository.recordDiscount` /
`repository.addLine` / `repository.updateLine` / `repository.finalizePersist`. Added 4 new unit
tests (`rejects an out-of-set discountType (400)`, two `rejects an out-of-set stockEffectType
override (400)` cases for add/update line) verifying each rejects with 400 and never reaches the
repository mock.

### CR-02: No validation of discount `amount`/`percent` sign or range — a caller can inflate a customer's total beyond the subtotal

**Files modified:** `apps/dgfy-api/src/modules/availments/usecases/availmentUseCases.js`,
`apps/dgfy-api/src/modules/availments/usecases/money.js`,
`apps/dgfy-api/tests/unit/modules/availments/availmentUseCases.test.js`,
`apps/dgfy-api/tests/unit/modules/availments/money.test.js`
**Commit:** `fbdc4f29`
**Applied fix:** Applied both halves of the review's fix exactly as specified (the review notes
either alone leaves a gap): (1) usecase-level validation in `buildApplyDiscountUseCase` rejecting
a non-finite/negative `amount`, a non-finite/out-of-[0,100]-range `percent`, and a missing/blank
`scPwdIdNumber` for `discountType === 'sc_pwd'` — all before `repository.recordDiscount` is
called; (2) defense-in-depth floor in `money.js`'s `computeAvailmentTotals`, changing
`Math.min(totalDiscountCentavos, discountBase)` to `Math.max(0, Math.min(...))` so a negative
discount term can never make `total_amount` exceed `subtotal_amount` even if it somehow bypasses
the usecase-level check. Added 5 new unit tests covering negative amount, negative percent,
percent > 100, missing scPwdIdNumber, and a money.js-level test confirming a negative discount
term is floored to 0 with `total_amount === subtotal_amount`.

### WR-01: VAT is computed independent of discount, producing internally inconsistent receipts for large/full discounts

**Files modified:** `apps/dgfy-api/src/modules/availments/usecases/money.js`,
`apps/dgfy-api/tests/unit/modules/availments/money.test.js`
**Commit:** `3af77e5e`
**Applied fix:** Chose option (a) from the review's fix (documenting the behavior as an
intentional Philippine BIR convention — non-SC/PWD discounts do not reduce the VATable base) since
this is established BIR practice and re-basing VAT off the discount would be a business-logic
change outside this fix pass's scope. Added a detailed inline comment in `computeAvailmentTotals`'s
standard-VAT branch explaining the behavior, and pinned it with a new "Golden Case 7" test
(`money.test.js`) asserting a 100%-off promo code zeroes `total_amount` while `vat_amount` stays
positive — this test will catch a future accidental "fix" that couples VAT to the discount.

### WR-02: Ambiguous dual-type contract in `computeManualAndCodeDiscounts` is a maintenance landmine

**Files modified:** `apps/dgfy-api/src/modules/availments/usecases/money.js`
**Commit:** `5bd1612e`
**Applied fix:** Chose the lighter-touch option from the review's fix ("or add a runtime
assertion/JSDoc `@throws`...") over the full field-rename refactor, to avoid touching every call
site's shape in a retroactive fix pass. Added an extensive JSDoc block on
`computeManualAndCodeDiscounts` spelling out the exact type-driven contract (string = pesos,
number = centavos), documenting the two current internal call sites that are each individually
consistent with it, and warning that any new call site must follow the same shape or risk a
silent 100x magnitude error. No runtime behavior change (kept low-risk for a documentation-only
finding); all existing tests still pass unmodified.

### WR-03: Falsy-zero footguns in `availmentController.js` silently null out legitimate zero values

**Files modified:** `apps/dgfy-api/src/modules/availments/controllers/availmentController.js`
**Commit:** `1b9183fa`
**Applied fix:** Replaced `body.quantity || null` (line 57, `updateLine`) and
`body.cash_received || null` (line 143, `finalize`) with explicit
`!== undefined && !== null` checks, exactly as the review's fix snippet specifies, so a
legitimate `0` (e.g. a fully-discounted ₱0.00 cash sale correctly submitting `cash_received: 0`)
is no longer silently coerced to `null`. No dedicated controller unit test file exists in this
codebase; verified via `node --check` (syntax) and a Tier-1 re-read of both changed lines.

### WR-04: `AvailmentRepository` resolves the tenant database name twice per write call

**Files modified:** `apps/dgfy-api/src/modules/availments/repositories/availmentRepository.js`
**Commit:** `974ba440`
**Applied fix:** Adapted the review's fix snippet: changed `withModel(businessId, fn)` to invoke
`fn(model, databaseName)` (passing the already-resolved `databaseName` as a second argument,
rather than restructuring `fn`'s first argument into a `models` object as the review's snippet
literally shows — this preserves every existing caller's `async (Availment) => {...}` destructuring
of the primary model while still eliminating the redundant lookup) and updated all 6 mutating
methods (`addLine`, `updateLine`, `cancelLine`, `restoreLine`, `recordDiscount`,
`finalizePersist`) to derive sibling models via `this.tenantConnector.getModels(databaseName)`
using the passed-in `databaseName`, removing each method's own duplicate
`await this.resolveDatabaseName(businessId)` call. Verified with a scratch smoke test using a
mocked `tenantConnector`/`businessDatabaseRegistryRepository`: confirmed the actual registry
lookup (`findByBusinessId`) drops from 2 calls to 1 call per `addLine` invocation (and separately
confirmed the pre-fix code made 2 calls, isolating this as a real behavior change, not a no-op).
No dedicated repository unit test file exists in this codebase (this repository is normally
exercised via `tests/integration/availments/*` mock-repository fakes, which don't invoke the real
`AvailmentRepository` class); all 110 existing availments-area tests still pass.

### WR-05: `discountType: 'sc_pwd'` requires no ID number and no permission gate, and multiple SC/PWD rows can stack on one availment

**Files modified:** `apps/dgfy-api/src/modules/availments/repositories/availmentRepository.js`,
`apps/dgfy-api/src/modules/availments/usecases/availmentUseCases.js`,
`apps/dgfy-api/tests/unit/modules/availments/availmentUseCases.test.js`
**Commit:** `76743ce7`
**Applied fix:** The `scPwdIdNumber` requirement half of this finding was already covered by
CR-02's fix (the review's own CR-02 fix snippet includes the `scPwdIdNumber` check). This commit
addresses the remaining half — stacking prevention — by choosing the review's second alternative
("add a repository-level check that rejects a second `sc_pwd` row for an availment that already
has one"): added a new `DuplicateScPwdDiscountError` class, a duplicate-row check in
`recordDiscount` (queries for an existing `discount_type: 'sc_pwd'` row on the availment before
insert — `availment_discounts` is append-only with no `cancelled_at`, so any prior row is a
permanent block), added the new error to `withModel`'s domain-error whitelist (so it isn't masked
as a 503), and wired `isDuplicateScPwdDiscountError` duck-typing in `buildApplyDiscountUseCase`'s
catch block to map it to a 409 conflict. Verified with a scratch smoke test using a mocked
`AvailmentDiscount.findOne` returning an existing row, confirming `DuplicateScPwdDiscountError` is
thrown; added a permanent unit test (`rejects a second sc_pwd discount on the same availment
(409)`) exercising the usecase-layer error mapping.

## Skipped Issues

None — all 7 in-scope findings were fixed.

## Verification

- `node --check` (syntax) passed for every modified source file after each edit.
- Full `apps/dgfy-api` unit + non-DB-integration test suite (`npm test` equivalent, run via
  `node --experimental-vm-modules node_modules/.bin/jest --config jest.config.cjs --runInBand`
  from `apps/dgfy-api`): **620 passed, 0 failed, 196 skipped** (skips are all pre-existing,
  gated behind `RUN_*_INTEGRATION=true` env vars requiring live MySQL credentials — unrelated to
  this fix pass).
- `availments`-scoped suites specifically: **110 passed, 0 failed, 5 skipped** (same
  live-DB-gated skips).
- Added 11 new unit tests total across `availmentUseCases.test.js` (9 tests: CR-01 discountType
  allowlist, CR-01 stockEffectType allowlist ×2, CR-02 negative amount/percent/range ×3, CR-02
  missing scPwdIdNumber, WR-05 duplicate sc_pwd) and `money.test.js` (2 tests: CR-02
  negative-discount floor, WR-01 100%-discount golden case).
- Architecture guardrails (`check-architecture-guardrails.js` + `check-controller-boundaries.js`)
  verified clean after every commit. Note: these guardrail scripts produce false-positive
  `controllerNaming` violations when run from a path reached via a symlinked directory (e.g.
  macOS's `/tmp` → `/private/tmp`) because they mix `$PWD`-derived and `__dirname`-derived
  absolute paths — an environmental artifact of this agent's isolated worktree living under
  `/tmp`, unrelated to any of the 7 findings. Worked around by operating from the resolved
  `/private/tmp/...` real path for all verification and commit commands; not a code change.

---

_Fixed: 2026-07-14T02:26:26Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
