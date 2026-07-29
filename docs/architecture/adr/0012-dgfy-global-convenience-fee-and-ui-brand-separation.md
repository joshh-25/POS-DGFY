---
status: accepted
authority_level: authoritative
owner: architecture
date: 2026-04-23
last_reviewed: 2026-04-23
review_by: 2026-10-23
applies_to: architecture_decision
topic: dgfy_global_convenience_fee_and_ui_brand_separation
---

# ADR 0012: DGFY Global Convenience Fee and UI Brand Separation

## Status
Accepted (2026-04-23)

## Context
POS and storefront checkout previously depended on order-method fee matrices (`pos_order_method_fees`) and POS payload override behavior (`service_fee_amount`). This created cross-surface pricing drift and inconsistent receipt labels. At the same time, UI rebranding requirements need DGFY-facing names without mutating legal fiscal issuer metadata used for compliance.

## Decision
Adopt one mandatory cross-surface fee policy and branding split:

1. Pricing policy
   - `service_fee_amount = round4(gross_subtotal * 0.01)` for all new POS/storefront transactions.
   - POS total: `(gross_subtotal - discount_amount) + service_fee_amount`.
   - Storefront total: `gross_subtotal + delivery_fee + service_fee_amount`.
   - Fee label snapshot: `DGFY convenience fee`.
   - Fee override is retired; runtime ignores caller `service_fee_amount`.
2. Snapshot persistence and compatibility
   - Keep existing DB fields and exports: `service_fee_*`.
   - Persist `service_fee_overridden=false` for new transactions.
   - Keep `service_fee_method_snapshot` from order method for traceability.
   - Forward-only behavior: no historical recompute/backfill.
3. Branding separation
   - Operator/customer UI branding uses `DGFY`.
   - Legal/fiscal issuer fields (`pos_business_name`, TIN/PTU/MIN/accreditation, etc.) remain unchanged and visible where required.
   - Receipt footer appends exact line: `Discover Goods For You`.
4. Settings behavior
   - `pos_order_method_fees` is deprecated for runtime pricing.
   - Setting remains read-compatible for historical rows only; editing UX is removed.

## Consequences
1. Cross-boundary consistency improves (POS + storefront + reports + receipts) with one fee engine.
2. Legacy clients sending `service_fee_amount` remain compatible, but value is ignored.
3. Compliance math remains unchanged: service fee stays non-VAT in VAT buckets/exports.
4. Future pricing customization now requires explicit governance (new ADR) instead of settings-level mutation.
