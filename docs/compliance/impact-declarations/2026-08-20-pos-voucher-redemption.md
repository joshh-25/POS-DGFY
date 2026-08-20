---
status: reference
owner: engineering
last_reviewed: 2026-08-20
declaration_id: 2026-08-20-pos-voucher-redemption
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.08.20
verification_evidence: posDiscountPolicy.unit.test.js,posVoucherDiscountCalculator.unit.test.js,voucherRedemptionUseCases.usecases.test.js,posValidator.discountPolicy.test.js,posCheckoutErrorMessages.test.js,discountTypeCards.contract.test.js,POS production build,Skupervisor production build
rollback_note: Revert this commit series to remove POS voucher redemption entirely. No data migration involved -- the only schema-adjacent change is the ledger idempotency-key prefix fix in voucherRedemptionUseCases.js, which is backward compatible (existing storefront redemptions already used the 'storefront:' prefix this fix continues to produce for channel='storefront'; only a future 'pos:'-prefixed row would need to be understood by a rollback, and none exist until this PR's own POS redemptions occur). The #604 master switch (default off) means no tenant is affected unless a merchant has already opted in.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-20T00:00:00+08:00
preflight_request_ref: ISSUE-712-POS-VOUCHER-REDEMPTION
---

# POS Voucher Redemption

## Compliance Impact Classification

Major because this wires a new governed discount type into `apps/dgfy-api/src/modules/pos/`'s
checkout use case and touches `apps/dgfy-api/src/modules/vouchers/`'s redemption use case, both
matching `scripts/check-compliance-impact.js`'s `surfaces: pos,terminal`, `minimumClassification:
major` rules. This is the first caller of `redeemVoucherUseCase`/`previewVoucherEligibilityUseCase`
with `channel: 'pos'` -- the master switch and channel-mask gate these functions already enforce
have never before had a live caller to actually gate.

## Affected Surfaces

1. `POST /pos/checkouts` -- gains a `type: 'voucher'` governed-discount option
   (`governed_discount.voucher_code`), sale-level only. Every other governed discount type
   (senior/pwd/employee/promo/manual) is unchanged.
2. `apps/dgfy-api/src/modules/vouchers/usecases/voucherRedemptionUseCases.js` --
   `redeemVoucherUseCase`'s ledger idempotency-key prefix is now derived from the caller's `channel`
   argument instead of hardcoded to `'storefront:'`. Storefront behavior is unchanged (its calls
   already pass `channel: 'storefront'` explicitly); this only changes what a `channel: 'pos'` (or
   any other future channel) caller produces.
3. POS checkout modal (`POSCheckoutTerminalView.jsx`) gains a sixth discount-type card. No other
   discount type's UI, validation, or payload shape changes.
4. Fiscal audit trail -- a POS voucher redemption persists a `pos_transaction_discounts` row with
   `discount_type: 'voucher'` and per-line allocations via the same `createGovernedTransactionDiscount`
   path every other governed discount already uses. No new table, no new column
   (`discount_type` is a free-form `STRING(40)`, and the voucher code reuses the existing
   `promo_code` column, matching the storefront's own precedent from Phase 110/#667).

## Compliance Preconditions

1. Redemption is gated behind the existing tenant-wide `voucher_pos_redemption_enabled` setting
   (#604, default `false`) **and** the specific voucher's `channels_mask` including the POS bit
   (`VOUCHER_CHANNEL_BITS.pos = 2`, `voucherEligibilityPolicy.js`) -- both pre-existing controls,
   neither modified by this change, both now actually enforced against a live caller for the first
   time.
2. POS voucher redemption requires a customer name (`posDiscountPolicy.js`'s existing
   `DISCOUNT_CUSTOMER_NAME_REQUIRED` guard, unmodified, already excludes only `employee` and the
   statutory types) and a manager PIN (parity with every other governed discount type, ADR 0033
   Decision 7, no exception carved out).
3. A voucher discount is mutually exclusive with a promo discount in the same governed-discount
   slot, extending the existing `MULTIPLE_PROMO_CODES_NOT_ALLOWED`/`VOUCHER_DISCOUNT_SLOT_OCCUPIED`
   check that already governs promo-vs-promo and (on the storefront) voucher-vs-promo.
4. Verified a voucher's discount amount is never client-resolvable and never trusted from the
   client: `governed_discount.discount_amount` (if present on the request) is not read anywhere in
   the new voucher branch of `posDiscountPolicy.js`; the persisted, charged amount always comes from
   `buildVoucherGovernedCalculation`'s server-side computation off the voucher's own ledger-
   authoritative `lineAllocations`.
5. Verified the voucher's per-line discount is never re-derived through `calculatePosDiscount`'s
   generic proportional redistribution -- confirmed by reading that module in full: its `vat_removed`/
   `vat_exempt_amount` are nonzero only for statutory (senior/pwd) discounts, so a voucher (never
   statutory) correctly produces zero for both in `buildVoucherGovernedCalculation` too, with no VAT
   formula duplicated.
6. No new PII is collected -- the customer name captured is a free-typed string on the pre-existing,
   nullable `pos_transaction_discounts.customer_name` column; no `store_customer_id`/`dgfy_account_id`
   is linked to a POS voucher redemption (ADR 0066 amendment, 2026-08-20).

## Verification Evidence

1. `apps/dgfy-api/tests/posDiscountPolicy.unit.test.js`'s `voucher discounts (#712)` block (7 tests)
   -- customer-name requirement, voucher-code-required-before-calling-redeemVoucher, missing-dependency
   throw, percent_off and fixed-benefit application shaping, sale-level-only line scoping (every
   prepared line passed, no per-line restriction), and a regression guard confirming the voucher
   branch is checked before the `UNSUPPORTED_DISCOUNT_TYPE` rejection.
2. `apps/dgfy-api/tests/posVoucherDiscountCalculator.unit.test.js` (5 tests) -- proves the calculator
   builds discount lines directly from `lineAllocations` rather than a proportional split (the
   specific defect this module exists to prevent), zeroes an ineligible line, never sets
   `vat_removed`/`vat_exempt_amount`, resolves method/rate correctly for all three benefit classes,
   and reconciles subtotal/discount/final-line-amount arithmetic.
3. `apps/dgfy-api/tests/voucherRedemptionUseCases.usecases.test.js` -- existing 25 tests unaffected
   (default `channel: 'storefront'` still produces the `storefront:` prefix), plus one new test
   proving the prefix is channel-derived, not hardcoded.
4. `apps/dgfy-api/tests/posValidator.discountPolicy.test.js` -- 5 new tests: accepts a governed
   voucher discount with a normalized (trimmed/uppercased) `voucher_code`; accepts a voucher
   `discount_type` on the approval payload; rejects a voucher code over 40 characters (matching the
   `pos_transaction_discounts.promo_code VARCHAR(40)` fiscal column width); rejects a `voucher`
   `discount_type` on a per-line `item_discount` (confirms the sale-level-only boundary is enforced
   at the schema layer, not just by convention).
5. `apps/dgfy-web/src/features/pos/utils/__tests__/posCheckoutErrorMessages.test.js` (5 tests) --
   voucher redemption-time reason codes now resolve to friendly copy, including on a 409 (the
   `VOUCHER_DISCOUNT_SLOT_OCCUPIED` case), not just the generic 422 validation-array path.
6. `apps/dgfy-web/src/features/pos/__tests__/discountTypeCards.contract.test.js` -- updated for six
   cards, plus a new assertion pinning the voucher field's no-client-validation shape.
7. `npm run build:pos` and `npm run build:skupervisor` both pass.
8. `GITHUB_BASE_REF=develop node scripts/check-compliance-impact.js`,
   `npm run check:architecture`, `npm run check:adr`, `npm run lint:docs` all pass.
9. Full `apps/dgfy-api` backend suite and `apps/dgfy-web` `src/features/pos` frontend suite run;
   the frontend suite's one intermittent 3-test/2-file failure signature was confirmed present
   (with different specific failing tests each run) on clean `develop` before this change, on two
   separate runs -- pre-existing test-parallelization flakiness, not a regression from this PR.
