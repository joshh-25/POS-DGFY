---
status: reference
authority_level: reference
owner: product
last_reviewed: 2026-05-08
applies_to: storefront_ui_only_work
topic: storefront_ui_implementation_brief
---

# Storefront UI Implementation Brief

## Current Status
This brief is now the implementation reference for the Storefront UI work merged back to `master` on 2026-05-08. It is not a new architecture source of truth; current behavior is reflected in `docs/features/STOREFRONT_SERVICE_MODE_CURRENT_STATE.md` and `docs/features/CUSTOMER_ACCESS_MODES_AND_INVENTORY_DISPLAY.md`.

Implemented code paths from this brief are concentrated in:
- `frontend/apps/store/src/StorefrontApp.jsx`
- `frontend/apps/store/src/main.jsx`
- `frontend/apps/store/src/normalizeStorefrontPageModel.js`
- `frontend/apps/store/src/servicesStorefrontViewModel.js`
- `frontend/apps/store/src/modePresentationRegistry.js`

The implementation stayed within the planned boundary: Storefront frontend only, no backend contract change, no POS behavior change, and no SKUpervisor authoring change.

## 1) Scope

### Problem statement
The current storefront must evolve into a content-driven, data-driven responsive UI that adapts to tenant content coming from SKUpervisor, remains usable when content is missing or partial, and presents customer flows that differ by business mode and customer access mode.

### In-scope changes
- Storefront UI/UX only.
- Storefront rendering, layout behavior, and customer-facing interaction flow.
- Normalized storefront view model inside the storefront app.
- Responsive containers and section-level graceful degradation rules.
- Mode-aware storefront templates and CTA behavior using existing tenant data and runtime rules.
- Service-mode storefront implementation using `ABeeZee` as the reference tenant.

### Out-of-scope changes
- No SKUpervisor UI changes.
- No POS UI changes.
- No new content-authoring flows in SKUpervisor.
- No backend contract changes unless a hard blocker is discovered.
- No business-rule rewrites for onboarding, workflow modes, customer access modes, or compliance.

## 2) Working Definition

We are redesigning only the storefront presentation layer into a content-driven, data-driven, responsive UI with graceful degradation.

- Content-driven: layout emphasis, section order, and section visibility are shaped by real tenant content rather than by fixed placeholders.
- Data-driven: storefront components are assembled from normalized tenant data, settings, assets, and mode metadata coming from SKUpervisor.
- Responsive: layout containers, spacing, section composition, and typography adapt fluidly across desktop and mobile.
- Graceful degradation: when tenant data is missing or incomplete, the storefront reduces cleanly instead of breaking layout, leaving empty shells, or exposing dead actions.
- Mode-aware: customer flows and CTA behavior differ by business mode and customer access mode while using the same source-of-truth data contracts.

Core UX principle:

Design for variable content first, then make it responsive.

## 3) Authoritative Documentation Used

- `docs/START_HERE.md` (authoritative, last_reviewed: 2026-03-06)
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md` (authoritative, last_reviewed: 2026-03-06)
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md` (authoritative, last_reviewed: 2026-03-06)
- ADR references:
  - `docs/architecture/adr/0008-tenant-workflow-mode-msme-simplification.md`
  - `docs/architecture/adr/0013-tenant-first-login-onboarding-and-storefront-readiness-contract.md`
  - `docs/architecture/adr/0014-multi-template-modes-pos-offline-sync-and-storefront-cache-contracts.md`
  - `docs/architecture/adr/0016-services-mode-independent-booking-and-ticketing.md`
  - `docs/architecture/adr/0017-customer-access-modes-and-inventory-display.md`
- Domain references:
  - `docs/features/SETTINGS_INFORMATION_ARCHITECTURE.md`
  - `docs/features/CUSTOMER_ACCESS_MODES_AND_INVENTORY_DISPLAY.md`
  - `docs/features/DGFY_UNIFIED_ONBOARDING_PLAN.md`

## 4) Architecture Impact

- Classification for this brief: `within-existing-boundary`
- Affected layer: storefront frontend app
- Boundary risk: medium
- ADR needed: `not currently`

This brief assumes the work remains storefront-only and consumes existing contracts from SKUpervisor and backend APIs as-is. If implementation reveals a need for new API fields, changed settings semantics, or changed behavior in SKUpervisor/POS/backend, pause implementation and reclassify the work before proceeding.

## 5) Source-Of-Truth Contract

- SKUpervisor remains the only content-authoring source for storefront content, branding, settings, contact details, access mode, inventory display, and storefront item visibility/media.
- Storefront consumes existing APIs and settings contracts.
- Storefront does not invent missing business meaning.
- If a field is absent, the storefront reduces the experience cleanly rather than filling gaps with misleading defaults.

## 6) Phase 1: Normalized View Model And Graceful Layout Rules

### Goal
Create a storefront view-model layer and a resilient section system that can render complete or incomplete tenant content without broken UX.

### Deliverables
- A normalized storefront view model that converts raw storefront data into render-ready UI state.
- A visibility contract for optional storefront sections.
- Empty-state and collapse rules for missing content.
- Desktop/mobile layout rules for every storefront section.

### Required section model
- Hero / branding
- Quick facts / trust strip
- About
- Categories
- Featured products or services
- Gallery
- Reviews
- Promo
- Contact / action area

### Graceful degradation rules
- Missing cover image: hero still renders with a valid fallback composition.
- Missing profile image: branding remains legible and visually balanced.
- Missing tagline: hero compresses without leaving empty text blocks.
- Missing about copy: remove the about section entirely.
- Missing gallery: hide gallery section and reflow surrounding sections.
- Missing review data: hide review blocks and avoid fake review placeholders.
- Missing promo data: hide promo card entirely.
- Missing social/contact fields: render only valid channels and avoid empty labels.
- Sparse categories or catalog entries: preserve hierarchy without oversized empty containers.

### Responsive rule
Containers must tolerate:
- long text
- short text
- no image
- optional image
- variable card counts
- variable CTA counts
- partial branding

## 7) Phase 2: Mode-Aware Templates And Customer Flows

### Goal
Use the Phase 1 layout foundation to present different storefront experiences by business mode and customer access mode.

### Service-mode reference tenant
Use `ABeeZee` as the model for service mode.

Observed tenant reference as of 2026-05-06:
- workflow mode: `services`
- current catalog orientation: laundry services and aircon cleaning services

### Mode-aware expectations
- Service mode: service-first layout, booking/order intent, trust and contact clarity, category-led discovery.
- Non-service modes: different content hierarchy and CTA patterns while still using the same normalized layout foundation.

### Customer access mode expectations
Respect existing runtime behavior for:
- `ghost`
- `catalog`
- `inquiry`
- `transaction`

The UI may change CTA prominence, copy, visibility, and action flow, but it must not bypass or contradict backend runtime enforcement.

## 8) UX Constraints

- Do not change SKUpervisor authoring flow.
- Do not change POS behavior.
- Do not add frontend assumptions that conflict with mode or access-mode policy.
- Do not leave empty shells for optional sections.
- Do not rely on one fixed storefront density or one ideal content shape.
- Do not assume service-mode and product-mode tenants share the same first CTA.

## 9) Verification

### Functional verification
- Tenant with full storefront content
- Tenant with minimal storefront content
- Tenant with missing media
- Tenant with missing reviews/promo/social links
- Service-mode storefront using `ABeeZee`
- Customer access mode permutations where applicable

### UI verification
- Desktop layout
- Mobile layout
- Section collapse and reflow when content is missing
- Long-text and short-text tolerance

### Guardrail verification
- Storefront consumes existing source-of-truth data only
- No SKUpervisor files changed for this phase
- No POS files changed for this phase
- No backend contract changes introduced for this phase

## 10) Rollout And Rollback

### Rollout
- The UI work was developed on `codex/storefront-merged-pilot` and selectively merged into `master` because the pilot branch was based behind current `master`.
- The merged state preserves newer `master` contracts for customer access modes, Storefront/POS catalog separation, F&B storefront behavior, and Storefront follow/discovery tests.
- Production rollout should deploy the committed `master` state through the repo deployment script after local validation passes.

### Rollback
- Revert storefront frontend changes only.
- No tenant data or backend behavior rollback should be required for UI-only work.

## 11) Exception Tracking

- New architecture allowlist exception introduced: `none`
- New backend exception introduced: `none`
- Reclassification trigger: any need to change backend, SKUpervisor, POS, or settings contract behavior

## 12) 2026-05-08 Validation Snapshot
- `npm --prefix frontend exec vitest run apps/store/src/__tests__` passed 12 storefront test files and 55 tests.
- `npm --prefix frontend run build:store` passed with the known Vite large chunk warning.
- `npm run lint:docs` passed.
- `npm run check:architecture` passed.
- `git diff --check` passed.
- Local browser smoke at `/tenant-store` rendered without console errors.
