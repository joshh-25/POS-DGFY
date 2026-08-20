---
status: reference
owner: engineering
last_reviewed: 2026-08-20
declaration_id: 2026-08-20-merge-promo-voucher-checkout-ui
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.08.20
verification_evidence: VoucherCodePanel.test.jsx,storefrontCatalogVoucherEntry.contract.test.js,legacyPromoAuthoringFrozen.contract.test.js,ServiceCartDrawer.test.jsx,simpleCheckoutSummaryPresentation.test.js,PromoCodePanel.test.jsx,discountTypeCards.contract.test.js,storefrontPromoEligibility.contract.test.js,store production build,skupervisor production build
rollback_note: Revert this commit series to restore the two-panel checkout UI and the unfrozen Add Promo button. No data or migration involved -- purely UI/UX (component merge, one button disabled). VoucherCodePanel's availableOffers prop and TerminalOperationsWorkspace.jsx's Add Promo disabled state are both pure presentational changes with no schema or redemption-logic impact; both are cleanly revertible with no residual state to clean up.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-20T00:00:00+08:00
preflight_request_ref: ISSUE-776-MERGE-PROMO-VOUCHER-CHECKOUT-UI
---

# Merge Promo/Voucher Checkout UI

## Compliance Impact Classification

Major because this touches `apps/dgfy-web/src/features/pos/components/TerminalOperationsWorkspace.jsx`,
matching `scripts/check-compliance-impact.js`'s `surfaces: pos,terminal`, `minimumClassification:
major` rule.

## Affected Surfaces

1. **Storefront checkout cart** — the previously-stacked `PromoCodePanel` ("Apply a promo /
   discount") and `VoucherCodePanel` ("Have a voucher code?") fields are merged into a single
   `VoucherCodePanel` labeled "Apply a promo / voucher". `PromoCodePanel`'s "Available Promos"
   listing UI is ported into `VoucherCodePanel` (`availableOffers` prop, fed from the same
   `promoSectionModel` both panels already had access to), so nothing customer-visible is lost.
   Every "Use" click on a listed offer now dispatches through `onApplyVoucher` — safe today because
   a full 45-tenant inventory (run 2026-08-20, #695) confirmed zero tenants have a real,
   non-migrated promo left; every real advertised offer is voucher-backed.
2. **Skupervisor merchant admin** — `TerminalOperationsWorkspace.jsx`'s "Add Promo" button (the sole
   creation entry point for the legacy `storefront_promo(s)` settings-based promo engine) is
   disabled unconditionally, with copy pointing merchants at Vouchers instead. This closes the loop
   that makes item 1's voucher-only dispatch safe going forward, not just against today's data:
   without this, a merchant could still author a new promo-only code that `VoucherCodePanel`'s
   listing would show but couldn't actually apply.
3. **No deletion.** `PromoCodePanel.jsx` (the component file), the legacy promo redemption/checkout
   code path (`commercialPromoPolicy.js` and its callers), and any existing promo card a tenant
   already has remain fully intact and editable — this declaration covers only new-promo creation
   being disabled and the checkout UI presenting one merged field instead of two. Full removal is
   explicitly deferred (Pat's call, 2026-08-20) until the voucher-based system is proven in
   production.

## Compliance Preconditions

1. No schema or data change — this is a UI-only diff. No migration, no `system_settings` write, no
   `vouchers` table write.
2. The voucher-only dispatch decision (item 1 above) is backed by a verified-empty state, not an
   assumption: the #695 dry-run/apply inventory covered all 45 active tenants and found exactly 3
   real promo codes, all already converted to vouchers with their settings rows deleted.
3. The Add Promo freeze (item 2) is the mechanism that keeps precondition 2 true going forward,
   rather than only being true as a point-in-time snapshot.
4. Reversible: reverting this commit series restores the prior two-panel UI and re-enables Add
   Promo, with no residual data cleanup needed either direction.

## Verification Evidence

1. `apps/dgfy-web/apps/store/src/__tests__/VoucherCodePanel.test.jsx` (new, 6 tests) — proves the
   merged listing behavior matches `PromoCodePanel.test.jsx`'s original coverage exactly: applying a
   listed offer's code, disabling a not-yet-scheduled offer, rendering eligibility metadata, hiding a
   code-less display-only offer, backend-driven status/applied-discount copy, and the
   `availableOffers`-omitted default (the two catalog-toolbar call sites that don't pass it).
2. `apps/dgfy-web/apps/store/src/__tests__/storefrontCatalogVoucherEntry.contract.test.js` (13
   tests, 3 new/updated) — confirms `PromoCodePanel` is no longer rendered by the checkout renderer
   but its file still exists, and confirms `promoSectionModel` is correctly wired into
   `VoucherCodePanel` as `availableOffers`.
3. `apps/dgfy-web/src/features/pos/__tests__/legacyPromoAuthoringFrozen.contract.test.js` (new, 2
   tests) — confirms the Add Promo button is unconditionally disabled and its copy points at
   Vouchers.
4. `PromoCodePanel.test.jsx` (5 tests, pre-existing, unaffected) — confirms the untouched component
   still behaves correctly in isolation, since it's still present in the codebase.
5. `ServiceCartDrawer.test.jsx`, `simpleCheckoutSummaryPresentation.test.js`,
   `discountTypeCards.contract.test.js`, `storefrontPromoEligibility.contract.test.js` — all
   pre-existing, all unaffected (27 + 6 tests total across this verification run, all passing).
6. `npm run build:store` and `npm run build:skupervisor` both pass.
7. `GITHUB_BASE_REF=develop node scripts/check-compliance-impact.js` (after this declaration was
   added), `npm run check:architecture`, `npm run check:adr` — pass.
