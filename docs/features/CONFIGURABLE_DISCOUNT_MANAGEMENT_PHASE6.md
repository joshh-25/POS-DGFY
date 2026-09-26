# Configurable Discount Management — Phase 6

## Browser/PWA POS legacy-profile cutover

Phase 6 makes the configurable discount-rule directory the only configurable discount source for the browser/PWA POS terminal. The independent mobile POS remains outside this phase and is unchanged.

## Delivered behavior

- The browser/PWA POS no longer loads `pos_discount_profiles` as a transaction-rate source.
- Existing `pos_discount_profiles` records are preserved and shown as read-only migrated records for compatibility and audit continuity.
- The legacy preset editor and Add Discount action are removed from the old POS automation section. New discount creation and edits continue through the Discount Management settings tab.
- Employee discount rate choices come only from enabled, approved, valid configurable employee rules and the current draft value.
- The terminal passes the current approved rule directory into parked-sale resume validation.

## Parked-sale safety

- A parked discount with a configurable rule identity must still resolve to an enabled and approved rule when the sale is resumed.
- If the configured rate or fixed amount changed after parking, the sale is blocked until the cashier reviews and reapplies the current rule.
- A legacy selected profile that matches a migrated rule is allowed to load as historical context, but the cashier must reselect the current approved rule before checkout.
- Existing server-authoritative Promo and Voucher flows remain compatible with their existing code/configuration validation and do not require a configurable rule identity.
- No parked-sale or historical transaction records are deleted or rewritten.

## Compatibility boundary

The old `pos_discount_profiles` setting remains stored for migration and compatibility. It is not used by the browser/PWA terminal for new transaction calculations. Mobile and other legacy callers are intentionally outside this cutover and were not modified.

## Files

- `packages/web-core/src/features/pos/components/POSCheckoutTerminal.jsx`
- `packages/web-core/src/features/pos/hooks/usePosCheckoutWorkflow.js`
- `packages/web-core/src/features/pos/settings/PosDiscountAutomationSection.jsx`
- `packages/web-core/src/features/pos/utils/posParkedSaleResume.js`
- `packages/web-core/src/features/pos/utils/posTerminalDraftState.js`
- `packages/web-core/src/features/pos/utils/__tests__/posParkedSaleResume.test.js`
- `packages/web-core/src/features/pos/utils/__tests__/posTerminalDraftState.test.js`

## Validation

- Focused browser/PWA POS regression tests: 9 files, 103 tests passed; the POS Settings workspace behavior suite also passed 38 tests.
- Targeted frontend lint completes without errors; it reports only the existing 8 warnings in the touched POS surface.
- The `apps/dgfy-ims` production build completes successfully.
- Documentation and ADR lint complete successfully.
