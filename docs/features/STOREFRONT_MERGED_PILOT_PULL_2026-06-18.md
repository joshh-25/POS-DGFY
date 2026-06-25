# Recent Branch Changes And Storefront Merged Pilot Pull - 2026-06-18

Status: reference
Last reviewed: 2026-06-18

## Summary

This document records the recent approved changes currently present in the working branch, including:

- POS popup dismiss control.
- POS/SKUpervisor receipt paper size support.
- Storefront/customer-flow code pulled from `codex/storefront-merged-pilot`.

Storefront pull source:

- Source branch: `bblabs/codex/storefront-merged-pilot`
- Source tip used for comparison: `df7af1e5 Fix DGFY auth return target fallback`
- Target working branch: `codex/pos-safety-pr`

The pull restored the documented storefront customer flow work from the merged pilot branch and then applied local compatibility fixes so it builds against the current master-aligned codebase.

## POS Changes

### DGFY Account Popup Dismiss Button

File:

- `frontend/src/features/pos/pages/TerminalPage.jsx`

Change:

- Added an `X` close button to the "Create or link your DGFY account" popup.
- The close control lets the cashier dismiss the prompt without sending a link code or creating a DGFY account.

Reason:

- The popup previously had action buttons but no direct dismiss affordance.
- This improves POS usability when the cashier needs to continue checkout without linking an account immediately.

### Receipt Paper Size Support

Files:

- `frontend/src/features/pos/components/ReceiptPrintView.jsx`
- `frontend/src/features/pos/components/POSCheckoutTerminal.jsx`
- `frontend/src/features/pos/components/SkupervisorPOSCheckoutTerminal.jsx`

Change:

- Added receipt view support for common thermal receipt sizes:
  - `80mm` / `3 1/8 inches`
  - `57mm` / `2 1/4 inches`
- Wired the selected receipt paper width through the POS and SKUpervisor receipt preview/print flows.

Reason:

- Receipt output needs to match common thermal printer roll widths used by POS terminals.
- SKUpervisor and POS receipt previews should match the actual paper size before printing.

Verification:

```powershell
npm --prefix frontend test -- --run frontend/src/features/pos/components/__tests__/ReceiptPrintView.test.jsx frontend/src/features/pos/components/__tests__/POSCheckoutTerminal.test.jsx
```

Result:

- POS receipt/view tests passed during the earlier verification run.

## Storefront Merged Pilot Pull

### Storefront App Shell

- `frontend/apps/store/src/StorefrontApp.jsx`
- `frontend/apps/store/src/Components/storefront/pages/SolutionsPage.jsx`
- `frontend/apps/store/src/Components/storefront/pages/FnbProductDetailsPage.jsx`
- `frontend/apps/store/src/Components/storefront/hero/StorefrontShareQr.jsx`

Purpose:

- Reconnects the storefront shell to the newer customer flow.
- Preserves discovery, catalog, product detail, checkout, and account navigation behavior.
- Restores customer-facing route handling from the pilot branch.

Local compatibility notes:

- Added an explicit catalog error state so failed catalog loads render a visible recovery UI instead of falling into the empty setup state.
- Kept `selectedStore` stable when catalog loading fails.
- Prioritized catalog error messaging over setup-empty messaging.
- Kept hidden screen-reader setup text from appearing when the issue is a catalog error.

### DGFY Customer Account Flow

- `frontend/apps/store/src/Components/storefront/pages/DgfyCustomerAccountPage.jsx`
- `frontend/Pages/DgfyAuthPage.jsx`
- `frontend/src/features/dgfy/components/DgfyAuthHero.jsx`
- `frontend/src/features/dgfyRouteHelpers.js`
- `frontend/src/services/dgfyAuthService.js`
- `frontend/src/services/authService.js`
- `frontend/src/services/browserSession.js`

Purpose:

- Restores DGFY customer account dashboard behavior.
- Reconnects DGFY sign-in, session handling, return targets, and account handoff behavior.
- Adds compatibility for DGFY account ownership and legacy link flows.

Local compatibility notes:

- `dgfyAuthService.js` was updated to restore exports expected by current imports:
  - `transferDgfyCompanyOwnershipForTenantSession`
  - `getDgfyLegacyLinkStatus`
  - `requestDgfyLegacyLinkEmailOtp`
  - `completeDgfyLegacyLink`
  - `startDgfyLegacyRegistrationHandoff`
  - `startDgfyPosSession`
- DGFY login required the database migration `20260617000002-dgfy-only-company-access.cjs` because the current code reads `tenants.owner_dgfy_account_id`.

### Guest Checkout Flow

New restored files:

- `frontend/apps/store/src/checkout/buildFnbCheckoutPayload.js`
- `frontend/apps/store/src/checkout/checkoutValidation.js`
- `frontend/apps/store/src/checkout/components/CheckoutHeroHeader.jsx`
- `frontend/apps/store/src/checkout/components/CheckoutStepProgressHeader.jsx`
- `frontend/apps/store/src/checkout/components/CustomerIdentityCard.jsx`
- `frontend/apps/store/src/checkout/components/GuestIdentityForm.jsx`
- `frontend/apps/store/src/checkout/components/OrderSummaryCard.jsx`
- `frontend/apps/store/src/checkout/components/PaymentMethodSelectorBlock.jsx`
- `frontend/apps/store/src/checkout/components/SavedCustomerDetailsPanel.jsx`
- `frontend/apps/store/src/checkout/components/SelectableOptionCard.jsx`

Purpose:

- Restores reusable checkout payload, validation, identity, payment, and order summary components.
- Supports both signed-in DGFY customer flows and guest checkout flows.

### Storefront Session And Request Helpers

New restored files:

- `frontend/apps/store/src/auth/storefrontSessionStorage.js`
- `frontend/apps/store/src/services/requestJson.js`

Purpose:

- Centralizes storefront session persistence.
- Provides a shared JSON request helper for storefront-specific API calls.

### Guest Tracking

New restored file:

- `frontend/apps/store/src/tracking/components/GuestTrackingDrawer.jsx`

Purpose:

- Restores guest order tracking UI used by the storefront flow.

### Backend Storefront And DGFY Use Cases

- `backend/src/middleware/storeAuth.js`
- `backend/src/modules/dgfy/usecases/dgfyCustomerUseCases.js`
- `backend/src/modules/store/usecases/storeUseCases.js`

Purpose:

- Reconnects storefront authentication and customer account use cases.
- Supports customer activity, tenant membership, and storefront order/account behavior required by the restored UI.

## Related Documentation Updated

- `docs/features/DGFY_CUSTOMER_ACCOUNT.md`
- `docs/features/STOREFRONT_CURRENT_STANDING.md`

These files were restored/updated as part of the pilot pull so the documented customer account and storefront standing match the current code direction.

## Assets Restored

- `frontend/public/bg-modals.png`
- `frontend/public/man.png`

Purpose:

- Restores image assets referenced by the DGFY/storefront customer-facing screens.

## Verification Performed

The following checks were run after the POS changes, pilot restore, and local compatibility fixes:

```powershell
npm --prefix frontend test -- --run frontend/apps/store/src/__tests__/DgfyCustomerAccountPage.dashboard.test.jsx frontend/apps/store/src/__tests__/profileLauncher.integration.test.jsx frontend/apps/store/src/__tests__/fnbStorefront.contract.test.js
npm --prefix frontend test -- --run frontend/src/features/pos/components/__tests__/ReceiptPrintView.test.jsx frontend/src/features/pos/components/__tests__/POSCheckoutTerminal.test.jsx
npm --prefix frontend run build:store
npm --prefix frontend run build:skupervisor
```

Result:

- Storefront handoff tests passed.
- POS receipt/view tests passed.
- Storefront build passed.
- SKUpervisor build passed after restoring missing DGFY auth service exports.

Known build notes:

- The frontend build still reports existing browserslist/chunk-size warnings. These are warnings, not blockers for the restored storefront flow.

## Runtime Notes

Required local services confirmed online after the pull:

- Backend API: `http://localhost:5000`
- Device bridge: `http://localhost:5101`
- SKUpervisor: `http://localhost:5173`
- POS: `http://localhost:5174`
- Storefront: `http://localhost:5175`

The DGFY sign-in failure encountered after the pull was caused by the pending database migration, not the entered credentials. Running backend migrations added `tenants.owner_dgfy_account_id`, and subsequent DGFY auth requests returned `200`.

## Caution

This document records the approved POS changes, restored storefront pilot work, and local compatibility fixes. It does not imply the full working tree is ready to commit, because the branch also contains unrelated local/runtime files and separate Android changes.
