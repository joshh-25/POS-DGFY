# Storefront Shared UI Guide

## Purpose

This guide explains what should be shared across Storefront modes and what must remain owned by a specific mode. It prevents duplicated UI while keeping F&B, Services, Simple, Hospitality, and future modes independent.

## Shared Means Reusable Without Mode Assumptions

A module belongs in `shared/` when two or more Storefront modes can use it without importing business-specific rules.

Shared code should receive normalized props. It must not inspect raw API responses or decide how an order, booking, promotion, or tracking payload works.

## Shared Ownership

### `shared/components/`

Use for reusable presentation such as:

- storefront header and navigation primitives
- footer and public contact sections
- drawer frames and modal shells
- promo card presentation
- review presentation
- customer identity and saved-address cards
- empty, loading, and closed states
- generic checkout summary rows

### `shared/hooks/`

Use for cross-mode React synchronization such as:

- viewport and responsive state
- generic cart persistence synchronization
- reusable document and browser event handling

Hooks must not contain F&B ordering, Services booking, or Simple checkout rules.

### `shared/model/`

Use for pure, reusable models such as:

- cart storage and expiry
- customer-details storage
- common catalog normalization
- business-hours display models
- reusable error normalization
- currency, date, and label formatting

### `shared/theme/`

Use semantic tokens such as `brandPrimary`, `surface`, `textStrong`, and `actionPrimary`. Shared components should consume semantic tokens instead of hardcoded business colors. This allows future tenant branding without rewriting mode components.

### `shared/utils/`

Use for business-neutral helpers such as:

- public URL builders
- QR URL builders
- stable identifier helpers
- external-link helpers
- shared formatting utilities

## Feature Boundaries That Are Not Shared UI

`discovery/` and `customer-dashboard/` are cross-mode features, but they are not generic shared UI. They own their route state, models, and pages because they represent complete product capabilities.

Universal tracking drawer presentation can be shared. Tracking payload normalization, polling, and mode-specific statuses remain owned by the applicable mode.

## Mode-Owned Responsibilities

Each `modes/<mode>/` folder owns:

- mode-specific storefront composition and hero behavior
- menu, service, product, or booking catalog interpretation
- cart or booking state with mode-specific fields
- checkout or booking route orchestration
- request payload construction
- promotion eligibility and application behavior
- tracking payload normalization and polling
- order, booking, or completion success behavior

Shared presentation may render these models, but it must not own their business rules.

## Dependency Rules

- A mode may import from `shared/`.
- `shared/` must not import from any mode.
- One mode must not import from another mode.
- Views must not call APIs or normalize raw responses.
- Hooks coordinate state and side effects.
- Model modules normalize data and implement pure rules.
- Route pages compose the feature and pass normalized props to views.
- `StorefrontApp.jsx` mounts routes and shared shells only.

## Adding a New Storefront Mode

1. Create `modes/<mode>/storefront/`.
2. Add `checkout/`, `booking/`, or `tracking/` only when the mode needs them.
3. Within each capability, use `pages/`, `components/`, `hooks/`, and `model/` as needed.
4. Normalize backend data in the mode model or hook.
5. Reuse shared components through normalized props.
6. Register the mode in the app runtime.
7. Add only a thin route mount to `StorefrontApp.jsx`.
8. Add mode-level tests and run the Storefront build.

## File-Size Guardrails

Line count is a warning signal, not the design goal.

| Module | Target | Review warning |
| --- | ---: | ---: |
| App shell | 300 lines | 500 lines |
| Route container or hook | 250 lines | 400 lines |
| View component | 200 lines | 300 lines |
| Model or utility | 150 lines | 250 lines |
| Test file | 250 lines | 400 lines |

Split a file earlier when it owns more than one business capability or becomes difficult to review and test.

## Review Checklist

- Is the code reusable without mode-specific conditions?
- Is business behavior owned by the correct mode?
- Are raw API responses normalized before reaching views?
- Does the dependency direction remain `mode -> shared`?
- Is `StorefrontApp.jsx` limited to route and shell composition?
- Are mobile and desktop states covered?
- Are targeted tests and `build:store` passing?

## Related Documents

- [`refactor/STOREFRONT_REFACTOR_PLAN.md`](refactor/STOREFRONT_REFACTOR_PLAN.md)
- [`refactor/STOREFRONT_FRONTEND_ARCHITECTURE_GUIDE.md`](refactor/STOREFRONT_FRONTEND_ARCHITECTURE_GUIDE.md)
- [`docs/development/STOREFRONT_FRONTEND_CODING_STANDARD_AND_FILE_OWNERSHIP.md`](../../../../../docs/development/STOREFRONT_FRONTEND_CODING_STANDARD_AND_FILE_OWNERSHIP.md)
- [`docs/features/STOREFRONT_MODE_IMPLEMENTATION_STANDARD.md`](../../../../../docs/features/STOREFRONT_MODE_IMPLEMENTATION_STANDARD.md)
