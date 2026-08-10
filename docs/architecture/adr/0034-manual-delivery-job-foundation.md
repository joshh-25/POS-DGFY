---
status: amended
authority_level: authoritative
owner: architecture
date: 2026-07-10
last_reviewed: 2026-07-17
review_by: 2027-01-10
applies_to: architecture_decision
topic: manual_delivery_job_foundation
---

# ADR 0034: Manual Delivery Job Foundation

## Decision

Keep `pos_transactions` as the canonical online-order and sales record. Add a tenant-local `delivery_jobs` record only for `order_method=delivery`, created in the same transaction as the online order.

The initial provider is `manual` and the initial state is `pending_dispatch`. This adds no courier API, rider data, live tracking, or Storefront endpoint/UI change. Provider dispatch, signed courier webhooks, event inbox/outbox processing, and inventory reservation are separate follow-up phases.

## Consequences

- Existing Storefront checkout, quote, tracking, and POS status routes remain unchanged.
- A failed delivery-job write rolls back the associated online order creation.
- Future provider integrations must update this ADR and use the modular delivery boundary rather than adding provider calls to Storefront or POS components.

## Validation

- `npm --prefix backend run check:architecture-guardrails`
- Apply the landlord migration and run `npm --prefix backend run repair:tenant-schema` before enabling delivery checkout in an environment.
- Confirm `npm --prefix backend run doctor:runtime` is healthy and `npm --prefix backend run check:tenant-schema` completes without failed tenants.

## Amendments

### 2026-08-07 — POS manual delivery lifecycle control

POS may advance a tenant-local `manual` delivery job through the guarded
transitions `pending_dispatch -> assigned -> picked_up -> delivered` while the
associated online order is `out_for_delivery`. Each mutation requires the
authenticated cashier's open shift at the order location, uses idempotent replay
protection, and records an audit event. POS cannot mutate provider-owned jobs or
write `failed`/`cancelled` states; courier integrations and provider lifecycle
events remain separate follow-up work.

### 2026-08-08 — Manual delivery assignment contract

The manual lifecycle requires a first-class tenant-scoped delivery-person
assignment before `picked_up`, `delivered`, or order completion. Assignment
must record the selected person, assigning actor, location, shift, and
timestamp. The assignment must not be represented only through
`provider_payload`; that field remains an integration seam rather than the
source of truth for POS assignment or accountability.

Cashiers with `pos:transact` may select an active delivery person and advance a
manual job only from an open shift at the order location. Administrator/settings
authority owns the delivery-person registry. Provider-owned jobs remain
read-only in POS. The detailed lifecycle, completion, payment, failure, and
acceptance contract is maintained in
`docs/features/POS_MANUAL_DELIVERY_WORKFLOW.md`.
