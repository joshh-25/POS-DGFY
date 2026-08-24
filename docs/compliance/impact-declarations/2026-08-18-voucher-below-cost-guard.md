---
status: reference
owner: engineering
last_reviewed: 2026-08-18
declaration_id: 2026-08-18-voucher-below-cost-guard
classification: major
surfaces: pos,terminal,payments
reason_codes_impacted: VOUCHER_PRICE_BELOW_COST
policy_version: 2026.08.18
verification_evidence: node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.cjs --runInBand tests/voucher*.test.js,node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.cjs --runInBand tests/storeRepository.locationStockFallback.test.js tests/storeRepositoryPromoPersistence.test.js tests/storeUsecases.applicationResult.test.js,npm run check:compliance,npm run check:architecture,npm run check:adr
rollback_note: Revert the seven changed files together (voucherBenefitPolicy.js, voucherErrors.js, voucherRedemptionUseCases.js, voucherDisplayUseCases.js, storeUseCases.js, storeRepository.js, the ADR 0066 amendment). No migration, no schema change, no new persisted column -- this PR only adds a read-time comparison and a new reason code. Reverting restores the prior write-only allow_below_cost behavior exactly; no data to unwind.
preflight_result: no_breach
preflight_reason_code: APPROVED_LOCAL_HARDENING
preflight_run_at: 2026-08-18T00:00:00+08:00
preflight_request_ref: PR-697-VOUCHER-BELOW-COST-GUARD
---

# Voucher Below-Cost Guard

## Compliance Impact Classification

Major. `vouchers.allow_below_cost` (present since #455/Phase 101, with a merchant UI toggle) has
been write-only since it shipped -- validated, persisted, and displayed, but read by no decision
path. This PR makes it enforce: a voucher redemption whose resolved per-line price would undercut
that item's `cost_per_unit` now fails checkout closed (`VOUCHER_PRICE_BELOW_COST`) unless the
voucher explicitly permits it, and the same condition fails catalog display open (per item). This
is a real, intentional behavior change to already-live checkout/display paths for money-discounting
config, matching the `pos,terminal` minimum classification this repo already applies to the
`modules/vouchers/` tree, plus the `payments` surface `modules/store/` (checkout) carries.

## Affected Surfaces

- `apps/dgfy-api/src/modules/vouchers/domain/voucherBenefitPolicy.js` -- pure benefit math gains an
  optional per-line `costPerUnitCentavos` input and a non-throwing `belowCostLines` output. No
  change to any existing discount calculation; below-cost detection is additive.
- `apps/dgfy-api/src/modules/vouchers/domain/voucherErrors.js` -- new reason code
  `VOUCHER_PRICE_BELOW_COST`.
- `apps/dgfy-api/src/modules/vouchers/usecases/voucherRedemptionUseCases.js` -- the shared
  preview/redeem resolution path (`resolveEligibleBenefit`) now fails closed (422) when a
  redemption would sell below cost and `allow_below_cost` is not `true`. Applies to both the
  checkout quote preview and the real atomic redemption -- a cart preview must never promise a
  discount checkout will then refuse.
- `apps/dgfy-api/src/modules/vouchers/usecases/voucherDisplayUseCases.js` -- the catalog display
  seam (#603) now skips (fails open, per item) a voucher price that would sell below cost, falling
  back to the plain catalog price for that item only.
- `apps/dgfy-api/src/modules/store/usecases/storeUseCases.js` -- two one-line projection widenings
  (`voucherLines` gains `cost_snapshot`; both `resolveVoucherDisplayPricesUseCase` call sites gain
  `cost_per_unit`). No new query -- cost is already loaded for the pre-existing affiliate below-cost
  guard this mirrors.
- `apps/dgfy-api/src/modules/store/repositories/storeRepository.js` -- `resolvePublicBarcode`
  (QR-code voucher display path) widened to select and return `cost_per_unit`, which it previously
  omitted; without this the QR-scan voucher price could not be checked against cost at all.
- `docs/architecture/adr/0066-voucher-sale-time-price-resolution.md` -- dated `## Amendments` block
  (`[default]` tier, ADR 0039), `status: amended`. Adds Decision 12 and corrects a References-section
  claim that this ADR already inherited a cost guard it never implemented.

## Compliance Preconditions

- **Behavior change, stated plainly:** `allow_below_cost` defaults to `false`. Any already-live
  voucher of *any* benefit class (not just `fixed_price`) that happens to resolve a price below an
  item's recorded cost will now fail checkout where it previously succeeded. That is the flag doing
  what its name says, not a bug -- but it is a real change to shipped behavior, not a pure addition.
- The comparison is against `Item.cost_per_unit` alone, matching the existing affiliate-pricing
  below-cost guard's own definition of cost (not `item_cost_breakdown`'s labor/overhead/packaging
  components, which nothing in this repo currently sums).
- A line with no recorded cost (`cost_per_unit IS NULL`) is exempt from the check in both the
  redemption and display paths -- it is never treated as a violation, so an item with unrecorded
  cost data does not silently block every voucher that touches it.
- No schema change, no new column, no migration. Everything here is a read-time comparison against
  data already loaded (or, for the QR path, an attribute-list widening of an existing query) plus a
  new reason code.

## Verification Evidence

- `node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.cjs --runInBand tests/voucher*.test.js`
  -- 281/281 passing, including 4 new fixture cases in `voucherBenefitCases.json`, 4 new fail-closed
  cases in `voucherRedemptionUseCases.usecases.test.js`, and 2 new fail-open cases in
  `voucherDisplayUseCases.usecases.test.js`.
- Same runner against `tests/storeRepository.locationStockFallback.test.js`,
  `tests/storeRepositoryPromoPersistence.test.js`, `tests/storeUsecases.applicationResult.test.js`
  -- 66/66 passing, no regression from the `storeUseCases.js`/`storeRepository.js` widening.
- `node --check` on all six changed `.js` files -- clean.
- `npm run check:compliance`, `npm run check:architecture`, `npm run check:adr` -- to be run after
  this declaration is added (self-referential gate, same as every other declaration in this
  directory).

## Rollback Considerations

Revert the seven changed files together. No migration, no persisted schema change, no data written
by this PR -- reverting restores the prior write-only `allow_below_cost` state exactly.
