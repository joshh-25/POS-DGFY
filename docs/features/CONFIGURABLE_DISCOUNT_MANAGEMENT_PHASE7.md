# Configurable Discount Management — Phase 7

## Browser/PWA POS selector and readiness hardening

Phase 7 hardens the browser/PWA POS discount selector so configurable choices are sourced from the approved server directory. The independent mobile POS remains outside this phase and is unchanged.

## Delivered behavior

- Configurable discount type cards are created only from enabled, approved, valid rules returned by the discount directory.
- While the directory is loading or unavailable, the selector exposes only the specialized Promo and Voucher compatibility flows; it no longer invents Employee, Senior Citizen, PWD, or Others choices locally.
- After the directory becomes ready, Promo and Voucher remain available when no static rule represents those specialized flows.
- The asynchronous discount modal opener applies a resolved rule through a new draft object, so React cannot retain a stale unconfigured draft after the directory finishes loading.
- Applying a configurable discount is blocked when no authoritative current rule is available. Promo and Voucher continue through their existing specialized validation paths.

## Safety boundary

- A configurable discount cannot reach the transaction workflow without a current rule identity and configured rate.
- Existing dynamic panels for employee, statutory, manual, Promo, and Voucher flows remain compatible when their corresponding type is returned by the server directory.
- No backend schema, historical transaction, legacy profile, or mobile POS behavior is changed in this phase.

## Files

- `packages/web-core/src/features/pos/utils/posDiscountOptions.js`
- `packages/web-core/src/features/pos/components/POSCheckoutTerminal.jsx`
- `packages/web-core/src/features/pos/components/POSDiscountWorkspace.jsx`
- `packages/web-core/src/features/pos/components/POSCheckoutConfirmDialog.jsx`
- `packages/web-core/src/features/pos/utils/__tests__/posDiscountOptions.test.js`
- `packages/web-core/src/features/pos/__tests__/discountTypeCards.contract.test.js`
- `packages/web-core/src/features/pos/__tests__/POSCheckoutConfirmDialog.behavior.test.jsx`

## Validation

- Focused browser/PWA POS regression tests: 11 files, 144 tests passed.
- Targeted frontend ESLint: 0 errors and the existing 8 warnings in the touched POS surface.
- The `apps/dgfy-ims` production build completes successfully.
- Documentation and ADR lint complete successfully.
- `git diff --check` completes successfully for the Phase 7 files.
