---
status: reference
authority_level: reference
owner: product
last_reviewed: 2026-04-26
applies_to: tenant_onboarding_and_storefront_bootstrap
topic: dgfy_unified_onboarding_plan
---

# DGFY + DGFY POS + SKUpervisor Unified Onboarding Plan

## 0) Official Product Terms
- `DGFY`: Tenant storefront (public-facing ecommerce page per tenant).
- `DGFY POS`: Point-of-sales surface.
- `SKUpervisor`: Inventory management system.
- Product direction: all three surfaces are connected.

## 1) Vision Alignment Status (As Of 2026-04-26)

### Vision Target
1. Store owner registers a store.
2. On first login, a short setup questionnaire appears (asset-first onboarding).
3. A tenant storefront page in DGFY is automatically available using template-based UI/UX.

### Current Closeness Score
- **Overall closeness: 97%**

### Layman Evidence (What Exists Today)
1. Registration remains manual-approval first before activation.
- Evidence: registration creates `pending` request and returns pending status for manual review path (`backend/src/modules/tenants/usecases/registerCompanyRequestUseCase.js`).
- Evidence: tenant management feature doc states standard onboarding uses pending -> admin approval (`docs/features/TENANT_MANAGEMENT.md`).

2. First-login onboarding wizard is implemented for tenant master admin.
- Evidence: onboarding routes exist (`GET /onboarding/status`, `PUT /onboarding/step`, `POST /onboarding/complete`, `POST /onboarding/events`) (`backend/src/routes/onboarding.js`).
- Evidence: onboarding metadata is exposed in login/current-user bootstrap for master admin scope (`backend/src/services/authService.js`, `backend/src/services/userService.js`).
- Evidence: onboarding wizard/reminder UI is implemented in app shell (`frontend/Layout.jsx`, `frontend/src/features/onboarding/components/OnboardingSetupModal.jsx`).

3. Storefront page infrastructure exists and is auto-bootstrapped at provisioning.
- Evidence: provisioning seeds storefront location and bootstraps discovery index so slug route works after approval (`backend/src/services/tenantProvisioningService.js`).
- Evidence: public discovery/profile API exists (`GET /api/v1/storefront/discovery`, `GET /api/v1/storefront/discovery/:slug`) (`backend/src/routes/storefrontDiscovery.js`).
- Evidence: store slug resolution to tenant context exists via `x-store-slug` in tenant middleware (`backend/src/middleware/tenantHandler.js`).

4. Storefront branding assets can be uploaded during onboarding and from Settings.
- Evidence: `POST/DELETE /api/v1/settings/storefront-assets/:asset_type` documented and implemented (`docs/api/specification.md`, `backend/src/routes/settings.js`, `frontend/Pages/Settings.jsx`).

### Layman Evidence (What Is Missing)
1. The current approved behavior is **soft reminder**, not hard blocking.
- Users can still enter POS/IMS while onboarding is incomplete.

2. Logo/cover remain optional by approved default.
- Completion is gated by required operational checks (store name baseline, active + primary location, sellable item), not all media assets.

3. Telemetry endpoint currently uses request-level rate limiting and validation, but there is no advanced anomaly alerting policy yet.

## 2) Authoritative Documentation Used
- `docs/START_HERE.md` (authoritative, last_reviewed: 2026-03-06)
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md` (authoritative, last_reviewed: 2026-03-06)
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md` (authoritative, last_reviewed: 2026-03-06)
- ADR references:
- `docs/architecture/adr/0006-skupervisor-expansion-program-boundaries.md`
- `docs/architecture/adr/0008-tenant-workflow-mode-msme-simplification.md`
- `docs/architecture/adr/0010-storefront-discovery-item-match-index-and-union-query.md`
- `docs/architecture/adr/0012-dgfy-global-convenience-fee-and-ui-brand-separation.md`
- Domain references:
- `docs/features/TENANT_MANAGEMENT.md`
- `docs/features/POS_STOREFRONT_SOURCE_SEPARATION_CONTRACT.md`
- `docs/api/specification.md`

## 3) Architecture Impact
- Classification: `cross-boundary`
- Affected layers:
- Frontend onboarding shell/login routing
- Settings + storefront asset flows
- Tenant/domain state in backend use-cases + repositories
- Storefront read-model exposure for setup completeness metadata (if added)
- Boundary risk: medium-high (touches auth entry, settings, storefront visibility behavior)
- ADR needed: `yes` (new ADR required before implementation starts)
- Proposed ADR path:
- `docs/architecture/adr/0013-tenant-first-login-onboarding-and-storefront-readiness-contract.md`

## 4) Onboarding Asset Research (Required vs Optional)

### External Reference Inputs
- Shopify business settings indicate baseline merchant identity/contact info (legal name, business address, phone, email).
- Shopify policy docs enumerate common legal/customer policy pages (return, privacy, terms, shipping).
- Google Merchant product data spec indicates minimum product/feed attributes for discoverability and ecommerce readiness (`id`, `title`, `description`, `link`, `image_link`, `price`, `availability`; `brand` required for many new products and `gtin` strongly recommended when available).
- Stripe statement descriptor docs specify recognizable merchant descriptor requirements for payment clarity and dispute reduction.

### Required At First Login (Blocker To Finish Initial Setup)
1. Brand identity:
- Store display name
- Primary logo (profile image)

2. Store operations:
- At least one active storefront location
- Primary storefront location selected
- Basic fulfillment toggles (delivery/pickup/dine-in) and wait-time/radius defaults

3. Merchant contact and legal minimum:
- Support email
- Support phone
- Business address
- At least placeholder policy links or text for: return, privacy, terms, shipping

4. Minimal sellable catalog readiness:
- At least one sellable item/product with:
- Name/title
- Price
- Stock/availability state
- Main image

### Optional In First Login (Can Be Completed Later)
- Cover/banner image
- Social links
- Story/about section
- Secondary gallery images
- Brand palette/theme preference
- Advanced SEO metadata
- Brand/GTIN enrichment where not yet available

## 5) Implemented Scope (Template-Based, No AI Generation)

### Phase 1: Contract + State Model
1. Added onboarding state contract in tenant settings domain:
- `tenant_onboarding_state`: `not_started | in_progress | completed`
- `tenant_onboarding_started_at`, `tenant_onboarding_completed_at`
- `tenant_onboarding_progress` with checklist snapshot
2. Added deterministic required readiness evaluator and missing-requirement contract.
3. Added ADR:
- `docs/architecture/adr/0013-tenant-first-login-onboarding-and-storefront-readiness-contract.md`

### Phase 2: First-Login Guided Setup
1. On successful login, master admin receives onboarding reminder + wizard for incomplete state.
2. Wizard sections:
- Brand basics (logo + store name)
- Optional branding assets
- Required readiness checks with deep links
3. Persist progress after each step and allow safe resume.

### Phase 3: Storefront Readiness Binding
1. Keep template-based storefront generation.
2. Onboarding completion triggers storefront discovery sync.
3. Keep storefront page editable through existing Settings after completion.

### Phase 4: Connected Surface Entry Rules
1. DGFY POS and SKUpervisor show setup-status banner until onboarding is complete.
2. Soft reminder policy preserved (no hard block).

### Phase 5: Telemetry + QA
1. Added onboarding telemetry events:
- `wizard_viewed`, `reminder_shown`, `reminder_dismissed`, `optional_asset_skipped`
2. Added backend/frontend tests for onboarding contracts and behavior.

## 6) Verification
1. Backend full suite pass (`npm --prefix backend test -- --runInBand`)
2. Frontend full suite pass (`npm --prefix frontend test`)
3. Architecture and docs gates pass:
- `npm run check:architecture`
- `npm run lint:docs`

## 7) Rollout & Rollback
1. Production deployment completed for commit `d652f2be5121901144e6197f61bc6b1283bf8fc8`.
2. Rollback path remains non-destructive:
- Hide onboarding UI and stop onboarding route usage.
- Keep stored onboarding settings for future restore.

## 8) Exception Tracking
- New architecture allowlist exception introduced: `none` (planned)
- Removal plan required for temporary exceptions: `n/a` at planning stage

## 9) Boundary + Freshness Validation Checklist
- Boundaries/governance reviewed before planning: `yes`
- Authoritative doc freshness checked (`last_reviewed`): `yes`
- Deprecated/historical docs used for planning decisions: `no`
- Cross-boundary ADR requirement identified: `yes`
