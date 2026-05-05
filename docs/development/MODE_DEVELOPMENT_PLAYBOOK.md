---
status: authoritative
authority_level: reference
owner: architecture
last_reviewed: 2026-05-02
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

4. Add backend route guards.
   - Hidden UI is not enough.
   - Backend routes that do not belong to a mode must deny access by workflow capability.

5. Add mode-native data contracts.
   - Keep shared primitives where they are correct, such as `item_id` for sellable lines.
   - Add side tables or mode-specific metadata where the shared model does not express the mode.
   - Avoid destructive migration of data hidden by a mode.
   - Declare stock behavior for every sellable line type as `stock_bearing` or `stock_exempt`. Stock-bearing lines in every mode must use location-scoped FIFO; stock-exempt lines must state why no inventory batch can be affected.

6. Build IMS as the admin/operator console for that mode.
   - Start with the daily workflow.
   - Then add setup pages.
   - Then add reports/history.
   - Keep the first screen simple enough for a small business operator.

7. Build POS for the live transaction moment.
   - POS should show only what the cashier/operator needs now.
   - Avoid admin setup controls in POS unless they unblock immediate transaction work.

8. Build Storefront for the customer's natural path.
   - Use mode-specific item cards, availability, checkout/booking fields, account prompts, and ticket/receipt behavior.
   - Respect the mode's payment and fulfillment policies.
   - Render mode-native required fields at checkout instead of accepting incomplete transactions and asking operators to fix them later.

9. Add tests at every contract boundary.
   - Registry parity.
   - Route guards.
   - Core use cases.
   - Storefront/POS/IMS API contract keys.
   - Privacy and authorization behavior.
   - Mode-specific edge cases.

10. Rate readiness honestly.
    - Backend architecture.
    - Backend completeness.
    - Privacy/security.
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
- It introduces architecture allowlist entries without an ADR and removal plan.
- It treats communications as sent without an auditable outbox, delivery status, or provider configuration state.
- It stores mode-specific setup data but does not render or enforce it in the customer/operator workflow.
- It sells or consumes stock-bearing items without preserving the paired `item_location_stocks` plus `fifo_batches.location_id` contract needed for operators to compare per-location batch differences in the frontend.

## Documentation Requirements

Every mode hardening pass must update or add:

- An ADR when the change crosses route, data model, POS, IMS, Storefront, or tenant mode semantics.
- A module README for any new backend module.
- This playbook when a reusable mode-development rule is learned.
- User-facing or operator docs when the workflow changes materially.
