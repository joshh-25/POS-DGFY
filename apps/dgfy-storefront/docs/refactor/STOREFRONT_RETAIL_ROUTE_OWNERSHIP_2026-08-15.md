# Retail Storefront Route Ownership Slice

Date: 2026-08-15
Status: Implemented locally; not committed or pushed

## Purpose

Move Retail route composition out of the cross-mode storefront dispatcher without redesigning Retail or changing its customer flow.

This is a small architecture correction under the existing storefront ownership contract. It is not a new repository phase and does not change the global implementation phase ledger.

## Authoritative guidance

- `docs/START_HERE.md`
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
- `docs/architecture/adr/0029-multi-industry-storefront-mode-boundaries.md`
- `docs/architecture/adr/0014-frontend-shared-ui-boundary-and-factory-constraints.md`
- `apps/dgfy-web/apps/store/docs/refactor/STOREFRONT_FRONTEND_ARCHITECTURE_GUIDE.md`

The applicable rule is that catalog, product-details, checkout, and tracking route behavior belongs to the industry mode. Shared code may provide neutral runtime data and shared visual primitives, but it must not own Retail route decisions.

## Change made

Added `RetailStorefrontRouteContainer.jsx` as the Retail-owned composition boundary for:

- product details;
- tracking;
- checkout/order;
- the main Retail catalog and shared storefront sections.

Updated `StorefrontCatalogRouteContainer.jsx` so it delegates Retail rendering to that Retail-owned container instead of importing and selecting each Retail page itself.

## Behavior preserved

- Existing Retail catalog props and pagination behavior
- Existing Retail product-details route
- Existing Retail checkout route
- Existing Retail tracking route and drawer behavior
- Existing promo, review, and shared storefront-section rendering
- Existing F&B, Simple MSME, Services, and fallback routes

No backend, API, database, styling, copy, or customer-flow change is included.

## Remaining architecture debt

The app dispatcher still prepares a large shared catalog runtime and passes grouped props into the Retail route container. A later safe slice should move Retail-specific view-model preparation into a Retail hook or adapter. That later change must preserve the current Retail UI and have separate regression evidence.

Do not combine that follow-up with F&B or Simple MSME extraction in one change.

## Validation

Focused tests run locally:

```text
npx vitest run \
  apps/store/src/__tests__/retailStorefrontRoute.contract.test.js \
  apps/store/src/__tests__/simpleTrackingPresentation.test.js \
  apps/store/src/__tests__/fnbStorefront.contract.test.js
```

Result: 3 test files passed, 25 tests passed.

The affected storefront build and rendered desktop/mobile checks remain required before commit or push.
