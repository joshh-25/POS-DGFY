# Retail Checkout — Independent Tree + MSME Fixes — Session Documentation (2026-08-02)

This documents the work that superseded `RETAIL_CHECKOUT_PROCESS_2026-07-30.md`'s approach: Retail's checkout layout was originally refined by editing the **shared** `shared/components/storefront/DefaultOrder*.jsx` files (see `DEFAULT_RETAIL_CHECKOUT_LAYOUT_REFINEMENT_2026-07-31.md`, now stale). Once it was confirmed that `DefaultOrder*.jsx` is used by **8** workflow modes — not just retail (`retail | manufacturing | food_manufacturing | hospitality | healthcare | ticketing_transport | logistics_distribution | education_institutions`) — those edits were reverted, and Retail was rebuilt as its own fully independent checkout tree under `modes/retail/checkout/`, matching the existing `modes/fnb/checkout/` and `modes/simple/checkout/` convention. This document covers that rebuild, the wiring that makes it reachable, two bugs found and fixed during debugging, and a related fix applied to MSME/Simple's checkout.

---

## 1. Revert all shared-file modifications

**Reason:** `DefaultOrder*.jsx` is shared across 8 workflow modes. Editing it directly for retail's benefit would have silently changed the checkout layout for hospitality, healthcare, manufacturing, food_manufacturing, ticketing_transport, logistics_distribution, and education_institutions tenants too.

**Action:** `git checkout --` on all 9 touched shared files, restoring them to git `HEAD`, confirmed via clean `git status` and a byte-identical diff against `origin/develop`. No shared file has been touched since.

---

## 2. Build Retail's independent checkout tree

**Reason:** Give retail its own checkout files, matching the refined MSME/F&B layout, without touching anything shared by other modes.

**Files created** (`frontend/apps/store/src/modes/retail/checkout/`):
- `components/RetailOrderStoreHeader.jsx` — back button, store profile photo, delivery/pickup eyebrow, store name, "Message Us"
- `components/RetailOrderJourneyHeader.jsx` — 3-step progress header (Account → Fulfillment → Review & Payment), clickable steps
- `components/RetailOrderAccountStep.jsx` — Step 1, placeholder guest identity card (not backend-wired)
- `components/RetailOrderFulfillmentStep.jsx` — Step 2, order type + Now/Schedule toggle, real interactive map pin, placeholder saved-address list, special instructions
- `components/RetailOrderSavedAddressesModal.jsx` — mobile "Saved Addresses" bottom sheet
- `components/RetailOrderReviewItemsList.jsx` — read-only cart recap on the payment step
- `components/RetailOrderPaymentStep.jsx` — Step 3, cash-only payment selector, inert "online payment coming soon" placeholder, disabled "Place Order (Coming Soon)"
- `components/RetailOrderSummaryContent.jsx` — desktop sidebar order summary + "Secure & Private" trust card
- `components/RetailOrderMobileSummaryPanel.jsx` — mobile bottom-sheet summary + floating footer actions
- `hooks/useRetailOrderPageProps.js` — props-passthrough hook feeding real cart/store data into the page
- `pages/RetailOrderPage.jsx` — page assembly (header, journey header, 3 step slots, desktop/mobile summary)

Leaf primitives reused from the shared layer (not duplicated): `shared/components/checkout/{SelectableOptionCard,SavedAddressCard,OrderSummaryCard,PaymentMethodSelectorBlock,CheckoutHeroHeader,CheckoutStepProgressHeader,CustomerIdentityCard}.jsx`, `features/locations/components/DeliveryPinMap.jsx`, `features/shared-storefront/components/StorefrontDropdown.jsx`, `shared/model/{storefrontConstants,storefrontCartModel}.js`.

**Explicitly not backend-wired:** account identity, saved addresses, and payment are all local placeholder state. Only the cart/product list and totals (`buildCartTotals`) are real — see §7 for what backend support already exists if this gets wired up later.

---

## 3. Wire `isRetailMode` so retail tenants reach the new tree

**Reason:** Route `workflow_mode: 'retail'` tenants to `RetailOrderPage`, while the other 7 default-like modes keep rendering the original, unmodified `DefaultOrderPage`.

**Files Modified:**
- `frontend/apps/store/src/StorefrontApp.jsx` — destructured `isRetailMode`, added the `useRetailOrderPageProps` hook call, threaded `retailOrderRouteProps` into the catalog-route-props call, scoped a `paddingRight`/`paddingLeft` exemption to `isResolvedOrderSubpage && isRetailMode`
- `frontend/apps/store/src/shared/hooks/useCartMutations.js` — added `isRetailMode` to `shouldOpenCartDrawer` so adding to cart no longer force-opens the drawer for retail (matches F&B/MSME)
- `frontend/apps/store/src/app/hooks/useStorefrontCatalogRouteProps.js` — passthrough of `isRetailMode`/`retailOrderRouteProps`
- `frontend/apps/store/src/app/pages/StorefrontCatalogRouteContainer.jsx` — passthrough of `isRetailMode`/`retailOrderRouteProps`
- `frontend/apps/store/src/shared/components/storefront/StorefrontClassicCatalog.jsx` — imported `RetailOrderPage`; added the actual render branch:
  ```jsx
  {isDefaultLikeMode && isResolvedOrderSubpage && defaultStorefrontModel && (
    isRetailMode
      ? <RetailOrderPage {...retailOrderRouteProps} />
      : <DefaultOrderPage {...defaultOrderRouteProps} />
  )}
  ```

Every change above is additive or gated behind `isRetailMode`, which is `false`/`undefined` for every other store type — confirmed via per-file diff review that the other 7 default-like modes' render path, padding, and cart-drawer behavior are byte-identical to before.

---

## 4. Bug: retail silently fell back to `DefaultOrderPage` despite correct wiring

**Reason:** After §3 was implemented, live testing showed `DefaultOrderStoreHeader`'s markup rendering instead of `RetailOrderStoreHeader`'s — the DOM (arrow-glyph back button, `100vw` full-bleed technique, no eyebrow) matched `DefaultOrderStoreHeader.jsx` exactly, not the new file.

**Root cause:** `isRetailMode` is computed in `app/runtime/modePresentationRegistry.js`'s `getStorefrontModeAdapter` (pre-existing, `isRetailMode: mode === 'retail'`) and correctly destructured in `StorefrontApp.jsx` — but the hook chain in between never passed it through. `normalizeStorefrontPageModel.js` derived `isHospitalityMode = modeAdapter.isHospitalityMode === true` but had no equivalent line for `isRetailMode`, and `useStorefrontCatalog.js` had the same gap one layer up. `isRetailMode` was therefore always `undefined` at the point `StorefrontClassicCatalog.jsx` branches on it — all of §3's wiring was correct but structurally unreachable.

**Files Modified:**
- `frontend/apps/store/src/app/runtime/normalizeStorefrontPageModel.js` — added `const isRetailMode = modeAdapter.isRetailMode === true;` and added it to the returned object, matching the existing `isHospitalityMode` pattern
- `frontend/apps/store/src/shared/hooks/useStorefrontCatalog.js` — added `isRetailMode` to both the destructure from `pageModel` and the hook's own returned object

**Verified:** live DOM inspection post-fix showed the correct `RetailOrderStoreHeader` markup (`ArrowLeft` SVG icon, `maxWidth: 1240` inner wrapper, eyebrow label present) at `/tenant-store/retail-ipsum-5a9b90/order`, zero page errors, zero lint errors.

---

## 5. Header responsive breakpoint fix (match F&B)

**Reason:** The user hand-edited `RetailOrderStoreHeader.jsx` to F&B's exact markup as a starting point, which broke the file in two ways: (1) it still exported `FnbCheckoutStoreHeader` instead of `RetailOrderStoreHeader`, so the import in `RetailOrderPage.jsx` resolved to `undefined`; (2) it now expected F&B's prop names (`onBack`, `displayFont`, `isResponsiveFlow`, `brandColor`/`brandShadow`/`textOnBrand`) instead of retail's own (`onBackToCatalog`, `servicesDisplayFont`, `isDesktopCheckout`). Both together meant retail's checkout was unreachable independent of §4's bug.

The underlying design intent, once fixed, is a genuine improvement: F&B's header uses `isResponsiveFlow` (`= !isDesktopCheckout`, the wider breakpoint) for its primary layout switch, not `isMobileViewport` (the narrower, phone-only breakpoint) — so it compacts (hides "Message Us", shrinks the back button) at any non-desktop width, including tablet, not only true phone widths.

**Files Modified:**
- `frontend/apps/store/src/modes/retail/checkout/components/RetailOrderStoreHeader.jsx` — fixed the export name; kept the new F&B-matching prop contract
- `frontend/apps/store/src/modes/retail/checkout/pages/RetailOrderPage.jsx` — updated the header call site to the new prop names, added local `RETAIL_ACCENT`/`RETAIL_ACCENT_SHADOW` constants (retail has no per-tenant theming system like F&B's, so these are fixed rather than passed down from tenant branding data)

**Verified:** live screenshots at 1400px/900px/375px confirmed "Message Us" shows only at true desktop width and correctly disappears at both tablet and mobile.

---

## 6. Trust-card grid-placement bug (Retail + MSME)

**Reason:** The "Secure & Private" trust card was rendering below the Step 1 card in the **left** column of the page's 2-column desktop grid, instead of below the Order Summary card in the **right** column.

**Root cause:** `RetailOrderSummaryContent.jsx` and `SimpleCheckoutSummaryContent.jsx` both returned `OrderSummaryCard` + the trust card wrapped in a bare React Fragment (`<>...</>`). A Fragment creates no DOM element, so when the component was placed as the single "sidebar" child of the page's `stepGridStyle` grid (`gridTemplateColumns: 'minmax(0,1.45fr) minmax(300px,380px)'`), its two children became **two separate grid items** instead of one block. Grid auto-flow (default `row`) placed `OrderSummaryCard` in column 2, then wrapped the trust card into column 1 of the next row — underneath the step content on the left.

**Files Modified:**
- `frontend/apps/store/src/modes/retail/checkout/components/RetailOrderSummaryContent.jsx` — `<>` → `<div style={{ display: 'grid', gap: 18 }}>`
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCheckoutSummaryContent.jsx` — same fix

**Verified:** live screenshot confirmed the trust card now sits directly beneath Order Summary in the right column. Scoped to desktop only, as requested — this component is never rendered on mobile in either tree (`{!isMobileViewport && (<...SummaryContent/>)}`).

---

## 7. Backend support audit (no code changes)

**Finding:** Retail's checkout makes zero API calls anywhere in `modes/retail/` — account, fulfillment, and payment are all local `useState`. This is intentional per the original brief (UI/UX only, no backend changes). The same is true of the other 7 default-like modes' `DefaultOrderPage` tree.

The backend already exposes a complete, **mode-agnostic** checkout API that F&B/MSME already use and that retail could plug into without any backend changes:

| Endpoint | Purpose |
|---|---|
| `POST /api/v1/store/checkout` | Final order submission (cash/QRPH, idempotency key) |
| `POST /api/v1/store/cart/quote` | Real fee/total calculation |
| `GET/POST/PUT/DELETE /api/v1/store/addresses` | Real saved-address book (authenticated) |
| `POST /api/v1/store/checkout/guest-otp/request` + `/verify` | Guest identity email verification |
| `POST /api/v1/store/checkout/payment-sessions` (+ `/confirm-test`) | QRPH online payment |

`storeCheckoutSchema` (`backend/src/validators/storeValidator.js`) expects `lines[]`, `order_method`, `customer_name/phone/email`, `delivery_address` + `latitude/longitude`, `scheduled_for`, `special_instructions`, `idempotency_key`, `payment_type` — state retail's UI already collects locally but currently discards instead of submitting. `optionalStoreCustomer` middleware means guest checkout (no login) is already supported server-side.

---

## Full file index

### Created
- `frontend/apps/store/src/modes/retail/checkout/components/RetailOrderStoreHeader.jsx`
- `frontend/apps/store/src/modes/retail/checkout/components/RetailOrderJourneyHeader.jsx`
- `frontend/apps/store/src/modes/retail/checkout/components/RetailOrderAccountStep.jsx`
- `frontend/apps/store/src/modes/retail/checkout/components/RetailOrderFulfillmentStep.jsx`
- `frontend/apps/store/src/modes/retail/checkout/components/RetailOrderSavedAddressesModal.jsx`
- `frontend/apps/store/src/modes/retail/checkout/components/RetailOrderReviewItemsList.jsx`
- `frontend/apps/store/src/modes/retail/checkout/components/RetailOrderPaymentStep.jsx`
- `frontend/apps/store/src/modes/retail/checkout/components/RetailOrderSummaryContent.jsx`
- `frontend/apps/store/src/modes/retail/checkout/components/RetailOrderMobileSummaryPanel.jsx`
- `frontend/apps/store/src/modes/retail/checkout/hooks/useRetailOrderPageProps.js`
- `frontend/apps/store/src/modes/retail/checkout/pages/RetailOrderPage.jsx`

### Modified
- `frontend/apps/store/src/StorefrontApp.jsx` — why: `isRetailMode` wiring, `retailOrderRouteProps` hook call, scoped padding exemption (§3)
- `frontend/apps/store/src/shared/hooks/useCartMutations.js` — why: cart-drawer auto-open exemption for retail (§3)
- `frontend/apps/store/src/app/hooks/useStorefrontCatalogRouteProps.js` — why: passthrough (§3)
- `frontend/apps/store/src/app/pages/StorefrontCatalogRouteContainer.jsx` — why: passthrough (§3)
- `frontend/apps/store/src/shared/components/storefront/StorefrontClassicCatalog.jsx` — why: `RetailOrderPage` import + render branch (§3)
- `frontend/apps/store/src/app/runtime/normalizeStorefrontPageModel.js` — why: missing `isRetailMode` derivation, the actual root cause of §4
- `frontend/apps/store/src/shared/hooks/useStorefrontCatalog.js` — why: missing `isRetailMode` passthrough, the other half of §4
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCheckoutSummaryContent.jsx` — why: trust-card grid bug fix (§6)

### Reverted (back to shared, untouched)
- `frontend/apps/store/src/StorefrontApp.jsx` *(later re-modified for retail wiring — see above)*
- `frontend/apps/store/src/shared/components/storefront/DefaultOrderAccountStep.jsx`
- `frontend/apps/store/src/shared/components/storefront/DefaultOrderFulfillmentStep.jsx`
- `frontend/apps/store/src/shared/components/storefront/DefaultOrderPage.jsx`
- `frontend/apps/store/src/shared/components/storefront/DefaultOrderPaymentStep.jsx`
- `frontend/apps/store/src/shared/components/storefront/DefaultOrderReviewItemsList.jsx`
- `frontend/apps/store/src/shared/components/storefront/DefaultOrderStoreHeader.jsx`
- `frontend/apps/store/src/shared/hooks/useCartMutations.js` *(later re-modified for retail wiring — see above)*
- `frontend/apps/store/src/shared/hooks/useDefaultOrderPageProps.js`

### Superseded documentation
- `docs/features/DEFAULT_RETAIL_CHECKOUT_LAYOUT_REFINEMENT_2026-07-31.md` — describes the shared-file approach reverted in §1. Left in place for historical record but no longer describes the current architecture; this document supersedes it.
