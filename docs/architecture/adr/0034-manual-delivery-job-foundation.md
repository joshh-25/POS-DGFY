---
status: accepted
date: 2026-07-10
last_reviewed: 2026-07-17
classification: authoritative
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
