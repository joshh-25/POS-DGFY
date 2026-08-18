---
status: reference
owner: engineering
last_reviewed: 2026-08-18
declaration_id: 2026-08-18-voucher-catalog-display-seam
classification: major
surfaces: payments
reason_codes_impacted: VOUCHER_NOT_FOUND,VOUCHER_NOT_ACTIVE,VOUCHER_NOT_STARTED,VOUCHER_EXPIRED,VOUCHER_WEEKDAY_NOT_ELIGIBLE,VOUCHER_TIME_WINDOW_BLOCKED,VOUCHER_TIME_WINDOW_DEGENERATE,VOUCHER_TIMEZONE_UNRESOLVABLE,VOUCHER_CHANNEL_NOT_ELIGIBLE,VOUCHER_FIXED_PRICE_AFFILIATE_CONFLICT
policy_version: 2026.08.18
verification_evidence: npm run check:architecture,npm test -- tests/voucherDisplayUseCases.usecases.test.js tests/voucherFolderScope.unit.test.js tests/voucherBenefitPolicy.unit.test.js tests/storeCheckoutAffiliatePricing.unit.test.js tests/storeRepository.locationStockFallback.test.js
rollback_note: Revert the display-price fields, the folder_id attribute additions, the cache-bypass middleware, and the voucher_code query params together. No data written -- this is a read-only display path, nothing to unwind server-side beyond the reverted code.
preflight_result: no_breach
preflight_reason_code: APPROVED_LOCAL_HARDENING
preflight_run_at: 2026-08-18T00:00:00+08:00
preflight_request_ref: PR-603-VOUCHER-CATALOG-DISPLAY
---

# Voucher Catalog Display Seam

## Compliance Impact Classification

Major. This PR is submitted ahead of #670/PR #676 (the compliance-scanner coverage fix that adds
`apps/dgfy-api/src/modules/store/` as a compliance-sensitive pattern) landing on `develop`. Once
#676 merges and this branch rebases, `check:compliance` will require exactly this declaration —
it is included now, pre-emptively, rather than as a follow-up commit, using the `surfaces:
['payments'], major` mapping Pat already approved for `modules/store/` in #676. Until that rebase,
`check:compliance` on this branch alone reports no compliance-sensitive changes, since the new rule
isn't live yet — expected, not a gap in this PR's own self-verification.

The change adds a read-only, best-effort voucher price resolution to the storefront's public
catalog and QR-resolve endpoints (`GET /catalog`, `GET /qr/resolve`) — a pricing/payments-adjacent
surface, matching the classification `modules/payments/` and `modules/store/` already carry
elsewhere in `COMPLIANCE_SENSITIVE_RULES`. It reads and displays a price; it writes nothing and
reserves nothing against the voucher ledger (that remains exclusively Phase 105's checkout-time
`redeemVoucherUseCase`, PR #661).

## Affected Surfaces

- Storefront public catalog list and QR/barcode resolve endpoints
  (`apps/dgfy-api/src/routes/store.js`, `storeUseCases.js`, `storeRepository.js`).
- New voucher domain use case (`apps/dgfy-api/src/modules/vouchers/usecases/voucherDisplayUseCases.js`)
  — read-only, no transaction, no ledger write.
- Response cache policy for both endpoints, when a `voucher_code` query parameter is present.

## Compliance Preconditions

- **Fail-open by design.** Every failure mode — voucher not found, an unresolvable timezone, a
  malformed benefit config, a repository error, one bad item in a large batch — falls back to the
  plain catalog price rather than blocking the response or throwing. Checkout (Phase 105, already
  shipped) remains the sole fail-closed enforcement point (ADR 0066 decision 3); display never
  blocks a page load.
- **No reservation, no ledger write.** This path calls only `findByCode`, `listScopes`, and
  `listItemFolderAdjacency` — none of `reserveRedemption`, `createRedemptionLedgerEntry`, or
  `createRedemptionLines`. A displayed voucher price is never treated as authoritative; checkout
  re-derives and reserves it independently.
- **ADR 0066 decision 7 mirrored at display time**: a `fixed_price` voucher is refused under active
  affiliate attribution here exactly as it is at checkout, so a displayed price never contradicts
  what checkout will actually allow.
- **Cache correctness**: a `voucher_code`-bearing request switches the shared public cache
  (`Cache-Control: public, max-age=45`) to `no-store`, so one buyer's voucher-priced catalog
  response cannot be served to a different buyer from a shared/CDN cache. (The parallel gap for the
  affiliate attribution cookie is tracked separately, #671, not fixed in this PR.)
- **amount_off vouchers get no per-item price rewrite** (badge-only) — an order-level discount cap
  has no well-defined single-item price in isolation on a browse card; only `percent_off` and
  `fixed_price` (both well-defined at quantity 1) resolve to a rewritten price.

## Verification Evidence

- `npm run check:architecture` — `ArchitectureGuardrails OK` (49 modules, 487 files),
  `ControllerBoundary OK` (88 controller files).
- 11 new unit tests (`tests/voucherDisplayUseCases.usecases.test.js`) covering: empty/not-found
  code, percent_off and fixed_price pricing (including the zero-clamp case), amount_off badge-only,
  every campaign-level gate (expired, wrong channel), confirmation that fulfillment/order-timing/
  min-spend/min-quantity/exhaustion reasons do NOT block display, the affiliate/fixed-price
  conflict, folder-scope exclusion, and fail-open on a repository error.
- Full regression pass, 0 failures: `voucherBenefitPolicy`, `voucherEligibilityPolicy`,
  `voucherFolderScope`, `voucherRedemptionUseCases`, `voucherReversalUseCases`, `voucherUseCases`,
  `voucherValidator`, `storefrontCatalogUseCases`, `priceFallbackSource.contract`,
  `storeCheckoutAffiliatePricing`, `storeRepository.locationStockFallback`,
  `storeRepositoryPromoPersistence`, `storeUsecases.applicationResult`,
  `storeValidator.fnbModifiers`, `storeValidator.follow` — 373 tests total, 0 failures (run against
  the main checkout's installed `node_modules`, symlinked into this worktree for the run only, then
  removed — this worktree itself has none installed).
