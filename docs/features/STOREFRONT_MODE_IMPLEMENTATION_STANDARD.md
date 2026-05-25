---
status: reference
authority_level: reference
owner: storefront
last_reviewed: 2026-05-22
applies_to: frontend_storefront_modes
topic: storefront_mode_implementation_standard
---

# Storefront Mode Implementation Standard

## Purpose
Define the required implementation pattern for adding or refactoring storefront modes so teams keep:
- consistent UI across modes
- backend contract alignment per mode
- low risk of cross-mode regressions
- clean, maintainable frontend structure

This standard applies to the storefront app under `frontend/apps/store`.

## Scope
This document governs:
- Hero section
- Promo section
- Customer reviews section
- Footer section
- Shared-vs-mode-specific component boundaries

This document does not change backend contracts. Each mode keeps its own backend behavior.

## Core Rule
Use a shared presentation shell + mode-specific data and behavior.

Do not create full duplicate page implementations per mode.

## Required Architecture Pattern

### 1. Shared Presentational Components
Keep visual sections shared when the UI pattern is the same:
- `components/storefront/hero/StorefrontHeaderNav.jsx`
- `components/storefront/hero/StorefrontHeroNameCluster.jsx`
- `components/storefront/hero/StorefrontShareQr.jsx`
- `components/storefront/sections/StorefrontPromoSection.jsx`
- `components/storefront/sections/StorefrontReviewsSection.jsx`
- `components/storefront/sections/StorefrontFooterSection.jsx`

Rules for shared components:
- presentation-only
- no API calls
- no payload shaping
- no mode branching for backend semantics
- configurable only through props

### 2. Mode-Specific Wrappers
Each mode keeps its own wrapper and logic:
- F&B mode wrapper/flow
- Services mode wrapper/flow
- Simple/MSME mode wrapper/flow
- future modes (example: manufacturing) must add their own wrapper

Rules for mode wrappers:
- own backend-facing data mapping
- own CTA actions and workflow transitions
- own mode-specific copy and operational rules
- pass normalized props to shared sections

### 3. Backend Alignment Rule (Non-Negotiable)
Each mode must remain aligned to its own backend contract.

Never force a shared UI change that mutates another mode’s backend behavior.

Examples:
- F&B checkout/tracking semantics remain F&B-specific
- Services booking semantics remain services-specific
- Simple/MSME catalog semantics remain simple-specific

## Implementation Checklist For New Mode

1. Create mode view model / adapter for backend payload normalization.
2. Implement mode wrapper component with mode-specific behavior only.
3. Reuse shared hero/promo/reviews/footer components.
4. Pass mode data through props; do not edit shared components for mode-specific backend logic.
5. Add or update tests for:
- mode contract behavior
- shared section rendering compatibility
- regression checks for existing modes
6. Run validation before merge:
- `npm --prefix frontend exec vitest run <relevant storefront tests>`
- `npm --prefix frontend run build:store`
- `npm run lint:docs` if docs are changed

## Refactor Safety Rules

1. One structural extraction at a time.
2. Preserve existing rendered UI during extraction.
3. Remove only dead local helpers after replacement is live.
4. Verify after every meaningful step (tests + build).
5. No backend edits during frontend-only extraction tasks.

## Do/Do Not

Do:
- centralize repeated section markup in shared presentational files
- keep mode wrappers responsible for backend-specific behavior
- keep props explicit and typed-by-shape (even in JS, keep prop contracts clear)
- prefer small, reversible refactor steps

Do not:
- duplicate shared sections per mode without necessity
- introduce mode conditionals in shared components that encode backend semantics
- change another mode’s workflow while working on one mode unless explicitly required
- use restore/reset workflows that can overwrite active storefront UI

## Required Review Gate For Storefront Mode Work

PR or handoff must include:
- changed files list
- impacted modes list
- confirmation of backend contract impact:
  - `none` or exact mode-specific impact
- test evidence
- build evidence

## Quick Template For Future Modes (Example: Manufacturing)

When adding `Manufacturing` mode:

1. Add mode wrapper and view model.
2. Reuse:
- `StorefrontHeaderNav`
- `StorefrontHeroNameCluster`
- `StorefrontShareQr`
- `StorefrontPromoSection`
- `StorefrontReviewsSection`
- `StorefrontFooterSection`
3. Keep manufacturing-specific logic in wrapper:
- lead time
- MOQ
- batch/order semantics
- manufacturing-specific actions
4. Validate existing modes are unchanged.

## Change Management Note
If a new mode requires visual patterns that cannot be represented via existing shared props, extend shared components in backward-compatible steps and verify all existing modes still render correctly.
