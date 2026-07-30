# Retail/Default Checkout Process — Session Documentation (2026-07-30)

This documents every change made in this session to build a dedicated checkout process for the Default/Retail storefront mode (any industry that isn't F&B, Services, or MSME/Simple — e.g. `workflow_mode: 'retail'`), modeled on MSME's existing checkout. Each modification below is self-contained: name, files changed, files added, files deleted, reason, and the key code.

---

## 1. Replace Retail's rectangular cart trigger with an icon-only button

### Files changed
- `frontend/apps/store/src/app/pages/StorefrontCartDrawerShellContainer.jsx`

### Files added
- `frontend/apps/store/src/shared/components/storefront/DefaultProductCartFab.jsx`

### Files deleted
None. `StorefrontCartFab.jsx` (the shared F&B/Services/Retail button) was left completely untouched — its Default-mode branch is now simply suppressed at the call site instead of being edited, so F&B/Services behavior carries zero risk.

### Reason for the modification
Retail's cart trigger was a wide rectangular button (`"{cartCount} item(s) in cart" / ₱total / "View Cart"`), rendered by `StorefrontCartFab.jsx`'s default/else branch. The user asked for it to become icon-only, matching MSME's circular floating cart button, while keeping Retail's existing brand color.

### Codes changed/added

`DefaultProductCartFab.jsx` (new) — mirrors `modes/simple/checkout/components/SimpleCartFloatingButton.jsx`'s structure, reusing Retail's existing blue gradient (already used by the old rectangular button, so "color coding" is retained exactly):

```jsx
export function DefaultProductCartFab({ cartCount = 0, isOpen = false, isMobileViewport = false, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={isOpen ? 'Close product cart' : 'Open product cart'}
      style={{
        position: 'fixed',
        right: isMobileViewport ? 16 : 24,
        bottom: isMobileViewport ? 16 : 24,
        zIndex: 2100,
        width: isMobileViewport ? 62 : 68,
        height: isMobileViewport ? 62 : 68,
        borderRadius: '50%',
        background: 'linear-gradient(135deg,#1a4586,#1a4e8d)',
        color: '#fff',
        boxShadow: '0 18px 38px rgba(26,69,134,.34)',
        ...
      }}
    >
      <span style={{ position: 'absolute', top: 8, right: 8, background: '#0f172a', ... }}>{cartCount}</span>
      <ShoppingCart size={24} strokeWidth={2.2} />
    </button>
  );
}
```

`StorefrontCartDrawerShellContainer.jsx` — the old `<StorefrontCartFab>` render is now conditionally suppressed for Default mode (computed locally, matches the same condition used elsewhere in this doc):

```jsx
const isDefaultCartSurfaceMode = !isFnbMode && !isServicesMode && !isSimpleMode;
...
{!isDefaultCartSurfaceMode && (
  <StorefrontCartFab ... />
)}
```

---

## 2. Detach the old checkout popup

### Files changed
- `frontend/apps/store/src/app/pages/StorefrontCartDrawerShellContainer.jsx`

### Files added
None.

### Files deleted
None — per explicit instruction ("do not modify, just detach").

### Reason for the modification
`StorefrontCheckoutSummaryContainer.jsx` (the old single-page popup checkout for Default/Retail mode) was being replaced by a new page-based flow. The instruction was to stop it from rendering without touching the component file itself, so it remains available/unmodified for reference or future reuse.

### Codes changed/added

Removed from `StorefrontCartDrawerShellContainer.jsx`: the import, the destructured `storefrontCheckoutSummaryProps` prop, and this render block:

```jsx
// REMOVED:
{checkoutTab === 'checkout' && !isFnbOrderSubpage && !isFnbMode && !isServicesMode && !(isSimpleMode && isResolvedOrderSubpage) && (
  <StorefrontCheckoutSummaryContainer {...storefrontCheckoutSummaryProps} />
)}
```

`StorefrontCheckoutSummaryContainer.jsx` itself has zero diff — confirmed via `git diff` equivalent inspection during the session.

---

## 3. New "Product Cart" popup, built independently from MSME's

### Files changed
- `frontend/apps/store/src/app/pages/StorefrontCartDrawerShellContainer.jsx`
- `frontend/apps/store/src/StorefrontApp.jsx`

### Files added
- `frontend/apps/store/src/shared/components/storefront/DefaultProductCartDrawer.jsx`
- `frontend/apps/store/src/shared/components/storefront/DefaultProductCartLineItem.jsx`
- `frontend/apps/store/src/shared/hooks/useDefaultProductCartDrawerProps.js`

### Files deleted
None.

### Reason for the modification
Clicking the new icon needed to open a cart preview popup. The user explicitly required this to copy MSME's cart-drawer functionality (item list, quantity controls, subtotal, checkout CTA) while being Retail's **own** component — not a shared/reused component — per the "two independent trees" pattern already used for F&B/MSME's checkout step components earlier in the project.

### Codes changed/added

`DefaultProductCartDrawer.jsx` (new) — mirrors `modes/simple/checkout/components/SimpleCartDrawerSurface.jsx`: right-side slide-in panel, backdrop, header ("Product Cart" / "Added products"), scrollable item list, footer with total + CTA, styled in Retail's blue instead of MSME's teal:

```jsx
const DEFAULT_BRAND = '#1a4e8d';
const DEFAULT_BRAND_DARK = '#1a4586';
...
<button type="button" onClick={() => onCheckout?.()} disabled={cart.length === 0} style={{
  background: cart.length === 0 ? '#cbd5e1' : `linear-gradient(135deg,${DEFAULT_BRAND},${DEFAULT_BRAND_DARK})`,
  ...
}}>
  Order &amp; Purchase
</button>
```

`DefaultProductCartLineItem.jsx` (new) — mirrors `SimpleCartLineItem.jsx` (thumbnail, name, unit price, qty stepper `-`/`+`, remove button) verbatim in structure.

`useDefaultProductCartDrawerProps.js` (new) — mirrors `useSimpleCartDrawerProps.js`'s shape, reusing the same already-existing shared cart state (`cart`, `cartCount`, `removeCartItem`, `updateQty`, etc.) — no new state, no backend change:

```js
export function useDefaultProductCartDrawerProps({ cart, cartCount, ..., goStoreOrderPage, isCheckoutOpen, setIsCheckoutOpen, ... }) {
  const toggleDrawer = useCallback(() => setIsCheckoutOpen((p) => !p), [setIsCheckoutOpen]);
  return useMemo(() => ({
    floatingButtonProps: { cartCount, isOpen: isCheckoutOpen, isMobileViewport, onToggle: toggleDrawer },
    drawerSurfaceProps: { ..., onCheckout: goStoreOrderPage, onClose: closeDrawer, onRemoveItem: removeCartItem, onUpdateQuantity: updateQty, ... }
  }), [...]);
}
```

`StorefrontApp.jsx` — new hook call, reusing existing shared state:

```jsx
const defaultProductCartDrawerProps = useDefaultProductCartDrawerProps({
  activeOrderMethodLabel, cart, cartCount, cartImageErrors, cartTotal,
  goStoreOrderPage, isCheckoutOpen, isMobileViewport, money, removeCartItem,
  setCartImageErrors, setIsCheckoutOpen, updateQty, withAssetOrigin
});
```

`StorefrontCartDrawerShellContainer.jsx` — new gated render, mirroring MSME's own block:

```jsx
{!isAccountDrawerOpen && isDefaultCartSurfaceMode && (
  <>
    <DefaultProductCartFab {...defaultProductCartDrawerProps.floatingButtonProps} />
    <DefaultProductCartDrawer {...defaultProductCartDrawerProps.drawerSurfaceProps} />
  </>
)}
```

Also added `isDefaultCartSurfaceMode` to `StorefrontCheckoutDrawerFrame`'s `disabled` prop so the (now content-less, for Default mode) old drawer frame stays inert:

```jsx
disabled={isFnbCartDrawerSurfaceOpen || isServicesCartDrawerMode || isSimpleCartSurfaceMode || isDefaultCartSurfaceMode || (isSimpleMode && isResolvedOrderSubpage)}
```

---

## 4. Build the `/order` page (3-step checkout: Account → Fulfillment → Review & Payment)

### Files changed
- `frontend/apps/store/src/StorefrontApp.jsx`
- `frontend/apps/store/src/app/hooks/useStorefrontCatalogRouteProps.js`
- `frontend/apps/store/src/app/pages/StorefrontCatalogRouteContainer.jsx`
- `frontend/apps/store/src/shared/components/storefront/StorefrontClassicCatalog.jsx`
- `frontend/apps/store/src/shared/hooks/useDefaultProductCartDrawerProps.js` (added `goStoreOrderPage` so the cart drawer's CTA now navigates to this new page)

### Files added
- `frontend/apps/store/src/shared/components/storefront/DefaultOrderPage.jsx`
- `frontend/apps/store/src/shared/components/storefront/DefaultOrderStoreHeader.jsx`
- `frontend/apps/store/src/shared/components/storefront/DefaultOrderJourneyHeader.jsx`
- `frontend/apps/store/src/shared/components/storefront/DefaultOrderAccountStep.jsx`
- `frontend/apps/store/src/shared/components/storefront/DefaultOrderFulfillmentStep.jsx`
- `frontend/apps/store/src/shared/components/storefront/DefaultOrderPaymentStep.jsx`
- `frontend/apps/store/src/shared/components/storefront/DefaultOrderReviewItemsList.jsx`
- `frontend/apps/store/src/shared/hooks/useDefaultOrderPageProps.js`

### Files deleted
None.

### Reason for the modification
The user asked for a dedicated `/order` page for Retail, matching MSME's layout/structure exactly: a stepper (Account, Fulfillment, Review & Payment), Continue/Back buttons, and three steps — with explicit instructions that Account, Delivery/Pickup, Now/Schedule, and Saved Addresses must **not** be connected to the backend yet (placeholder/local state only), while the map itself should be a real interactive component and the item list should show the real cart.

### Codes changed/added

`DefaultOrderPage.jsx` (new) — owns all step/placeholder state locally, assembles the page:

```jsx
export function DefaultOrderPage({ cart = [], cartCount = 0, isMobileViewport = false, money, onBackToCatalog, servicesBodyFont, servicesDisplayFont, selectedStore, withAssetOrigin }) {
  const [step, setStep] = useState(1);
  const [orderMethod, setOrderMethod] = useState('delivery');
  const [scheduleMode, setScheduleMode] = useState('asap');
  const [scheduledFor, setScheduledFor] = useState('');
  const [customerPin, setCustomerPin] = useState(null);
  const [selectedAddressId, setSelectedAddressId] = useState('placeholder-home');
  const [paymentType, setPaymentType] = useState('cash');
  ...
  return (
    <div style={{ ... }}>
      <DefaultOrderStoreHeader ... />
      <DefaultOrderJourneyHeader activeStep={step} ... onStepChange={setStep} />
      {step === 1 && <DefaultOrderAccountStep onContinue={() => setStep(2)} onBackToCatalog={onBackToCatalog} ... />}
      {step === 2 && <DefaultOrderFulfillmentStep onBack={() => setStep(1)} onContinue={() => setStep(3)} orderMethod={orderMethod} scheduleMode={scheduleMode} ... />}
      {step === 3 && <DefaultOrderPaymentStep cart={cart} onBack={() => setStep(2)} paymentType={paymentType} ... />}
    </div>
  );
}
```

`DefaultOrderJourneyHeader.jsx` (new) — mirrors `SimpleCheckoutJourneyHeader.jsx`/`FnbCheckoutJourneyHeader.jsx`: three-step `CheckoutStepProgressHeader` (shared component) with `variant="connected"`, Retail's own blue tokens:

```jsx
const steps = [
  { realStep: 1, displayStep: 1, label: 'Account', allow: cartHasItems },
  { realStep: 2, displayStep: 2, label: 'Fulfillment', allow: cartHasItems },
  { realStep: 3, displayStep: 3, label: 'Review & Payment', allow: cartHasItems }
];
```

`DefaultOrderAccountStep.jsx` (new) — placeholder identity, Continue always enabled, no auth wiring:

```jsx
const PLACEHOLDER_ACCOUNT = { name: 'Guest Customer', phone: '+63 917 000 0000', email: 'guest@example.com' };
...
<CustomerIdentityCard title="Account Details" showVerifiedBadge={false} name={PLACEHOLDER_ACCOUNT.name} phone={PLACEHOLDER_ACCOUNT.phone} email={PLACEHOLDER_ACCOUNT.email} ... />
```

`DefaultOrderFulfillmentStep.jsx` (new) — Delivery/Pickup + Now/Schedule via `SelectableOptionCard` (shared, local state only), a real `DeliveryPinMap`, and a placeholder saved-address list via `SavedAddressCard` (shared) fed mock data:

```jsx
const PLACEHOLDER_ADDRESSES = [
  { id: 'placeholder-home', label: 'Home', fullAddress: 'Jereos Street, San Pedro, Jaro, Iloilo City', isDefault: true },
  { id: 'placeholder-work', label: 'Work', fullAddress: 'Ledesco Village, La Paz, Iloilo City', isDefault: false }
];
...
<DeliveryPinMap pin={customerPin} onPinChange={onPinChange} disabled={false} highlighted highlightColor={DEFAULT_ACCENT} ... />
```

`DefaultOrderPaymentStep.jsx` + `DefaultOrderReviewItemsList.jsx` (new) — placeholder payment-type dropdown (local state, `PaymentMethodSelectorBlock` shared component) + a real read-only list of actual cart items; submit button is disabled with a "Coming Soon" label and an explicit preview-only notice:

```jsx
const PLACEHOLDER_PAYMENT_OPTIONS = [
  { value: 'cash', label: 'Cash on delivery/pickup' }, { value: 'gcash', label: 'GCash' },
  { value: 'maya', label: 'Maya' }, { value: 'card', label: 'Card' }, { value: 'bank_transfer', label: 'Bank transfer' }
];
...
<button type="button" disabled style={{ background: '#cbd5e1', ... }}>Place Order (Coming Soon)</button>
```

`useDefaultOrderPageProps.js` (new) — plain pass-through of only real, already-existing shared state (cart display, store info, navigation):

```js
export function useDefaultOrderPageProps({ cart, cartCount, isMobileViewport, money, selectedStore, servicesBodyFont, servicesDisplayFont, goStoreCatalogPage, withAssetOrigin }) {
  return { cart, cartCount, isMobileViewport, money, selectedStore, servicesBodyFont, servicesDisplayFont, withAssetOrigin, onBackToCatalog: goStoreCatalogPage };
}
```

Routing wire-through — `defaultOrderRouteProps` threaded `StorefrontApp.jsx` → `useStorefrontCatalogRouteProps.js` → `StorefrontCatalogRouteContainer.jsx` → `StorefrontClassicCatalog.jsx`, mounted the same way MSME's checkout page is:

```jsx
// StorefrontClassicCatalog.jsx
const isDefaultLikeMode = !isServicesMode && !isFnbMode && !isSimpleMode;
...
{isDefaultLikeMode && isResolvedOrderSubpage && defaultStorefrontModel && (
  <DefaultOrderPage {...defaultOrderRouteProps} />
)}
```

`useDefaultProductCartDrawerProps.js` — connected the cart drawer's CTA to real navigation (reusing the exact same `goStoreOrderPage` function F&B/MSME already use — pushState only, no backend call):

```js
onCheckout: goStoreOrderPage,
```

---

## 5. Bug fix: storefront hero/contact content bleeding through above the order page

### Files changed
- `frontend/apps/store/src/app/pages/StorefrontHeroBandContainer.jsx`
- `frontend/apps/store/src/shared/components/storefront/StorefrontClassicCatalog.jsx`

### Files added
None.

### Files deleted
None.

### Reason for the modification
After building the `/order` page, the user observed (via screenshot) that the storefront's hero/contact-map/why-choose-us content was still rendering **above** the new order page — unlike MSME, where that content correctly disappears on `/order`. Root cause: two Default-mode render branches were missing the `!isResolvedOrderSubpage` guard that the equivalent F&B and Simple branches already had (pre-existing gap, invisible until Default mode had its own order-subpage content to protect against).

### Codes changed/added

`StorefrontHeroBandContainer.jsx` — Zone 1 (nav breadcrumb) and Zone 2 (hero) both fixed:

```jsx
// Before: {!isFnbMode && !isSimpleMode && (
// After:
{!isFnbMode && !isSimpleMode && !isResolvedOrderSubpage && (
  <section>...Back to Discovery...</section>
)}
...
// Before: ) : (!isFnbMode && !isSimpleMode) ? (
// After:
) : (!isFnbMode && !isSimpleMode && !isResolvedOrderSubpage) ? (
  <DefaultStorefrontHero ... />
```

`StorefrontClassicCatalog.jsx` — promo/reviews/footer sections for Default mode, same fix:

```jsx
// Before: {!isServicesMode && !isFnbMode && !isSimpleMode && defaultStorefrontModel && (
// After:
{isDefaultLikeMode && !isResolvedOrderSubpage && defaultStorefrontModel && (
  <>
    <SharedStorefrontPromoSection ... />
    <SharedStorefrontReviewsSection ... />
    <SharedStorefrontFooterSection ... />
  </>
)}
```

Verified by measuring both pages' DOM live: before the fix, `DefaultStorefrontHero`/Zone 1 nav were confirmed rendering on `/order`; after the fix, neither renders, matching MSME's behavior exactly (confirmed via Playwright screenshot).

---

## 6. Bug fix: top spacing mismatch vs MSME's order page

### Files changed
- `frontend/apps/store/src/StorefrontApp.jsx`

### Files added
None.

### Files deleted
None.

### Reason for the modification
The user screenshotted Retail's order page and noted extra whitespace above the store header bar compared to MSME's. Measured live via Playwright: Retail's header sat at `top: 28px`, MSME's at `top: 18px` — a 10px discrepancy. Root cause: the page's outer container `paddingTop` was `0` for Services/F&B/Simple modes unconditionally, but `10px` (desktop) for every other mode with **no exception for being on the order subpage** — a pre-existing gap invisible until Default mode had its own order page to compare against.

### Codes changed/added

`StorefrontApp.jsx` line 3378:

```jsx
// Before:
paddingTop: isStorePage && (isServicesMode || isFnbMode || isSimpleMode) ? 0 : (isMobileViewport ? 6 : 10),

// After:
paddingTop: isStorePage && (isServicesMode || isFnbMode || isSimpleMode || (isResolvedOrderSubpage && !isServicesMode && !isFnbMode && !isSimpleMode)) ? 0 : (isMobileViewport ? 6 : 10),
```

Scoped narrowly to the order subpage only — the catalog page's existing padding/spacing was left untouched to avoid any regression there. Verified via live DOM measurement: both pages now report `top: 18px` for the header bar, pixel-identical.

---

## 7. Remove Dine In / Takeout from Retail's order-method options

### Files changed
- `frontend/apps/store/src/shared/components/storefront/DefaultOrderFulfillmentStep.jsx`

### Files added
None.

### Files deleted
None.

### Reason for the modification
`DefaultOrderFulfillmentStep.jsx` originally mapped over the full shared `ORDER_METHOD_OPTIONS` list (`delivery`, `pickup`, `dine_in`, `takeout` — the last two exist for dine-in-capable modes like F&B). The user asked for Retail to only offer Delivery and Pickup.

### Codes changed/added

```jsx
// Before:
const ORDER_METHOD_ICONS = {
  delivery: ({ size }) => <Truck size={size} />,
  pickup: ({ size }) => <ShoppingBag size={size} />,
  dine_in: ({ size }) => <ShoppingBag size={size} />,
  takeout: ({ size }) => <ShoppingBag size={size} />
};
...
{ORDER_METHOD_OPTIONS.map((option) => (...))}

// After:
const ORDER_METHOD_ICONS = {
  delivery: ({ size }) => <Truck size={size} />,
  pickup: ({ size }) => <ShoppingBag size={size} />
};

const RETAIL_ORDER_METHOD_OPTIONS = ORDER_METHOD_OPTIONS.filter(
  (option) => option.value === 'delivery' || option.value === 'pickup'
);
...
{RETAIL_ORDER_METHOD_OPTIONS.map((option) => (...))}
```

The shared `ORDER_METHOD_OPTIONS` constant itself (`shared/model/storefrontConstants.js`) was left untouched, since other modes (e.g. F&B) still use the full list — filtering happens locally in Retail's own component.

---

## Verification performed throughout

- ESLint (`--no-eslintrc -c .eslintrc.json`) run after every modification — 0 errors across all touched/added files each time, matching the project's pre-existing warning baseline.
- Production build (`npm run build:store`) run after modifications 1–4 — succeeded each time (exit code 0).
- Live visual/behavioral verification via a headless Chrome (Playwright) driver script against the running dev server for modifications 4–7: added an item to cart, opened the cart popup, clicked "Order & Purchase", confirmed the `/order` URL, screenshotted each step, and compared against the equivalent MSME store (`retail-ipsum-6161e0`, `workflow_mode: msme`) side by side. No console errors observed in either flow.
- Test stores used: `retail-ipsum-5a9b90` (`workflow_mode: retail`, Default/Retail tree) and `retail-ipsum-6161e0` (`workflow_mode: msme`, Simple tree).

## Explicitly not connected to the backend (by design, this session)

- Account/guest identity (Step 1) — placeholder only.
- Order method (Delivery/Pickup) and schedule (Now/Schedule) selection — local UI state only.
- Saved addresses list — placeholder/mock data, not the DGFY account addresses API.
- Payment type selection — placeholder only; "Place Order" is disabled.

Real/functional in this pass: the product cart itself (add/remove/quantity), the interactive delivery-pin map, the read-only item list on the Review & Payment step, and the `/order` page navigation itself (client-side routing only, no backend call).
