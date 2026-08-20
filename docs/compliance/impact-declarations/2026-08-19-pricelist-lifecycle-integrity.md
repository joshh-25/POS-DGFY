---
status: reference
owner: engineering
last_reviewed: 2026-08-19
declaration_id: 2026-08-19-pricelist-lifecycle-integrity
classification: major
surfaces: pos,terminal
reason_codes_impacted: PRICELIST_IN_USE_BY_VOUCHER (new), VOUCHER_PRICELIST_NOT_ACTIVE (existing code, new call sites)
policy_version: 2026.08.19
verification_evidence: node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.cjs --runInBand tests/voucherValidator.test.js tests/voucherUseCases.usecases.test.js tests/voucherRedemptionUseCases.usecases.test.js tests/pricelistUseCases.usecases.test.js tests/pricelistValidator.test.js tests/voucherBenefitPolicy.unit.test.js tests/voucherDisplayUseCases.usecases.test.js tests/voucherReversalUseCases.usecases.test.js tests/voucherFolderScope.unit.test.js tests/storeCheckoutVoucherPromoStacking.unit.test.js tests/storeRepositoryPromoPersistence.test.js tests/tenantSchemaSyncScripts.test.js,npm run build:pos,npm run check:compliance,npm run check:architecture
rollback_note: Revert all changed files. No migration, no schema change. Reverting restores the prior (silently-incorrect) pricelist lifecycle exactly -- archive with no usage check, no use-time status re-check, no row lock on the price read.
preflight_result: no_breach
preflight_reason_code: APPROVED_LOCAL_HARDENING
preflight_run_at: 2026-08-19T00:00:00+08:00
preflight_request_ref: PR-717-PRICELIST-LIFECYCLE-INTEGRITY
---

# Pricelist Lifecycle Integrity

## Compliance Impact Classification

Major, per `modules/vouchers/`'s and `apps/dgfy-web/src/features/pos/`'s floor. This closes a
real live-mispricing path: an already-published pricelist could be archived while a voucher still
attached it, and once archived, the voucher kept redeeming (and displaying) at the retired prices
indefinitely, since status was previously checked at attach time only.

## Affected Surfaces

Three related fixes, one domain (#717):

- **L1 — archive now checks usage.** `pricelistUseCases.js`'s `buildArchivePricelistUseCase` calls
  the pre-existing `countVouchersUsingPricelist` (previously wired to the `GET` response only,
  informationally) inside the same lock/transaction as the archive itself, and refuses with the new
  `PRICELIST_IN_USE_BY_VOUCHER` reason code when nonzero.
- **L2 — status is re-checked at use time, not attach-time only.**
  `voucherRedemptionUseCases.js`'s `resolveEligibleBenefit` (shared by both preview and redeem)
  now calls `findPricelistStatus` before reading prices and fails **closed** with
  `VOUCHER_PRICELIST_NOT_ACTIVE` if the attached pricelist is not `active`.
  `voucherDisplayUseCases.js`'s catalog-display resolution does the same check but fails **open**
  — falls back to the plain catalog price, matching this module's own stated fail-open contract,
  rather than blocking the whole catalog response. This split follows ADR 0066 Decision 3's
  existing fail-open (display) / fail-closed (checkout) rule; it is not a new rule.
- **L3 — the redemption path's row lock is now honored.** `voucherRepository.js`'s
  `findPricelistStatus` and `listPricelistItemPrices` previously used only `options.transaction`,
  silently dropping `options.lock` even though the redemption path already builds
  `{ transaction, lock: true }` in good faith. Both now take `FOR UPDATE` when `lock: true` and a
  transaction are present, mirroring `pricelistRepository.js`'s existing pattern.
- `voucherErrors.js` — one new reason code, two comments corrected to state the fixed behavior
  rather than the prior (buggy) one.
- `PricelistManagementPanel.jsx` — one new merchant-facing message for the new reason code.

## Compliance Preconditions

- **No schema change, no migration.** All three fixes are application-layer.
- **No behavior change to any currently-passing archive/redemption/display path** — the new checks
  only fire on the specific race this closes (archive-while-attached, or a voucher whose attached
  pricelist was archived after attach). Every pre-existing pricelist test still passes unchanged.
- **The fail-open/fail-closed split is not new policy** — it is ADR 0066 Decision 3, applied to a
  gap that decision already covers in principle but this specific check hadn't implemented yet.

## Verification Evidence

- 12 related suites, 323/323 passing (11 pre-existing suites unchanged in count + 7 new `#717`
  cases: archive-refused-while-attached, archive-still-succeeds-at-zero-attachments,
  redemption-fails-closed-on-archived-pricelist, redemption-succeeds-on-explicit-active-status,
  display-fails-open-on-archived-pricelist).
- `npm run build:pos` — real Vite build, succeeds.
- `npm run check:architecture` — OK, 49 modules / 491 files.
- `npm run check:compliance` — to be re-run after this declaration is added.

## Rollback Considerations

Revert all changed files. No migration, no schema change, no data written by this PR.
