---
status: reference
authority_level: reference
owner: architecture
last_reviewed: 2026-05-24
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
- New Business Mode selectors hide the legacy `manufacturing` alias while persisted legacy `manufacturing` values continue to normalize to Food Manufacturing until a separate governed Manufacturing mode exists.
- Services Mode independence, booking/ticketing, mode-native IMS/POS/Storefront behavior, stock-exempt POS service sales, and the Food Manufacturing rename are governed by ADR 0016 and `docs/development/MODE_DEVELOPMENT_PLAYBOOK.md`.
- POS offline replay hardening (durable queue statuses + Sync Queue operations console) is tracked in POS feature/testing docs and ADR 0014.
- Storefront discovery/catalog cache-header contracts and route-level no-store behavior are tracked in API/testing docs and ADR 0014.
- Tenant first-login onboarding is tracked in ADR 0013 and `docs/api/specification.md`. The current wizard uses optional brand assets, primary storefront location, and mode-aware bulk starter items; merchant-facing starter uploads are labeled `Item image`; future mode work must define onboarding item presets before production readiness.
- Customer Access Modes and Inventory Display are default-on public Storefront contracts. `CUSTOMER_ACCESS_MODES_ENABLED=false` is rollback-only, `CUSTOMER_ACCESS_MODES_ENABLED_TENANTS` supports tenant re-enablement during rollback, and `GET /settings` exposes read-only runtime key `customer_access_modes_enabled` for IMS Settings status. The feature contract is tracked in `docs/features/CUSTOMER_ACCESS_MODES_AND_INVENTORY_DISPLAY.md` and governed by ADR 0017.
- Inventory item/product create-edit flows are covered by `docs/features/CUSTOMER_ACCESS_MODES_AND_INVENTORY_DISPLAY.md` where they intersect POS/Storefront catalog setup. They expose a guarded `Save and exit` action across create/edit modes, keep draft save separate from finalization, and retain internal Storefront catalog image field names while using `Item image` in merchant-facing copy.
- Storefront location pin management, including inactive-pin permanent delete, reference-count blockers, fail-closed tenant-reference inspection, and discovery refresh behavior, is tracked in `docs/features/CUSTOMER_ACCESS_MODES_AND_INVENTORY_DISPLAY.md`, `docs/api/specification.md`, and ADR 0017.
- Barcode Identity, Labels, and Scan Routing is tracked in `docs/features/BARCODE_IDENTITY_LABELS_AND_SCAN_ROUTING.md` and governed by ADR 0018. It covers tenant-local manufacturer/internal barcodes, printable labels, IMS scan prefill, POS scan eligibility, Storefront QR, Services/tickets, offline replay revalidation, and conflict handling.
- Food & Beverage Mode is tracked in `docs/features/FOOD_AND_BEVERAGE_MODE.md`, governed by ADR 0019, and rated through `docs/testing/fnb-operational-readiness-qa.md`. It covers restaurant menu modifiers, dining areas/tables, open checks, kitchen tickets, multi-table reservations/waitlist requests, restaurant service-charge snapshots, POS additive metadata, recipe-driven Storefront/POS checkout, and lazy Storefront restaurant/map surfaces.
- Hospitality Mode is governed by `docs/architecture/adr/0022-hospitality-mode-pms-stay-management.md`. It promotes `hospitality` from placeholder to PMS/stay-management mode with rooms, room types, guests, reservations, stays, folios, housekeeping, maintenance, amenities, facilities, packages, rate plans, public booking, and mode-native RBAC.
- Storefront mode-presentation standing is tracked in `docs/features/STOREFRONT_CURRENT_STANDING.md`. It is the current status reference for the shared storefront template registry, Services storefront view model, F&B storefront view model, duplicate-coordinate marker fanout, MapLibre/WebGL fallback behavior, and the latest storefront regression/build evidence.
- Front-facing DGFY customer accounts are tracked in `docs/features/DGFY_CUSTOMER_ACCOUNT.md` and governed by ADR 0023. The public DGFY surface has separate `Log in / Sign up` and `Register Your Business` actions; signed-in DGFY users can use customer profile, tracking, activity history, recovery, addresses, reviews, loyalty, and company invitations without treating tenant-local `store_customers` as the global account.
- Historical DGFY customer activity backfill is an operator command, not a public API. `npm run backfill:dgfy-customer-activity:apply` runs landlord migrations before writes; dry-runs use `npm run backfill:dgfy-customer-activity -- ...` and can require POS/Services/Hospitality mode discovery with `--require-activity-types=order,service_booking,hospitality_booking`.
- Mode-Aware RBAC and Role Presets is tracked in `docs/architecture/adr/0020-mode-aware-rbac-and-role-presets.md`, `docs/architecture/RBAC_DESIGN_PROPOSAL.md`, `docs/setup/ADMIN_SETUP.md`, `docs/api/specification.md`, and `docs/development/MODE_DEVELOPMENT_PLAYBOOK.md`. New mode work must declare role presets, permission groups, sensitive actions, route guards, location scope, tests, and docs before implementation is considered complete.
- Tenant provisioning/model-clone readiness for future modes is tracked in `docs/development/MODE_DEVELOPMENT_PLAYBOOK.md` and ADR 0014/0016/0019/0020. New mode work that adds tenant-local tables or foreign keys must prove `tenantModelFactory` clone coverage, disposable schema sync, and retryable approval cleanup before readiness is claimed.
- Mode-aware item CSV import/export for corrected modes is tracked in `docs/api/specification.md`, ADR 0014, `docs/development/MODE_DEVELOPMENT_PLAYBOOK.md`, `docs/features/SERVICES_MODE.md`, and `docs/features/FOOD_AND_BEVERAGE_MODE.md`. Food Manufacturing, MSME, Services, F&B, and Hospitality exports use the import-template headers as the canonical round-trip contract; legacy `type=items|products|master` exports remain compatibility behavior.
- Settings tab/section ownership and deep-link anchors are tracked in `docs/features/SETTINGS_INFORMATION_ARCHITECTURE.md`.
- PWA installability and service-worker surface ownership are tracked in `docs/deployment/PWA_SURFACE_CONTRACT.md`.
- Shared-hosting degraded mode and Redis-capable VPS mode are tracked in `docs/ops/HOSTING_PROFILES.md`, with profile validation through `scripts/check-hosting-profile.js`.
- PM2 production runtime uses root `ecosystem.config.cjs` as the canonical ecosystem file for backend, IMS, POS, and Storefront. Current production readiness steps and exact gate caveats are tracked in `docs/ops/DEPLOYMENT_GUIDE.md`, `docs/ops/PRODUCTION_CHECKLIST.md`, `docs/ops/NO_STAGING_RELEASE_STANDARD.md`, and `docs/testing/release-go-no-go-checklist.md`.
- Storefront cover/profile upload ingress is tracked in `docs/ops/DEPLOYMENT_GUIDE.md` and `docs/features/STOREFRONT_SERVICE_MODE_CURRENT_STATE.md`. VPS deploys install an Nginx `client_max_body_size 8m;` guard so IMS Settings photo uploads reach backend validation instead of failing at the proxy with `413`.
- Namecheap shared-hosting artifact deploys are tracked in `docs/ops/NAMECHEAP_SHARED_CICD.md`, with CI artifacts and `.github/workflows/deploy-namecheap-shared.yml`.
- Tenant registration approval policy is tracked in `docs/features/TENANT_MANAGEMENT.md` and `docs/api/specification.md`. `auto_standard` is the default, new registrations are premium-capable by plan metadata, public registration provisions the tenant immediately before the frontend follows with a normal login call, and `manual` remains an explicit rollback/admin-review mode.
- Account-phone rollout state is tracked in `docs/features/TENANT_MANAGEMENT.md`, `docs/api/specification.md`, `docs/database/schema.md`, and `docs/reference/QUICK_REFERENCE.md`. The current production-safe contract is staged enforcement: `observe` by default, `tenant_allowlist` for verified clean tenants, and global `all` only after the phone-rollout closure gate passes.
- Account password policy is tracked in `docs/features/TENANT_MANAGEMENT.md`, `docs/api/specification.md`, and `docs/features/SETTINGS_INFORMATION_ARCHITECTURE.md`. Current registration, invitation acceptance, company founder registration, and Settings > Profile password-change flows enforce only a minimum of 8 characters and expose an optional readable 16-character generator.
- Public company registration abuse limits are tracked in the same tenant/API docs and configured through `RATE_LIMIT_TENANT_REGISTRATION_WINDOW_MS` plus `RATE_LIMIT_TENANT_REGISTRATION_MAX_REQUESTS`.
- Compliance governance, classification floors, and PH regulatory mapping are under `docs/compliance`.
- Compliance-sensitive changes are branch-gated by `npm run check:compliance`; declaration files must satisfy computed classification floors, and `major|regulatory` declarations require preflight metadata.
- Compliance evidence and submission packet are under `docs/compliance/evidence/` and `docs/compliance/submission/`.
- Compliance Final Review documentary requirements are tenant self-serve in Settings > Compliance (backend stores tenant records; submission docs remain internal reference).
- Compliance activation readiness browser E2E and startup regression guardrails are under `docs/testing/README.md`.
- Frontend release-hardening budgets are documented in `docs/testing/README.md`; `npm run check:frontend-budgets` governs route chunks and keeps lazy MapLibre isolated under its dedicated ceiling.
- No-staging release promotion requires exact QA deploy parity. `docs/ops/NO_STAGING_RELEASE_STANDARD.md` defines the hard gate that rejects stale `qa_deploy_summary.txt` evidence when `deployed_head` does not match `RELEASE_TARGET_SHA`.
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
