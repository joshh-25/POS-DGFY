---
status: reference
authority_level: reference
owner: architecture
last_reviewed: 2026-05-09
applies_to: docs_navigation
topic: docs_index
---

# Documentation Index

Canonical planning entry:
- `docs/START_HERE.md`

## Sections
- `docs/architecture`
- `docs/api`
- `docs/compliance`
- `docs/database`
- `docs/development`
- `docs/deployment`
- `docs/features`
- `docs/generated`
- `docs/guides`
- `docs/images`
- `docs/ops`
- `docs/setup`
- `docs/reference`
- `docs/templates`
- `docs/testing`
- `docs/proposals`
- `docs/_meta`
- `docs/archive`

## Current Focus Areas
- Storefront and tenant-location rollout docs are primarily under `docs/api`, `docs/testing`, and `docs/reference`.
- POS hardening and terminal operations evidence are primarily under `docs/testing`.
- POS/storefront source separation contract is maintained in `docs/features/POS_STOREFRONT_SOURCE_SEPARATION_CONTRACT.md` with validation evidence in `docs/testing/pos-readiness-status.md`.
- Expanded workflow-mode template behavior and backward-compatible family semantics are governed by ADR 0008 + ADR 0014 and current feature/testing docs.
- Services Mode independence, booking/ticketing, mode-native IMS/POS/Storefront behavior, stock-exempt POS service sales, and the Food Manufacturing rename are governed by ADR 0016 and `docs/development/MODE_DEVELOPMENT_PLAYBOOK.md`.
- POS offline replay hardening (durable queue statuses + Sync Queue operations console) is tracked in POS feature/testing docs and ADR 0014.
- Storefront discovery/catalog cache-header contracts and route-level no-store behavior are tracked in API/testing docs and ADR 0014.
- Tenant first-login onboarding advisory questionnaire classification is tracked in `docs/features/DGFY_UNIFIED_ONBOARDING_PLAN.md` and API contracts in `docs/api/specification.md`.
- Customer Access Modes and Inventory Display are implemented behind `CUSTOMER_ACCESS_MODES_ENABLED` and the tenant allowlist `CUSTOMER_ACCESS_MODES_ENABLED_TENANTS`. The feature contract is tracked in `docs/features/CUSTOMER_ACCESS_MODES_AND_INVENTORY_DISPLAY.md` and governed by ADR 0017.
- Barcode Identity, Labels, and Scan Routing is tracked in `docs/features/BARCODE_IDENTITY_LABELS_AND_SCAN_ROUTING.md` and governed by ADR 0018. It covers tenant-local manufacturer/internal barcodes, printable labels, IMS scan prefill, POS scan eligibility, Storefront QR, Services/tickets, offline replay revalidation, and conflict handling.
- Food & Beverage Mode is tracked in `docs/features/FOOD_AND_BEVERAGE_MODE.md` and governed by ADR 0019. It covers restaurant menu modifiers, dining areas/tables, open checks, kitchen tickets, multi-table reservations/waitlist requests, restaurant service-charge snapshots, POS additive metadata, and lazy Storefront restaurant/map surfaces.
- Mode-Aware RBAC and Role Presets is tracked in `docs/architecture/adr/0020-mode-aware-rbac-and-role-presets.md`, `docs/architecture/RBAC_DESIGN_PROPOSAL.md`, `docs/setup/ADMIN_SETUP.md`, `docs/api/specification.md`, and `docs/development/MODE_DEVELOPMENT_PLAYBOOK.md`. New mode work must declare role presets, permission groups, sensitive actions, route guards, location scope, tests, and docs before implementation is considered complete.
- Tenant provisioning/model-clone readiness for future modes is tracked in `docs/development/MODE_DEVELOPMENT_PLAYBOOK.md` and ADR 0014/0016/0019/0020. New mode work that adds tenant-local tables or foreign keys must prove `tenantModelFactory` clone coverage, disposable schema sync, and retryable approval cleanup before readiness is claimed.
- Mode-aware item CSV import/export for corrected modes is tracked in `docs/api/specification.md`, ADR 0014, `docs/development/MODE_DEVELOPMENT_PLAYBOOK.md`, `docs/features/SERVICES_MODE.md`, and `docs/features/FOOD_AND_BEVERAGE_MODE.md`. Food Manufacturing, MSME, Services, and F&B exports use the import-template headers as the canonical round-trip contract; legacy `type=items|products|master` exports remain compatibility behavior.
- Settings tab/section ownership and deep-link anchors are tracked in `docs/features/SETTINGS_INFORMATION_ARCHITECTURE.md`.
- PWA installability and service-worker surface ownership are tracked in `docs/deployment/PWA_SURFACE_CONTRACT.md`.
- Shared-hosting degraded mode and Redis-capable VPS mode are tracked in `docs/ops/HOSTING_PROFILES.md`, with profile validation through `scripts/check-hosting-profile.js`.
- PM2 production runtime uses root `ecosystem.config.cjs` as the canonical ecosystem file for backend, IMS, POS, and Storefront. Current production readiness steps and exact gate caveats are tracked in `docs/ops/DEPLOYMENT_GUIDE.md`, `docs/ops/PRODUCTION_CHECKLIST.md`, `docs/ops/NO_STAGING_RELEASE_STANDARD.md`, and `docs/testing/release-go-no-go-checklist.md`.
- Storefront cover/profile upload ingress is tracked in `docs/ops/DEPLOYMENT_GUIDE.md` and `docs/features/STOREFRONT_SERVICE_MODE_CURRENT_STATE.md`. VPS deploys install an Nginx `client_max_body_size 8m;` guard so IMS Settings photo uploads reach backend validation instead of failing at the proxy with `413`.
- Namecheap shared-hosting artifact deploys are tracked in `docs/ops/NAMECHEAP_SHARED_CICD.md`, with CI artifacts and `.github/workflows/deploy-namecheap-shared.yml`.
- Tenant registration approval policy is tracked in `docs/features/TENANT_MANAGEMENT.md` and `docs/api/specification.md`. `manual` remains the default, new pending/active registrations are premium-capable by plan metadata, and `TENANT_REGISTRATION_APPROVAL_MODE=auto_standard` temporarily provisions manual registrations immediately before the frontend follows with a normal login call.
- Public company registration abuse limits are tracked in the same tenant/API docs and configured through `RATE_LIMIT_TENANT_REGISTRATION_WINDOW_MS` plus `RATE_LIMIT_TENANT_REGISTRATION_MAX_REQUESTS`.
- Compliance governance, classification floors, and PH regulatory mapping are under `docs/compliance`.
- Compliance evidence and submission packet are under `docs/compliance/evidence/` and `docs/compliance/submission/`.
- Compliance Final Review documentary requirements are tenant self-serve in Settings > Compliance (backend stores tenant records; submission docs remain internal reference).
- Compliance activation readiness browser E2E and startup regression guardrails are under `docs/testing/README.md`.
- Historical compliance remediation packets are archived under `docs/archive/compliance/2026-04-07`.
- Historical exploratory testing packets are archived under `docs/archive/testing/`.
- Historical SKU expansion/storefront planning snapshots are archived under `docs/archive/reference/2026-03/`.
- Architecture and planning authority remain under `docs/architecture` and `docs/START_HERE.md`.

## Current Repository Notes
- Build artifacts are generated into `dist-apps/` and `frontend/dist/` and should be treated as disposable outputs.
- Vite caches under `frontend/node_modules/.vite*`, repository `.tmp/` gate output, and root `logs/` runtime output are generated/local artifacts; delete only after confirming they are not needed as current evidence.
- Local AI export temp files are runtime data under `backend/storage/temp-ai-exports/`; they are private runtime artifacts, ignored by Git, and must not be moved under public `/uploads`.
- Deployment state metadata is kept in `.deploy-state/` and is used by `scripts/deploy.sh` as runtime state only.
- Historical/non-governed root docs are supplemental only; governed sources are under `docs/`.
