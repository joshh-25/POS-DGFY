# Retail & MSME Checkout Backend Wiring — Session Documentation (2026-08-02)

Scope: everything done starting from the prompt *"Next, in Retail since we already have a template for step 1: Account, we need to implement the backend. use the F&B for reference, you will need to implement the backend for (1) verified users, and (2) for 'guest' users. Use the given images as reference as well"* through to the Retail storefront-closed notice. Supersedes/extends `RETAIL_CHECKOUT_INDEPENDENT_TREE_2026-08-02.md`, which covered the earlier layout-only build.

---

## 1. Task

1. Implement Retail's Account step (Step 1) backend — identify verified (signed-in DGFY) customers and guest customers, matching F&B's functionality.
2. Implement Retail's Fulfillment step (Step 2, §3 "Where should we deliver your order?") backend — real saved addresses, CRUD, map pin persistence.
3. Remove the "This step is a preview only" notice from Retail's Review & Payment step.
4. Audit MSME (Simple) for the same three functions, and bring it to parity wherever it was missing something.
5. Implement the "storefront currently closed" notice on Retail's Review & Payment step, matching F&B/MSME.
6. Fix two Retail cart-button bugs: the floating cart button rendering above (instead of behind) the open "Added products" drawer, and the same button still appearing while on Retail's checkout (`/order`) pages.

---

## 2. Description

**Retail Account step (Task 1).** Discovered that the identity/guest-checkout system is already fully shared and mode-agnostic: `useGuestCustomerIdentity` (produces `renderGuestCheckoutEntry`/`renderAccountOwnedIdentitySummary`/`renderGuestIdentityFields`) and `useFnbGuestCheckoutOtp` (guest email OTP request/verify against the real `POST /api/v1/store/checkout/guest-otp/{request,verify}` endpoints) are each instantiated once in `StorefrontApp.jsx` and already power F&B. Rebuilt `RetailOrderAccountStep.jsx` to consume the same three-way branch F&B uses (`renderGuestCheckoutEntry` when signed-out and guest-checkout not yet unlocked → `renderAccountOwnedIdentitySummary` when signed in → `renderGuestIdentityFields` + OTP verification when guest-checkout is active), added `RetailOrderGuestEmailVerification.jsx` (retail-styled copy of `FnbGuestEmailVerification.jsx`), and gated the step's Continue button on `hasCustomerName && hasPrimaryContact && guestCheckoutOtpVerified`. No new backend endpoints or hooks — pure consumption of existing shared infrastructure.

**Retail Fulfillment/address backend (Task 2).** Same discovery pattern: `useSignedInCheckoutAddresses` (real DGFY account address CRUD via `/api/v1/dgfy/customer/addresses`, or session-local pinned locations for guests) and `useDeliveryPinResolution` (reverse-geocoding, "Use Current Location") are both single shared instances already used by F&B/MSME. These hooks operate on **shared global state** (`orderMethod`, `customerPin`, `deliveryLocationAction`, `selectedSavedLocationId`, etc.) in `StorefrontApp.jsx`, not per-mode local state — so `RetailOrderPage.jsx` had to be migrated off its own local `orderMethod`/`customerPin`/`selectedAddressId` `useState` and onto that shared state for the address hooks to have anything to operate on. Rebuilt `RetailOrderFulfillmentStep.jsx`'s §3 with the real saved-address list, map overlay controls ("Use Current Location", "Drag to adjust pin", expand-map button), the address-display-field + "Add Address"/"Add Location" button, and a new `RetailOrderExpandedMapModal.jsx`.

**Preview notice removal (Task 3).** Deleted the static "This step is a preview only — placing an order isn't connected to checkout yet." banner from `RetailOrderPaymentStep.jsx`. The disabled "Place Order (Coming Soon)" button was left in place — Payment/checkout submission itself remains unwired, only the redundant banner was removed per explicit instruction.

**MSME audit (Task 4).** Checked all three functions against MSME's current code:
- Location/address: already fully implemented — this was in fact the original template used to build Retail's version in Task 2. No changes needed.
- Preview notice: does not exist on MSME's payment step (`SimpleCheckoutPaymentActions` already has live "Get Quote"/"Place Order" buttons) — nothing to remove.
- Account step: had identity + signed-in/guest entry, but was **missing guest email OTP verification** entirely (no UI, no gating), unlike F&B and the now-updated Retail. Fixed by adding `SimpleCheckoutGuestEmailVerification.jsx` and updating `SimpleCheckoutCustomerStep.jsx` to match Retail/F&B's exact composition and guest-form parameters (`includeAddress: false`, `layoutVariant: 'fnbGuest'`, `savedDetailsApplyLabel: 'Send Code and Apply Details'`). `simpleCustomerStepComplete` (in `useSimpleCheckoutGating.js`) now also requires `guestCheckoutOtpVerified` (already `true` for signed-in users automatically).

**Retail closed-notice (Task 5).** Found `useStorefrontClosedNotice.js` — another fully shared hook (`storefrontClosedByHours` + `renderStorefrontClosedNotice()`), instantiated once in `StorefrontApp.jsx`, reading `selectedStore.storefront_hours_status.is_open_now`, already consumed by both F&B and MSME's payment steps. Wired the same flag/renderer into `RetailOrderPaymentStep.jsx`, rendered in the same position F&B/MSME use it (after the action-button row).

**Cart FAB bugs (Task 6).** Retail's floating "product cart" button isn't F&B's own component at all — Retail falls under the shared `isDefaultCartSurfaceMode` bucket (used by all 8 non-F&B/Services/MSME modes) and renders the generic `DefaultProductCartFab.jsx`/`DefaultProductCartDrawer.jsx`. Compared against MSME's own cart button (`SimpleCartFloatingButton.jsx`), which had already been fixed for the identical stacking bug earlier this session, to find both root causes directly:
- **Stacking order:** `DefaultProductCartFab.jsx` used `zIndex: 2100`, above the drawer's own `zIndex: 2095` — so the button always floated on top of the open drawer instead of being covered by it. MSME's already-fixed button uses `zIndex: 2090` (below the drawer); applied the identical value.
- **Visible during checkout:** MSME already hides its cart button on its own order page via `isSimpleCartSurfaceMode = isSimpleMode && !isResolvedOrderSubpage`; Retail had no equivalent exclusion. Added `shouldRenderDefaultCartSurface = isDefaultCartSurfaceMode && !(isRetailMode && isResolvedOrderSubpage)` in `StorefrontCartDrawerShellContainer.jsx`, threading `isRetailMode` down through `useStorefrontCartDrawerShellProps.js` from `StorefrontApp.jsx`.

---

## 3. Files Created

- `frontend/apps/store/src/modes/retail/checkout/components/RetailOrderGuestEmailVerification.jsx` — Task 1
- `frontend/apps/store/src/modes/retail/checkout/components/RetailOrderExpandedMapModal.jsx` — Task 2
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCheckoutGuestEmailVerification.jsx` — Task 4

## 4. Files Deleted

None.

## 5. Files Changed

- `frontend/apps/store/src/StorefrontApp.jsx` — threaded new shared values into `retailOrderRouteProps`/`useSimpleCheckoutGating`/`useSimpleCheckoutRouteProps`/`useStorefrontCartDrawerShellProps` call sites across Tasks 1, 2, 4, 5, 6
- `frontend/apps/store/src/modes/retail/checkout/components/RetailOrderAccountStep.jsx` — Task 1 (rewritten)
- `frontend/apps/store/src/modes/retail/checkout/pages/RetailOrderPage.jsx` — Tasks 1, 2, 5 (OTP props/gating; removed local order-method/pin/address state in favor of shared state; `FNB_RECOMMENDED_LOCATION` filter; closed-notice computation)
- `frontend/apps/store/src/modes/retail/checkout/hooks/useRetailOrderPageProps.js` — Tasks 1, 2, 5 (passthrough threading)
- `frontend/apps/store/src/modes/retail/checkout/components/RetailOrderFulfillmentStep.jsx` — Task 2 (rewritten §3)
- `frontend/apps/store/src/modes/retail/checkout/components/RetailOrderSavedAddressesModal.jsx` — Task 2 (`onSelectAddress` now passes the full location object)
- `frontend/apps/store/src/modes/retail/checkout/components/RetailOrderPaymentStep.jsx` — Tasks 3, 5 (notice removed; closed-notice added)
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCheckoutCustomerStep.jsx` — Task 4 (rewritten)
- `frontend/apps/store/src/modes/simple/checkout/hooks/useSimpleCheckoutGating.js` — Task 4 (`guestCheckoutOtpVerified` folded into `simpleCustomerStepComplete`)
- `frontend/apps/store/src/modes/simple/checkout/hooks/useSimpleCheckoutRouteProps.js` — Task 4 (OTP passthrough)
- `frontend/apps/store/src/modes/simple/checkout/pages/SimpleCheckoutRoutePage.jsx` — Task 4 (new props threaded to `SimpleCheckoutCustomerStep`)
- `frontend/apps/store/src/shared/components/storefront/DefaultProductCartFab.jsx` — Task 6 (`zIndex` 2100 → 2090; shared across all 8 default-like modes, not Retail-exclusive — an unambiguous stacking-order bug fix)
- `frontend/apps/store/src/app/hooks/useStorefrontCartDrawerShellProps.js` — Task 6 (threaded `isRetailMode`)
- `frontend/apps/store/src/app/pages/StorefrontCartDrawerShellContainer.jsx` — Task 6 (`shouldRenderDefaultCartSurface` gate, scoped to Retail only)

---

## 6. Additional Notes (Bugs, etc.)

- **Bug found and fixed (Task 2):** `useSignedInCheckoutAddresses` unconditionally folds F&B's own `FNB_RECOMMENDED_LOCATION` ("Mandurriao, Iloilo City" — F&B's branch) into `deliverySavedLocations` whenever the customer has no real saved addresses yet — this is *not* gated by mode, only the auto-select-on-mount behavior is. Left unfixed, every Retail guest would see F&B's branch listed as a fake "saved location." Fixed by filtering `source === 'recommended'` out at the Retail-page layer (`RetailOrderPage.jsx`) rather than touching the shared hook, to avoid any risk to F&B's own behavior.
- **`useFnbGuestCheckoutOtp` naming is misleading.** Despite the "Fnb" prefix and living under `modes/fnb/checkout/hooks/`, it contains zero F&B-specific logic — it's a generic, mode-agnostic OTP hook reused as-is by Retail and MSME. Not renamed (out of scope / touches F&B's own import), but worth knowing for future work in this area.
- **Retail's `orderMethod`/`customerPin`/etc. are now shared global state**, not page-local. This matches F&B/MSME's existing architecture (required for the address hooks to function) but means Retail's fulfillment choices now live in the same top-level state as every other mode's — consistent with the rest of the app, not a new risk, but worth remembering if debugging cross-mode state leakage in the future.
- **Environment blocker throughout, not a code issue:** the `storefront_discovery` IP rate limiter tripped repeatedly during live verification (self-inflicted from heavy testing this session), and all test stores are outside configured business hours (9 AM–6 PM) during this work window. Resolved by waiting out the cooldown — both the MSME OTP step and Retail's closed-notice were subsequently confirmed live with zero page errors (screenshots match the F&B reference pixel-for-pixel).
- **Retail's Payment/checkout submission remains intentionally unwired** — Task 3 only removed the notice text; "Place Order (Coming Soon)" is still a disabled placeholder button, matching the original brief's scope (Account + Fulfillment/address backend only, not full order submission).
- **Task 6's two fixes are deliberately scoped differently.** The `zIndex` fix is a shared-component change affecting all 8 default-like modes equally — there's no legitimate reason for the cart button to float above its own drawer in any of them, so it was fixed at the source rather than duplicated per mode. The "hide during checkout" fix is scoped to `isRetailMode` only, since Retail's `/order` page already has its own cart summary (`RetailOrderSummaryContent`/`RetailOrderMobileSummaryPanel`) making the floating button redundant there; the other 7 modes' bare-bones `DefaultOrderPage` has no equivalent summary yet, so their behavior was left untouched pending a similar request. Live-verified on mobile (390×844): the button is fully absent from the DOM during checkout, and `zIndex: 2090` (confirmed via computed style) correctly sits below the drawer's `2095` — zero page errors.
