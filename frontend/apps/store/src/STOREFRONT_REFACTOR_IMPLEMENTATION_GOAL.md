# Storefront Refactor Implementation Goal

> Status: active execution guide
>
> Read this together with:
>
> - `STOREFRONT_REFACTOR_PLAN.md`
> - `STOREFRONT_FRONTEND_ARCHITECTURE_GUIDE.md`
> - `STOREFRONT_REFACTOR_PROGRESS_REPORT.md`

## Goal

Complete the Storefront frontend refactor by reducing `StorefrontApp.jsx` into a thin app shell while preserving current UI, routes, backend contracts, and storefront behavior.

The active implementation goal is:

- keep `StorefrontApp.jsx` responsible only for route detection, mode detection, and feature container mounting
- move feature-owned state, effects, handlers, model mapping, and large JSX into the correct ownership folders
- keep Customer Dashboard, Discovery, F&B, Services, Simple, Hospitality, and shared tracking concerns separated
- record every safe refactor slice with validation evidence

## Architecture Rules

Follow SOLID and practical MVVM.

- Views render UI only.
- ViewModels/hooks prepare state and actions.
- Models normalize data, build payloads, and own contract helpers.
- Shared code must be truly mode-neutral.
- Mode-specific behavior must stay inside the owning mode folder.

Do not add new feature logic to `StorefrontApp.jsx`.

## File Size Guardrails

Line count is a warning signal, not a success metric.

- App shell files: target 300 lines, warning at 500 lines.
- Route containers and hooks: target 250 lines, warning at 400 lines.
- View components: target 200 lines, warning at 300 lines.
- Model and utility files: target 150 lines, warning at 250 lines.
- Tests: target 250 lines, warning at 400 lines.

If a file crosses the warning limit, the next related edit should extract a focused helper, hook, model, or child component before adding more behavior.

## Implementation Phases

### Phase 1: Shell Stabilization

Move low-risk constants, helpers, and derived state out of `StorefrontApp.jsx`.

Done when:

- shared helpers live under `shared/`
- route shell behavior stays unchanged
- app builds after each slice

### Phase 2: Customer Dashboard Ownership

Move dashboard tabs, route state, drawer/page presentation, business access, notifications, and sign-out presentation into `customer-dashboard/`.

Done when:

- dashboard tabs no longer live in `StorefrontApp.jsx`
- `/map-dgfy/account` still works
- dashboard drawer mode still works
- POS redirect logic is owned by dashboard hooks/model

### Phase 3: F&B Storefront Ownership

Move F&B hero, catalog, categories, product details, reviews, promos, and storefront section composition into `modes/fnb/storefront/`.

Done when:

- F&B storefront page JSX is mode-owned
- F&B product-detail route props are mode-owned
- F&B promo card UI is mode-owned
- Simple and Services storefront modes are not affected

### Phase 4: F&B Checkout Ownership

Move F&B cart drawer, guest details, OTP, promo application display, order summaries, delivery/pickup state, and payment step UI into `modes/fnb/checkout/`.

Done when:

- F&B checkout body does not live in `StorefrontApp.jsx`
- guest OTP proof handling stays in F&B checkout ownership
- promo/discount summary rows are consistent across cart, checkout, tracking, and success views
- checkout payload behavior is covered by tests

### Phase 5: F&B Tracking Ownership

Move F&B tracking route, drawer data path, order snapshot normalization, polling, and active/completed tracking views into `modes/fnb/tracking/`.

Done when:

- tracking page and drawer route assembly are mode-owned
- shared tracking primitives live under `tracking/shared/` only when mode-neutral
- order items render in drawer and full tracking view

### Phase 6: Discovery Ownership

Move search, filters, map runtime, marker rendering, cluster behavior, and result panel behavior into `discovery/`.

Done when:

- discovery runtime does not live in `StorefrontApp.jsx`
- cluster clicks and result panels are discovery-owned
- map marker behavior is model/view separated
- Discovery remains cross-mode and not tied to F&B

### Phase 7: Services, Simple, And Hospitality Ownership

Keep each non-F&B mode inside its own mode folder.

Done when:

- Services code stays under `modes/services/`
- Simple code stays under `modes/simple/`
- Hospitality code stays under `modes/hospitality/`
- no mode is re-inlined into `StorefrontApp.jsx`

### Phase 8: Legacy Cleanup

Delete obsolete compatibility blocks only after proving they are unused.

Done when:

- `rg` confirms old imports are gone
- targeted tests pass
- `build:store` passes
- live routes render without console errors

## Required Slice Workflow

Use this workflow for every refactor slice:

1. Read the plan and architecture guide.
2. Select one ownership boundary only.
3. Move code into the owning folder.
4. Keep route and UI behavior unchanged.
5. Update imports.
6. Run targeted tests.
7. Run `git diff --check`.
8. Run `npm --prefix frontend run build:store`.
9. Record the slice in `STOREFRONT_REFACTOR_PROGRESS_REPORT.md`.

## Progress Record Template

Add this entry format to the progress report after every slice:

```md
### YYYY-MM-DD - Slice Name

- Owner: `modes/fnb/checkout`
- Changed:
  - moved X out of `StorefrontApp.jsx`
  - added Y hook/component/model
- Preserved:
  - routes
  - UI
  - backend contracts
- Validation:
  - targeted tests: pass/fail/not run
  - `git diff --check`: pass/fail
  - `npm --prefix frontend run build:store`: pass/fail
  - live preview: pass/fail/not run
- StorefrontApp.jsx line count:
  - before: N
  - after: N
- Notes:
  - remaining risk or next safe slice
```

## Current Baseline

Current measured `StorefrontApp.jsx` size:

- `10,078` lines

This remains above the target and should continue shrinking through safe feature-boundary extraction.

## Next Recommended Slice

Move the next low-risk shell-owned view, pure model helper, or F&B checkout/shared component adapter out of `StorefrontApp.jsx`.

Scope:

- prefer pure view/model extraction over route rewrites
- do not touch checkout submit, tracking polling, map clustering, Services booking, or Simple checkout in the same slice
- keep `StorefrontApp.jsx` shrinking
- run a live console gate before and after the slice

Reason:

- the legacy `Components/storefront` source tree has already been cleaned up
- the remaining work is shell shrinkage by ownership boundary
- the safest next cuts are generic shared views, F&B checkout component ownership, F&B tracking route ownership, or Discovery runtime pieces selected one at a time
