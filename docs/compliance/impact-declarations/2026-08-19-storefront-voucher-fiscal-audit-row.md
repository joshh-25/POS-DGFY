---
status: reference
owner: engineering
last_reviewed: 2026-08-19
declaration_id: 2026-08-19-storefront-voucher-fiscal-audit-row
classification: major
surfaces: payments,pos,terminal
reason_codes_impacted: VOUCHER_DISCOUNT_SLOT_OCCUPIED,VOUCHER_REDEMPTION_UNRECORDED
policy_version: 2026.08.19
verification_evidence: node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.cjs --runInBand tests/voucher*.test.js,node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.cjs --runInBand tests/storeRepositoryPromoPersistence.test.js tests/storeUsecases.applicationResult.test.js tests/storeCheckoutAffiliatePricing.unit.test.js tests/storeCheckoutVoucherPromoStacking.unit.test.js,node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.cjs --runInBand tests/posCheckoutFnbContracts.usecase.test.js tests/posItemDiscountPolicy.unit.test.js tests/posReports.repository.test.js tests/posSplitPayment.usecases.test.js tests/salesRepositoryPromoReadModel.test.js,npm run check:compliance,npm run check:architecture,npm run check:adr
rollback_note: Revert the seven changed files together (storeUseCases.js, storeRepository.js, voucherRedemptionUseCases.js, voucherBenefitPolicy.js, voucherErrors.js, vouchers/index.js, voucherValidator.js -- plus the ADR 0066 amendment and the VoucherManagementPanel.jsx/ReceiptPrintView.jsx frontend edits). No migration, no schema change, no new persisted column. Reverting restores storefront checkout to letting voucher and promo stack uncapped (#667's original defect) and to writing no fiscal audit row for a voucher-only order -- both known-bad prior states, not a new risk introduced by rolling back. No data to unwind: nothing here backfills or rewrites an existing row.
preflight_result: no_breach
preflight_reason_code: APPROVED_FISCAL_AUDIT_COMPLETION
preflight_run_at: 2026-08-19T00:00:00+08:00
preflight_request_ref: PR-667-VOUCHER-GOVERNED-DISCOUNT-SLOT
---

# Storefront Voucher Fiscal Audit Row

## Compliance Impact Classification

Major. Fixes two related defects in already-merged, money-discounting checkout code: (1) storefront
checkout let a `voucher_code` and an already-applied `promo_code` both discount the same order,
uncapped and with no mutual-exclusivity check, unlike the single governed-discount-slot rule ADR
0066 Decision 8 already states and `pos_transaction_discounts`' `UNIQUE (transaction_id)` already
enforces; (2) as a direct consequence, a storefront voucher-only order deducted the voucher's
discount from `total_amount` but persisted no `pos_transaction_discounts` audit row and no per-line
allocations, so the order header's discount fields and the fiscal audit trail did not reflect the
actual discount applied -- a real gap against ADR 0033's 2026-08-17 amendment and ADR 0066 Decision
10, both of which already state that a voucher redemption persists this audit trail. This PR closes
both gaps rather than shipping a stacking-cap workaround: with the slot enforced, at most one
governed discount exists per order, so the voucher path can write the exact same audit row shape
the promo path already does.

## Affected Surfaces

- `apps/dgfy-api/src/modules/store/usecases/storeUseCases.js` -- `resolveCheckoutContext` rejects a
  voucher code submitted alongside an already-applied promo code (422,
  `VOUCHER_DISCOUNT_SLOT_OCCUPIED`) before either benefit resolves against the ledger. The order
  header's `discount_amount`/`discount_label_snapshot`/`discount_rate_snapshot` and the discount
  payload passed to `createOnlineTransactionWithLines` now reflect whichever source actually
  applied (promo or voucher, never both -- the slot guard makes "both" unreachable). New helper
  `buildVoucherDiscountRecord` converts a voucher's centavos-denominated allocations into the same
  peso-denominated shape the promo path already produces. The existing defensive
  `VOUCHER_REDEMPTION_UNRECORDED` guard is extended to also catch a fresh (non-replay), positively
  discounted redemption whose allocations don't actually carry the discount.
- `apps/dgfy-api/src/modules/store/repositories/storeRepository.js` --
  `createOnlineTransactionWithLines` takes `discount_type`/`discount_method` from the caller instead
  of hardcoding `'promo'`/`'percentage'`, defaulting to those exact literals so the promo path's
  persisted row is byte-for-byte unchanged.
- `apps/dgfy-api/src/modules/vouchers/domain/voucherErrors.js` -- new reason code
  `VOUCHER_DISCOUNT_SLOT_OCCUPIED`, re-exported via `apps/dgfy-api/src/modules/vouchers/index.js` so
  the store module can reference it by name.
- `apps/dgfy-api/src/modules/vouchers/domain/voucherBenefitPolicy.js` -- each line allocation gains
  `eligible` and `lineSubtotalCentavos`, carried through from the already-normalized input line.
  Additive; no existing caller destructures this object exhaustively.
- `apps/dgfy-api/src/modules/vouchers/usecases/voucherRedemptionUseCases.js` -- both the preview and
  redeem use cases now return `code`/`title`/`badge`/`benefitClass`/`percentOffBps` (for building a
  fiscal discount-label snapshot, mirroring `commercialPromoPolicy.js`'s own `badge || title ||
  fallback`). The redeem use case's `lineAllocations` is now the **unfiltered** per-input-line array
  (same length/order as the checkout's own lines) rather than the ledger-row-shaped filtered array,
  so a caller can map allocations positionally against its own transaction lines the same way the
  promo path already does. The ledger insert itself is unaffected -- it still filters to
  discounted lines only, from the same underlying data.
- `apps/dgfy-api/src/validators/voucherValidator.js` and
  `apps/dgfy-web/src/features/pos/components/VoucherManagementPanel.jsx` -- voucher codes capped at
  40 characters (previously up to 64), to fit `pos_transaction_discounts.promo_code VARCHAR(40)`
  without widening a fiscal table's column. See Compliance Preconditions.
- `apps/dgfy-web/src/features/pos/components/ReceiptPrintView.jsx` -- the receipt's discount-code
  label reads "Voucher Code" instead of "Promo Code" when `discount_type === 'voucher'`.
- `docs/architecture/adr/0066-voucher-sale-time-price-resolution.md` -- dated `## Amendments` block
  (`[default]` tier, ADR 0039), recording that Decisions 8 and 10 are now enforced/fulfilled on the
  storefront path, not changed.

## Compliance Preconditions

- **No migration, no schema change.** `pos_transaction_discounts.discount_type` is already
  `VARCHAR(40)`, not an enum -- the new `'voucher'` value needed no DDL change. The alternative that
  *would* have required a migration (allowing two audit rows per transaction, by dropping
  `pos_transaction_discounts`' `UNIQUE (transaction_id)` index) was explicitly rejected in favor of
  enforcing the single-slot rule instead, which needs none.
- **Voucher code length narrowed from 64 to 40 characters**, application-level only (`vouchers.code`
  stays `VARCHAR(64)` at the DB layer). This is a real behavior change for the merchant authoring
  UI/API, stated plainly: a merchant could previously request a code up to 64 characters; the
  ceiling is now 40. **No production voucher code is narrowed out from under a merchant** --
  storefront voucher redemption is not on `main` as of this change (confirmed: `git show
  origin/main:.../storeUseCases.js | grep -c voucher_code` → `0`), so no live code exists at
  create-time to be invalidated by this validator change.
- **The slot guard changes checkout behavior for a real, if narrow, case.** A customer who
  deliberately enters both a promo code and a voucher code at storefront checkout previously had
  both discounts applied (uncapped stacking, #667's original defect); they will now be rejected
  (422 `VOUCHER_DISCOUNT_SLOT_OCCUPIED`) and must remove one. Promo codes never auto-apply
  (`commercialPromoPolicy.js` short-circuits on an empty entered code), so this only fires on a
  deliberate double-entry, not passively.
- **Mutual exclusivity, not a migration workaround.** This does not anticipate or depend on #695
  (the promo-code-to-voucher-entity migration) -- ADR 0066 Decision 8's "one governed discount slot
  per transaction" already existed and already applies fleet-wide; this PR is the storefront side
  catching up to a rule the POS side already had wired in place.
- **The fiscal audit row is now complete for a voucher-only order.** Before this PR, a voucher-only
  storefront order's `pos_transaction_discounts` table had no row, and its `pos_transactions`
  header's discount fields were empty/zero despite `total_amount` reflecting a real discount. After
  this PR, `subtotal_amount − discount_amount + delivery_fee + service_fee_amount === total_amount`
  holds by construction for every storefront order, promo or voucher.

## Verification Evidence

- `node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.cjs --runInBand tests/voucher*.test.js`
  -- 306/306 passing. Two pre-existing tests were retargeted, not weakened, because the shape of
  `lineAllocations` legitimately changed (unfiltered, not ledger-row-shaped) -- see the changed test
  file's own inline comments for what each retargeted assertion now checks instead.
- Same runner against `tests/storeRepositoryPromoPersistence.test.js`,
  `tests/storeUsecases.applicationResult.test.js`, `tests/storeCheckoutAffiliatePricing.unit.test.js`,
  `tests/storeCheckoutVoucherPromoStacking.unit.test.js` -- 148/148 passing, including the
  `storeRepositoryPromoPersistence.test.js` case proving the promo-only persisted row is
  byte-for-byte unchanged.
- Same runner against every test file in `apps/dgfy-api/tests/` matching `discount_type`
  (`posCheckoutFnbContracts.usecase.test.js`, `posItemDiscountPolicy.unit.test.js`,
  `posReports.repository.test.js`, `posSplitPayment.usecases.test.js`,
  `salesRepositoryPromoReadModel.test.js`) -- 58/58 passing, confirming POS (untouched by this PR)
  has no regression.
- `node --check` on every changed `.js` file -- clean.
- `npm run check:architecture` -- OK, 49 modules / 491 code files checked.
- `npm run check:adr --strict` -- OK, 74 ADRs validated.
- `npm run check:compliance` -- to be re-run after this declaration is added (self-referential gate,
  same as every other declaration in this directory).

## Rollback Considerations

Revert the changed files together (listed in `rollback_note` above) plus the ADR 0066 amendment. No
migration, no persisted schema change, no data written or backfilled by this PR -- reverting
restores the two prior defects exactly (uncapped storefront stacking, and a voucher-only order with
no fiscal audit row), not a new or different risk.
