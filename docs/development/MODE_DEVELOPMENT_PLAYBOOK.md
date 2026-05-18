---
status: authoritative
authority_level: reference
owner: architecture
last_reviewed: 2026-05-07
applies_to: workflow_modes
topic: mode_development
---

# Mode Development Playbook

This playbook records how workflow modes should be made independent one mode at a time.

Use it after the mandatory documentation lookup order:

1. `docs/START_HERE.md`
2. `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
3. `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
4. Relevant ADRs
5. This playbook and domain-specific docs

## Goal

Each mode must feel native to its business type across IMS, POS, and Storefront. A mode is not ready if it only renames another mode's navigation, copies another mode's data assumptions, or hides unrelated pages without adding the mode's real operating workflow.

## Required Mode Build Order

Every mode implementation plan must include explicit RBAC and tenant-provisioning sections. The RBAC section must list the mode's role presets, permission groups, sensitive actions, route guards, location scope rules, legacy/mismatch behavior, tests, and documentation updates. The provisioning section must list every new tenant-local model/table, foreign-key dependency, seed/default data requirement, and approval/auto-approval retry behavior. A mode plan that omits either section is incomplete and must not proceed to implementation.

1. Research the target business type.
   - Identify the daily operator workflow.
   - Identify what admins configure once.
   - Identify what customers see in Storefront.
   - Identify what POS must do quickly during live operations.

2. Update the mode registry.
   - Label, alias behavior, default template, capabilities, route visibility, POS defaults, Storefront behavior, and pin metadata must be explicit.
   - Frontend and backend registries must stay contract-tested.

3. Define mode-native nouns.
   - Services uses services, appointments, clients, providers, resources, waitlist, tickets, and receipts.
   - Food Manufacturing uses production, job orders, dispatch, batches, stock movements, and inventory.
   - Food & Beverage uses menus, modifiers, dining areas, tables, checks, guests, servers, courses, kitchen stations, kitchen tickets, reservations, waitlist requests, ingredients, allergen notes, and restaurant service charge.
   - Do not borrow nouns from another mode unless the domain truly shares the workflow.

4. Define mode-specific access control.
   - Every mode must declare its native role presets, permission groups, and sensitive actions before implementation is considered complete.
   - Add those presets and permission groups to the backend mode role catalog before wiring User Management UI.
   - Role presets are UX/admin templates only. Server authorization must continue to enforce granular permissions and workflow capability guards.
   - Each mode must state which existing generic roles remain valid, which role names are hidden or replaced in that mode, and how current tenant users migrate or retain access when the tenant switches modes.
   - Permission names must map to mode-native nouns where the workflow is mode-specific. For example, F&B should not rely on job-order roles for restaurant checks, table service, kitchen tickets, modifiers, or reservations.
   - Master Admin remains a tenant-level bypass for tenant administration, but mode-sensitive actions still need explicit permission names so audit, UI gating, and non-master-admin delegation are clear.
   - Location-scoped operational roles must state whether access is tenant-wide or limited to assigned locations.

5. Add backend route guards.
   - Hidden UI is not enough.
   - Backend routes that do not belong to a mode must deny access by workflow capability.

6. Add mode-native data contracts.
   - Keep shared primitives where they are correct, such as `item_id` for sellable lines.
   - Add side tables or mode-specific metadata where the shared model does not express the mode.
   - Avoid destructive migration of data hidden by a mode.
   - Treat tenant provisioning as part of the data contract. Every new tenant-local model must be cloned by `backend/src/utils/tenantModelFactory.js`, and every tenant-local foreign key must reference a table present in the cloned tenant schema. Do not rely on a table existing in the default model registry unless the tenant clone contract and tests prove it is included.
   - Approval and auto-approval provisioning failures must leave the landlord tenant row in a valid retryable lifecycle state. Do not introduce temporary statuses outside the landlord `Tenant.status` enum unless the enum, API contract, UI filters, and recovery paths are updated together.
   - Declare stock behavior for every sellable line type as `stock_bearing` or `stock_exempt`. Stock-bearing lines in every mode must use location-scoped FIFO; stock-exempt lines must state why no inventory batch can be affected.
   - Define item creation presets before UI/backend work begins. Each preset must declare its user-facing label, canonical `items.category`, `product_type`, default UOM, allowed UOM groups/units, stock behavior, FIFO default, POS eligibility, Storefront eligibility, and legacy-row behavior. When explicit allowed units are present, both frontend selectors and backend validators must enforce those units instead of expanding to every unit in the allowed group.
   - Define first-login onboarding starter-item behavior before exposing a mode as production-ready. The mode must declare which presets appear in onboarding, which fields are required, which hidden item fields are derived, whether cost/stock/image are optional, and what row-level backend/frontend validation proves partial bulk saves.
   - Define catalog setup behavior before exposing a preset in POS or Storefront. The mode contract must state stock-bearing versus stock-exempt behavior, sale-price and cost requirements, POS visibility defaults and blockers, Storefront visibility defaults and customer-price blockers, image upload behavior, and whether the item should be recommended for POS, Storefront, both, or internal use only.
   - If two presets share the same canonical category/product type, persist the preset key (for example `items.mode_item_preset`) instead of relying on UOM inference to recover user intent.
   - Separate convertible UOMs from valid business presentation units. Automatic conversion is allowed only for weight, volume, and count groups. Presentation and packaging units such as `serving`, `service`, `ticket`, `pack`, `case`, and `bottle` require explicit item-specific conversion before stock math can convert them.

7. Build IMS as the admin/operator console for that mode.
   - Start with the daily workflow.
   - Then add setup pages.
   - Then add reports/history.
   - Keep the first screen simple enough for a small business operator.
   - Item-detail inventory UI for stock-bearing items must show location stock and FIFO batches together. Operators need grouped location summaries, an accessible location filter, per-location cost/value, and a "next to use" batch calculated within the selected location.

8. Build POS for the live transaction moment.
   - POS should show only what the cashier/operator needs now.
   - Avoid admin setup controls in POS unless they unblock immediate transaction work.

9. Build Storefront for the customer's natural path.
   - Use mode-specific item cards, availability, checkout/booking fields, account prompts, and ticket/receipt behavior.
   - Respect the mode's payment and fulfillment policies.
   - Render mode-native required fields at checkout instead of accepting incomplete transactions and asking operators to fix them later.

10. Add tests at every contract boundary.
   - Registry parity.
   - Tenant model factory coverage for every new tenant-local model and foreign-key reference.
   - Disposable tenant schema sync/provisioning coverage across all supported `WORKFLOW_MODE_VALUES`, including placeholder modes that reuse conservative defaults.
   - Failed provisioning cleanup coverage that proves approval retries remain possible after schema, seed, email, or storefront-bootstrap failures.
   - Route guards.
   - Core use cases.
   - Storefront/POS/IMS API contract keys.
   - Privacy and authorization behavior.
   - Mode-specific role preset and permission visibility behavior.
   - Mode-specific edge cases.

11. Rate readiness honestly.
   - Backend architecture.
   - Backend completeness.
   - Privacy/security.
   - RBAC and delegated-operator access correctness.
   - Mode workflow correctness.
   - IMS readiness.
   - POS readiness.
   - Storefront readiness.
   - Test coverage.
   - Release readiness.

## Services Mode Reference Implementation

Services Mode is the first deeper implementation of this pattern.

The target surfaces are:

- IMS: Today, Calendar, Services, Team & Resources, Waitlist, Clients.
- POS: service queue, check-in/start/complete/no-show, collect payment through existing POS checkout, and stock-exempt service sale cards that are not disabled by zero inventory stock.
- Storefront: bookable service catalog, appointment datetime, payment-policy-aware booking, ticket image download, customer account history.
- Backend: service catalog metadata, resources, assignments, bookings, waitlist, clients, lifecycle transitions, availability guards, and mode route guards.
- Service-readiness contracts: reminder outbox, SMTP-backed due reminder processing, intake form capture, provider selection, waitlist preference capture, client retention/no-show signals, and auditable skipped/failed states for communications.

## Readiness Rules

A mode cannot be called production-ready while any of these are true:

- It exposes customer PII through public lookup routes.
- Its UI expects API fields that the backend does not return.
- It inherits another mode's daily workflow as the primary screen.
- It allows impossible lifecycle transitions.
- It shows payment/fulfillment choices disallowed by the mode policy.
- It has no tests for the mode's core contract.
- It cannot provision a fresh tenant database through the shared approval/auto-approval path, or it can leave a failed approval in a non-retryable or invalid landlord status.
- It adds tenant-local tables or foreign keys without tenant model factory coverage and a disposable tenant schema sync proof.
- It introduces architecture allowlist entries without an ADR and removal plan.
- It treats communications as sent without an auditable outbox, delivery status, or provider configuration state.
- It stores mode-specific setup data but does not render or enforce it in the customer/operator workflow.
- It sells or consumes stock-bearing items without preserving the paired `item_location_stocks` plus `fifo_batches.location_id` contract needed for operators to compare per-location batch differences in the frontend.
- It renders FIFO batches without a location-aware operator view, or lets a stale location filter hide valid batches after switching items.
- It has no documented mode-specific RBAC contract for role presets, permission groups, sensitive actions, route guards, and tenant/location scope.

## Documentation Requirements

Every mode hardening pass must update or add:

- An ADR when the change crosses route, data model, POS, IMS, Storefront, or tenant mode semantics.
- A module README for any new backend module.
- This playbook when a reusable mode-development rule is learned.
- User-facing or operator docs when the workflow changes materially.
- Role and permission documentation when a mode adds, hides, renames, or re-scopes operator responsibilities.

## Mode-Aware RBAC Implementation Rule

Mode-aware RBAC is governed by ADR 0020. New mode work must extend the additive catalog instead of introducing another hardcoded role dropdown.

Implementation checklist:

1. Add mode-native permission strings to the backend permission registry.
2. Add role presets to `backend/src/config/modeRolePresets.js`.
3. Include visible permission groups for the mode's User Management surface.
4. Guard mode routes with mode-native permissions plus any intentionally temporary compatibility fallback. Temporary fallback must be feature-flagged, documented, tested both enabled and disabled, and paired with a remapping/removal plan.
5. Add catalog and route-guard tests.
6. Update operator and API docs with the new role preset family.

## Future Mode Item-Correction Checklist

Before changing any placeholder mode item UI, complete this checklist:

1. Add or update the mode ADR with the business purpose, daily workflow, item presets, UOM contract, stock-bearing rules, POS/Storefront eligibility, financial display/readiness rules, and legacy-row behavior.
2. Add the mode to the shared corrected-mode item taxonomy only after the ADR is accepted.
3. Define each preset's cost visibility, selling-price visibility, cost requirement, selling-price requirement, stock-bearing status, FIFO behavior, and reporting treatment before adding UI fields.
4. Ensure POS, Storefront, Dispatch Order, stock movement, COGS, valuation, and profitability/reporting paths use the same preset policy instead of falling back from selling price to item cost.
5. Keep public Storefront behavior customer-safe: public catalog/readiness/checkouts must expose selling price only, must suppress or reject price-less sellable rows, and must never expose `cost_per_unit`.
6. Add backend validation for new non-draft rows and draft finalization.
7. Add frontend item-form preset/UOM/financial-display tests and backend taxonomy/readiness/reporting parity tests.
8. Update CSV templates/import rules for that mode, including preview and confirm validation for optimized bulk-import paths.
9. Keep CSV export and import on the same mode contract. Corrected-mode item exports must reuse the import template definition, include template marker columns, preserve persisted preset keys such as `mode_item_preset`, include customer sale price fields such as `default_sale_price`, and pass a preview-import round trip for the tenant workflow mode. Legacy category-split exports are compatibility behavior only when old callers explicitly request `type=items`, `type=products`, or `type=master`.
10. Define the mode's Catalog Setup contract before promotion:
    - Corrected item presets and mode-native labels.
    - Stock-bearing versus stock-exempt behavior for every POS/Storefront candidate.
    - Sale-price and cost requirements by preset.
    - POS visibility defaults, POS readiness blockers, and service/stock exemptions.
    - Storefront visibility defaults, customer-price blockers, and public cost/privacy boundaries.
    - POS image versus Storefront image behavior, public/private asset boundaries, and cleanup expectations for failed writes.
    - Bulk image upload validation behavior. Unsupported files, duplicate SKU filenames, unmatched SKU filenames, readiness blockers, and failed writes must return per-file results where transport limits allow it.
    - Import/export template columns for visibility, price, cost, images, and preset keys.
    - Onboarding starter-item expectations, including preset choices, which presets count as customer-facing completion starters, required `name` and positive `default_sale_price`, optional cost/stock/image behavior, hidden default derivation, duplicate-row/idempotency behavior, and why zero stock does or does not affect completion readiness.
    - Bulk setup recommendation rules for `Recommended for POS`, `Recommended for Storefront`, `Keep internal`, `Needs setup`, and any mode-specific labels.
    - Backend and frontend tests for single-item setup, bulk visibility, bulk image upload, onboarding readiness, import/export, and all mode fallback behavior.

Current corrected item-taxonomy modes are Food Manufacturing (`food_manufacturing` and legacy `manufacturing`), MSME, Services, and Food & Beverage. Retail, Hospitality, Healthcare, Ticketing & Transport, Logistics & Distribution, and Education & Institutions remain placeholder item-taxonomy modes until their governed mode pass is completed.

Placeholder modes must not gain custom POS, Storefront, image, import/export, or recommendation defaults through one-off UI logic. Until the checklist above is complete, they inherit conservative finished-goods catalog defaults and must be labelled as conservative/default behavior in future implementation notes.

## Future Mode Provisioning Checklist

Before implementing or promoting any future mode, complete this checklist:

1. List every tenant-local model/table the mode adds or extends, including shared tables receiving new foreign keys.
2. Confirm `backend/src/utils/tenantModelFactory.js` clones those models into new tenant databases and excludes only landlord-owned models.
3. Add or update tenant model factory tests so every tenant-local foreign key points to a cloned tenant table.
4. Run a disposable MySQL tenant schema sync against the complete model graph, not only mocked provisioning tests.
5. Run the mode matrix against every value in `WORKFLOW_MODE_VALUES`, including placeholder modes that inherit conservative defaults.
6. Confirm approval and auto-approval failures restore a valid retryable landlord status (`pending` for approval paths) and drop any zombie tenant database safely.
7. Document seed/default data requirements for first-login onboarding, including brand assets, primary storefront location, starter-item presets, customer access settings, role presets, Storefront discovery, and mode-native setup tables.
