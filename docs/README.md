---
status: authoritative
authority_level: authoritative
owner: architecture
last_reviewed: 2026-05-04
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
- `docs/compliance`: compliance guide, control matrix, preflight workflow, ops cadence
  - includes classification floor matrix (`docs/compliance/compliance-classification-matrix.md`)
  - includes evidence and submission packet docs under `docs/compliance/evidence/` and `docs/compliance/submission/`
  - active compliance docs index: `docs/compliance/README.md`
- `docs/database`: schema contracts
- `docs/development`: environment setup and workflow docs
- `docs/deployment/PWA_SURFACE_CONTRACT.md`: PWA manifest/service-worker surface contract and readiness checklist
- `docs/features`: feature behavior docs
- `docs/setup`: operational setup steps
- `docs/testing`: verification and audit protocols
- `docs/reference`: supporting plans, checklists, and quick references
- `docs/guides/SCRIPTS_GUIDE.md`: operational script inventory (including compliance activation seeding script)
- `docs/archive`: historical artifacts only (including archived exploratory testing packets)

## Current Product Surfaces
- `frontend/apps/skupervisor`: tenant/admin IMS workflows
- `frontend/apps/pos`: POS terminal and operations
- `frontend/apps/store`: public storefront, quote, checkout, and tracking

## Implemented Behind Flag
- Customer Access Modes and Inventory Display controls are implemented behind `CUSTOMER_ACCESS_MODES_ENABLED` and the tenant-scoped rollout allowlist `CUSTOMER_ACCESS_MODES_ENABLED_TENANTS`. Current behavior, rollout constraints, public API metadata, and validation evidence are tracked in `docs/features/CUSTOMER_ACCESS_MODES_AND_INVENTORY_DISPLAY.md` and governed by `docs/architecture/adr/0017-customer-access-modes-and-inventory-display.md`.

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
1. Tenant workflow mode accepts 11 template values (`retail`, `services`, `manufacturing`, `food_manufacturing`, `fnb`, `hospitality`, `healthcare`, `ticketing_transport`, `logistics_distribution`, `education_institutions`, `msme`) with backward-compatible family behavior (`manufacturing` vs `msme`) per ADR 0008, ADR 0014, and ADR 0016. User-facing `manufacturing` is Food Manufacturing, while `manufacturing` remains a legacy alias.
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
13. Tenant first-login onboarding now supports business classification (`business_classification`) with deterministic snapshot outputs (`visibility_mode`, `customer_access_mode`, `inventory_display_mode`, `monetization_tier`, `workflow_mode_recommendation`, `compliance_path_hint`) while keeping readiness completion gates unchanged.
14. Settings information architecture is split by user mental model: Profile, Company, Storefront, POS Setup, Compliance, and System (`docs/features/SETTINGS_INFORMATION_ARCHITECTURE.md`).
15. SKUpervisor/admin, POS, and Storefront all have PWA source contracts with manifests and service-worker entrypoints; admin/SKUpervisor service-worker caching bypasses `/api/` and `/uploads/`.
16. Hosting mode is selected from one codebase by environment profile (`shared` or `vps`) and validated by `npm run preflight:shared` / `npm run preflight:vps`; runtime capabilities are visible through `/health`, `/api/v1/health`, and Admin > Hosting.
17. Services Mode is a first-class workflow mode across IMS, POS, and Storefront. It uses item-backed service catalog rows plus service metadata, appointment bookings, resources/providers, waitlist, intake forms, reminder outbox, client signals, and stock-exempt POS service sales.
18. Standard company registration defaults to manual platform-admin approval. `TENANT_REGISTRATION_APPROVAL_MODE=auto_standard` is the temporary opt-in path for immediately provisioning standard tenants and signing the founder in through the normal login API; premium/subscription registration remains blocked while `PAYMENTS_ENABLED=false`.
19. Public company registration has its own strict IP limiter (`RATE_LIMIT_TENANT_REGISTRATION_WINDOW_MS` and `RATE_LIMIT_TENANT_REGISTRATION_MAX_REQUESTS`) because `auto_standard` can create tenant databases from a public request.
20. Customer Access Mode is the runtime storefront capability contract behind a controlled rollout flag. Discovery/profile/catalog responses expose additive access metadata; `ghost` suppresses public item-search/catalog rows, `catalog` and `inquiry` suppress cart/quote/checkout/booking, and `transaction` preserves current ordering/booking behavior subject to existing stock, location, compliance, and payment gates.
21. Inventory Display is independent from Customer Access Mode. Public storefront payloads keep raw `current_stock` and `cost_per_unit` private while exposing only the normalized `inventory_display` object allowed by tenant settings.
22. POS and Storefront item catalog controls are independent. POS uses `pos_catalog_overrides`; Storefront uses `storefront_catalog_overrides`. POS-derived Storefront fallback is allowed only when the Storefront override table is unavailable during rollout, not when an individual Storefront override row is missing.

## Rules
1. Use authoritative docs first.
2. Do not use deprecated docs for new design decisions.
3. Update docs in the same PR when code behavior changes.
4. Run `npm run check:compliance` to enforce both declaration and API contract drift gates for compliance-sensitive changes.
