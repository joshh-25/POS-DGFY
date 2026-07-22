# Storefront Frontend Refactor and Folderization Plan

> Working note: This is the active storefront refactor and folderization basis for the local storefront frontend work.
> A separate storefront frontend architecture guide using SOLID and MVVM principles may still be restored later.
> Until that document is found, this plan should be read together with `docs/development/STOREFRONT_FRONTEND_CODING_STANDARD_AND_FILE_OWNERSHIP.md` and `docs/features/STOREFRONT_MODE_IMPLEMENTATION_STANDARD.md`.
> Do not use this plan to re-inline Services or Simple mode into `StorefrontApp.jsx`; mode-owned code should stay under `modes/services` and `modes/simple`.
## Purpose

This plan defines how to safely reduce the responsibility of `StorefrontApp.jsx`
and organize the storefront frontend folders at:

`C:\xampp\htdocs\SKU-Inventory-Manager\frontend\apps\store\src`

The goal is not a rewrite.

The goal is to:

- keep current backend contracts unchanged
- keep the storefront runtime buildable at every slice
- stop adding feature-specific logic into `StorefrontApp.jsx`
- organize folders by ownership
- prepare the storefront frontend for long-term modular growth

## Core Decision

Do not use one global checkout folder for every storefront mode.

Each storefront mode must own its own transaction flow because:

- F&B uses order + cart + delivery/pickup + order tracking
- Services uses booking + schedule + service intake + booking tracking
- Simple mode can use a lighter order flow

These are not the same UX, not the same state model, and not the same runtime contract.

## Rule Starting Now

No new dashboard, checkout, booking, or tracking logic should be added to:

`frontend/apps/store/src/StorefrontApp.jsx`

`StorefrontApp.jsx` should become a thin shell that only:

- detects route
- detects storefront mode
- mounts the correct feature container
- provides minimal top-level shared app context

## Current Problem

Right now `StorefrontApp.jsx` still acts as:

- route switcher
- discovery orchestrator
- storefront page renderer
- customer dashboard route owner
- F&B order-process owner
- tracking page and drawer owner
- promo mount owner
- signed-in checkout address bridge
- cross-mode state coordinator

This creates:

- merge conflicts
- UI overlap bugs
- route regressions
- hidden coupling between unrelated screens
- large review scope for even small changes

## Target Architecture

Use a practical MVVM-style structure:

### View

- pages
- drawers
- sections
- cards
- primitives

### ViewModel

- route containers
- feature hooks
- derived UI state
- action handlers
- mode-specific presentation state

### Model

- API normalization
- browser storage helpers
- mapping helpers
- contract adapters
- feature-specific utilities

## Refactor Principle

Refactor by feature boundary, not by file size alone.

Every slice must:

1. move one ownership boundary only
2. preserve current API/backend behavior
3. keep the app buildable
4. pass targeted tests
5. be checked in live preview before the next slice

## Recommended Folder Strategy

Use three ownership levels:

### 1. App Shell

For routing and runtime only.

Keep in:

- `app/`

### 2. Cross-Mode Shared Features

Only for logic that is truly reusable across storefront modes.

Keep in:

- `auth/`
- `customer-dashboard/`
- `discovery/`
- `features/` only when the code is genuinely shared
- `shared/` after migration

### 3. Mode-Owned Runtime

Each storefront mode owns its own transaction flow and tracking flow.

Use:

- `modes/fnb/`
- `modes/services/`
- `modes/simple/`

## Target Folder Structure

```text
src/
  app/
    routing/
    runtime/
    providers/

  auth/
    components/
    hooks/
    utils/

  customer-dashboard/
    pages/
    components/
    hooks/
    model/

  discovery/
    pages/
    components/
    hooks/
    model/

  tracking/
    shared/
      components/
      hooks/
      utils/

  shared/
    components/
    hooks/
    utils/

  modes/
    fnb/
      pages/
      components/
      hooks/
      model/
      checkout/
        pages/
        components/
        hooks/
        utils/
      tracking/
        pages/
        components/
        hooks/
        utils/

    services/
      pages/
      components/
      hooks/
      model/
      booking/
        pages/
        components/
        hooks/
        utils/
      tracking/
        pages/
        components/
        hooks/
        utils/

    simple/
      pages/
      components/
      hooks/
      model/
      checkout/
        pages/
        components/
        hooks/
        utils/
      tracking/
        pages/
        components/
        hooks/
        utils/

  legacy/
    Components/
    pages/

  styles/
  data/
  __tests__/
```

## Folder Ownership Rules

### Shared folder rules

Put code into shared folders only if:

- it works for multiple modes without branching by industry
- it does not know F&B-only steps
- it does not know Services-only intake rules
- it does not assume one tracking flow

Examples of valid shared code:

- address map primitives
- customer identity card primitives
- summary row primitives
- shared storefront hero/footer/reviews sections
- QR export helpers

### Mode folder rules

Put code into a mode folder if:

- the step flow is different
- the labels are different
- the payload shaping is different
- the tracking stages are different
- the UI rules are different

Examples:

- F&B promo placement and order summary flow -> `modes/fnb/checkout`
- Services booking intake flow -> `modes/services/booking`
- F&B delivery tracking vs pickup tracking -> `modes/fnb/tracking`

## What Must Leave StorefrontApp.jsx

### Highest Priority

1. customer dashboard data loading
2. customer dashboard address actions
3. customer dashboard business actions
4. customer dashboard order activity actions
5. tracking page state assembly
6. tracking drawer state assembly
7. signed-in checkout saved-address bridge

### Second Priority

1. promo stack rendering
2. account-gate rendering
3. discovery stage assembly
4. mode-specific render helpers

### Lowest Priority

1. compatibility imports
2. legacy presentation helpers
3. root-level helpers that can be re-exported temporarily

## Current Folder Drift

Current `src` already contains:

- modern folders:
  - `app`
  - `auth`
  - `checkout`
  - `customer-dashboard`
  - `discovery`
  - `tracking`
- mode folders:
  - `fnb-storefront`
  - `services-storefront`
  - `simple-storefront`
- legacy folder:
  - `Components`
- root-level files that still own feature behavior

This is the actual cleanup target.

## Folderization Plan

### Phase 1: stabilize ownership, no broad moves yet

Do not move everything at once.

First create missing ownership folders:

- `customer-dashboard/hooks/`
- `customer-dashboard/model/`
- `modes/fnb/checkout/`
- `modes/fnb/tracking/`
- `modes/services/booking/`
- `modes/services/tracking/`
- `modes/simple/checkout/`
- `modes/simple/tracking/`
- `shared/components/`
- `shared/hooks/`
- `shared/utils/`

### Phase 2: move customer dashboard logic

Move remaining dashboard-specific route state and actions out of `StorefrontApp.jsx` into:

- `customer-dashboard/hooks/useCustomerAccountPanel.js`
- `customer-dashboard/hooks/useCustomerOrderActivity.js`
- `customer-dashboard/hooks/useCustomerAddressBook.js`
- `customer-dashboard/hooks/useCustomerBusinessAccess.js`

Keep:

- `CustomerDashboardRouteContainer.jsx`
- `CustomerDashboardPage.jsx`
- `CustomerDashboardDrawer.jsx`

as the view layer.

### Phase 3: move signed-in F&B checkout address bridge

Move checkout address ownership into:

- `modes/fnb/checkout/hooks/useSignedInCheckoutAddresses.js`

This avoids coupling customer dashboard addresses and F&B checkout addresses in the root shell.

### Phase 4: move F&B order flow ownership

Move F&B-owned flow pieces into:

- `modes/fnb/checkout/components/`
- `modes/fnb/checkout/hooks/`
- `modes/fnb/checkout/utils/`

This should include:

- promo placement orchestration
- order summary orchestration
- account gate flow
- F&B-specific checkout step state

### Phase 5: move F&B tracking ownership

Move F&B tracking route and drawer state into:

- `modes/fnb/tracking/hooks/`
- `modes/fnb/tracking/components/`

Keep only generic map or card primitives in shared tracking folders.

### Phase 6: move Services booking and tracking ownership

Services should not share F&B checkout ownership.

Move Services flow into:

- `modes/services/booking/`
- `modes/services/tracking/`

### Phase 7: move Simple mode order ownership

Move Simple mode flow into:

- `modes/simple/checkout/`
- `modes/simple/tracking/`

### Phase 8: shrink legacy folder reliance

After feature ownership is stable:

- migrate `Components/storefront/pages`
- keep temporary compatibility re-exports where needed
- remove old paths only after runtime verification

## Immediate Safe Extraction Queue

### Slice 1

Customer dashboard hooks and model ownership.

### Slice 2

F&B signed-in saved-address bridge.

### Slice 3

F&B tracking route and drawer model.

### Slice 4

F&B promo/account gate/order summary orchestration.

### Slice 5

Services booking container ownership.

## Legacy Strategy

Do not delete old folders immediately.

Use this sequence:

1. move real implementation
2. keep compatibility re-export if import paths still depend on old location
3. update imports in small batches
4. remove legacy wrapper only after build + live verification

## Validation After Every Slice

Run:

1. `npm run check:architecture`
2. `npm --prefix frontend run build:store`
3. targeted storefront tests
4. live route verification

Minimum live verification:

- discovery page
- one F&B storefront
- `/map-dgfy/account`
- one tracking route
- one F&B checkout route

If Services is touched, also verify:

- one services storefront
- one services booking route

## Definition of Success

`StorefrontApp.jsx` is considered healthy when it only:

- detects route
- detects storefront mode
- mounts the correct feature route container
- provides minimal app-shell context

It should no longer directly own:

- dashboard feature actions
- tracking feature actions
- mode-specific transaction orchestration
- feature-specific render assembly

## Non-Negotiable Rules

- frontend only
- preserve current backend contracts
- one feature boundary per slice
- no broad folder moves without live verification
- no new dashboard logic inside `StorefrontApp.jsx`
- no combining F&B checkout and Services booking into one feature folder
- do not trust build success alone

## Recommended Next Step

Start with customer-dashboard extraction, not checkout.

Reason:

- it already has its own folder
- it is already partially extracted
- it is the main source of the current storefront/dashboard overlap problem
- it gives the fastest structural win without changing mode-specific transaction behavior

