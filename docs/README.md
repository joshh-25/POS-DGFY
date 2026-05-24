---
status: authoritative
authority_level: authoritative
owner: architecture
last_reviewed: 2026-05-24
applies_to: all_documentation_users
topic: docs_hub
---

# Documentation Hub

Start here for all planning and implementation work:

- `docs/START_HERE.md`

## High-Value Sections
- `docs/architecture`: architecture boundaries, governance, ADRs
- `docs/api`: API specs and integration guides
- `docs/ops`: production runbooks, hosting profile guidance, no-staging hard-gate policy, and release checklists
  - shared/VPS hosting profile runbook: `docs/ops/HOSTING_PROFILES.md`
  - Namecheap shared GitHub Actions deploy lane: `docs/ops/NAMECHEAP_SHARED_CICD.md`
- `docs/compliance`: compliance guide, control matrix, preflight workflow, ops cadence
  - includes classification floor matrix (`docs/compliance/compliance-classification-matrix.md`)
  - includes evidence and submission packet docs under `docs/compliance/evidence/` and `docs/compliance/submission/`
  - active compliance docs index: `docs/compliance/README.md`
- `docs/database`: schema contracts
- `docs/development`: environment setup and workflow docs
- `docs/deployment/PWA_SURFACE_CONTRACT.md`: PWA manifest/service-worker surface contract and readiness checklist
- `docs/features`: feature behavior docs
  - Food & Beverage Mode: `docs/features/FOOD_AND_BEVERAGE_MODE.md`
- `docs/setup`: operational setup steps
- `docs/testing`: verification and audit protocols
- `docs/reference`: supporting plans, checklists, and quick references
- `docs/guides/SCRIPTS_GUIDE.md`: operational script inventory (including compliance activation seeding script)
- `docs/archive`: historical artifacts only (including archived exploratory testing packets)

## Current Product Surfaces
- `frontend/apps/skupervisor`: tenant/admin IMS workflows
- `frontend/apps/pos`: POS terminal and operations
- `frontend/apps/store`: public storefront, quote, checkout, and tracking

## Default-On Runtime Contracts
- Customer Access Modes and Inventory Display controls are default-on public Storefront contracts. `CUSTOMER_ACCESS_MODES_ENABLED=false` is reserved for rollback, and `CUSTOMER_ACCESS_MODES_ENABLED_TENANTS` can re-enable selected tenants while rollback is active. Current behavior, rollback constraints, public API metadata, Settings runtime status, and validation evidence are tracked in `docs/features/CUSTOMER_ACCESS_MODES_AND_INVENTORY_DISPLAY.md` and governed by `docs/architecture/adr/0017-customer-access-modes-and-inventory-display.md`.

## Current Cross-Boundary Programs
- Barcode Identity, Labels, and Scan Routing is governed by `docs/architecture/adr/0018-barcode-identity-labels-and-scan-routing.md` and described in `docs/features/BARCODE_IDENTITY_LABELS_AND_SCAN_ROUTING.md`. It keeps barcode identities separate from `sku_code`, supports manufacturer/imported and tenant-generated internal codes, emits browser-print label contracts, and routes scans through existing IMS/POS/Storefront/Services rules instead of bypassing them.
- Food & Beverage Mode is governed by `docs/architecture/adr/0019-food-and-beverage-mode-full-service-restaurant.md`, described in `docs/features/FOOD_AND_BEVERAGE_MODE.md`, and rated through `docs/testing/fnb-operational-readiness-qa.md`. It keeps `fnb` as the stable internal workflow code, labels it `Food & Beverage`, and adds restaurant-native tables/checks/modifiers/kitchen/reservation/service-charge contracts without reusing manufacturing job-order workflows.
- Mode-Aware RBAC and Role Presets is governed by `docs/architecture/adr/0020-mode-aware-rbac-and-role-presets.md`. It keeps legacy `users.role`, `users.permissions`, and `is_master_admin` operational while adding `users.role_preset_key`, a backend mode role catalog, mode-native Services/F&B/Hospitality permissions, assigned-location role scope, and backend-driven User Management role catalogs.
- Hospitality Mode is governed by `docs/architecture/adr/0022-hospitality-mode-pms-stay-management.md`. It promotes `hospitality` from placeholder to PMS/stay-management mode with rooms, reservations, stays, guests, folios, housekeeping, maintenance, amenities, facilities, packages, rates, Storefront booking, and mode-native RBAC.
- Storefront mode presentation is tracked in `docs/features/STOREFRONT_CURRENT_STANDING.md` and `docs/proposals/STOREFRONT_UI_IMPLEMENTATION_BRIEF.md`. The current storefront app uses a shared template registry plus Services/F&B view models, preserves customer-access/inventory-display gates, and keeps mode-specific lazy surfaces such as service booking, F&B reservation, and map presentation outside the initial generic catalog shell where possible.
- Front-Facing DGFY Customer Account is governed by `docs/architecture/adr/0023-front-facing-dgfy-customer-account.md` and described in `docs/features/DGFY_CUSTOMER_ACCOUNT.md`. `dgfy.ph` exposes separate `Log in / Sign up` and `Register Your Business` actions, uses landlord-scoped DGFY identity for customer profile/activity/tracking, bridges DGFY JWTs into Storefront customer routes, and keeps tenant-local `store_customers` as compatibility records rather than the global account.
- Tenant provisioning/model-clone hardening is part of the workflow-mode readiness contract. Future mode plans must include tenant-local table and foreign-key mapping, `tenantModelFactory` clone coverage, disposable schema sync evidence across `WORKFLOW_MODE_VALUES`, and retryable approval/auto-approval cleanup behavior.
- Account-phone rollout hardening is tracked in `docs/features/TENANT_MANAGEMENT.md`, `docs/api/specification.md`, `docs/database/schema.md`, and `docs/reference/QUICK_REFERENCE.md`. New company/user registration requires phone capture, historical accepted users are surfaced for remediation, and post-login enforcement now uses staged rollout controls (`observe`, tenant allowlist, then `all`) instead of surprise global lockout.
- Account password policy is tracked in `docs/features/TENANT_MANAGEMENT.md`, `docs/api/specification.md`, and `docs/features/SETTINGS_INFORMATION_ARCHITECTURE.md`. Registration, invitation acceptance, company founder registration, and Settings > Profile password changes require only a minimum of 8 characters; the frontend offers an optional readable 16-character generator on those password-entry flows.

## Repository Structure Snapshot
- `backend/`: Express + Sequelize modular-monolith backend
- `frontend/`: multi-surface Vite workspace (legacy and `apps/*` surfaces coexist during migration)
- `packages/`: shared/internal packages used by app surfaces
- `scripts/`: repo-level automation and governance scripts
- `dist-apps/`, `frontend/dist/`: generated build output (non-source)

## Documentation Scope
- Governed implementation and architecture docs live under `docs/`.
- Root-level operational files are thin compatibility pointers; canonical operational docs are under `docs/setup`, `docs/ops`, and `docs/reference`.
- `docs/archive/` is historical only and is non-authoritative for new planning.
- Historical compliance remediation packets from April 2026 are archived under `docs/archive/compliance/2026-04-07/`.
- Historical SKU expansion/storefront planning snapshots from March 2026 are archived under `docs/archive/reference/2026-03/`.
- Compliance activation readiness browser E2E guidance is maintained in `docs/testing/README.md`.

## Current Behavior Notes
1. Tenant workflow mode accepts 11 persisted/normalized template values (`retail`, `services`, `manufacturing`, `food_manufacturing`, `fnb`, `hospitality`, `healthcare`, `ticketing_transport`, `logistics_distribution`, `education_institutions`, `msme`) with backward-compatible family behavior (`manufacturing` vs `msme`) per ADR 0008, ADR 0014, ADR 0016, ADR 0019, and ADR 0022. New Business Mode selectors hide the legacy `manufacturing` alias so operators see one Food Manufacturing choice; existing `manufacturing` data still normalizes to `food_manufacturing`. Hospitality is PMS/stay-management first rather than a generic retail catalog. A distinct future Manufacturing mode requires its own governed mode pass before it can become selectable.
2. POS setup is wizard-first; item cards no longer host single-item POS setup widgets.
3. POS visibility enablement is readiness-gated with deterministic denial metadata for unresolved requirements.
4. Final Review documentary readiness is tenant self-serve in Settings > Compliance; repo submission docs are reference artifacts, not tenant input.
5. PO/JO quantity inputs use a shared external numeric stepper with right-side vertical controls and display-only UOM abbreviations.
6. POS keyboard quantity/price increment/decrement behavior is standardized to step-by-1; precision sliders in product quality/yield flows remain documented exceptions.
7. POS and storefront checkout transactions are source-separated (`in_store` vs `online_store`) across POS history, Orders mode, and unified sales reporting contracts.
8. Weighted average cost valuation is additive and exposed across inventory, purchasing, dashboard, and reporting flows (ADR 0010).
9. Production release policy is no-staging hard-gated by QA evidence (`docs/ops/NO_STAGING_RELEASE_STANDARD.md`) before deploy.
10. POS terminal location safety now includes audited shift-location remediation and strict-binding readiness guardrails before enabling `pos_terminal_location_binding_enforced=true`.
11. POS offline operations (including checkout replay) use a durable queue contract with explicit statuses (`queued`, `replaying`, `replayed`, `failed_manual_resolution_required`) and operator-facing Sync Queue controls.
12. Storefront discovery/catalog read endpoints now publish explicit HTTP cache contracts while checkout/mutation flows remain `no-store`.
13. Tenant first-login onboarding is a three-step soft-reminder flow: optional storefront profile/cover photos, primary storefront location pin, and mode-aware bulk starter items. Completion requires store name, an active primary storefront location, and one active positively priced starter item; zero stock and item images do not block completion. Merchant-facing onboarding copy labels starter-item uploads as `Item image` while backend Storefront catalog image fields remain unchanged.
14. Settings information architecture is split by user mental model: Profile, Company, Storefront, POS Setup, Compliance, and System (`docs/features/SETTINGS_INFORMATION_ARCHITECTURE.md`).
15. SKUpervisor/admin, POS, and Storefront all have PWA source contracts with manifests and service-worker entrypoints; admin/SKUpervisor service-worker caching bypasses `/api/` and `/uploads/`.
16. Hosting mode is selected from one codebase by environment profile (`shared` or `vps`) and validated by `npm run preflight:shared` / `npm run preflight:vps`; runtime capabilities are visible through `/health`, `/api/v1/health`, and Admin > Hosting. Namecheap shared production deploys use `.github/workflows/deploy-namecheap-shared.yml` plus the runbook in `docs/ops/NAMECHEAP_SHARED_CICD.md`.
   - The canonical PM2 production entrypoint is root `ecosystem.config.cjs`, which runs backend, IMS, POS, and Storefront processes. Do not use obsolete two-process ecosystem shapes for production signoff.
17. Services Mode is a first-class workflow mode across IMS, POS, and Storefront. It uses item-backed service catalog rows plus service metadata, appointment bookings, resources/providers, waitlist, intake forms, reminder outbox, client signals, and stock-exempt POS service sales.
18. Company registration defaults to immediate activation. New registrations are premium-capable by plan metadata, `TENANT_REGISTRATION_APPROVAL_MODE=auto_standard` is the default, and successful public registration provisions the tenant database before the frontend signs the founder in through the normal login API. `TENANT_REGISTRATION_APPROVAL_MODE=manual` remains an explicit rollback/admin-review mode; provider subscription registration remains blocked while `PAYMENTS_ENABLED=false`.
19. Public company registration has its own strict IP limiter (`RATE_LIMIT_TENANT_REGISTRATION_WINDOW_MS` and `RATE_LIMIT_TENANT_REGISTRATION_MAX_REQUESTS`) because the default `auto_standard` path creates tenant databases from public requests.
20. Customer Access Mode is the default-on runtime storefront capability contract. Discovery/profile/catalog responses expose additive access metadata; `GET /settings` exposes read-only runtime key `customer_access_modes_enabled` for IMS Settings status; `ghost` suppresses public item-search/catalog rows, `catalog` and `inquiry` suppress cart/quote/checkout/booking, and `transaction` preserves current ordering/booking behavior subject to existing stock, location, compliance, and payment gates.
21. Inventory Display is independent from Customer Access Mode. Public storefront payloads keep raw `current_stock` and `cost_per_unit` private while exposing only the normalized `inventory_display` object allowed by tenant settings.
22. POS and Storefront item catalog controls are independent. POS uses `pos_catalog_overrides`; Storefront uses `storefront_catalog_overrides`. POS-derived Storefront fallback is allowed only when the Storefront override table is unavailable during rollout, not when an individual Storefront override row is missing. Inventory create/edit flows now expose a guarded `Save and exit` action: new and draft rows save as drafts and close, active rows update and close, and finalization remains limited to the explicit finalize/create/update actions.
23. Barcode scans identify inventory/POS/Storefront/service/ticket/package context only. Assignment conflicts fail closed, POS scans are readiness-gated, service booking/ticket QR scans route instead of becoming cart lines, Storefront QR follows Customer Access Mode, service scans stay stock-exempt, label print intent is audited, and offline POS replay revalidates stored scan metadata server-side.
24. Food & Beverage Mode is a first-class restaurant workflow across IMS, POS, and Storefront. IMS exposes menu modifiers, dining areas/tables, kitchen stations, checks, multi-table reservations/waitlist requests, and restaurant service-charge settings. POS checkout accepts additive F&B table/check/server/guest/course/modifier/kitchen/service-charge snapshots while keeping the DGFY convenience fee in `service_fee_amount`. Storefront lazy-loads F&B reservation and map components so restaurant-only UI does not inflate the initial public catalog entry. Final F&B readiness ratings must run `npm run qa:fnb-readiness` first.
25. Mode-aware RBAC is additive. User Management loads `GET /api/v1/users/role-catalog` for the tenant's active workflow mode, invitations and role updates may submit `role_preset_key`, and users without a preset remain visible as `Legacy <role>`. Assigned-scope presets require explicit location grants when the tenant has multiple active locations; bulk assigned-scope role assignment requires a shared location selection. Services and F&B route guards prefer `services:*` / `fnb:*` permissions and only accept generic fallback permissions while `MODE_RBAC_GENERIC_FALLBACK_ENABLED` remains enabled during legacy remapping.
26. FIFO and location stock are paired for every stock-bearing item across modes. Pure service rows remain stock-exempt, but Services Mode physical add-ons, retail products, consumables, kits, and supplies must be modeled as separate stock-bearing lines and continue through location-scoped FIFO.
27. Item cost and customer selling price are separate contracts across corrected modes. `cost_per_unit`, FIFO cost, weighted average cost, stock movements, valuation, and COGS are internal accounting data; POS, Storefront, Dispatch Orders, and future customer sale surfaces require an explicit positive `default_sale_price` and must not sell at cost by fallback. Placeholder modes must define this financial/readiness contract before they move into corrected item taxonomy.
28. Tenant provisioning is mode-wide, not F&B-only. Fresh tenant schema creation now clones tenant-local models from the canonical model registry while excluding landlord-only models, and provisioning cleanup restores approval paths to retryable valid statuses instead of introducing invalid transient tenant states. Future modes that add tables or foreign keys must prove this with tenant model factory tests and disposable MySQL schema sync.
29. Item CSV export is mode-aware for corrected modes. Food Manufacturing, MSME, Services, and Food & Beverage exports reuse their import-template headers, include template marker columns, preserve `mode_item_preset` and `default_sale_price`, and are expected to preview-import back into the same workflow mode. Legacy `type=items|products|master` category-split exports remain compatibility behavior for old callers.
30. Storefront cover/profile image uploads from IMS Settings are production-ingress guarded. Backend validation allows 5 MiB image files, and VPS deploys install `/etc/nginx/conf.d/skupervisor-client-body-size.conf` with `client_max_body_size 8m;` so normal multipart photo uploads reach the backend before auth and image validation. Operational details are in `docs/ops/DEPLOYMENT_GUIDE.md`; the Storefront feature note is in `docs/features/STOREFRONT_SERVICE_MODE_CURRENT_STATE.md`.
31. Settings > Storefront location pins support add, edit, primary, deactivate/reactivate, and permanent delete for inactive unused pins. Permanent delete is guarded by a tenant-local reference-source manifest, returns `409` with `reference_counts` for operational history, fails closed with `503` when reference inspection is unavailable, and refreshes Storefront discovery after successful deletion.
32. Storefront discovery map pins use preview-first branded marker cards. Duplicate-coordinate pins are separated with display-only marker offsets so each pin remains targetable without changing stored branch coordinates or location-scoped Storefront routing. Selected/highlighted pins use motion-safe glow/ripple styling on the existing marker DOM; normal discovery keeps `pin_scope=tenant_primary`, while the Near Me action switches the request-local scope to `nearest_matching_branch`.
33. Storefront mode presentation is template-driven. Services Mode uses service-specific view-model grouping, availability/hold-backed booking drafts, batch booking, and per-booking confirmation/payment rendering; F&B uses restaurant/menu grouping, default modifier selection, allergen presentation, and a reservation entry point; simple/MSME keeps a lightweight product storefront. The May 14, 2026 local production candidate passed 74 storefront app tests and a tenant-store build with a fresh vendor chunk, replacing the previously reported failing `vendor-BGNbcnYt.js` runtime path.
34. Account-phone rollout is now explicit and staged. New company/user registration and invite acceptance require phone numbers, existing users can correct numbers in Settings > Profile, admins can isolate missing-phone accounts in User Management, and backend enforcement defaults to `PHONE_COMPLETION_ENFORCEMENT_MODE=observe` outside tests. Operators can pilot clean tenants through `tenant_allowlist`, inspect unresolved users with `npm --prefix backend run verify:phone-rollout:users`, prove current config safety with `npm --prefix backend run verify:phone-rollout:config-safe`, and only switch to global `all` mode after `npm --prefix backend run verify:phone-rollout:complete` passes.
35. Account passwords require only a minimum of 8 characters across tenant user registration, invitation acceptance, company founder registration, and authenticated Settings > Profile password changes. The frontend password generator is optional convenience UI, defaults to a readable 16-character password, and fills matching confirmation fields where present.
36. Frontend release hardening includes a governed route-chunk budget gate. `npm run check:frontend-budgets` enforces login, POS, terminal, and sales route ceilings, treats lazy `vendor-maplibre-*` as a separately capped map dependency, and still reports unrelated vendor growth as actionable.
37. Compliance-sensitive delivery work now has two paired branch gates: `npm run check:compliance` requires a declaration file for sensitive paths and enforces computed minimum classification plus strict `major|regulatory` preflight metadata, while the bundled API-contract check fails when compliance-sensitive runtime fields drift from `docs/api/specification.md`.
38. No-staging production promotion requires exact QA deploy parity. `qa_deploy_summary.txt` must show the same `deployed_head` as `RELEASE_TARGET_SHA`; stale QA evidence is a hard release failure unless an explicit emergency bypass is recorded.
39. The front-facing DGFY customer account surface is landlord-scoped and cross-tenant. DGFY customer dashboard/order/history/recovery reads from landlord activity tables, while a bounded request-time sync backfills recent tenant order activity only for latency safety. Full historical completeness uses `npm run backfill:dgfy-customer-activity:apply`, which runs landlord migrations first and then scans POS orders, Services bookings, and Hospitality reservations. Production dry-runs can require mode evidence with `--require-activity-types=order,service_booking,hospitality_booking`.

## Rules
1. Use authoritative docs first.
2. Do not use deprecated docs for new design decisions.
3. Update docs in the same PR when code behavior changes.
4. Run `npm run check:compliance` to enforce both declaration and API contract drift gates for compliance-sensitive changes.
