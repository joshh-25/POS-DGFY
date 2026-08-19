---
status: reference
owner: engineering
last_reviewed: 2026-08-19
declaration_id: 2026-08-19-fixed-price-voucher-create-null
classification: major
surfaces: pos,terminal
reason_codes_impacted: none (existing validation shape, wider acceptance)
policy_version: 2026.08.19
verification_evidence: node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.cjs --runInBand tests/voucherValidator.test.js tests/voucherUseCases.usecases.test.js tests/voucherRedemptionUseCases.usecases.test.js tests/pricelistUseCases.usecases.test.js tests/pricelistValidator.test.js tests/voucherBenefitPolicy.unit.test.js tests/voucherDisplayUseCases.usecases.test.js tests/voucherReversalUseCases.usecases.test.js tests/voucherFolderScope.unit.test.js tests/storeCheckoutVoucherPromoStacking.unit.test.js tests/storeRepositoryPromoPersistence.test.js,npx vitest run src/features/pos/__tests__/voucherManagementPayload.test.js,npm run build:pos,npm run check:compliance,npm run check:architecture
rollback_note: Revert both changed files. No migration, no schema change, no data written. Pure validation-schema and payload-shape changes; reverting restores the prior (broken) create-time rejection exactly.
preflight_result: no_breach
preflight_reason_code: APPROVED_LOCAL_HARDENING
preflight_run_at: 2026-08-19T00:00:00+08:00
preflight_request_ref: PR-716-FIXED-PRICE-VOUCHER-CREATE-NULL
---

# Fixed-Price Voucher Create — Explicit Null Tolerance

## Compliance Impact Classification

Major, per `modules/vouchers/`'s and `apps/dgfy-web/src/features/pos/`'s floor. The actual risk
is a widening of what the create schema *accepts*, not a change to redemption/pricing/discount
math — no fiscal calculation, no reason code, and no downstream consumer changes. Named at the
floor rather than argued down, since this is the authoring entry point for the fixed-price voucher
feature.

## Affected Surfaces

- `apps/dgfy-api/src/validators/voucherValidator.js` — `createVoucherSchema`'s
  `fixed_unit_price_centavos`, `pricelist_id`, and `scopes` conditionals. Every `is:` check that
  used to test only "the sibling key is present" (`Joi.exist()`) or "the field itself is absent"
  (`Joi.forbidden()`) now correctly distinguishes "a real value is present" from "the key is
  present but explicitly `null`." No other field in the schema is touched.
- `apps/dgfy-web/src/features/pos/components/VoucherManagementPanel.jsx` — no behavior change;
  `buildVoucherPayload` and `blankForm` are exported (unchanged bodies) so the new regression test
  can import them.

## The bug this closes

**A fixed-price voucher could not be created from the merchant UI at all, in either sub-mode.**
`buildVoucherPayload` sends the inapplicable field as an explicit `null` (required by the *update*
path, to clear a stale field when a merchant switches an existing voucher between "single price"
and "pricelist" sub-modes — `applyBenefitConfig` sees the merged/stored row and throws
`VOUCHER_PRICELIST_CONFLICT` if both are present). The *create* schema's `Joi.forbidden()`
disallowed the key's mere presence regardless of value, and `Joi.exist()` — used to detect "a
pricelist is attached" — is satisfied by `null`, so the same defect also silently skipped the
mandatory-scope requirement for a single-price voucher submitted with `pricelist_id: null`. Verified
directly by executing the real UI payloads against the exported `__testables.createVoucherSchema`
before this fix; both were rejected. Full detail: #716.

## Compliance Preconditions

- **No downstream behavior change.** Once a create request is accepted, it flows through the same
  `applyBenefitConfig` XOR guard, the same `assertPricelistRef`, and the same repository write path
  that already existed and is already covered by the passing suites below. This PR only changes
  which requests *reach* that path.
- **No schema change, no migration.** Joi validation only.
- **The frontend payload shape is unchanged** — this PR does not alter what
  `VoucherManagementPanel.jsx` sends; it makes the API accept what the UI (correctly) already sent.

## Verification Evidence

- `tests/voucherValidator.test.js` — 89/89 passing (82 pre-existing, unchanged, + 7 new `#716`
  cases: both real UI payloads accepted; the single-price no-scopes case still refused; a real
  value in the wrong branch still rejected; both fields null on `fixed_price` still rejected; the
  null-as-no-op behavior confirmed for `percent_off`/`amount_off`).
- 11 related suites (`voucherUseCases`, `voucherRedemptionUseCases`, `pricelistUseCases`,
  `pricelistValidator`, `voucherBenefitPolicy`, `voucherDisplayUseCases`, `voucherReversalUseCases`,
  `voucherFolderScope`, `storeCheckoutVoucherPromoStacking`, `storeRepositoryPromoPersistence`) —
  305/305 passing, none regressed.
- New frontend test `voucherManagementPayload.test.js` — 4/4 passing, asserting the payload shape
  both create and update depend on (exactly one real value between the two fixed-price fields;
  neither field emitted for `percent_off`/`amount_off`).
- `npm run build:pos` — real Vite build, succeeds.
- `npm run check:compliance` — to be re-run after this declaration is added.
- `npm run check:architecture` — OK, 49 modules / 491 files checked.

## Rollback Considerations

Revert both changed files. No migration, no schema change, no data written by this PR.
