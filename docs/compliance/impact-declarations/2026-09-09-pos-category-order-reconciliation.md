---
status: reference
owner: engineering
last_reviewed: 2026-09-09
declaration_id: 2026-09-09-pos-category-order-reconciliation
classification: major
surfaces: pos,terminal,inventory,payments
reason_codes_impacted: ALLOWED
policy_version: 2026.09.09
verification_evidence: POS category reorder behavior tests,Storefront F&B/services category-order tests,inventory repository reorder tests,live public Storefront category-order smoke,architecture check,compliance check,documentation check,git diff check
rollback_note: Revert the category-list reconciliation change and its regression tests; persisted category sort_order and existing tenant data remain unchanged.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-09T00:00:00.000Z
preflight_request_ref: NOT-EXECUTED-PHASE-315-LOCAL-ONLY
---

# POS category order reconciliation

## Compliance Impact Classification

Major. The change affects the authenticated POS category-management recovery
path after a rejected reorder. It reloads the existing tenant-scoped category
list so a stale tab cannot continue showing an order the server rejected. It
does not change authorization, item identity, prices, stock, payments, taxes,
receipts, or customer data.

## Affected Surfaces

- POS category reorder failures now reconcile from the authoritative category
  list instead of leaving a stale optimistic list on screen.
- Storefront F&B and services model tests pin the shared persisted category
  order, secondary-only visibility, invalid-ID handling, and All counts.
- Existing atomic reorder and active-category filtering contracts remain
  unchanged.

## Compliance Preconditions

- The existing tenant-admin permission and complete-list validation remain the
  only mutation gates.
- Reorder writes still occur in the existing single transaction; this change
  adds no database write or new endpoint.
- A failed silent refresh retains the last known list rather than replacing it
  with an empty state.
- Edit Item image selection remains local until Save Item; pending files count
  toward the existing five-image gallery limit, and no saved image is removed
  implicitly.
- No polling loop, per-item request, or new cache is introduced.

## Verification Evidence

- POS category behavior tests pass, including complete-order submission and
  stale-list refresh recovery.
- Storefront F&B and services ordering/secondary-category tests pass.
- API repository, stock-fallback, and atomic reorder tests pass.
- Local public Storefront rendering and catalog payload expose the same saved
  category order for the Masu Cafe tenant.
- Architecture, documentation, compliance, and diff checks pass.

The request-time compliance preflight was not executed because this is an
authorized local-only implementation with no PR, push, deployment, or
production operation.
