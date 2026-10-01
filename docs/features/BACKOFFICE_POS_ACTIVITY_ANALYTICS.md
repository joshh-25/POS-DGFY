---
status: authoritative
authority_level: authoritative
owner: product-and-pos
last_reviewed: 2026-10-01
review_by: 2027-04-01
applies_to: apps/dgfy-opis, apps/dgfy-api
topic: backoffice_pos_activity_analytics
---

# Back Office POS Activity Analytics (#2193)

OPIS administrators get a configurable, location-filtered view of POS
operating activity, payment volume, and customer counts over a Manila-time
date range, plus recurring historically quiet weekday/hour periods as
planning guidance. API aggregation lives in `apps/dgfy-api` under the
existing Business Admin module boundary
(`routes -> controllers -> usecases -> repositories`); the UI lives in
`apps/dgfy-opis` per ADR 0087. No ADR change is needed: ownership
boundaries are preserved.

## Source of truth

Server-side, tenant-scoped `pos_transactions` records. PostHog browser
events are consent-gated, lossy, and lack reliable tenant/location
dimensions; they must never recompute these metrics.

## Metric definitions

- **Qualifying sale**: one completed POS transaction with `payment_status`
  `paid`. Split-tender allocations never multiply the sale; the persisted
  transaction `total_amount` is summed once per sale.
- **Excluded**: voided transactions, refund-related or otherwise unpaid
  payment states (`unpaid`, `payment_pending`, `partially_paid`, `failed`,
  `refund_pending`, `partial_refunded`, `refunded`), and online orders
  without completed fulfillment — following the canonical POS reporting
  source rule (`in_store` or `NULL` source, plus `online_store` only when
  fulfillment is `completed`).
- **Distinct linked customers**: count of distinct `store_customer_id`
  values among qualifying sales — explicit tenant profile links only.
  Qualifying sales without a linked profile are reported separately as
  `unlinked_transaction_count` and are never merged by name, email, or
  phone snapshot.
- **Quiet periods**: recurring weekday/hour slots (Manila time) ranked by
  average qualifying sales per weekday occurrence in the selected range.
  Payment and customer columns are context only; ranking uses the
  sale-count average. The profile always covers all 168 weekday/hour
  slots, including zero-activity ones.
- **No PII**: the endpoint returns aggregates only — no customer names,
  contact details, transaction-level customer data, or other-tenant data.

## Guidance and exclusions

- Branch operating schedules are unknown to this view. A zero-activity slot
  may mean the branch was closed, not that demand was low; results are
  observed activity only.
- Quiet periods are historical planning guidance. They do not establish
  that deployment, updates, or tests are currently safe.
- Live deployment-safety assessment would additionally require current
  terminal, checkout, and synchronization state, which this view does not
  assess and must never be read as providing.

## PostHog's remaining exploratory role

PostHog stays useful for consent-gated exploratory behavior analysis only:
`discovery_viewed`, `discovery_search_submitted`,
`discovery_category_selected`, `discovery_store_card_clicked`,
`store_viewed`, `store_catalog_filtered`, `item_viewed`,
`cart_item_added`, `cart_item_removed`, `checkout_started`,
`checkout_step_completed`, `promo_code_applied`, `order_placed`,
`checkout_failed`, `pos_order_completed`,
`pos_payment_method_selected`, `pos_shift_opened`, `pos_shift_closed`,
and `pos_offline_queue_flushed` funnels and dashboards. No additional
event instrumentation is added by this feature; the existing named funnel
events already cover the exploratory surface the issue asks to document.

## Contract

- `GET /api/v1/business-admin/pos-activity-analytics` with `date_from`,
  `date_to` (`YYYY-MM-DD`, Manila; default today; 366-day maximum) and
  optional `branch_id`, under Business Admin authorization and
  server-derived location grants. See `docs/api/specification.md`.
- OPIS `POS activity` workspace in the Reports navigation group renders
  the daily trend, customer summary, quiet-period ranking, definitions,
  and the historical-guidance copy above, with loading, error, empty, and
  filtered states.
