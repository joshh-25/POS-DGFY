---
status: reference
authority_level: reference
owner: product
last_reviewed: 2026-04-25
applies_to: tenant_onboarding_and_storefront_bootstrap
topic: dgfy_unified_onboarding_plan
---

# DGFY + DGFY POS + SKUpervisor Unified Onboarding Plan

## 0) Official Product Terms
- `DGFY`: Tenant storefront (public-facing ecommerce page per tenant).
- `DGFY POS`: Point-of-sales surface.
- `SKUpervisor`: Inventory management system.
- Product direction: all three surfaces are connected.

## 1) Vision Alignment Baseline (As Of 2026-04-25)

### Vision Target
1. Store owner registers a store.
2. On first login, a short setup questionnaire appears (asset-first onboarding).
3. A tenant storefront page in DGFY is automatically available using template-based UI/UX.

### Current Closeness Score
- **Overall closeness: 56%**

### Layman Evidence (What Exists Today)
1. Registration exists, but standard flow is still admin-approved before activation.
- Evidence: registration creates `pending` request and returns pending status for manual review path (`backend/src/modules/tenants/usecases/registerCompanyRequestUseCase.js`).
- Evidence: tenant management feature doc states standard onboarding uses pending -> admin approval (`docs/features/TENANT_MANAGEMENT.md`).

2. Storefront page infrastructure exists and is auto-bootstrapped at provisioning.
- Evidence: provisioning seeds storefront location and bootstraps discovery index so slug route works after approval (`backend/src/services/tenantProvisioningService.js`).
- Evidence: public discovery/profile API exists (`GET /api/v1/storefront/discovery`, `GET /api/v1/storefront/discovery/:slug`) (`backend/src/routes/storefrontDiscovery.js`).
- Evidence: store slug resolution to tenant context exists via `x-store-slug` in tenant middleware (`backend/src/middleware/tenantHandler.js`).

3. Storefront branding assets can already be uploaded from Settings.
- Evidence: `POST/DELETE /api/v1/settings/storefront-assets/:asset_type` documented and implemented (`docs/api/specification.md`, `backend/src/routes/settings.js`, `frontend/Pages/Settings.jsx`).

### Layman Evidence (What Is Missing)
1. No forced first-login onboarding questionnaire flow.
- Evidence: login flow authenticates and navigates directly to dashboard (`frontend/Pages/Login.jsx`), auth session response has no onboarding/setup-required contract (`backend/src/services/authService.js`).

2. No defined required-vs-optional onboarding asset gate for first use.
- Current asset upload is available in Settings, but not a guided first-login blocker with completion state.

3. No explicit onboarding progress state model (for example: `pending_setup`, `setup_in_progress`, `setup_completed`) enforced across DGFY, DGFY POS, and SKUpervisor entry.

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

## 5) Implementation Plan (Template-Based, No AI Generation)

### Phase 1: Contract + State Model
1. Add onboarding state contract in tenant context/settings domain.
2. Define completion checklist keys and deterministic completion evaluator.
3. Add ADR 0013 for cross-boundary decision and rollout rules.

### Phase 2: First-Login Guided Setup
1. On successful login, route new/incomplete tenants to onboarding wizard before normal dashboard usage.
2. Wizard sections:
- Brand basics (logo + store name)
- Business contact/legal
- Storefront location defaults
- First sellable product quick-create
3. Persist progress after each step and allow safe resume.

### Phase 3: Storefront Readiness Binding
1. Keep template-based storefront generation.
2. Auto-enable DGFY storefront visibility when required checklist passes.
3. Keep storefront page editable through existing Settings after completion.

### Phase 4: Connected Surface Entry Rules
1. DGFY POS and SKUpervisor show setup-status banner until onboarding is complete.
2. Enforce route-level readiness for storefront-critical actions while minimizing POS/IMS disruption.

### Phase 5: Telemetry + QA
1. Add events: onboarding started, step completed, onboarding completed, onboarding abandoned.
2. Add integration tests for first-login gating, resume, and storefront auto-enable behavior.

## 6) Verification
- Unit tests:
- Onboarding state evaluator
- Required checklist enforcement
- Integration tests:
- Register -> approve -> first login -> wizard -> completion -> storefront reachable
- Regression checks for existing settings/storefront routes
- CI gates:
- `npm run check:architecture`
- `npm run lint:docs`
- Existing backend/frontend tests
- Monitoring:
- Onboarding drop-off rate
- Time-to-first-storefront-live
- Setup failure reason distribution

## 7) Rollout & Rollback
- Rollout strategy:
- Feature flag: `tenant_first_login_onboarding_enabled`
- Start with newly approved tenants only
- Expand to existing tenants with incomplete readiness later
- Rollback strategy:
- Disable feature flag to return to current login behavior
- Preserve saved onboarding progress/settings data (non-destructive)
- Operational safeguards:
- Keep current Settings asset upload endpoints intact
- Keep storefront discovery/profile contracts backward-compatible

## 8) Exception Tracking
- New architecture allowlist exception introduced: `none` (planned)
- Removal plan required for temporary exceptions: `n/a` at planning stage

## 9) Boundary + Freshness Validation Checklist
- Boundaries/governance reviewed before planning: `yes`
- Authoritative doc freshness checked (`last_reviewed`): `yes`
- Deprecated/historical docs used for planning decisions: `no`
- Cross-boundary ADR requirement identified: `yes`
