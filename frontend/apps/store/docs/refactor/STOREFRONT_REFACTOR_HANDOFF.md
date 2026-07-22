# Storefront Refactor Handoff

> Status: active handoff
> Branch: `fix/storefront-refactor-progress-20260722`
> Last updated: 2026-07-22
> Scope: `frontend/apps/store/src`

Read this together with:

- `STOREFRONT_REFACTOR_PLAN.md`
- `STOREFRONT_FRONTEND_ARCHITECTURE_GUIDE.md`
- `STOREFRONT_REFACTOR_IMPLEMENTATION_GOAL.md`
- `STOREFRONT_REFACTOR_PROGRESS_REPORT.md`
- `docs/ai/PR.md` before staging, committing, pushing, or opening a PR

## Current State In Simple Terms

The Storefront frontend is being moved away from one large `StorefrontApp.jsx` file into feature-owned folders.

Current `StorefrontApp.jsx` line count:

- `9,184` lines

This is smaller than before, but it is still too large. Treat it as a shell-in-progress, not a place to add new feature logic.

## What Is Already Owned By Feature Folders

### Customer Dashboard

Folder:

- `customer-dashboard/`

Owns:

- account page and drawer presentation
- overview, orders, bookings, addresses, loyalty, account, business tabs
- dashboard route container and route mode decisions
- dashboard live sync, notifications, address handling, tracking actions
- business asset mapping and POS redirect hook

Rule:

- Do not move dashboard tabs back into `StorefrontApp.jsx`.

### Discovery And Map

Folder:

- `discovery/`

Owns or is expected to own:

- discovery landing sections
- search/category UI
- map presentation
- marker and cluster presentation models
- result panel behavior
- discovery route/runtime hooks

Rule:

- Discovery is shared across storefront modes. Do not place Discovery map behavior under F&B, Services, or Simple.

### F&B Storefront Mode

Folder:

- `modes/fnb/`

Owns:

- F&B storefront hero/catalog/product-detail UI
- F&B cart drawer and checkout route pages
- F&B guest OTP UI/runtime/model
- F&B promo UI/model
- F&B checkout payload model
- F&B tracking page and drawer runtime

Rule:

- F&B order, checkout, cart, promo, and tracking behavior must stay in `modes/fnb`.

### Services Storefront Mode

Folder:

- `modes/services/`

Owns:

- Services storefront hero/model
- Services booking components, hooks, and models
- Services cart drawer props
- Services booking cart refresh persistence through shared cart storage

Recent slice:

- `ServiceBookingDetailsForm.jsx` was extracted from `ServiceBookingSteps.jsx`.

Rule:

- Services booking behavior must not be re-inlined into `StorefrontApp.jsx`.

### Simple Storefront Mode

Folder:

- `modes/simple/`

Owns:

- Simple storefront hero/model
- Simple checkout route page
- Simple checkout props adapter

Recent slices:

- Simple checkout Step 1-4 composition moved to `SimpleCheckoutRoutePage.jsx`.
- Simple checkout route prop assembly moved to `useSimpleCheckoutRouteProps.js`.

Rule:

- Simple checkout composition must stay under `modes/simple/checkout`.

### Hospitality Storefront Mode

Folder:

- `modes/hospitality/`

Owns:

- Hospitality-specific booking and storefront behavior.

Rule:

- Hospitality is not the same as Services. Do not merge hospitality into Services unless a product decision explicitly says so.

### Shared Storefront Code

Folders:

- `shared/components/`
- `shared/hooks/`
- `shared/model/`
- `shared/theme/`
- `shared/utils/`

Owns:

- mode-neutral checkout components
- mode-neutral cart persistence storage/hook
- QR URL helpers
- storefront formatting helpers
- shared theme and visual primitives

Rule:

- Shared means reusable by more than one mode without mode-specific assumptions.

## Architecture Rules

Use practical SOLID and MVVM.

### View

Views render UI only.

Examples:

- cards
- forms
- route pages
- drawers
- modals
- section components

Views should receive ready-to-render props and callbacks.

### ViewModel

ViewModels prepare state and actions for views.

Examples:

- route containers
- route props hooks
- runtime hooks
- derived UI state
- user interaction handlers

ViewModels should not render large JSX sections.

### Model

Models own data rules and contracts.

Examples:

- payload builders
- promo normalization
- cart persistence format
- discovery result mapping
- address normalization

Models should not depend on React rendering.

## File Size Guardrails

Line count is a warning signal.

- App shell: target `300`, warning at `500`
- Route containers/hooks: target `250`, warning at `400`
- View components: target `200`, warning at `300`
- Model/util files: target `150`, warning at `250`
- Tests: target `250`, warning at `400`

If a file exceeds the warning limit, the next related edit should split it before adding more behavior.

## Files That Still Need Refactor Attention

### Highest Priority

- `StorefrontApp.jsx`
  - Still owns too much route/runtime glue.
  - Continue shrinking by moving one feature boundary at a time.

### Services

- `modes/services/booking/components/ServiceBookingSteps.jsx`
  - Still contains Step 2 and Step 3 compositions.
  - Next safe split: `ServiceBookingReviewStep.jsx` or `ServiceBookingPaymentStep.jsx`.

### Discovery

- `discovery/components/StoresMap.jsx`
  - Keep marker rendering, cluster behavior, and map-result panel behavior inside Discovery.
  - Do not mix this with F&B or dashboard changes.

- Discovery renderers/hooks under `discovery/`
  - Continue splitting large UI/render logic into view components, hooks, and model helpers.

### F&B

- Continue checking F&B checkout/tracking files for file-size warnings.
- Do not change checkout submit, OTP verification, promo calculation, or tracking polling in the same slice as presentation refactors.

### Shared

- Keep only truly cross-mode pieces here.
- If a shared component starts branching by mode, move that mode-specific part into the owning mode folder.

## Safe Push Preparation

Before pushing this branch:

1. Confirm current branch:

```powershell
git branch --show-current
```

Expected:

```text
fix/storefront-dashboard-fnb-discovery
```

2. Inspect scope:

```powershell
git status --short
```

3. Check for accidental secrets or debug markers:

```powershell
rg "SMTP_PASS|SMTP_USER|EMAIL_FROM|PRIVATE KEY|BEGIN RSA|BEGIN OPENSSH|password" frontend/apps/store/src docs -n
```

Do not stage `.env`, SMTP credentials, tokens, certificates, or temporary local files.

4. Run targeted Storefront checks:

```powershell
cmd /c frontend\node_modules\.bin\eslint.cmd frontend/apps/store/src/StorefrontApp.jsx --quiet
cmd /c frontend\node_modules\.bin\vitest.cmd run frontend/apps/store/src/__tests__/storefrontCartStorage.test.js frontend/apps/store/src/__tests__/fnbStorefront.contract.test.js frontend/apps/store/src/__tests__/serviceBookingMultiplicity.contract.test.js frontend/apps/store/src/__tests__/checkoutRules.test.js
cmd /c npm --prefix frontend run build:store
```

5. Run diff hygiene:

```powershell
git diff --check -- frontend/apps/store/src
```

6. Manually QA on the local Storefront preview:

- Discovery map and cluster behavior
- F&B storefront catalog and item add-to-cart
- F&B cart drawer open/close
- F&B checkout Step 1, Step 2, Step 3
- Guest OTP send and verify
- Promo list, Use button, promo code display, discount row and totals
- F&B tracking drawer and full tracking page
- Customer dashboard `/map-dgfy/account`
- Customer dashboard Business tab Go to POS
- Services storefront and booking Step 1
- Simple storefront and checkout route

## Commit Strategy

Follow `docs/ai/PR.md`.

Use separate commits by domain:

1. `refactor(storefront): move shared runtime and app shell helpers`
2. `refactor(customer-dashboard): move dashboard route and tab ownership`
3. `refactor(fnb-storefront): move fnb storefront checkout tracking ownership`
4. `refactor(discovery): move discovery map and result ownership`
5. `refactor(services-storefront): move services booking ownership`
6. `refactor(simple-storefront): move simple checkout ownership`
7. `test(storefront): add storefront refactor regression coverage`
8. `docs(storefront): document refactor state and handoff`

Only create commits that match actual staged files.

## PR Scope Guidance

Include:

- Storefront frontend refactor files under `frontend/apps/store/src`
- tests directly covering changed Storefront frontend behavior
- docs that explain Storefront refactor state and architecture

Exclude:

- backend changes unless separately approved
- `.env` files and secrets
- POS/IMS unrelated changes
- temporary local folders
- generated build outputs
- unrelated documents outside Storefront refactor scope

## PR Note Template

```md
## Summary
Refactors Storefront frontend ownership so Customer Dashboard, Discovery, F&B, Services, Simple, Hospitality, and shared helpers live in their dedicated folders instead of growing `StorefrontApp.jsx`.

## Motivation
`StorefrontApp.jsx` had become too large and merge-prone. This PR continues the SOLID/MVVM refactor so each storefront mode owns its own UI, route, model, and runtime behavior while preserving existing routes and backend contracts.

## Testing
- Scoped Storefront ESLint: [paste result]
- Targeted Storefront Vitest: [paste result]
- `npm --prefix frontend run build:store`: [paste result]
- Manual QA: [list routes checked]
```

## Next Refactor Slice

Recommended next slice:

- Extract Services Step 2 review composition from `ServiceBookingSteps.jsx` into `ServiceBookingReviewStep.jsx`.

Why:

- It is Services-owned.
- It is lower risk than map/location or checkout submit logic.
- It keeps shrinking a large component without changing backend contracts.
