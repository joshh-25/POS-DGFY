# Storefront Frontend Architecture Guide

> Status: active working guide
>
> This document must be kept with `STOREFRONT_REFACTOR_PLAN.md`.
> Do not delete either document unless a replacement architecture guide and migration note are added in the same change.

## Purpose

This guide defines how storefront frontend code must be structured so the app can scale without repeating the `StorefrontApp.jsx` problem.

The goal is simple:

- keep each file focused
- keep each storefront mode isolated
- keep shared code truly shared
- keep UI, state, mapping, routing, and API concerns separated
- make future merges easier to review

## Required First Read

Before editing storefront frontend code, read these files:

1. `frontend/apps/store/docs/refactor/STOREFRONT_REFACTOR_PLAN.md`
2. `frontend/apps/store/docs/refactor/STOREFRONT_FRONTEND_ARCHITECTURE_GUIDE.md`
3. `docs/development/STOREFRONT_FRONTEND_CODING_STANDARD_AND_FILE_OWNERSHIP.md`
4. `docs/features/STOREFRONT_MODE_IMPLEMENTATION_STANDARD.md`

If these documents conflict, prefer the more specific storefront mode ownership rule and preserve existing backend contracts.

## Core Rule

`StorefrontApp.jsx` is an app shell only.

It may:

- detect the current route
- detect the storefront mode
- mount a route container
- pass minimal shared runtime context

It must not own:

- customer dashboard state
- F&B checkout flow
- Services booking flow
- Simple checkout flow
- tracking drawer behavior
- discovery map runtime
- promo calculation logic
- API payload building
- backend response normalization
- large JSX sections

## Architecture Pattern

Use practical MVVM.

### View

Views render UI only.

Examples:

- page components
- cards
- sections
- drawers
- banners
- modal layouts
- buttons
- summary rows

Views should receive normalized props and action callbacks. They should not fetch data, build API payloads, or know backend response shapes.

### ViewModel

ViewModels prepare state and actions for views.

Examples:

- route containers
- feature hooks
- flow hooks
- derived display state
- event handlers
- loading, empty, success, and error state orchestration

ViewModels may call model/API helpers, but they should not contain large JSX blocks.

### Model

Models own data transformation and contracts.

Examples:

- API response normalization
- request payload builders
- browser storage adapters
- money and status mapping
- route URL builders
- promo eligibility display mapping
- tracking snapshot normalization

Models should be easy to unit test without rendering React.

## SOLID Rules For Storefront Frontend

### Single Responsibility

One file should do one business job.

Good:

- `useFnbCheckoutRuntime.js` coordinates F&B checkout state.
- `FnbCheckoutSummary.jsx` renders the summary.
- `buildFnbCheckoutPayload.js` builds the checkout payload.

Bad:

- One file fetches data, maps API responses, handles checkout, renders the full UI, opens modals, and builds payloads.

### Open/Closed

Add new mode behavior by adding or extending a mode-owned module, not by expanding root conditionals.

Good:

- add `modes/fnb/tracking/...`
- add `modes/services/booking/...`

Bad:

- add another large `if (isFnbMode)` block inside `StorefrontApp.jsx`.

### Liskov Substitution

Shared components must accept stable props and not break when used by F&B, Services, or Simple mode.

Shared components must not assume a mode-specific payload shape.

### Interface Segregation

Pass only the props a component needs.

Avoid large prop bundles such as `storefrontRuntime`, `checkoutEverything`, or `dashboardState` unless the target is a route container.

### Dependency Inversion

UI depends on normalized interfaces, not raw backend responses.

Views should not know if data came from POS, tenant storefront settings, discovery API, local storage, or DGFY account APIs.

## Folder Ownership

Use the folder ownership defined in `STOREFRONT_REFACTOR_PLAN.md`.

```text
frontend/apps/store/src/
  app/
  auth/
  customer-dashboard/
  discovery/
  tracking/
  shared/
  modes/
    fnb/
    services/
    simple/
```

### Customer Dashboard

Customer dashboard code belongs in:

- `customer-dashboard/pages/`
- `customer-dashboard/components/`
- `customer-dashboard/hooks/`
- `customer-dashboard/model/`

This includes:

- overview
- active orders
- orders
- bookings
- addresses
- loyalty
- account
- business
- help center
- support
- notifications
- sign out presentation

### F&B Mode

F&B code belongs in:

- `modes/fnb/storefront/`
- `modes/fnb/checkout/`
- `modes/fnb/tracking/`
- `modes/fnb/model/`
- `modes/fnb/hooks/`

This includes:

- F&B storefront sections
- cart behavior
- menu/category behavior
- checkout steps
- promo placement in F&B checkout
- delivery/pickup flow
- F&B tracking page
- F&B order-complete flow

### Services Mode

Services code belongs in:

- `modes/services/`

Do not move Services behavior into F&B or shared modules.

### Simple Mode

Simple storefront code belongs in:

- `modes/simple/`

Do not re-inline Simple mode into `StorefrontApp.jsx`.

### Discovery

Discovery and map code belongs in:

- `discovery/pages/`
- `discovery/components/`
- `discovery/hooks/`
- `discovery/model/`

This includes:

- search state
- category filters
- map runtime
- map marker normalization
- cluster behavior
- discovery result panel behavior

### Shared

Use `shared/` only when the code is truly reusable across modes without mode-specific branching.

Examples:

- buttons
- layout primitives
- status badge primitives
- money formatting
- safe image helpers
- generic modal shell

If a shared file starts checking `isFnbMode`, `isServicesMode`, or `isSimpleMode`, it probably belongs in a mode folder.

## File Size Guardrails

Line count is a warning signal, not the only quality metric. Still, these limits prevent another oversized shell file.

### Hard Rules

- No new file should exceed 300 lines without a clear reason.
- No existing file should be made larger if it is already over 300 lines.
- No feature file should exceed 500 lines without a documented split plan.
- No app shell file should exceed 500 lines long term.
- `StorefrontApp.jsx` must only shrink over time unless a temporary compatibility mount is explicitly documented.

### Recommended Limits

| File type | Target | Review required |
| --- | ---: | ---: |
| App shell | 300 lines | 500 lines |
| Route container | 250 lines | 350 lines |
| Hook / ViewModel | 220 lines | 300 lines |
| Component / View | 200 lines | 300 lines |
| Model / mapper / utility | 180 lines | 250 lines |
| Test file | 350 lines | 500 lines |

### Split Triggers

Split a file when it has more than one of these responsibilities:

- route decisions
- API calls
- payload building
- response normalization
- local storage handling
- derived state
- event handlers
- JSX rendering
- modal/drawer behavior
- mode-specific branching

## Naming Rules

Use names that describe ownership.

Good:

- `FnbCheckoutRouteContainer.jsx`
- `useFnbCheckoutRuntime.js`
- `normalizeFnbTrackingPayload.js`
- `CustomerDashboardRouteContainer.jsx`
- `useDiscoveryRuntime.js`

Avoid:

- `helpers.js`
- `utils2.js`
- `newCheckout.jsx`
- `StorefrontStuff.jsx`
- `CommonLogic.jsx`

## Route Ownership

Route strings and external app URLs must be centralized.

Do not hardcode ports, local IPs, or live domains inside feature components.

Good:

- route helper builds customer dashboard URL
- POS URL helper builds POS login URL
- storefront route helper builds track URL

Bad:

- `window.location.href = "http://10.123.35.127:5174"`
- hardcoded `dev.dgfy.ph` inside a component

## Promo Ownership

Promo data comes from POS storefront settings and backend quote/checkout responses.

F&B may own promo placement and F&B checkout presentation, but it must not invent promo logic.

Rules:

- promo cards display POS-configured fields
- promo code must use the real `promo_code`
- discount display must use backend quote/checkout discount response
- invalid/ineligible promo errors must be user-friendly
- order summaries must show discount rows consistently when a promo is applied

## Tracking Ownership

Tracking UI can share primitives, but tracking runtime belongs to the relevant mode or shared tracking container depending on behavior.

Use shared tracking only for cross-mode behavior:

- drawer shell
- generic active order card shell
- status badge primitive
- shared track URL helper

Use mode-owned tracking for mode-specific behavior:

- F&B tracking stages
- Services booking stages
- Simple order stages

## Map Ownership

Discovery map behavior belongs in `discovery/`, not `StorefrontApp.jsx`.

Rules:

- map markers must be anchored by MapLibre coordinates
- marker UI must not drift with pan or zoom
- cluster behavior must be model-driven
- result panel behavior must be owned by Discovery
- map styling should be component-scoped or shared through a Discovery style module

## Validation Rules

After meaningful storefront changes, run the smallest useful checks first.

Recommended sequence:

1. targeted unit or contract test
2. `npm --prefix frontend run build:store`
3. live preview route verification
4. broader lint/build before PR

Minimum manual routes for storefront PRs:

- discovery page
- one F&B storefront
- F&B cart drawer
- F&B checkout steps 1 to 3
- F&B order complete
- F&B tracking page
- tracking drawer
- `/map-dgfy/account`
- Services storefront if Services files changed
- Simple storefront if Simple files changed

## PR Review Checklist

Before staging a storefront PR:

- `StorefrontApp.jsx` did not grow without a documented reason
- no backend contract was changed accidentally
- no Services/Simple changes are included unless approved
- no `.env`, secrets, tokens, or local credentials are staged
- all changed files belong to the stated PR scope
- route helpers are used instead of hardcoded URLs
- promo, checkout, tracking, and dashboard behavior are manually verified if touched

## Non-Negotiable Rule

If a change requires adding a large block to `StorefrontApp.jsx`, stop and create a feature-owned route container, hook, model, or component instead.
