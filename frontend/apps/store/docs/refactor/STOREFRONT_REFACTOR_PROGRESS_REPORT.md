# Storefront Refactor Progress Report

> Status: active progress ledger
>
> Keep this file with `STOREFRONT_REFACTOR_PLAN.md` and `STOREFRONT_FRONTEND_ARCHITECTURE_GUIDE.md`.
> Update this report after every safe refactor slice.
> Use `STOREFRONT_REFACTOR_IMPLEMENTATION_GOAL.md` as the execution checklist for future slices.

## Goal

Complete the storefront frontend refactor without changing backend contracts, storefront routes, or user-facing behavior.

The target is to reduce `StorefrontApp.jsx` into a thin shell that only:

- detects route intent
- detects storefront mode
- mounts feature-owned route containers
- passes minimal shared runtime context

Feature logic must live in the proper owner folders:

- `customer-dashboard/`
- `discovery/`
- `tracking/`
- `shared/`
- `modes/fnb/`
- `modes/services/`
- `modes/simple/`
- `modes/hospitality/`

## Active Implementation Goal

Finish the Storefront frontend refactor by moving feature-owned logic out of `StorefrontApp.jsx` in safe, reviewable slices.

The working goal is:

- preserve the current UI and route behavior
- keep Services, Simple, F&B, Discovery, Tracking, and Customer Dashboard in their correct ownership folders
- keep backend contracts unchanged
- keep every slice buildable before continuing
- record every slice in this progress report

`StorefrontApp.jsx` should only shrink over time. If a slice requires adding new feature logic to the shell, stop and move that logic into the owning feature folder instead.

## Architecture Basis

Use these documents as the required first read before every storefront frontend edit:

- `frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_PLAN.md`
- `frontend/apps/store/docs/refactor/STOREFRONT_FRONTEND_ARCHITECTURE_GUIDE.md`

Refactor rules:

- Use small slices.
- Check the live browser console before starting the next refactor slice.
- Keep each mode isolated.
- Keep shared code truly shared.
- Keep views, hooks/view-models, and model helpers separated.
- Do not add new feature logic to `StorefrontApp.jsx`.
- Do not re-inline Services or Simple mode into `StorefrontApp.jsx`.
- Keep Hospitality separate from Services.

## File Size Guardrails

Treat line count as a warning signal.

Recommended limits:

- Route shell files: 300 lines target, 500 lines warning.
- Route containers/hooks: 250 lines target, 400 lines warning.
- View components: 200 lines target, 300 lines warning.
- Model/util files: 150 lines target, 250 lines warning.
- Test files: 250 lines target, 400 lines warning.

If a file crosses the warning limit, the next related edit should extract a focused helper or child component before adding more behavior.

## Phase Implementation Plan

### Phase 1: Stabilize The Shell

Goal: keep `StorefrontApp.jsx` stable while moving only low-risk derived state and action handlers.

Status: mostly complete.

Rules:

- do not rewrite route behavior
- do not move multiple modes in one slice
- do not re-inline Services or Simple mode
- run targeted tests and `build:store` after each slice

### Phase 2: Customer Dashboard Ownership

Goal: keep customer dashboard route, drawer, tabs, actions, and business access inside `customer-dashboard/`.

Status: mostly complete.

Remaining checks:

- verify no dashboard tab-specific action remains in `StorefrontApp.jsx`
- keep standalone `/map-dgfy/account` and drawer presentation behavior intact
- keep POS redirection helper out of UI components

### Phase 3: F&B Storefront Ownership

Goal: keep F&B storefront hero, catalog, detail page, reviews, promos, and cart actions inside `modes/fnb/storefront/`.

Status: in progress.

Next safe work:

- move remaining F&B product-detail route prop assembly out of `StorefrontApp.jsx`
- keep product-detail UI unchanged
- keep Simple product-detail compatibility intact until Simple has its own full route owner

### Phase 4: F&B Checkout Ownership

Goal: keep F&B cart drawer, guest details, OTP, promo placement, order summary, delivery/pickup, and checkout steps inside `modes/fnb/checkout/`.

Status: partially complete.

Next safe work:

- move remaining cart drawer route ownership into an F&B checkout route container
- keep promo calculation display based on quote/checkout response
- keep guest OTP proof handling in F&B checkout ownership

### Phase 5: F&B Tracking Ownership

Goal: keep F&B tracking page state, drawer state, order snapshot normalization, and route assembly inside `modes/fnb/tracking/`.

Status: partially complete.

Next safe work:

- move tracking drawer route ownership out of `StorefrontApp.jsx`
- keep shared tracking primitives in `tracking/shared/` only if they are mode-neutral
- verify tracking page and drawer after extraction

### Phase 6: Discovery Ownership

Goal: keep search, filters, map runtime, marker behavior, clusters, and result panel behavior inside `discovery/`.

Status: in progress.

Next safe work:

- finish `discovery/hooks/useDiscoveryRuntime.js`
- move remaining map state and result-panel behavior out of `StorefrontApp.jsx`
- preserve latest map cluster and result-panel behavior

### Phase 7: Services And Simple Ownership

Goal: keep Services and Simple storefront behavior inside their mode folders without reintroducing inline shell code.

Status: partially complete.

Rules:

- Services belongs in `modes/services/`
- Simple belongs in `modes/simple/`
- Hospitality stays separate in `modes/hospitality/`
- only touch these modes when their route breaks or their slice is explicitly selected

### Phase 8: Legacy Cleanup

Goal: remove old compatibility wrappers only after imports, build, and live routes prove they are unused.

Status: not started.

Rules:

- no deletion without `rg` proof
- keep temporary re-exports if old imports still exist
- remove legacy code in small batches

## Current Shell State

Current measured `StorefrontApp.jsx` line count:

- `9,221` lines

This is still too large, but it has been reduced through safe feature-boundary extraction.

## Completed Refactor Slices

### Shared Runtime And Models

- Moved storefront customer storage helpers into `shared/model/storefrontCustomerStorage.js`.
- Moved checkout/cart model calculations into `shared/model/storefrontCartModel.js`.
- Moved storefront constants into `shared/model/storefrontConstants.js`.
- Moved money, rounding, and slug helpers into `shared/utils/storefrontFormatters.js`.
- Moved idempotency key creation into `shared/utils/idempotency.js`.
- Moved external action link handling into `shared/utils/externalLinks.js`.
- Moved style tokens into `shared/theme/storefrontStyleTokens.js`.

### Discovery

- Moved discovery filter option constants into `discovery/model/discoveryFilterOptions.js`.
- Moved discovery map DOM helpers into `discovery/model/discoveryMapDom.js`.
- Moved discovery presentation helpers into `discovery/model/discoveryPresentation.js`.
- Started Discovery route/page ownership under `discovery/pages/` and `discovery/hooks/`.

### Customer Dashboard

- Moved customer dashboard route ownership into `customer-dashboard/pages/`.
- Moved dashboard shell and tab UI into `customer-dashboard/components/`.
- Moved dashboard runtime and business access handling into `customer-dashboard/hooks/`.
- Preserved standalone dashboard URL behavior and drawer presentation support.

### F&B Storefront

- Moved F&B hero/storefront presentation into `modes/fnb/storefront/`.
- Moved F&B catalog toolbar and catalog runtime into `modes/fnb/storefront/components/` and `modes/fnb/storefront/hooks/`.
- Moved F&B mobile layout calculation into `modes/fnb/storefront/model/fnbMobileLayout.js`.
- Moved F&B community/footer model assembly into `modes/fnb/storefront/model/fnbCommunityModel.js`.
- Moved F&B product-detail metadata into `modes/fnb/storefront/model/fnbProductDetailsModel.js`.
- Moved F&B product-detail route state and derived metadata into `modes/fnb/storefront/hooks/useFnbProductDetailsRoute.js`.
- Moved F&B product-detail route prop assembly into `modes/fnb/storefront/hooks/useFnbProductDetailsRouteProps.js`.
- Moved F&B product-detail add-to-cart/buy-now/quick-add actions into `modes/fnb/storefront/hooks/useFnbProductDetailActions.js`.
- Moved F&B product-detail review route props into `modes/fnb/storefront/hooks/useFnbProductDetailsReviewProps.js`.
- Moved F&B item review submit/reset handling into `modes/fnb/storefront/hooks/useFnbItemReviewRuntime.js`.
- Moved F&B promo display normalization into `modes/fnb/promos/model/fnbPromoModel.js`.

### F&B Checkout

- Moved F&B checkout route/body components into `modes/fnb/checkout/components/`.
- Moved checkout address helpers into `modes/fnb/checkout/model/`.
- Moved checkout payment options into `modes/fnb/checkout/model/fnbCheckoutPaymentOptions.js`.
- Moved cart and drawer presentation labels into `modes/fnb/checkout/model/fnbCartPresentation.js`.
- Moved F&B cart drawer route prop assembly into `modes/fnb/checkout/hooks/useFnbCartDrawerRouteProps.js`.
- Moved the F&B cart drawer overlay/header/frame into `modes/fnb/checkout/pages/FnbCartDrawerSurface.jsx`.
- Moved guest checkout OTP frontend helpers into F&B checkout ownership.

### F&B Tracking

- Moved F&B tracking route props and tracking runtime into `modes/fnb/tracking/`.
- Started separation of tracking page/drawer state from the shell.

### Simple Mode

- Kept Simple mode under `modes/simple/`.
- Moved Simple related-items logic into `modes/simple/storefront/model/simpleProductDetailsModel.js`.

### Services Mode

- Kept Services mode under `modes/services/`.
- Moved Services hero and category icon model into `modes/services/storefront/`.
- Moved Services booking field/schedule helpers into `modes/services/booking/model/`.

### Hospitality Mode

- Kept Hospitality separate from Services under `modes/hospitality/`.

## Open Refactor Work

### Highest Priority

1. Move F&B cart drawer frame/body ownership into a route/container under `modes/fnb/checkout/`.
2. Move F&B checkout step body ownership out of the shared drawer frame where still safe.
3. Move F&B tracking drawer route ownership into `modes/fnb/tracking/`.

### Medium Priority

1. Finish Discovery runtime extraction into `discovery/hooks/useDiscoveryRuntime.js`.
2. Move remaining Discovery map state/pin/result panel behavior out of `StorefrontApp.jsx`.
3. Move remaining customer dashboard bridge code out of the shell if any remains.
4. Extract shared tracking drawer presentation into `tracking/shared/` if used across multiple modes.

### Later Priority

1. Split large mode-owned components that exceed preferred file limits.
2. Add model-level unit tests for newly extracted pure helpers.
3. Add route-level smoke tests for Discovery, F&B storefront, checkout, tracking, and customer dashboard.
4. Add code-splitting for large Storefront build chunks.

## Validation Checklist Per Slice

Run after every meaningful storefront refactor:

```powershell
cd C:\xampp\htdocs\SKU-Inventory-Manager\frontend
cmd /c npx vitest run apps/store/src/__tests__/customerAccess.test.js apps/store/src/__tests__/fnbStorefront.contract.test.js apps/store/src/__tests__/normalizeStorefrontPageModel.test.js apps/store/src/__tests__/modePresentationRegistry.test.js apps/store/src/__tests__/servicesStorefrontViewModel.test.js
```

Then from repo root:

```powershell
cd C:\xampp\htdocs\SKU-Inventory-Manager
git diff --check
cmd /c npm --prefix frontend run build:store
(Get-Content frontend/apps/store/src/StorefrontApp.jsx).Count
```

Manual QA should cover the affected route after build passes.

## Latest Validation Snapshot

Latest known validation after the most recent F&B cart drawer surface extraction:

- Targeted Vitest: passed, 5 files, 44 tests.
- `git diff --check`: passed, only CRLF warnings.
- `npm --prefix frontend run build:store`: passed, only existing Browserslist and chunk-size warnings.
- `StorefrontApp.jsx`: `10,173` lines.

## Progress Log

```text
Date: 2026-07-22
Slice: Add max-lines lint guardrail + 3 bounded extractions (overlays, ServiceProductCard, follow/share hook).
Files changed:
- frontend/.eslintrc.json (max-lines warn @ 1500; StorefrontApp.jsx + tests exempted)
- frontend/apps/store/docs/refactor/STOREFRONT_FRONTEND_ARCHITECTURE_GUIDE.md (enforced-ceiling note; 500 target)
- frontend/apps/store/src/shared/components/storefront/StorefrontOrderSuccessOverlay.jsx (new)
- frontend/apps/store/src/shared/components/storefront/StorefrontPaymentUnavailableModal.jsx (new)
- frontend/apps/store/src/modes/services/storefront/components/ServiceProductCard.jsx (new)
- frontend/apps/store/src/shared/hooks/useStorefrontShareActions.js (new)
- frontend/apps/store/src/StorefrontApp.jsx
StorefrontApp.jsx line count: 9,221 (from 9,388)
Validation:
- Scoped ESLint: 0 errors on all touched/new files (existing StorefrontApp warning debt remains).
- Targeted tests: discoveryMapLayers, storefrontStoresMapSource.contract, discoveryPresentation,
  discoverySearchRanking, businessModePins, DgfyCustomerAccountPage.dashboard, fnbStorefront.contract —
  7 files, 50 tests passed.
- npx vite build --config apps/store/vite.config.js: passed (only existing Browserslist/chunk-size warnings).
Manual QA:
- Not performed in this environment (headless, no WebGL); browser click-through QA recommended before merge.
Notes / next step:
- Maps/discovery internals NOT touched (no raw map code remained inline; only prop wiring). develop's map behavior unchanged.
- Behavior preserved: overlays, services product card, follow/share all moved verbatim.
- Next safe slices (deferred, need browser QA): DGFY session bootstrap effect -> customer-dashboard/hooks;
  services booking render assembly -> modes/services/booking; central cart ops (addToCart/updateQty) as isolated slices.
```
```text
Date: 2026-07-20
Slice: Move shared cart fly-animation overlay into a shared component.
Files changed:
- frontend/apps/store/src/StorefrontApp.jsx
- frontend/apps/store/src/shared/components/StorefrontCartFlyAnimations.jsx
- frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_PROGRESS_REPORT.md
StorefrontApp.jsx line count: 9,699
Validation:
- Pre-slice route probe: passed on http://10.123.35.127:5176/tenant-store/kusina-caf-e36b28; HTTP 200 and React root present.
- Scoped ESLint: passed with 0 errors for StorefrontApp.jsx and StorefrontCartFlyAnimations.jsx. Existing StorefrontApp.jsx warning debt remains.
- Targeted tests: fnbStorefront.contract.test.js, guestCheckoutOtp.contract.test.js, and serviceBookingMultiplicity.contract.test.js passed, 19 tests.
- git diff --check: passed for affected files, with existing CRLF warning.
- cmd /c npm --prefix frontend run build:store: passed, only existing Browserslist and chunk-size warnings.
- Post-slice route probe: passed on http://10.123.35.127:5176/tenant-store/kusina-caf-e36b28; HTTP 200 and React root present.
Manual QA:
- Route probe only; no click-through add-to-cart animation QA in this slice.
Notes / next step:
- This moved the shared F&B/Services cart fly-animation JSX and keyframes out of StorefrontApp.jsx.
- UI, cart behavior, F&B checkout, Discovery, customer dashboard, promo, tracking, Simple mode, Services booking behavior, and backend contracts were unchanged.
- Continue only after another live console gate. The next safe slice should inspect remaining small shared cart/floating-action UI blocks before editing.
```
```text
Date: 2026-07-20
Slice: Move Services cart drawer prop assembly into a Services-owned hook.
Files changed:
- frontend/apps/store/src/StorefrontApp.jsx
- frontend/apps/store/src/modes/services/booking/hooks/useServiceCartDrawerProps.js
- frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_PROGRESS_REPORT.md
StorefrontApp.jsx line count: 9,747
Validation:
- Pre-slice route probe: passed on http://10.123.35.127:5176/tenant-store/kusina-caf-e36b28; HTTP 200 and React root present.
- Scoped ESLint: passed with 0 errors for StorefrontApp.jsx, useServiceCartDrawerProps.js, and ServiceCartDrawer.jsx. Existing StorefrontApp.jsx warning debt remains.
- Targeted tests: fnbStorefront.contract.test.js, guestCheckoutOtp.contract.test.js, and serviceBookingMultiplicity.contract.test.js passed, 19 tests.
- git diff --check: passed for affected files, with existing CRLF warning.
- cmd /c npm --prefix frontend run build:store: passed, only existing Browserslist and chunk-size warnings.
- Post-slice route probe: passed on http://10.123.35.127:5176/tenant-store/kusina-caf-e36b28; HTTP 200 and React root present.
Manual QA:
- Route probe only; no click-through Services cart drawer QA in this slice.
Notes / next step:
- This moved Services cart drawer prop wiring out of StorefrontApp.jsx while preserving the existing ServiceCartDrawer component and behavior.
- UI, F&B checkout, Discovery, customer dashboard, promo, tracking, Simple mode, Services booking behavior, and backend contracts were unchanged.
- Continue only after another live console gate. The next safe slice should inspect Services booking route-mount metadata or cart animation ownership before editing.
```
```text
Date: 2026-07-20
Slice: Move Services booking cart validation into a Services-owned model helper.
Files changed:
- frontend/apps/store/src/StorefrontApp.jsx
- frontend/apps/store/src/modes/services/booking/model/serviceBookingValidation.js
- frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_PROGRESS_REPORT.md
StorefrontApp.jsx line count: 9,745
Validation:
- Pre-slice live render/console gate: passed on http://10.123.35.127:5176/tenant-store/kusina-caf-e36b28; React root rendered, body was non-empty, and no runtime error text appeared.
- Scoped ESLint: passed with 0 errors for StorefrontApp.jsx, useServiceBookingFieldFocus.js, and serviceBookingValidation.js. Existing StorefrontApp.jsx warning debt remains.
- Targeted tests: fnbStorefront.contract.test.js, guestCheckoutOtp.contract.test.js, and serviceBookingMultiplicity.contract.test.js passed, 19 tests.
- git diff --check: passed for affected files, with existing CRLF warning.
- cmd /c npm --prefix frontend run build:store: passed, only existing Browserslist and chunk-size warnings.
- Post-slice route probe: passed on http://10.123.35.127:5176/tenant-store/kusina-caf-e36b28; HTTP 200 and React root present.
Manual QA:
- Route probe only; no click-through Services booking QA in this slice.
Notes / next step:
- This moved missing schedule, required intake field, and Services runtime compatibility validation out of StorefrontApp.jsx.
- UI, Services booking flow, F&B checkout, Discovery, customer dashboard, promo, tracking, Simple mode, and backend contracts were unchanged.
- Continue only after another live console gate. The next safe slice should inspect a small Services booking drawer frame or route-mount block before editing.
```
```text
Date: 2026-07-20
Slice: Move Services booking field-focus behavior into a Services-owned hook.
Files changed:
- frontend/apps/store/src/StorefrontApp.jsx
- frontend/apps/store/src/modes/services/booking/hooks/useServiceBookingFieldFocus.js
- frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_PROGRESS_REPORT.md
StorefrontApp.jsx line count: 9,775
Validation:
- Pre-slice live render/console gate: passed on http://10.123.35.127:5176/tenant-store/kusina-caf-e36b28; React root rendered, body was non-empty, and no runtime error text appeared.
- Scoped ESLint: passed with 0 errors for StorefrontApp.jsx and the new Services booking focus hook. Existing StorefrontApp.jsx warning debt remains.
- Targeted tests: fnbStorefront.contract.test.js and guestCheckoutOtp.contract.test.js passed, 14 tests.
- git diff --check: passed for affected files, with existing CRLF warning.
- cmd /c npm --prefix frontend run build:store: passed, only existing Browserslist and chunk-size warnings.
- Post-slice rendered route check: passed on http://10.123.35.127:5176/tenant-store/kusina-caf-e36b28; React root rendered, body was non-empty, and no runtime error text appeared.
Manual QA:
- Browser render/console gate only; no click-through Services booking QA in this slice.
Notes / next step:
- This moved the preferred-date input picker, booking field ref registry, jump-to-field behavior, and pending field focus effect out of StorefrontApp.jsx.
- UI, Services booking fields, F&B checkout, Discovery, customer dashboard, promo, tracking, Simple mode, and backend contracts were unchanged.
- Continue only after another live console gate. The next safe slice should inspect a small Services booking step metadata, drawer frame, or remaining Services booking mount block before editing.
```

```text
Date: 2026-07-20
Slice: Move Services booking summary derivation into a Services-owned model helper.
Files changed:
- frontend/apps/store/src/StorefrontApp.jsx
- frontend/apps/store/src/modes/services/booking/model/serviceBookingSummary.js
- frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_PROGRESS_REPORT.md
StorefrontApp.jsx line count: 9,811
Validation:
- Pre-slice live render/console gate: passed on http://10.123.35.127:5176/tenant-store/kusina-caf-e36b28; React root rendered, body was non-empty, and no runtime error text appeared.
- Scoped ESLint: passed with 0 errors for StorefrontApp.jsx and the new Services booking summary model. Existing StorefrontApp.jsx warning debt remains.
- Targeted tests: fnbStorefront.contract.test.js and guestCheckoutOtp.contract.test.js passed, 14 tests.
- git diff --check: passed for affected files, with existing CRLF warning.
- cmd /c npm --prefix frontend run build:store: passed, only existing Browserslist and chunk-size warnings.
- Post-slice rendered route check: passed on http://10.123.35.127:5176/tenant-store/kusina-caf-e36b28; React root rendered, body was non-empty, and no runtime error text appeared.
Manual QA:
- Browser render/console gate only; no click-through Services booking QA in this slice.
Notes / next step:
- This moved pure Services booking review rows, summary rows, summary line items, title, schedule, quantity, and amount derivation out of the root shell.
- UI, Services booking flow, F&B checkout, Discovery, customer dashboard, promo, tracking, Simple mode, and backend contracts were unchanged.
- Continue only after another live console gate. The next safe slice should inspect either the remaining Services booking mount block or a small shared drawer/frame block before editing.
```

```text
Date: 2026-07-20
Slice: Move generic storefront closed notice view into shared/components.
Files changed:
- frontend/apps/store/src/StorefrontApp.jsx
- frontend/apps/store/src/shared/components/StorefrontClosedNotice.jsx
- frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_IMPLEMENTATION_GOAL.md
- frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_PROGRESS_REPORT.md
StorefrontApp.jsx line count: 10,105
Validation:
- Scoped ESLint: passed with 0 errors and existing StorefrontApp warning debt only.
- git diff --check: passed for affected files.
- build:store: passed, only existing Browserslist and chunk-size warnings.
- Live render/console gate: passed on http://10.123.35.127:5176/tenant-store; React root rendered, body was non-empty, no runtime error text appeared, and no console warn/error logs were captured.
Manual QA:
- Browser render/console gate only; no click-through QA in this slice.
Notes / next step:
- This moved only a generic cross-mode closed-store notice view. Store hours/body calculation remains unchanged.
- No checkout, tracking, map, Services, Simple, F&B order, or backend behavior was changed.
- Continue only after another live console gate. The next safe slice should pick one shell-owned feature boundary from F&B checkout, F&B tracking, Discovery runtime, or another generic shared view.
```

```text
Date: 2026-07-18
Slice: Move F&B cart drawer overlay/header/frame into FnbCartDrawerSurface.
Files changed:
- frontend/apps/store/src/StorefrontApp.jsx
- frontend/apps/store/src/modes/fnb/checkout/pages/FnbCartDrawerSurface.jsx
- frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_PROGRESS_REPORT.md
StorefrontApp.jsx line count: 10,173
Validation:
- Targeted tests: passed, 5 files, 44 tests.
- git diff --check: passed, only CRLF warnings.
- build:store: passed, only existing Browserslist and chunk-size warnings.
Manual QA:
- Not run in this slice.
Notes / next step:
- This moves F&B cart drawer presentation ownership into the F&B checkout boundary, but shell line count increased because the shared legacy drawer frame remains for checkout, Services, and Simple paths. Next shrink slice should extract the remaining shared drawer frame into a small shared route-frame component or move more F&B checkout body ownership out of the inline frame.
```

```text
Date: 2026-07-18
Slice: Move F&B cart drawer route prop assembly into useFnbCartDrawerRouteProps.
Files changed:
- frontend/apps/store/src/StorefrontApp.jsx
- frontend/apps/store/src/modes/fnb/checkout/hooks/useFnbCartDrawerRouteProps.js
- frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_PROGRESS_REPORT.md
StorefrontApp.jsx line count: 10,164
Validation:
- Targeted tests: passed, 5 files, 44 tests.
- git diff --check: passed, only CRLF warnings.
- build:store: passed, only existing Browserslist and chunk-size warnings.
Manual QA:
- Not run in this slice.
Notes / next step:
- This slice moved F&B cart route prop ownership but did not shrink the shell yet because root cart state is still root-owned. Continue by moving the F&B cart drawer frame/body route ownership into modes/fnb/checkout.
```

```text
Date: 2026-07-18
Slice: Move F&B product-detail route prop assembly into useFnbProductDetailsRouteProps.
Files changed:
- frontend/apps/store/src/StorefrontApp.jsx
- frontend/apps/store/src/modes/fnb/storefront/hooks/useFnbProductDetailsRouteProps.js
- frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_PROGRESS_REPORT.md
StorefrontApp.jsx line count: 10,160
Validation:
- Targeted tests: passed, 5 files, 44 tests.
- git diff --check: passed, only CRLF warnings.
- build:store: passed, only existing Browserslist and chunk-size warnings.
Manual QA:
- Not run in this slice.
Notes / next step:
- Continue by moving F&B cart drawer route ownership into modes/fnb/checkout while preserving current cart drawer behavior.
```

```text
Date: 2026-07-18
Slice: Move F&B product-detail review route props into useFnbProductDetailsReviewProps.
Files changed:
- frontend/apps/store/src/StorefrontApp.jsx
- frontend/apps/store/src/modes/fnb/storefront/hooks/useFnbProductDetailsReviewProps.js
- frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_PROGRESS_REPORT.md
StorefrontApp.jsx line count: 10,166
Validation:
- Targeted tests: passed, 5 files, 44 tests.
- git diff --check: passed, only CRLF warnings.
- build:store: passed, only existing Browserslist and chunk-size warnings.
Manual QA:
- Not run in this slice.
Notes / next step:
- Continue by moving the remaining F&B product-detail route prop assembly into a route view-model or container while keeping Simple compatibility intact.
```

```text
Date: 2026-07-18
Slice: Move F&B product-detail add-to-cart, buy-now, quick-add, and price action props into useFnbProductDetailActions.
Files changed:
- frontend/apps/store/src/StorefrontApp.jsx
- frontend/apps/store/src/modes/fnb/storefront/hooks/useFnbProductDetailActions.js
- frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_PROGRESS_REPORT.md
StorefrontApp.jsx line count: 10,169
Validation:
- Targeted tests: passed, 5 files, 44 tests.
- git diff --check: passed, only CRLF warnings.
- build:store: passed, only existing Browserslist and chunk-size warnings.
Manual QA:
- Not run in this slice.
Notes / next step:
- Continue by moving remaining F&B detail route prop assembly into a route view-model.
```

```text
Date: 2026-07-18
Slice: Move F&B item review submit/reset handling into useFnbItemReviewRuntime.
Files changed:
- frontend/apps/store/src/StorefrontApp.jsx
- frontend/apps/store/src/modes/fnb/storefront/hooks/useFnbItemReviewRuntime.js
- frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_PROGRESS_REPORT.md
StorefrontApp.jsx line count: 10,170
Validation:
- Targeted tests: passed, 5 files, 44 tests.
- git diff --check: passed, only CRLF warnings.
- build:store: passed, only existing Browserslist and chunk-size warnings.
Manual QA:
- Not run in this slice.
Notes / next step:
- Continue with F&B detail page action-handler extraction.
```

## Progress Log Template

Copy this section after each new slice:

```text
Date: 2026-07-18
Slice: Extract shared checkout drawer frame wrapper into StorefrontCheckoutDrawerFrame.
Files changed:
- frontend/apps/store/src/StorefrontApp.jsx
- frontend/apps/store/src/shared/components/StorefrontCheckoutDrawerFrame.jsx
- frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_PROGRESS_REPORT.md
StorefrontApp.jsx line count: 10,111
Validation:
- Scoped ESLint: passed with 0 errors and existing warnings only.
- git diff --check: passed.
- build:store: passed, only existing Browserslist and chunk-size warnings.
- Live console gate: passed on http://192.168.1.42:5176/tenant-store with React root rendered and no warn/error logs.
Manual QA:
- Browser runtime check only; no click-through QA in this slice.
Notes / next step:
- Existing ownership folders were checked first to avoid duplicate modules.
- The shared drawer frame is now under shared/components because it is used across F&B, Services, and Simple checkout surfaces.
- Continue with a smaller checkout/body ownership extraction only after another clean console gate.
```

```text
Date:
Slice:
Files changed:
StorefrontApp.jsx line count:
Validation:
- Targeted tests:
- git diff --check:
- build:store:
Manual QA:
Notes / next step:
```

## 2026-07-18 - Services Booking Component Ownership Move

Slice: Move Services booking UI components from the root `services/components` folder into `modes/services/booking/components`.

Files changed:
- `frontend/apps/store/src/StorefrontApp.jsx`
- `frontend/apps/store/src/modes/services/booking/components/ServiceBookingConfirmation.jsx`
- `frontend/apps/store/src/modes/services/booking/components/ServiceBookingEmptyState.jsx`
- `frontend/apps/store/src/modes/services/booking/components/ServiceBookingLocationSection.jsx`
- `frontend/apps/store/src/modes/services/booking/components/ServiceBookingSelectedServiceCard.jsx`
- `frontend/apps/store/src/modes/services/booking/components/ServiceBookingStepCards.jsx`
- `frontend/apps/store/src/modes/services/booking/components/ServiceBookingSteps.jsx`
- `frontend/apps/store/src/modes/services/booking/components/ServiceBookingSummaryCard.jsx`
- `frontend/apps/store/src/modes/services/booking/components/ServiceCartDrawer.jsx`
- `frontend/apps/store/src/__tests__/storefrontClosedHoursMessaging.contract.test.js`
- `frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_PROGRESS_REPORT.md`

StorefrontApp.jsx line count: 10,111

Validation:
- Scoped ESLint: passed with 0 errors and existing warnings only.
- `storefrontClosedHoursMessaging.contract.test.js`: passed, 3 tests.
- `git diff --check`: passed for affected files.
- `npm --prefix frontend run build:store`: passed, only existing Browserslist and chunk-size warnings.
- Live render gate: passed on `http://192.168.1.42:5176/tenant-store`; React root rendered, body was non-empty, and no runtime error text appeared.

Notes / next step:
- Existing folders were checked first to avoid duplicate Services ownership folders.
- `frontend/apps/store/src/services/components` was empty after the move and was removed.
- Root `services/` now keeps shared service request/contract modules only.
- Continue with another small ownership slice only after a fresh live console/render gate.

## 2026-07-20 - Shared Storefront Hero And Section Ownership Move

Slice: Move cross-mode storefront hero and section components from legacy `Components/storefront` into `shared/components/storefront`.

Files changed:
- `frontend/apps/store/src/StorefrontApp.jsx`
- `frontend/apps/store/src/shared/components/storefront/hero/StorefrontHeaderNav.jsx`
- `frontend/apps/store/src/shared/components/storefront/hero/StorefrontHeroNameCluster.jsx`
- `frontend/apps/store/src/shared/components/storefront/hero/StorefrontShareQr.jsx`
- `frontend/apps/store/src/shared/components/storefront/sections/StorefrontFooterSection.jsx`
- `frontend/apps/store/src/shared/components/storefront/sections/StorefrontPromoSection.jsx`
- `frontend/apps/store/src/shared/components/storefront/sections/StorefrontReviewsSection.jsx`
- `frontend/apps/store/src/__tests__/StorefrontHeaderNav.test.jsx`

StorefrontApp.jsx line count: 9,893

Validation:
- Scoped ESLint: passed with 0 errors. Babel still reports the existing large-file deoptimization warning for `StorefrontApp.jsx`.
- `StorefrontHeaderNav.test.jsx`: passed, 2 tests.
- `git diff --check`: passed for affected files.
- `npm --prefix frontend run build:store`: passed, only existing Browserslist and chunk-size warnings.
- Live render/console gate: passed on `http://10.123.35.127:5176/tenant-store`; React root rendered, body was non-empty, no runtime error text appeared, and no console warn/error logs were captured.

Notes / next step:
- Existing ownership folders were checked first to avoid duplicate modules.
- `SolutionsPage.jsx` is treated as Discovery/public marketing surface work and was not moved in this slice.
- `http://192.168.1.42:5176/tenant-store` was unreachable from this environment during validation, so the live gate used the reachable `10.123.35.127:5176` preview.
- Continue only after another live console gate. The next safe slice should target legacy `Components/storefront/pages` ownership or root utility relocation, not rework already-owned F&B, Services, or Simple mode folders.

## 2026-07-20 - Customer Dashboard Auth Modal Ownership Move

Slice: Move `DgfyCustomerAuthModal` from legacy `Components/storefront/pages` into the `customer-dashboard/components` boundary.

Files changed:
- `frontend/apps/store/src/customer-dashboard/components/DgfyCustomerAuthModal.jsx`
- `frontend/apps/store/src/customer-dashboard/pages/CustomerDashboardRouteHost.jsx`
- `frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_PROGRESS_REPORT.md`

StorefrontApp.jsx line count: 9,893

Validation:
- Pre-slice live render/console gate: passed on `http://10.123.35.127:5176/tenant-store`; React root rendered, body was non-empty, and no console warn/error logs were captured.
- Stale reference scan: passed; `DgfyCustomerAuthModal` is now referenced only from `customer-dashboard`.
- Scoped ESLint: passed with 0 errors for the moved modal and route host.
- `DgfyCustomerAccountPage.dashboard.test.jsx`: passed, 7 tests.
- `git diff --check`: passed for affected files.
- `npm --prefix frontend run build:store`: passed, only existing Browserslist and chunk-size warnings.
- Post-slice live render/console gate: passed on `http://10.123.35.127:5176/tenant-store`; React root rendered, body was non-empty, no runtime error text appeared, and no console warn/error logs were captured.

Notes / next step:
- This was a customer-dashboard-only ownership move.
- No Services, Simple, F&B checkout, or Discovery behavior was changed in this slice.
- Continue only after another live console gate. The next safe slice should inspect the remaining legacy `Components/storefront/pages` files and choose one bounded owner: Discovery for `SolutionsPage`, F&B for any remaining product-detail legacy, or Customer Dashboard for account legacy.

## 2026-07-20 - Discovery Solutions Page Ownership Move

Slice: Move `SolutionsPage` from legacy `Components/storefront/pages` into the Discovery page boundary.

Files changed:
- `frontend/apps/store/src/discovery/pages/SolutionsPage.jsx`
- `frontend/apps/store/src/discovery/pages/DiscoveryHomePage.jsx`
- `frontend/apps/store/src/__tests__/fnbStorefront.contract.test.js`
- `frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_IMPLEMENTATION_GOAL.md`
- `frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_PROGRESS_REPORT.md`

StorefrontApp.jsx line count: 9,893

Validation:
- Stale reference scan: passed; no source references the old `Components/storefront/pages/SolutionsPage.jsx` path.
- Scoped ESLint: passed with 0 errors. Existing warnings remain in `SolutionsPage.jsx` hook dependency and `fnbStorefront.contract.test.js` unused source helper.
- `fnbStorefront.contract.test.js`: passed, 12 tests.
- `git diff --check`: passed for affected files.
- `cmd /c npm --prefix frontend run build:store`: passed, only existing Browserslist and chunk-size warnings.
- Live render/console gate: passed on `http://10.123.35.127:5176/tenant-store`; React root rendered, body was non-empty, no runtime error text appeared, and no console warn/error logs were captured.

Notes / next step:
- This was a Discovery-only ownership move.
- No F&B checkout/tracking, Customer Dashboard, Services, Simple, or backend behavior was changed.
- Continue only after another live console gate. The next safe slice should inspect the remaining legacy `Components/storefront/pages` and `Components/storefront/account` files before moving account page compatibility or F&B product-detail legacy ownership.

## 2026-07-20 - Customer Dashboard Legacy Page Cleanup

Slice: Retire legacy customer-dashboard page/account files from `Components/storefront` after confirming the active dashboard is owned by `customer-dashboard`.

Files changed:
- `frontend/apps/store/src/__tests__/DgfyCustomerAccountPage.dashboard.test.jsx`
- `frontend/apps/store/src/customer-dashboard/components/CustomerDashboardShell.jsx`
- `frontend/apps/store/src/Components/storefront/pages/DgfyCustomerAccountPage.jsx`
- `frontend/apps/store/src/Components/storefront/account/DgfyCustomerAccountSections.jsx`
- `frontend/apps/store/src/Components/storefront/account/DgfyCustomerAccountUi.jsx`
- `frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_PROGRESS_REPORT.md`

StorefrontApp.jsx line count: 9,893

Validation:
- Pre-slice live render/console gate: passed on `http://10.123.35.127:5176/tenant-store`; React root rendered, body was non-empty, and no console warn/error logs were captured.
- Stale reference scan: passed; no source or test imports the old customer-dashboard paths under `Components/storefront`.
- Scoped ESLint: passed with 0 errors for the customer-dashboard page, shell, and dashboard test.
- `DgfyCustomerAccountPage.dashboard.test.jsx`: passed, 7 tests.
- `git diff --check`: passed for affected files.
- `cmd /c npm --prefix frontend run build:store`: passed, only existing Browserslist and chunk-size warnings.
- Post-slice live render/console gate: passed on `http://10.123.35.127:5176/tenant-store`; React root rendered, body was non-empty, no runtime error text appeared, and no console warn/error logs were captured.

Notes / next step:
- This was a customer-dashboard ownership cleanup and did not alter active dashboard UI flow.
- The owned dashboard shell now carries the dashboard test id, preserving the presentation contract in the correct feature boundary.
- Only `frontend/apps/store/src/Components/storefront/pages/FnbProductDetailsPage.jsx` remains in the legacy storefront page folder.
- Continue only after another live console gate. The next safe slice should compare the legacy F&B product-detail page against `modes/fnb/storefront/pages/FnbProductDetailsPage.jsx` and delete the legacy duplicate only if no runtime or test references remain.

## 2026-07-20 - F&B Product Detail Legacy Page Cleanup

Slice: Delete the unreferenced legacy F&B product-detail page from `Components/storefront/pages` after confirming the active route uses the mode-owned page.

Files changed:
- `frontend/apps/store/src/Components/storefront/pages/FnbProductDetailsPage.jsx`
- `frontend/apps/store/src/__tests__/fnbStorefront.contract.test.js`
- `frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_PROGRESS_REPORT.md`

StorefrontApp.jsx line count: 9,893

Validation:
- Pre-slice live render/console gate: passed on `http://10.123.35.127:5176/tenant-store`; React root rendered, body was non-empty, and no console warn/error logs were captured.
- Reference scan: passed; no active source or test imports `Components/storefront/pages/FnbProductDetailsPage.jsx`.
- Active route ownership confirmed: `modes/fnb/storefront/pages/FnbProductDetailsRoute.jsx` imports `modes/fnb/storefront/pages/FnbProductDetailsPage.jsx`.
- Scoped ESLint: passed with 0 errors for the active F&B product-detail route/page and contract test.
- Targeted F&B tests: `fnbStorefront.contract.test.js` and `fnbStorefrontViewModel.test.js` passed, 14 tests.
- `git diff --check`: passed for affected files.
- `cmd /c npm --prefix frontend run build:store`: passed, only existing Browserslist and chunk-size warnings.
- Post-slice live render/console gate: passed on `http://10.123.35.127:5176/tenant-store/kusina-caf-e36b28`; React root rendered, body was non-empty, no runtime error text appeared, and no console warn/error logs were captured.

Notes / next step:
- The legacy `Components/storefront` tree no longer has active source files.
- No F&B product-detail behavior was changed; this removed only an unreferenced duplicate.
- Continue only after another live console gate. The next safe slice should inspect remaining root-level storefront shared helpers such as `businessModePins.js`, `storefrontMode.js`, `storefrontRoutes.js`, `storefrontUrl.js`, and `storefrontUser.js` and move only one clearly-owned helper group into `app`, `shared`, or `discovery`.

## 2026-07-20 - F&B Checkout Promo Renderer Ownership

Slice: Move F&B checkout promo renderer wiring from `StorefrontApp.jsx` into `modes/fnb/checkout/hooks/useFnbCheckoutPromoRenderers.jsx`.

Files changed:
- `frontend/apps/store/src/StorefrontApp.jsx`
- `frontend/apps/store/src/modes/fnb/checkout/hooks/useFnbCheckoutPromoRenderers.jsx`
- `frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_PROGRESS_REPORT.md`
- `frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_IMPLEMENTATION_GOAL.md`

StorefrontApp.jsx line count: 10,078

Validation:
- Pre-slice live render/console gate: passed on `http://10.123.35.127:5176/tenant-store`; React root rendered, body was non-empty, and no console warn/error logs were captured.
- Scoped ESLint: passed with 0 errors. Existing `StorefrontApp.jsx` warning debt remains.
- Targeted tests: `PromoCodePanel.test.jsx` and `fnbStorefront.contract.test.js` passed, 17 tests.
- `git diff --check`: passed for affected files.
- `cmd /c npm --prefix frontend run build:store`: passed, only existing Browserslist and chunk-size warnings.
- Rendered route check: passed on `http://10.123.35.127:5176/tenant-store/kusina-caf-e36b28`; React root rendered, body was non-empty, and no runtime error text appeared. Console included external resource/auth warnings unrelated to this renderer extraction.

Manual QA:
- Browser render/console gate only; no click-through QA in this slice.

Notes / next step:
- This moved only F&B promo panel renderer ownership. Promo calculation, quote/checkout contracts, and modal behavior were not changed.
- `PromoCodePanel` itself still lives in the legacy checkout component folder and can be moved in a later focused checkout-component slice if no shared consumers require it there.
- Continue only after another live console gate.

## 2026-07-20 - F&B Promo Component Ownership Move

Slice: Move `PromoCodePanel` from the old root checkout component folder into the F&B checkout component boundary.

Files changed:
- `frontend/apps/store/src/checkout/components/PromoCodePanel.jsx`
- `frontend/apps/store/src/modes/fnb/checkout/components/PromoCodePanel.jsx`
- `frontend/apps/store/src/modes/fnb/checkout/hooks/useFnbCheckoutPromoRenderers.jsx`
- `frontend/apps/store/src/__tests__/PromoCodePanel.test.jsx`
- `frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_PROGRESS_REPORT.md`

StorefrontApp.jsx line count: 10,078

Validation:
- Pre-slice live render/console gate: passed on `http://10.123.35.127:5176/tenant-store`; React root rendered, body was non-empty, and no runtime error text appeared. Console had only external/resource/auth errors.
- Reference scan: passed; no source imports `checkout/components/PromoCodePanel.jsx`.
- Scoped ESLint: passed with 0 errors for the moved component, F&B promo renderer hook, and promo panel test.
- Targeted tests: `PromoCodePanel.test.jsx` and `fnbStorefront.contract.test.js` passed, 17 tests.
- `git diff --check`: passed for affected files.
- `cmd /c npm --prefix frontend run build:store`: passed, only existing Browserslist and chunk-size warnings.
- Post-slice rendered route check: passed on `http://10.123.35.127:5176/tenant-store/kusina-caf-e36b28`; React root rendered, body was non-empty, and no runtime error text appeared. Console included external resource/auth warnings unrelated to this ownership move.

Notes / next step:
- This was an F&B checkout ownership move only. UI, promo contract, quote, checkout, Services, Simple, and backend behavior were unchanged.
- The old root `checkout/components/PromoCodePanel.jsx` path is now retired.
- Continue only after another live console gate. The next safe slice should inspect the remaining root `checkout/components` primitives and decide whether each is truly shared or should move into a mode-owned checkout folder.

## 2026-07-20 - Shared Checkout Selectable Option Ownership Move

Slice: Move `SelectableOptionCard` from the old root checkout component folder into `shared/components/checkout` because it is used by both F&B checkout and the remaining Simple checkout flow.

Files changed:
- `frontend/apps/store/src/StorefrontApp.jsx`
- `frontend/apps/store/src/checkout/components/SelectableOptionCard.jsx`
- `frontend/apps/store/src/shared/components/checkout/SelectableOptionCard.jsx`
- `frontend/apps/store/src/modes/fnb/checkout/components/FnbCheckoutFulfillmentChoices.jsx`
- `frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_PROGRESS_REPORT.md`

StorefrontApp.jsx line count: 9,861

Validation:
- Pre-slice live render/console gate: passed on `http://10.123.35.127:5176/tenant-store`; React root rendered, body was non-empty, and no runtime error text appeared. Console had only external/resource/auth errors.
- Reference scan: passed; no source imports `checkout/components/SelectableOptionCard.jsx`.
- Scoped ESLint: passed with 0 errors. Existing `StorefrontApp.jsx` warning debt remains.
- Targeted tests: `fnbStorefront.contract.test.js` passed, 12 tests.
- `git diff --check`: passed for affected files.
- `cmd /c npm --prefix frontend run build:store`: passed, only existing Browserslist and chunk-size warnings.
- Post-slice rendered route check: passed on `http://10.123.35.127:5176/tenant-store/kusina-caf-e36b28`; React root rendered, body was non-empty, and no runtime error text appeared. Console included external resource/auth warnings and MapLibre null-coordinate warnings unrelated to this ownership move.

Notes / next step:
- This was a shared UI primitive move only. UI, F&B behavior, Simple behavior, Services behavior, and backend contracts were unchanged.
- The old root `checkout/components/SelectableOptionCard.jsx` path is now retired.
- Continue only after another live console gate. The next safe slice should classify the remaining root checkout components one at a time before moving them to either `shared/components/checkout`, `modes/fnb/checkout/components`, or `modes/simple/checkout/components`.

## 2026-07-20 - Shared Checkout Hero Header Ownership Move

Slice: Move `CheckoutHeroHeader` from the old root checkout component folder into `shared/components/checkout` because it is a pure checkout header used by F&B checkout and the remaining inline checkout route.

Files changed:
- `frontend/apps/store/src/StorefrontApp.jsx`
- `frontend/apps/store/src/checkout/components/CheckoutHeroHeader.jsx`
- `frontend/apps/store/src/shared/components/checkout/CheckoutHeroHeader.jsx`
- `frontend/apps/store/src/modes/fnb/checkout/components/FnbCheckoutJourneyHeader.jsx`
- `frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_PROGRESS_REPORT.md`

StorefrontApp.jsx line count: 9,861

Validation:
- Pre-slice live render/console gate: passed on `http://10.123.35.127:5176/tenant-store`; React root rendered, body was non-empty, and no runtime error text appeared. Console had only external/resource/auth errors.
- Reference scan: passed; no source imports `checkout/components/CheckoutHeroHeader.jsx`.
- Scoped ESLint: passed with 0 errors. Existing `StorefrontApp.jsx` warning debt remains.
- Targeted tests: `fnbStorefront.contract.test.js` passed, 12 tests.
- `git diff --check`: passed for affected files.
- `cmd /c npm --prefix frontend run build:store`: passed, only existing Browserslist and chunk-size warnings.
- Post-slice rendered route check: passed on `http://10.123.35.127:5176/tenant-store/kusina-caf-e36b28`; React root rendered, body was non-empty, and no runtime error text appeared. Console included external resource/auth warnings and MapLibre null-coordinate warnings unrelated to this ownership move.

Notes / next step:
- This was a shared UI primitive move only. UI, F&B behavior, Simple behavior, Services behavior, and backend contracts were unchanged.
- The old root `checkout/components/CheckoutHeroHeader.jsx` path is now retired.
- Continue only after another live console gate. The next safe slice should move `CheckoutStepProgressHeader` if its consumers still prove it is a shared checkout primitive.

## 2026-07-20 - Shared Checkout Step Progress Ownership Move

Slice: Move `CheckoutStepProgressHeader` from the old root checkout component folder into `shared/components/checkout` because it is a pure checkout progress UI primitive used by F&B checkout and the remaining inline checkout route.

Files changed:
- `frontend/apps/store/src/StorefrontApp.jsx`
- `frontend/apps/store/src/checkout/components/CheckoutStepProgressHeader.jsx`
- `frontend/apps/store/src/shared/components/checkout/CheckoutStepProgressHeader.jsx`
- `frontend/apps/store/src/modes/fnb/checkout/components/FnbCheckoutJourneyHeader.jsx`
- `frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_PROGRESS_REPORT.md`

StorefrontApp.jsx line count: 9,861

Validation:
- Pre-slice live render/console gate: passed on `http://10.123.35.127:5176/tenant-store`; React root rendered, body was non-empty, and no runtime error text appeared. Console had only external/resource/auth errors.
- Reference scan: passed; no source imports `checkout/components/CheckoutStepProgressHeader.jsx`.
- Scoped ESLint: passed with 0 errors. Existing `StorefrontApp.jsx` warning debt remains.
- Targeted tests: `fnbStorefront.contract.test.js` passed, 12 tests.
- `git diff --check`: passed for affected files.
- `cmd /c npm --prefix frontend run build:store`: passed, only existing Browserslist and chunk-size warnings.
- Post-slice rendered route check: passed on `http://10.123.35.127:5176/tenant-store/kusina-caf-e36b28`; React root rendered, body was non-empty, and no runtime error text appeared. Console included external resource/auth warnings and MapLibre null-coordinate warnings unrelated to this ownership move.

Notes / next step:
- This was a shared UI primitive move only. UI, F&B behavior, Simple behavior, Services behavior, and backend contracts were unchanged.
- The old root `checkout/components/CheckoutStepProgressHeader.jsx` path is now retired.
- Continue only after another live console gate. The next safe slice should inspect the remaining root checkout components and move one component only if its ownership is clear.

## 2026-07-20 - Shared Checkout Order Summary Ownership Move

Slice: Move `OrderSummaryCard` from the old root checkout component folder into `shared/components/checkout` because it is a display-only checkout summary UI primitive used by F&B checkout and the remaining inline checkout route.

Files changed:
- `frontend/apps/store/src/StorefrontApp.jsx`
- `frontend/apps/store/src/checkout/components/OrderSummaryCard.jsx`
- `frontend/apps/store/src/shared/components/checkout/OrderSummaryCard.jsx`
- `frontend/apps/store/src/modes/fnb/checkout/components/FnbCheckoutSummaryContent.jsx`
- `frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_PROGRESS_REPORT.md`

StorefrontApp.jsx line count: 9,861

Validation:
- Pre-slice live render/console gate: passed on `http://10.123.35.127:5176/tenant-store`; React root rendered, body was non-empty, and no runtime error text appeared. Console had only external/resource/auth errors.
- Reference scan: passed; no source imports `checkout/components/OrderSummaryCard.jsx`.
- Scoped ESLint: passed with 0 errors. Existing `StorefrontApp.jsx` warning debt remains.
- Targeted tests: `fnbStorefront.contract.test.js` passed, 12 tests.
- `git diff --check`: passed for affected files.
- `cmd /c npm --prefix frontend run build:store`: passed, only existing Browserslist and chunk-size warnings.
- Post-slice rendered route check: passed on `http://10.123.35.127:5176/tenant-store/kusina-caf-e36b28`; React root rendered, body was non-empty, and no runtime error text appeared. Console included external resource/auth warnings and MapLibre null-coordinate warnings unrelated to this ownership move.

Notes / next step:
- This was a shared UI primitive move only. UI, F&B behavior, Simple behavior, Services behavior, and backend contracts were unchanged.
- The old root `checkout/components/OrderSummaryCard.jsx` path is now retired.
- Continue only after another live console gate. The next safe slice should classify the remaining root checkout files again; `PaymentMethodSelectorBlock` is a likely shared UI primitive candidate, while identity/address components need more careful ownership review because they touch customer dashboard, Services booking, and F&B checkout.

## 2026-07-20 - Shared Checkout Payment Method Selector Ownership Move

Slice: Move `PaymentMethodSelectorBlock` from the old root checkout component folder into `shared/components/checkout` because it is a pure checkout payment method UI primitive used by the remaining inline checkout route.

Files changed:
- `frontend/apps/store/src/StorefrontApp.jsx`
- `frontend/apps/store/src/checkout/components/PaymentMethodSelectorBlock.jsx`
- `frontend/apps/store/src/shared/components/checkout/PaymentMethodSelectorBlock.jsx`
- `frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_PROGRESS_REPORT.md`

StorefrontApp.jsx line count: 9,861

Validation:
- Pre-slice live render/console gate: passed on `http://10.123.35.127:5176/tenant-store`; React root rendered, body was non-empty, and no runtime error text appeared. Console had only external/resource/auth errors.
- Reference scan: passed; no source imports `checkout/components/PaymentMethodSelectorBlock.jsx`.
- Scoped ESLint: passed with 0 errors. Existing `StorefrontApp.jsx` warning debt remains.
- Targeted tests: `fnbStorefront.contract.test.js` passed, 12 tests.
- `git diff --check`: passed for affected files.
- `cmd /c npm --prefix frontend run build:store`: passed, only existing Browserslist and chunk-size warnings.
- Post-slice rendered route check: passed on `http://10.123.35.127:5176/tenant-store/kusina-caf-e36b28`; React root rendered, body was non-empty, and no runtime error text appeared. Console included external resource/auth warnings and MapLibre null-coordinate warnings unrelated to this ownership move.

Notes / next step:
- This was a shared UI primitive move only. UI, F&B behavior, Simple behavior, Services behavior, and backend contracts were unchanged.
- The old root `checkout/components/PaymentMethodSelectorBlock.jsx` path is now retired.
- Continue only after another live console gate. The next safe slice should classify the remaining root checkout identity and saved-address components because they touch customer-dashboard, Services booking, and F&B checkout.

## 2026-07-20 - Shared Checkout Customer Identity Card Ownership Move

Slice: Move `CustomerIdentityCard` from the old root checkout component folder into `shared/components/checkout` because it is a pure identity display primitive used by checkout identity renderers and saved customer details presentation.

Files changed:
- `frontend/apps/store/src/checkout/components/CustomerIdentityCard.jsx`
- `frontend/apps/store/src/shared/components/checkout/CustomerIdentityCard.jsx`
- `frontend/apps/store/src/checkout/components/SavedCustomerDetailsPanel.jsx`
- `frontend/apps/store/src/features/checkout/renderers/customerIdentityRenderers.jsx`
- `frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_PROGRESS_REPORT.md`

StorefrontApp.jsx line count: 9,861

Validation:
- Pre-slice live render/console gate: passed on `http://10.123.35.127:5176/tenant-store`; React root rendered, body was non-empty, and no runtime error text appeared. Console had only external/resource/auth errors.
- Ownership scan: `CustomerIdentityCard` was display-only and imported only by checkout identity presentation code.
- Reference scan: passed; no source imports `checkout/components/CustomerIdentityCard.jsx`.
- Scoped ESLint: passed with 0 errors for the moved card and affected checkout identity imports.
- Targeted tests: `fnbStorefront.contract.test.js` and `guestCheckoutOtp.contract.test.js` passed, 14 tests.
- `git diff --check`: passed for affected files.
- `cmd /c npm --prefix frontend run build:store`: passed, only existing Browserslist and chunk-size warnings.
- Post-slice rendered route check: passed on `http://10.123.35.127:5176/tenant-store/kusina-caf-e36b28`; React root rendered, body was non-empty, and no runtime error text appeared. Console included external resource/auth warnings and MapLibre null-coordinate warnings unrelated to this ownership move.

Notes / next step:
- This was a shared UI primitive move only. UI, checkout logic, OTP, promo, Services, Simple, F&B behavior, and backend contracts were unchanged.
- The old root `checkout/components/CustomerIdentityCard.jsx` path is now retired.
- Continue only after another live console gate. `SavedCustomerDetailsPanel` is the next likely shared checkout identity presentation candidate, but `GuestIdentityForm` and `SavedAddressCard` need more careful ownership review because they are larger and touch broader checkout/address flows.

## 2026-07-20 - Shared Checkout Saved Customer Details Panel Ownership Move

Slice: Move `SavedCustomerDetailsPanel` from the old root checkout component folder into `shared/components/checkout` because it is checkout identity presentation used by shared checkout identity renderers.

Files changed:
- `frontend/apps/store/src/checkout/components/SavedCustomerDetailsPanel.jsx`
- `frontend/apps/store/src/shared/components/checkout/SavedCustomerDetailsPanel.jsx`
- `frontend/apps/store/src/features/checkout/renderers/customerIdentityRenderers.jsx`
- `frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_PROGRESS_REPORT.md`

StorefrontApp.jsx line count: 9,861

Validation:
- Pre-slice live render/console gate: passed on `http://10.123.35.127:5176/tenant-store`; React root rendered, body was non-empty, and no runtime error text appeared. Console had only external/resource/auth errors.
- Reference scan: passed; no source imports `checkout/components/SavedCustomerDetailsPanel.jsx`.
- Scoped ESLint: passed with 0 errors for the moved panel, shared identity card, and affected checkout identity renderer.
- Targeted tests: `fnbStorefront.contract.test.js` and `guestCheckoutOtp.contract.test.js` passed, 14 tests.
- `git diff --check`: passed for affected files.
- `cmd /c npm --prefix frontend run build:store`: passed, only existing Browserslist and chunk-size warnings.
- Post-slice rendered route check: passed on `http://10.123.35.127:5176/tenant-store/kusina-caf-e36b28`; React root rendered, body was non-empty, and no runtime error text appeared. Console included external resource/auth errors unrelated to this ownership move.

Notes / next step:
- This was a shared checkout identity presentation move only. UI, guest OTP behavior, F&B checkout logic, Services, Simple, promo, tracking, and backend contracts were unchanged.
- The old root `checkout/components/SavedCustomerDetailsPanel.jsx` path is now retired.
- Continue only after another live console gate. The remaining root checkout components are `GuestIdentityForm` and `SavedAddressCard`; both are larger and should be handled in separate slices after a careful ownership scan.

## 2026-07-20 - Checkout Feature Guest Identity Form Ownership Move

Slice: Move `GuestIdentityForm` from the old root checkout component folder into `features/checkout/components` because it owns checkout guest identity field presentation and is used by the checkout identity renderer. It is not a generic shared primitive because it includes the F&B guest layout variant.

Files changed:
- `frontend/apps/store/src/checkout/components/GuestIdentityForm.jsx`
- `frontend/apps/store/src/features/checkout/components/GuestIdentityForm.jsx`
- `frontend/apps/store/src/features/checkout/renderers/customerIdentityRenderers.jsx`
- `frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_PROGRESS_REPORT.md`

StorefrontApp.jsx line count: 9,861

Validation:
- Pre-slice live render/console gate: passed on `http://10.123.35.127:5176/tenant-store`; React root rendered, body was non-empty, and no runtime error text appeared. Console had only external/resource/auth errors.
- Ownership scan: `GuestIdentityForm` is checkout identity feature presentation, not a global shared primitive, because it carries guest identity form behavior and the F&B guest layout variant.
- Reference scan: passed; no source imports `checkout/components/GuestIdentityForm.jsx`.
- Scoped ESLint: passed with 0 errors for the moved form and affected checkout identity renderer.
- Targeted tests: `fnbStorefront.contract.test.js` and `guestCheckoutOtp.contract.test.js` passed, 14 tests.
- `git diff --check`: passed for affected files.
- `cmd /c npm --prefix frontend run build:store`: passed, only existing Browserslist and chunk-size warnings.
- Post-slice rendered route check: passed on `http://10.123.35.127:5176/tenant-store/kusina-caf-e36b28`; React root rendered, body was non-empty, and no runtime error text appeared. Console included external resource/auth warnings and MapLibre null-coordinate warnings unrelated to this ownership move.

Notes / next step:
- This was a checkout identity feature ownership move only. UI, guest OTP behavior, F&B checkout logic, Services, Simple, promo, tracking, and backend contracts were unchanged.
- The old root `checkout/components/GuestIdentityForm.jsx` path is now retired.
- Continue only after another live console gate. `SavedAddressCard` is the remaining active root checkout component and should move to shared checkout only after a careful consumer scan because it is used by customer-dashboard, F&B checkout, Services booking, and the remaining shell route.

## 2026-07-20 - Shared Checkout Saved Address Card Ownership Move

Slice: Move `SavedAddressCard` from the old root checkout component folder into `shared/components/checkout` because it is shared address presentation used by customer dashboard, F&B checkout, Services booking, and the remaining shell checkout route.

Files changed:
- `frontend/apps/store/src/StorefrontApp.jsx`
- `frontend/apps/store/src/checkout/components/SavedAddressCard.jsx`
- `frontend/apps/store/src/shared/components/checkout/SavedAddressCard.jsx`
- `frontend/apps/store/src/customer-dashboard/components/AddressesSection.jsx`
- `frontend/apps/store/src/modes/fnb/checkout/components/FnbCheckoutSavedAddressSelector.jsx`
- `frontend/apps/store/src/modes/services/booking/components/ServiceBookingLocationSection.jsx`
- `frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_PROGRESS_REPORT.md`

StorefrontApp.jsx line count: 9,861

Validation:
- Pre-slice live render/console gate: passed on `http://10.123.35.127:5176/tenant-store/kusina-caf-e36b28`; React root rendered, body was non-empty, and no runtime error text appeared. Console had only external/resource/auth warnings.
- Ownership scan: `SavedAddressCard` is shared checkout/address presentation because it is used by customer dashboard, F&B checkout, Services booking, and the remaining shell checkout route.
- Reference scan: passed; no source imports `checkout/components/SavedAddressCard.jsx`.
- Scoped ESLint: passed with 0 errors for the moved card and affected imports. Existing warnings remain in `ServiceBookingLocationSection.jsx` for unused values unrelated to this import-only move.
- Targeted tests: `fnbStorefront.contract.test.js` and `guestCheckoutOtp.contract.test.js` passed, 14 tests.
- `git diff --check`: passed for affected files.
- `cmd /c npm --prefix frontend run build:store`: passed, only existing Browserslist and chunk-size warnings.
- Post-slice rendered route check: passed on `http://10.123.35.127:5176/tenant-store/kusina-caf-e36b28`; React root rendered, body was non-empty, and no runtime error text appeared. Console included external resource/auth warnings and MapLibre null-coordinate warnings unrelated to this ownership move.

Notes / next step:
- This was a shared address UI ownership move only. Customer dashboard behavior, F&B saved-address behavior, Services booking behavior, Simple checkout, backend contracts, promo, OTP, and tracking were unchanged.
- The old root `checkout/components/SavedAddressCard.jsx` path is now retired.
- Continue only after another live console gate. The root checkout folder should now be reviewed for any remaining tracked or stale files; the next safe slice is likely `CheckoutSuccessAnimation` if it is still duplicated or incorrectly owned.

## 2026-07-20 - Checkout Success Animation Duplicate Cleanup

Slice: Remove the unused legacy `Components/CheckoutSuccessAnimation.jsx` duplicate because the active checkout-owned copy already lives in `features/checkout/components/CheckoutSuccessAnimation.jsx`.

Files changed:
- `frontend/apps/store/src/Components/CheckoutSuccessAnimation.jsx`
- `frontend/apps/store/src/features/checkout/components/CheckoutSuccessAnimation.jsx`
- `frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_PROGRESS_REPORT.md`

StorefrontApp.jsx line count: 9,861

Validation:
- Pre-slice live render/console gate: passed on `http://10.123.35.127:5176/tenant-store/kusina-caf-e36b28`; React root rendered after hydration, body was non-empty, and no runtime error text appeared. Console had only external/resource/auth warnings and MapLibre null-coordinate warnings.
- Reference scan: passed; no source imports the legacy `Components/CheckoutSuccessAnimation.jsx` file.
- Scoped ESLint: passed with 0 errors for the active checkout-owned `CheckoutSuccessAnimation.jsx`.
- Targeted tests: `fnbStorefront.contract.test.js` and `guestCheckoutOtp.contract.test.js` passed, 14 tests.
- `git diff --check`: passed for affected files.
- `cmd /c npm --prefix frontend run build:store`: passed, only existing Browserslist and chunk-size warnings.
- Post-slice rendered route check: passed on `http://10.123.35.127:5176/tenant-store/kusina-caf-e36b28`; React root rendered, body was non-empty, and no runtime error text appeared. Console included external resource/auth warnings and MapLibre null-coordinate warnings unrelated to this cleanup.

Notes / next step:
- This was dead-code cleanup only. UI, checkout success behavior, F&B checkout, Services, Simple, customer dashboard, backend contracts, promo, OTP, and tracking were unchanged.
- Continue only after another live console gate. The next highest-value refactor target is not another checkout primitive; inspect remaining large `StorefrontApp.jsx` inline route blocks and move one mode-owned page/section into the correct `modes/*` or `discovery/*` boundary.

## 2026-07-20 - Shared Storefront Follow Floating Action Extraction

Slice: Move the non-mode storefront follow floating action UI from `StorefrontApp.jsx` into a shared storefront component.

Files changed:
- `frontend/apps/store/src/StorefrontApp.jsx`
- `frontend/apps/store/src/shared/components/storefront/StorefrontFollowFloatingAction.jsx`
- `frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_PROGRESS_REPORT.md`

StorefrontApp.jsx line count: 9,888

Validation:
- Pre-slice route gate: passed on `http://10.123.35.127:5176/tenant-store/kusina-caf-e36b28`; response was HTTP 200.
- Scoped ESLint: passed with 0 errors for `StorefrontApp.jsx` and `StorefrontFollowFloatingAction.jsx`.
- Targeted tests: `fnbStorefront.contract.test.js`, `guestCheckoutOtp.contract.test.js`, and `serviceBookingMultiplicity.contract.test.js` passed, 19 tests.
- `git diff --check`: passed for affected files with the existing CRLF normalization warning on `StorefrontApp.jsx`.
- `cmd /c npm --prefix frontend run build:store`: passed, only existing Browserslist and chunk-size warnings.
- Post-build route gate: passed on `http://10.123.35.127:5176/tenant-store/kusina-caf-e36b28`; response was HTTP 200 and React root was present.

Notes / next step:
- This was a shared presentational UI extraction only. Follow state, follow API behavior, F&B, Services, Simple, customer dashboard, checkout, tracking, promo, and backend contracts were unchanged.
- `StorefrontApp.jsx` now mounts the shared follow action by passing only `enabled`, `followState`, viewport state, and the click handler.
- Continue only after another live console gate. The next safe slice should inspect the remaining simple floating cart block or another isolated presentational shell block before touching any checkout, tracking, map, or mode runtime state.

## 2026-07-20 - Simple Checkout Floating Cart Button Extraction

Slice: Move the Simple-mode floating product-cart button from `StorefrontApp.jsx` into `modes/simple/checkout/components`.

Files changed:
- `frontend/apps/store/src/StorefrontApp.jsx`
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCartFloatingButton.jsx`
- `frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_PROGRESS_REPORT.md`

StorefrontApp.jsx line count: 9,851

Validation:
- Pre-slice route gate: passed on `http://10.123.35.127:5176/tenant-store/kusina-caf-e36b28`; response was HTTP 200 and React root was present.
- Simple route gate: passed on `http://10.123.35.127:5176/tenant-store/bob-store-61fc74`; response was HTTP 200 and React root was present.
- Scoped ESLint: passed with 0 errors for `StorefrontApp.jsx` and `SimpleCartFloatingButton.jsx`.
- Targeted tests: `fnbStorefront.contract.test.js`, `guestCheckoutOtp.contract.test.js`, `serviceBookingMultiplicity.contract.test.js`, and `checkoutRules.test.js` passed, 24 tests.
- `git diff --check`: passed for affected files with the existing CRLF normalization warning on `StorefrontApp.jsx`.
- `cmd /c npm --prefix frontend run build:store`: passed, only existing Browserslist and chunk-size warnings.
- Post-build Simple route gate: passed on `http://10.123.35.127:5176/tenant-store/bob-store-61fc74`; response was HTTP 200 and React root was present.

Notes / next step:
- This was a Simple checkout-owned presentational extraction only. The Simple cart drawer body, quantity handlers, checkout navigation, F&B, Services, dashboard, tracking, promo, and backend contracts were unchanged.
- The remaining Simple cart drawer body is still inline in `StorefrontApp.jsx` and should move later as its own focused slice after a live console gate, because it carries more callbacks and cart-line behavior.
- Continue only after another live console gate. The next safe candidate is the Simple cart drawer surface body, but it should be moved as a dedicated `modes/simple/checkout` component with props rather than bundled with unrelated cart or cross-mode FAB behavior.

## 2026-07-20 - Simple Checkout Cart Drawer Surface Extraction

Slice: Move the Simple-mode product cart drawer surface from `StorefrontApp.jsx` into `modes/simple/checkout/components`.

Files changed:
- `frontend/apps/store/src/StorefrontApp.jsx`
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCartDrawerSurface.jsx`
- `frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_PROGRESS_REPORT.md`

StorefrontApp.jsx line count: 9,694

Validation:
- Pre-slice Simple route gate: passed on `http://10.123.35.127:5176/tenant-store/bob-store-61fc74`; response was HTTP 200 and React root was present.
- Scoped ESLint: passed with 0 errors for `StorefrontApp.jsx`, `SimpleCartFloatingButton.jsx`, and `SimpleCartDrawerSurface.jsx`.
- Targeted tests: `fnbStorefront.contract.test.js`, `guestCheckoutOtp.contract.test.js`, `serviceBookingMultiplicity.contract.test.js`, and `checkoutRules.test.js` passed, 24 tests.
- `git diff --check`: passed for affected files with the existing CRLF normalization warning on `StorefrontApp.jsx`.
- `cmd /c npm --prefix frontend run build:store`: passed, only existing Browserslist and chunk-size warnings.
- Post-build Simple route gate: passed on `http://10.123.35.127:5176/tenant-store/bob-store-61fc74`; response was HTTP 200 and React root was present.

Notes / next step:
- This was a Simple checkout-owned presentation extraction only. Existing cart state, image-error state, quantity handlers, remove handler, checkout navigation, and money formatting remain owned by the shell/runtime and are passed as props.
- The new drawer component is 203 lines, slightly above the preferred 200-line target but below the 300-line warning limit for view components. Do not add more behavior to it; split line item or footer subcomponents first if this drawer needs future changes.
- Continue only after another live console gate. The next safe Simple checkout slice should be a model/helper extraction for cart-line display data or a route-container hook, not more JSX added to `StorefrontApp.jsx`.

## 2026-07-20 - Simple Checkout Cart Drawer Props Hook Extraction

Slice: Move Simple cart drawer and floating-button prop/callback assembly from `StorefrontApp.jsx` into `modes/simple/checkout/hooks/useSimpleCartDrawerProps.js`.

Files changed:
- `frontend/apps/store/src/StorefrontApp.jsx`
- `frontend/apps/store/src/modes/simple/checkout/hooks/useSimpleCartDrawerProps.js`
- `frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_PROGRESS_REPORT.md`

StorefrontApp.jsx line count: 9,469

Validation:
- Pre-slice Simple route gate: passed on `http://10.123.35.127:5176/tenant-store/bob-store-61fc74`; response was HTTP 200 and React root was present.
- Scoped ESLint: passed with 0 errors for `StorefrontApp.jsx`, `SimpleCartFloatingButton.jsx`, `SimpleCartDrawerSurface.jsx`, and `useSimpleCartDrawerProps.js`.
- Targeted tests: `fnbStorefront.contract.test.js`, `guestCheckoutOtp.contract.test.js`, `serviceBookingMultiplicity.contract.test.js`, and `checkoutRules.test.js` passed, 24 tests.
- `git diff --check`: passed for affected files with the existing CRLF normalization warning.
- `cmd /c npm --prefix frontend run build:store`: passed, only existing Browserslist and chunk-size warnings.
- Post-build Simple route gate: passed on `http://10.123.35.127:5176/tenant-store/bob-store-61fc74`; response was HTTP 200 and React root was present.

Notes / next step:
- This was a Simple checkout view-model extraction only. It moved toggle/close/image-error callback assembly and props for the Simple cart button/drawer into Simple checkout ownership.
- Cart state, quantity updates, removal, checkout navigation, formatting, F&B, Services, customer dashboard, promo, tracking, and backend contracts are unchanged.
- Continue only after another live console gate. The next safe target should be model-level Simple cart-line display data or another isolated Simple checkout hook; do not add more Simple checkout logic to `StorefrontApp.jsx`.

## 2026-07-20 - Simple Checkout Cart Line Item Extraction

Slice: Move the repeated Simple cart line-card markup from `SimpleCartDrawerSurface.jsx` into a smaller Simple checkout-owned presentational component.

Files changed:
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCartDrawerSurface.jsx`
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCartLineItem.jsx`
- `frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_PROGRESS_REPORT.md`

StorefrontApp.jsx line count: 9,469

Component line counts:
- `SimpleCartDrawerSurface.jsx`: 146
- `SimpleCartLineItem.jsx`: 83

Validation:
- Scoped ESLint: passed with 0 errors for `StorefrontApp.jsx`, `SimpleCartFloatingButton.jsx`, `SimpleCartDrawerSurface.jsx`, `SimpleCartLineItem.jsx`, and `useSimpleCartDrawerProps.js`.
- Targeted tests: `fnbStorefront.contract.test.js`, `guestCheckoutOtp.contract.test.js`, `serviceBookingMultiplicity.contract.test.js`, and `checkoutRules.test.js` passed, 24 tests.
- `git diff --check`: passed for affected files with the existing CRLF normalization warning on `StorefrontApp.jsx`.
- `cmd /c npm --prefix frontend run build:store`: passed, only existing Browserslist and chunk-size warnings.
- Post-build Simple route gate: passed on `http://10.123.35.127:5176/tenant-store/bob-store-61fc74`; response was HTTP 200 and React root was present.

Notes / next step:
- This was a presentational split only. Quantity updates, removal, image fallback handling, checkout navigation, cart state, money formatting, and backend contracts are unchanged.
- The Simple drawer component now stays below the preferred 200-line component target from the architecture guide.
- Continue only after another console/route gate. The next safe refactor target should return to `StorefrontApp.jsx` ownership reduction: move another small mode-owned prop assembly hook or an isolated discovery/customer-dashboard shell block, not a broad multi-mode rewrite.

## 2026-07-20 - Simple Checkout Summary Card Extraction

Slice: Move duplicated Simple checkout order-summary aside markup from `StorefrontApp.jsx` into a Simple checkout-owned presentational card.

Files changed:
- `frontend/apps/store/src/StorefrontApp.jsx`
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCheckoutSummaryCard.jsx`
- `frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_PROGRESS_REPORT.md`

StorefrontApp.jsx line count: 9,468

Component line count:
- `SimpleCheckoutSummaryCard.jsx`: 34

Validation:
- Scoped ESLint: passed with 0 errors for `StorefrontApp.jsx`, `SimpleCheckoutSummaryCard.jsx`, `SimpleCartDrawerSurface.jsx`, `SimpleCartLineItem.jsx`, and `useSimpleCartDrawerProps.js`.
- Targeted tests: `fnbStorefront.contract.test.js`, `guestCheckoutOtp.contract.test.js`, `serviceBookingMultiplicity.contract.test.js`, and `checkoutRules.test.js` passed, 24 tests.
- `git diff --check`: passed for affected files with the existing CRLF normalization warning on `StorefrontApp.jsx`.
- `cmd /c npm --prefix frontend run build:store`: passed, only existing Browserslist and chunk-size warnings.
- Post-build Simple route gate: passed on `http://10.123.35.127:5176/tenant-store/bob-store-61fc74`; response was HTTP 200 and React root was present.

Notes / next step:
- This was a presentational extraction only. Simple checkout step state, quote/checkout handlers, promo row calculation, totals mapping, payment selection, and backend contracts are unchanged.
- The summary card receives precomputed rows and amount from the existing runtime, so it does not own pricing or promo logic.
- Continue only after another console/route gate. The next safe target should be a model/helper extraction for Simple order summary line rows or a focused route step component; avoid moving the delivery pin/map body together with unrelated checkout controls.

## 2026-07-20 - Simple Checkout Store Header Extraction

Slice: Move the Simple order-page store header from `StorefrontApp.jsx` into a Simple checkout-owned presentational component.

Files changed:
- `frontend/apps/store/src/StorefrontApp.jsx`
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCheckoutStoreHeader.jsx`
- `frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_PROGRESS_REPORT.md`

StorefrontApp.jsx line count: 9,452

Component line count:
- `SimpleCheckoutStoreHeader.jsx`: 36

Validation:
- Pre-slice Simple route gate: passed on `http://10.123.35.127:5176/tenant-store/bob-store-61fc74`; response was HTTP 200 and React root was present.
- Scoped ESLint: passed with 0 errors for `StorefrontApp.jsx`, `SimpleCheckoutStoreHeader.jsx`, `SimpleCheckoutSummaryCard.jsx`, `SimpleCartDrawerSurface.jsx`, and `SimpleCartLineItem.jsx`.
- Targeted tests: `fnbStorefront.contract.test.js`, `guestCheckoutOtp.contract.test.js`, `serviceBookingMultiplicity.contract.test.js`, and `checkoutRules.test.js` passed, 24 tests.
- `git diff --check`: passed for affected files with the existing CRLF normalization warning on `StorefrontApp.jsx`.
- `cmd /c npm --prefix frontend run build:store`: passed, only existing Browserslist and chunk-size warnings.
- Post-build Simple route gate: passed on `http://10.123.35.127:5176/tenant-store/bob-store-61fc74`; response was HTTP 200 and React root was present.

Notes / next step:
- This was a Simple checkout-owned presentational extraction only. Back navigation, image URL normalization, store name display, step state, checkout state, Services, F&B, dashboard, discovery, promo, tracking, and backend contracts are unchanged.
- Continue only after another console/route gate. The next safe target should be a focused Simple order step component or model/helper extraction; do not extract delivery map/pin behavior with unrelated Simple checkout controls.

## 2026-07-20 - Simple Checkout Order Method Selector Extraction

Slice: Move the Simple checkout Step 2 pickup/delivery method selector from `StorefrontApp.jsx` into a Simple checkout-owned presentational component.

Files changed:
- `frontend/apps/store/src/StorefrontApp.jsx`
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleOrderMethodSelector.jsx`
- `frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_PROGRESS_REPORT.md`

StorefrontApp.jsx line count: 9,433

Component line count:
- `SimpleOrderMethodSelector.jsx`: 35

Validation:
- Pre-slice Simple route gate: passed on `http://10.123.35.127:5176/tenant-store/bob-store-61fc74`; response was HTTP 200 and React root was present.
- Scoped ESLint: passed with 0 errors for `StorefrontApp.jsx` and affected Simple checkout components/hooks.
- Targeted tests: `fnbStorefront.contract.test.js`, `guestCheckoutOtp.contract.test.js`, `serviceBookingMultiplicity.contract.test.js`, and `checkoutRules.test.js` passed, 24 tests.
- `git diff --check`: passed for affected files with the existing CRLF normalization warning on `StorefrontApp.jsx`.
- `cmd /c npm --prefix frontend run build:store`: passed, only existing Browserslist and chunk-size warnings.
- Post-build Simple route gate: passed on `http://10.123.35.127:5176/tenant-store/bob-store-61fc74`; response was HTTP 200 and React root was present.

Notes / next step:
- This was a Simple checkout-owned presentation extraction only. Delivery map, saved-address behavior, schedule inputs, pin-location errors, cart state, checkout payloads, F&B, Services, customer dashboard, discovery, promo, tracking, and backend contracts are unchanged.
- The extracted selector receives normalized options and an action callback from the existing runtime, keeping view logic separate from state orchestration.
- Continue only after another console/route gate. The next safe target should be another focused Simple checkout section such as the schedule/instructions fields or a model/helper extraction; do not move delivery map/pin behavior together with unrelated controls.

## 2026-07-20 - Simple Checkout Schedule Fields Extraction

Slice: Move the Simple checkout Step 2 schedule time and special-instructions fields from `StorefrontApp.jsx` into a Simple checkout-owned presentational component.

Files changed:
- `frontend/apps/store/src/StorefrontApp.jsx`
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCheckoutScheduleFields.jsx`
- `frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_PROGRESS_REPORT.md`

StorefrontApp.jsx line count: 9,431

Component line count:
- `SimpleCheckoutScheduleFields.jsx`: 31

Validation:
- Pre-slice Simple route gate: passed on `http://10.123.35.127:5176/tenant-store/bob-store-61fc74`; response was HTTP 200 and React root was present.
- Scoped ESLint: passed with 0 errors for `StorefrontApp.jsx` and affected Simple checkout components/hooks.
- Targeted tests: `fnbStorefront.contract.test.js`, `guestCheckoutOtp.contract.test.js`, `serviceBookingMultiplicity.contract.test.js`, and `checkoutRules.test.js` passed, 24 tests.
- `git diff --check`: passed for affected files with the existing CRLF normalization warning on `StorefrontApp.jsx`.
- `cmd /c npm --prefix frontend run build:store`: passed, only existing Browserslist and chunk-size warnings.
- Post-build Simple route gate: passed on `http://10.123.35.127:5176/tenant-store/bob-store-61fc74`; response was HTTP 200 and React root was present.

Notes / next step:
- This was a Simple checkout-owned presentation extraction only. Delivery address, delivery pin map, saved-address behavior, location selector, cart state, checkout payloads, F&B, Services, customer dashboard, discovery, promo, tracking, and backend contracts are unchanged.
- The extracted fields receive existing values and setter callbacks from the current runtime, preserving behavior while moving view markup into the Simple checkout boundary.
- Continue only after another console/route gate. The next safe target should be either the Simple delivery address card as its own isolated component or a model/helper extraction; keep map/pin interaction separate.

## 2026-07-20 - Simple Checkout Delivery Address Field Extraction

Slice: Move the Simple checkout Step 2 signed-in delivery address field from `StorefrontApp.jsx` into a Simple checkout-owned presentational component.

Files changed:
- `frontend/apps/store/src/StorefrontApp.jsx`
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleDeliveryAddressField.jsx`
- `frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_PROGRESS_REPORT.md`

StorefrontApp.jsx line count: 9,430

Component line count:
- `SimpleDeliveryAddressField.jsx`: 19

Validation:
- Pre-slice Simple route gate: passed on `http://10.123.35.127:5176/tenant-store/bob-store-61fc74`; response was HTTP 200 and React root was present.
- Scoped ESLint: passed with 0 errors for `StorefrontApp.jsx` and affected Simple checkout components/hooks.
- Targeted tests: `fnbStorefront.contract.test.js`, `guestCheckoutOtp.contract.test.js`, `serviceBookingMultiplicity.contract.test.js`, and `checkoutRules.test.js` passed, 24 tests.
- `git diff --check`: passed for affected files with the existing CRLF normalization warning on `StorefrontApp.jsx`.
- `cmd /c npm --prefix frontend run build:store`: passed, only existing Browserslist and chunk-size warnings.
- Post-build Simple route gate: passed on `http://10.123.35.127:5176/tenant-store/bob-store-61fc74`; response was HTTP 200 and React root was present.

Notes / next step:
- This was a Simple checkout-owned presentation extraction only. Delivery pin map, pin actions, saved-address behavior, location selector, cart state, checkout payloads, F&B, Services, customer dashboard, discovery, promo, tracking, and backend contracts are unchanged.
- The extracted field receives the existing customer address value and setter callback from the current runtime.
- Continue only after another console/route gate. The next safe target should be the Simple delivery pin panel as its own isolated component or a Simple checkout footer/action component; do not combine it with broader route state extraction.

## 2026-07-20 - Simple Checkout Delivery Pin Panel Extraction

Slice: Move the Simple checkout Step 2 delivery pin panel from `StorefrontApp.jsx` into a Simple checkout-owned presentational component.

Files changed:
- `frontend/apps/store/src/StorefrontApp.jsx`
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleDeliveryPinPanel.jsx`
- `frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_PROGRESS_REPORT.md`

StorefrontApp.jsx line count: 9,416

Component line count:
- `SimpleDeliveryPinPanel.jsx`: 36

Validation:
- Pre-slice Simple route gate: passed on `http://10.123.35.127:5176/tenant-store/bob-store-61fc74`; response was HTTP 200 and React root was present.
- Scoped ESLint: passed with 0 errors for `StorefrontApp.jsx` and affected Simple checkout components/hooks.
- Targeted tests: `fnbStorefront.contract.test.js`, `guestCheckoutOtp.contract.test.js`, `serviceBookingMultiplicity.contract.test.js`, and `checkoutRules.test.js` passed, 24 tests.
- `git diff --check`: passed for affected files with the existing CRLF normalization warning on `StorefrontApp.jsx`.
- `cmd /c npm --prefix frontend run build:store`: passed, only existing Browserslist and chunk-size warnings.
- Post-build Simple route gate: passed on `http://10.123.35.127:5176/tenant-store/bob-store-61fc74`; response was HTTP 200 and React root was present.

Notes / next step:
- This was a Simple checkout-owned presentation extraction only. The existing `DeliveryPinMap` implementation, pin state, current-location handler, clear-pin behavior, delivery address field, cart state, checkout payloads, F&B, Services, customer dashboard, discovery, promo, tracking, and backend contracts are unchanged.
- The extracted panel receives existing pin state and callbacks from the current runtime.
- Continue only after another console/route gate. The next safe target should be a Simple checkout footer/action component or a model/helper extraction for Simple checkout review rows; avoid broad route-state extraction until the smaller view blocks are owned.

## 2026-07-20 - Simple Checkout Review Items List Extraction

Slice: Move the Simple checkout Step 3 review item list from `StorefrontApp.jsx` into a Simple checkout-owned presentational component.

Files changed:
- `frontend/apps/store/src/StorefrontApp.jsx`
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCheckoutReviewItemsList.jsx`
- `frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_PROGRESS_REPORT.md`

StorefrontApp.jsx line count: 9,414

Component line count:
- `SimpleCheckoutReviewItemsList.jsx`: 20

Validation:
- Pre-slice Simple route gate: passed on `http://10.123.35.127:5176/tenant-store/bob-store-61fc74`; response was HTTP 200 and React root was present.
- Scoped ESLint: passed with 0 errors for `StorefrontApp.jsx` and affected Simple checkout components/hooks.
- Targeted tests: `fnbStorefront.contract.test.js`, `guestCheckoutOtp.contract.test.js`, `serviceBookingMultiplicity.contract.test.js`, and `checkoutRules.test.js` passed, 24 tests.
- `git diff --check`: passed for affected files with the existing CRLF normalization warning on `StorefrontApp.jsx`.
- `cmd /c npm --prefix frontend run build:store`: passed, only existing Browserslist and chunk-size warnings.
- Post-build Simple route gate: passed on `http://10.123.35.127:5176/tenant-store/bob-store-61fc74`; response was HTTP 200 and React root was present.

Notes / next step:
- This was a Simple checkout-owned presentation extraction only. Existing cart data, money formatting, quote action, checkout action, payment selector, checkout payloads, F&B, Services, customer dashboard, discovery, promo, tracking, and backend contracts are unchanged.
- The extracted list receives existing cart data and the existing money formatter from the current runtime.
- Continue only after another console/route gate. The next safe target should be a Simple checkout payment action/footer component or a model helper for Simple checkout summary rows.

## 2026-07-20 - Simple Checkout Payment Actions Extraction

Slice: Move Simple checkout Step 3 quote/place/back actions and adjacent warning/error messages from `StorefrontApp.jsx` into a Simple checkout-owned component.

Files changed:
- `frontend/apps/store/src/StorefrontApp.jsx`
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCheckoutPaymentActions.jsx`
- `frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_PROGRESS_REPORT.md`

StorefrontApp.jsx line count: 9,629

Component line count:
- `SimpleCheckoutPaymentActions.jsx`: 40

Validation:
- Scoped ESLint: passed with 0 errors for `StorefrontApp.jsx` and affected Simple checkout components/hooks. Existing warning debt remains in `StorefrontApp.jsx`.
- Targeted tests: `fnbStorefront.contract.test.js`, `guestCheckoutOtp.contract.test.js`, `serviceBookingMultiplicity.contract.test.js`, and `checkoutRules.test.js` passed, 24 tests.
- `git diff --check`: passed for affected files with existing CRLF normalization warnings.
- `cmd /c npm --prefix frontend run build:store`: passed, only existing Browserslist and chunk-size warnings.
- Post-build Simple route gate: passed on `http://10.123.35.127:5176/tenant-store/bob-store-61fc74`; response was HTTP 200 and React root was present.

Notes / next step:
- This was a Simple checkout-owned presentation/action extraction only. Existing quote handler, checkout handler, cart state, checkout eligibility, closed-store notice renderer, error strings, payment selector, checkout payloads, F&B, Services, customer dashboard, discovery, promo, tracking, and backend contracts are unchanged.
- Because the component requires explicit prop handoff, this slice improves ownership more than it reduces shell LOC. The next safe reduction should be a larger Simple Step 3 route section extraction or a model/helper extraction that removes more shell code at once.
- Continue only after another console/route gate.

## 2026-07-20 - Simple Checkout Payment Step Extraction

Slice: Move the Simple checkout Step 3 review/payment section from `StorefrontApp.jsx` into a Simple checkout-owned presentational component.

Files changed:
- `frontend/apps/store/src/StorefrontApp.jsx`
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCheckoutPaymentStep.jsx`
- `frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_PROGRESS_REPORT.md`

StorefrontApp.jsx line count: 9,616

Component line count:
- `SimpleCheckoutPaymentStep.jsx`: 61

Validation:
- Scoped ESLint: passed with 0 errors for `StorefrontApp.jsx`, `SimpleCheckoutPaymentStep.jsx`, `SimpleCheckoutPaymentActions.jsx`, and `SimpleCheckoutReviewItemsList.jsx`. Existing warning debt remains in `StorefrontApp.jsx`.
- Targeted tests: `fnbStorefront.contract.test.js`, `guestCheckoutOtp.contract.test.js`, `serviceBookingMultiplicity.contract.test.js`, and `checkoutRules.test.js` passed, 24 tests.
- `git diff --check`: passed for affected files with existing CRLF normalization warnings.
- `cmd /c npm --prefix frontend run build:store`: passed, only existing Browserslist and chunk-size warnings.
- Post-build Simple route gate: passed on `http://10.123.35.127:5176/tenant-store/bob-store-61fc74`; response was HTTP 200 and React root was present.

Notes / next step:
- This was a Simple checkout-owned presentation extraction only. Existing quote handler, checkout handler, payment type handler, dropdown component, cart state, checkout eligibility, promo summary, closed-store notice renderer, F&B, Services, customer dashboard, discovery, tracking, and backend contracts are unchanged.
- The Simple Step 3 route body now owns its payment selector, review item list, and action/error area under `modes/simple/checkout/components`.
- Continue only after another console/route gate. The next safe target should be Simple checkout success/confirmation view extraction or a Simple checkout route container extraction; do not mix this with F&B, Services, customer dashboard, or discovery changes.

## 2026-07-20 - Simple Checkout Success Step Extraction

Slice: Move the Simple checkout Step 4 order confirmation and receipt snapshot view from `StorefrontApp.jsx` into a Simple checkout-owned presentational component.

Files changed:
- `frontend/apps/store/src/StorefrontApp.jsx`
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCheckoutSuccessStep.jsx`
- `frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_PROGRESS_REPORT.md`

StorefrontApp.jsx line count: 9,592

Component line count:
- `SimpleCheckoutSuccessStep.jsx`: 61

Validation:
- Pre-slice Simple route gate: passed on `http://10.123.35.127:5176/tenant-store/bob-store-61fc74`; response was HTTP 200 and React root was present.
- Scoped ESLint: passed with 0 errors for `StorefrontApp.jsx`, `SimpleCheckoutSuccessStep.jsx`, and `SimpleCheckoutPaymentStep.jsx`. Existing warning debt remains in `StorefrontApp.jsx`.
- Targeted tests: `fnbStorefront.contract.test.js`, `guestCheckoutOtp.contract.test.js`, `serviceBookingMultiplicity.contract.test.js`, and `checkoutRules.test.js` passed, 24 tests.
- `git diff --check`: passed for affected files with existing CRLF normalization warnings.
- `cmd /c npm --prefix frontend run build:store`: passed, only existing Browserslist and chunk-size warnings.
- Post-build Simple route gate: passed on `http://10.123.35.127:5176/tenant-store/bob-store-61fc74`; response was HTTP 200 and React root was present.

Notes / next step:
- This was a Simple checkout-owned presentation extraction only. Existing checkout result state, download handler, back-to-catalog behavior, payment display value, fulfillment display value, money formatter, F&B, Services, customer dashboard, discovery, promo, tracking, and backend contracts are unchanged.
- The Simple confirmation/receipt UI now lives under `modes/simple/checkout/components`.
- Continue only after another console/route gate. The next safe target should be a Simple checkout route container/view-model extraction that assembles Step 1-4 props, or a smaller Simple checkout model helper for summary/status rows if a full route container is too risky.

## 2026-07-20 - Simple Checkout Customer Step Extraction

Slice: Move the Simple checkout Step 1 customer/details view from `StorefrontApp.jsx` into a Simple checkout-owned presentational component.

Files changed:
- `frontend/apps/store/src/StorefrontApp.jsx`
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCheckoutCustomerStep.jsx`
- `frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_PROGRESS_REPORT.md`

StorefrontApp.jsx line count: 9,568

Component line count:
- `SimpleCheckoutCustomerStep.jsx`: 54

Validation:
- Pre-slice Simple route gate: passed (`status=200`, `hasRoot=True`).
- Scoped ESLint: passed with 0 errors; existing StorefrontApp warnings remain.
- Targeted Vitest: passed (`4` files, `24` tests).
- `git diff --check`: passed with CRLF normalization warnings only.
- `build:store`: passed with existing Browserslist/chunk-size warnings.
- Post-build Simple route gate: passed (`status=200`, `hasRoot=True`).

Notes / next step:
- Presentation-only extraction. Existing identity renderers, validation readiness, back/continue behavior, promo summary, F&B, Services, dashboard, discovery, tracking, and backend contracts are unchanged.
- Continue only after console is clear. Next safe target: Simple checkout Step 2 route wrapper or a Simple checkout route view component, keeping map/pin behavior unchanged.

## 2026-07-20 - Simple Checkout Fulfillment Step Extraction

Slice: Move the Simple checkout Step 2 fulfillment view from `StorefrontApp.jsx` into a Simple checkout-owned presentational component.

Files changed:
- `frontend/apps/store/src/StorefrontApp.jsx`
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCheckoutFulfillmentStep.jsx`
- `frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_PROGRESS_REPORT.md`

StorefrontApp.jsx line count: 9,525

Component line count:
- `SimpleCheckoutFulfillmentStep.jsx`: 108

Validation:
- Pre-slice Simple route gate: passed (`status=200`, `hasRoot=True`).
- Scoped ESLint: passed with 0 errors; existing StorefrontApp warnings remain.
- Targeted Vitest: passed (`4` files, `24` tests).
- `git diff --check`: passed with CRLF normalization warnings only.
- `build:store`: passed with existing Browserslist/chunk-size warnings.
- Post-build Simple route gate: passed (`status=200`, `hasRoot=True`).

Notes / next step:
- Presentation-only extraction. Existing location selector, order-method callback, schedule fields, delivery address field, delivery pin panel, validation readiness, promo summary, F&B, Services, dashboard, discovery, tracking, and backend contracts are unchanged.
- Continue only after console is clear. Next safe target: Simple checkout route composition wrapper so Step 1/2/3/4 mounts are owned by `modes/simple/checkout` while the shell keeps state and route orchestration.

## 2026-07-20 - Console Gate Fix Before Next Slice

Fix: Resolve a runtime initialization error before continuing the next refactor slice.

Files changed:
- `frontend/apps/store/src/StorefrontApp.jsx`
- `frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_PROGRESS_REPORT.md`

Changes:
- Moved `openServiceBookingPanel` and `openServiceCartEditor` above `useServiceCartDrawerProps` so the hook no longer receives `openServiceCartEditor` before initialization.
- Replaced public-directory image imports with Vite-safe public URL constants for `dgfy-logo.png`, `dgfy-symbologo.png`, and `man.png`.

Validation:
- Scoped ESLint: passed with 0 errors; existing StorefrontApp warnings remain.
- Targeted Vitest: passed (`4` files, `24` tests).
- `git diff --check`: passed with CRLF normalization warnings only.
- `build:store`: passed with existing Browserslist/chunk-size warnings.
- Route gate: passed (`status=200`, `hasRoot=True`).

Notes / next step:
- No new refactor slice should start until the browser console is refreshed and confirmed clear.

## 2026-07-20 - Service Cart Drawer Dependency Ordering Fix

Fix: Resolve the follow-up runtime initialization error before continuing the next refactor slice.

Files changed:
- `frontend/apps/store/src/StorefrontApp.jsx`
- `frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_PROGRESS_REPORT.md`

Changes:
- Moved `useServiceCartDrawerProps` below `removeCartItem` and `updateQty` so all service cart drawer callback dependencies are initialized before the hook consumes them.
- Kept the earlier `openServiceBookingPanel` and `openServiceCartEditor` ordering fix intact.
- No service cart behavior, checkout behavior, route behavior, or backend contract was intentionally changed.

Validation:
- Scoped ESLint (`StorefrontApp.jsx --quiet`): passed with 0 errors.
- Targeted Vitest: passed (`4` files, `24` tests).
- `git diff --check`: passed with CRLF normalization warnings only.
- `build:store`: passed with existing Browserslist/chunk-size warnings.
- Route gate: passed (`status=200`, `hasRoot=True`).

Notes / next step:
- No new refactor slice should start until the browser console is refreshed and confirmed clear.

## 2026-07-21 - F&B Cart Drawer Open/Close Regression Fix

Fix: Restore the intended F&B add-to-cart flow before continuing refactor work.

Files changed:
- `frontend/apps/store/src/StorefrontApp.jsx`
- `frontend/apps/store/src/modes/fnb/checkout/hooks/useFnbCartDrawerRouteProps.js`
- `frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_PROGRESS_REPORT.md`

Changes:
- F&B add-to-cart now keeps the cart drawer closed and only runs the cart fly animation.
- The F&B cart drawer now requires both `checkoutTab === 'cart'` and `isCheckoutOpen === true` before mounting as active.
- The cart drawer `X` close action can now close the drawer because `setIsCheckoutOpen(false)` is part of the active-state condition.

Validation:
- Scoped ESLint (`StorefrontApp.jsx` and `useFnbCartDrawerRouteProps.js --quiet`): passed with 0 errors.
- Targeted Vitest: passed (`2` files, `14` tests).
- `git diff --check`: passed with CRLF normalization warnings only.
- `build:store`: passed with existing Browserslist/chunk-size warnings.
- F&B route gate: passed (`status=200`, `hasRoot=True`).

Notes / next step:
- Browser QA still needs to confirm: adding an F&B item does not auto-open the drawer, tapping the floating cart opens it, and the `X` closes it without leaving a stuck overlay.
- No new refactor slice should start until the browser console is refreshed and confirmed clear.

## 2026-07-21 - F&B Cart Refresh Persistence Slice

Goal: Preserve active F&B cart items across a browser refresh without adding storage logic into `StorefrontApp.jsx`.

Files changed:
- `frontend/apps/store/src/StorefrontApp.jsx`
- `frontend/apps/store/src/shared/hooks/useStorefrontCartPersistence.js`
- `frontend/apps/store/src/shared/model/storefrontCartStorage.js`
- `frontend/apps/store/src/__tests__/storefrontCartStorage.test.js`
- `frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_PROGRESS_REPORT.md`

Changes:
- Added a shared cart storage model that scopes persisted carts by storefront slug and mode.
- Added a shared React hook that hydrates the cart once per store/mode and writes later cart changes to local storage.
- Mounted the hook for F&B mode only; Services and Simple behavior remain unchanged.
- Kept checkout success clearing behavior through the existing `setCart([])` flow.

Validation:
- Scoped ESLint (`StorefrontApp.jsx`, cart persistence hook/model, and storage test): passed with 0 errors.
- Targeted Vitest: passed (`3` files, `18` tests).
- `git diff --check`: passed with CRLF normalization warnings only.
- `build:store`: passed with existing Browserslist/chunk-size warnings.
- F&B route gate: passed (`status=200`, `hasRoot=True`).

Notes / next step:
- Browser QA must confirm: add an F&B item, refresh the same storefront, confirm the floating cart and cart drawer still show the item, then complete checkout and confirm the cart is cleared.

## 2026-07-22 - Services Cart Refresh Persistence Slice

Goal: Preserve active Services booking cart items across a browser refresh using the existing shared storefront cart persistence boundary.

Files changed:
- `frontend/apps/store/src/StorefrontApp.jsx`
- `frontend/apps/store/src/__tests__/storefrontCartStorage.test.js`
- `frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_PROGRESS_REPORT.md`

Changes:
- Enabled `useStorefrontCartPersistence` for Services mode in addition to F&B mode.
- Kept the persistence implementation in `shared/hooks` and `shared/model`; no storage logic was added to `StorefrontApp.jsx`.
- Added regression coverage proving Services cart snapshots preserve booking-specific fields such as service detail, area, duration, notes, schedule, payment timing, and intake responses.
- Kept Simple mode unchanged.

Validation:
- Scoped ESLint: passed with 0 errors for `StorefrontApp.jsx`, cart persistence hook/model, and storage test.
- Targeted Vitest: passed (`3` files, `15` tests).

Notes / next step:
- Browser QA must confirm: add a Services booking item, refresh the same storefront, confirm the booking cart still shows the item, then complete/cancel and confirm the cart clears through the existing empty-cart path.
- Continue only after console is clear. The next safe refactor target is Simple checkout route composition ownership, not another cross-mode behavior change.

## 2026-07-22 - Simple Checkout Route Composition Extraction

Slice: Move the Simple checkout Step 1-4 route composition out of `StorefrontApp.jsx` into a Simple mode-owned route page.

Files changed:
- `frontend/apps/store/src/StorefrontApp.jsx`
- `frontend/apps/store/src/modes/simple/checkout/pages/SimpleCheckoutRoutePage.jsx`
- `frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_PROGRESS_REPORT.md`

StorefrontApp.jsx line count: 9,392

Component line count:
- `SimpleCheckoutRoutePage.jsx`: 280

Changes:
- Added `SimpleCheckoutRoutePage` under `modes/simple/checkout/pages`.
- Moved the Simple checkout store header, hero header, step progress, Step 1 customer, Step 2 fulfillment, Step 3 payment, promo summaries, and Step 4 success composition into the Simple mode route page.
- Kept existing cart state, quote state, checkout handlers, payment handler, promo renderers, customer identity renderers, pin/location handlers, and backend contracts in place.
- Removed now-unused Simple checkout presentational imports from `StorefrontApp.jsx`.

Validation:
- Scoped ESLint: passed with 0 errors for `StorefrontApp.jsx` and `SimpleCheckoutRoutePage.jsx`.
- Targeted Vitest: passed (`4` files, `27` tests).

Notes / next step:
- Browser QA must confirm the Simple checkout route still renders Step 1-4 correctly.
- Continue only after console is clear. The next safe target is a Simple checkout view-model/props adapter to reduce the large prop list, or a smaller Services booking component split if Services is the priority.

## 2026-07-22 - Simple Checkout Route Props Adapter

Slice: Move the Simple checkout route prop assembly out of the render tree and into a Simple checkout-owned hook.

Files changed:
- `frontend/apps/store/src/StorefrontApp.jsx`
- `frontend/apps/store/src/modes/simple/checkout/hooks/useSimpleCheckoutRouteProps.js`
- `frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_PROGRESS_REPORT.md`

StorefrontApp.jsx line count: 9,389

Hook line count:
- `useSimpleCheckoutRouteProps.js`: 128

Changes:
- Added `useSimpleCheckoutRouteProps` under `modes/simple/checkout/hooks`.
- Moved the Simple checkout route page prop mapping and callback adaptation into the Simple checkout boundary.
- Reduced the Simple route mount in `StorefrontApp.jsx` to `<SimpleCheckoutRoutePage {...simpleCheckoutRouteProps} />`.
- Kept state ownership, checkout flow, quote flow, promo rendering, pin/location behavior, and backend contracts unchanged.

Validation:
- Scoped ESLint: passed with 0 errors for `StorefrontApp.jsx`, `SimpleCheckoutRoutePage.jsx`, and `useSimpleCheckoutRouteProps.js`.
- Targeted Vitest: passed (`4` files, `27` tests).

Notes / next step:
- Browser QA must confirm the Simple checkout route remains functional after the prop adapter.
- Continue only after console is clear. The next safe target is either Services booking component split (`ServiceBookingSteps.jsx`) or discovery renderer split, depending which area has active QA priority.

## 2026-07-22 - Services Booking Step 1 Details Form Extraction

Slice: Move the Services booking Step 1 schedule/service-detail form body into a focused Services-owned component.

Files changed:
- `frontend/apps/store/src/modes/services/booking/components/ServiceBookingSteps.jsx`
- `frontend/apps/store/src/modes/services/booking/components/ServiceBookingDetailsForm.jsx`
- `frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_PROGRESS_REPORT.md`

StorefrontApp.jsx line count: 9,184

Component line counts:
- `ServiceBookingSteps.jsx`: 468
- `ServiceBookingDetailsForm.jsx`: 265

Changes:
- Added `ServiceBookingDetailsForm` under `modes/services/booking/components`.
- Moved the Step 1 schedule, time, unit type, unit count, instructions, and dynamic additional service fields out of `ServiceBookingSteps.jsx`.
- Kept location/map rendering untouched through the existing `renderLocationSection` injection.
- Kept booking state ownership, checkout flow, payment flow, and backend payload behavior unchanged.

Validation:
- Scoped ESLint: passed with 0 errors for `ServiceBookingSteps.jsx` and `ServiceBookingDetailsForm.jsx`.
- Targeted Vitest: passed (`2` files, `10` tests).

Notes / next step:
- Browser QA must confirm Services Step 1 still renders the customer identity area, schedule fields, service fields, location section, and Continue button.
- Continue only after console is clear. The next safe target is Services Step 2 review composition or Step 3 payment notice extraction.

## 2026-07-22 - Refactor Documentation Organization

Slice: Move Storefront refactor records out of runtime source and add a clear documentation entry point.

Files changed:
- `frontend/apps/store/docs/README.md`
- `frontend/apps/store/docs/STOREFRONT_SHARED_UI_GUIDE.md`
- `frontend/apps/store/docs/refactor/STOREFRONT_FRONTEND_ARCHITECTURE_GUIDE.md`
- `frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_HANDOFF.md`
- `frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_IMPLEMENTATION_GOAL.md`
- `frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_PLAN.md`
- `frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_PROGRESS_REPORT.md`

StorefrontApp.jsx line count: 9,184

Changes:
- Moved the five refactor records from `src/` to `docs/refactor/` without changing runtime code.
- Added a Storefront documentation index and required reading order.
- Added shared UI ownership, dependency, file-size, and new-mode guidance.
- Updated internal documentation paths and the current StorefrontApp baseline.

Validation:
- Documentation lint: passed (`npm run lint:docs`).
- Architecture checks: passed; Windows-incompatible inline environment assignments were executed as equivalent PowerShell environment variables.
- Storefront production build: passed (`npm --prefix frontend run build:store`).
- Git diff check: passed.

Notes / next step:
- Keep these records in `frontend/apps/store/docs/refactor/` and update the progress report after every bounded refactor slice.

## 2026-07-22 - Wave 0: zustand store scaffolding + state-management standard

Slice: Stand up a proper, documented state-management layer for the storefront (sliced zustand),
the enabler for decomposing `StorefrontApp.jsx` below 1,000 lines. No behavior change — scaffold only.

Files added:
- `frontend/apps/store/src/store/useStorefrontStore.js` (composed store + devtools + official reset)
- `frontend/apps/store/src/store/slices/{ui,session,catalog,cart,checkout,serviceBooking,discovery}Slice.js`
  (`uiSlice` is the fully-worked reference; the rest are documented scaffolds filled in later waves)
- `frontend/apps/store/src/store/selectors/uiSelectors.js`
- `frontend/apps/store/src/store/__tests__/useStorefrontStore.test.js`
- `frontend/apps/store/docs/refactor/STOREFRONT_STATE_MANAGEMENT.md`

Files changed:
- `frontend/apps/store/docs/refactor/STOREFRONT_FRONTEND_ARCHITECTURE_GUIDE.md`
  (required-reading entry + State Management section)

StorefrontApp.jsx line count: 9,221 (unchanged — scaffold not yet wired)

Decisions:
- Library: zustand (repo already standardises on it via `frontend/src/store/useStore.js`); not Redux/Context.
- Structure: slice pattern — state nested per domain (`s.cart`), actions flat (`s.cartAdd`).
- Middleware: `devtools` only now; `persist` deferred to Wave 3 (cart), `immer` not used (not a repo dep).
- Migration uses the in-place bridge (relocate state keeping the same shell-local name → then collapse props).

Validation:
- Targeted Vitest: passed (`1` file, `6` tests) — scaffolding, ui reference actions, reset.
- Lint (`apps/store/src/store`): passed, 0 errors.
- Storefront production build: passed (`npm --prefix frontend run build:store`).

Notes / next step:
- Wave 1 migrates low-risk slices (session, ui, discovery-wiring, catalog read paths) via the bridge,
  each with unit tests, gated on browser QA (account/session, modal open/close, discovery, storefront load).
