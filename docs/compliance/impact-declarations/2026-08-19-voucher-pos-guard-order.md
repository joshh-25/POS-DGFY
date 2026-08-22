---
status: reference
owner: engineering
last_reviewed: 2026-08-19
declaration_id: 2026-08-19-voucher-pos-guard-order
classification: major
surfaces: pos,terminal
reason_codes_impacted: VOUCHER_POS_REDEMPTION_DISABLED
policy_version: 2026.08.19
verification_evidence: node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.cjs --runInBand tests/voucherRedemptionUseCases.usecases.test.js,npm run check:compliance,npm run check:architecture
rollback_note: Revert the single changed file. No migration, no schema change, no data written. The guard reorder is the entire diff -- reverting restores the prior (latent) ordering bug exactly.
preflight_result: no_breach
preflight_reason_code: APPROVED_LOCAL_HARDENING
preflight_run_at: 2026-08-19T00:00:00+08:00
preflight_request_ref: PR-693-VOUCHER-POS-GUARD-ORDER
---

# Voucher POS Guard Ordering

## Compliance Impact Classification

Major, per `modules/vouchers/`'s floor -- but the actual risk is dormant, stated plainly rather than
inflated to match the floor. `buildRedeemVoucherUseCase`'s POS master-switch guard ran before the
empty-code short-circuit: a POS checkout carrying no voucher code at all would throw 422
`VOUCHER_POS_REDEMPTION_DISABLED` whenever the tenant-wide switch was off (its default), instead of
the benign no-op every other empty-code caller gets. **No live caller passes `channel: 'pos'`
today** -- POS voucher redemption itself is not built (confirmed: `grep -c voucher`
`modules/pos/usecases/posUseCases.js` → 0) -- so this bug has never actually fired in production. It
would have broken the first POS checkout the moment a POS caller shipped, silently, since nothing
currently exercises this path to catch it.

## Affected Surfaces

- `apps/dgfy-api/src/modules/vouchers/usecases/voucherRedemptionUseCases.js` --
  `buildRedeemVoucherUseCase`'s empty-code short-circuit moved above the POS master-switch check.
  Pure statement reorder; no other logic changed. The channel-mask check inside
  `resolveEligibleBenefit`'s `evaluateVoucherEligibility` call is untouched and unaffected.

## Compliance Preconditions

- **No behavior change to any currently-reachable path.** `channel` defaults to `'storefront'`
  everywhere it's called today (`storeUseCases.js`), and no other caller exists. This fix only
  changes what happens the day a POS voucher redemption caller is built -- it does not change
  today's storefront behavior at all.
- **No schema change, no migration, no new reason code** -- `VOUCHER_POS_REDEMPTION_DISABLED`
  already existed (#604); this only corrects when it can fire.

## Verification Evidence

- `node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.cjs --runInBand tests/voucherRedemptionUseCases.usecases.test.js`
  -- 23/23 passing, including a new case (`is a no-op for an empty code on the POS channel, even
  with the master switch off`) that deliberately does NOT mock
  `resolveVoucherPosRedemptionEnabled` -- if the ordering regresses, this test fails loudly against
  a real, unconnected Sequelize model rather than passing by accident.
- `node --check` on the one changed file -- clean.
- `npm run check:architecture` -- OK, 49 modules / 491 files checked.
- `npm run check:compliance` -- to be re-run after this declaration is added.

## Rollback Considerations

Revert the single changed file. No migration, no schema change, no data written by this PR.
