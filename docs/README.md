---
status: authoritative
authority_level: authoritative
owner: architecture
last_reviewed: 2026-04-28
applies_to: all_documentation_users
topic: docs_hub
---

# Documentation Hub

Start here for all planning and implementation work:

- `docs/START_HERE.md`

## High-Value Sections
- `docs/architecture`: architecture boundaries, governance, ADRs
- `docs/api`: API specs and integration guides
- `docs/ops`: production runbooks, no-staging hard-gate policy, and release checklists
- `docs/compliance`: compliance guide, control matrix, preflight workflow, ops cadence
  - includes classification floor matrix (`docs/compliance/compliance-classification-matrix.md`)
  - includes evidence and submission packet docs under `docs/compliance/evidence/` and `docs/compliance/submission/`
  - active compliance docs index: `docs/compliance/README.md`
- `docs/database`: schema contracts
- `docs/development`: environment setup and workflow docs
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

## Repository Structure Snapshot
- `backend/`: Express + Sequelize modular-monolith backend
- `frontend/`: multi-surface Vite workspace (legacy and `apps/*` surfaces coexist during migration)
- `packages/`: shared/internal packages used by app surfaces
- `scripts/`: repo-level automation and governance scripts
- `dist-apps/`, `frontend/dist/`: generated build output (non-source)

## Documentation Scope
- Governed implementation and architecture docs live under `docs/`.
- Root-level operational docs (for example `SETUP.md`, `QUICK_START.md`, `TROUBLESHOOTING.md`) remain as supplemental reference while migration continues.
- `docs/archive/` is historical only and is non-authoritative for new planning.
- Historical compliance remediation packets from April 2026 are archived under `docs/archive/compliance/2026-04-07/`.
- Historical SKU expansion/storefront planning snapshots from March 2026 are archived under `docs/archive/reference/2026-03/`.
- Compliance activation readiness browser E2E guidance is maintained in `docs/testing/README.md`.

## Current Behavior Notes
1. Tenant workflow mode accepts 11 template values (`retail`, `services`, `manufacturing`, `food_manufacturing`, `fnb`, `hospitality`, `healthcare`, `ticketing_transport`, `logistics_distribution`, `education_institutions`, `msme`) with backward-compatible family behavior (`manufacturing` vs `msme`) per ADR 0008 and ADR 0014.
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
11. Tenant first-login onboarding now supports advisory business classification (`business_classification`) with deterministic snapshot outputs (`visibility_mode`, `monetization_tier`, `workflow_mode_recommendation`, `compliance_path_hint`) while keeping readiness completion gates unchanged.

## Rules
1. Use authoritative docs first.
2. Do not use deprecated docs for new design decisions.
3. Update docs in the same PR when code behavior changes.
4. Run `npm run check:compliance` to enforce both declaration and API contract drift gates for compliance-sensitive changes.
