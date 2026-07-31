---
status: accepted
date: 2026-07-07
last_reviewed: 2026-07-08
classification: authoritative
---

# ADR 0033: Commercial Promo and Statutory POS Discount Boundaries

## Context

The POS Apply Discount surface previously submitted client-calculated rates and
allocations directly to checkout. Senior/PWD selection was not enforced by the
backend, promo codes were stripped by validation and never checked, employee
identity was free text, and active POS discount rules were not resolved. The
Storefront owns tenant-configured commercial promo contracts with code, rate,
item targets, time window, and usage limit.

## Decision

1. `storefront_promos` is the multi-rule commercial promo configuration for both
   Storefront and POS. `storefront_promo` remains a backward-compatible primary
   promo fallback during rollout. Promo is a commercial discount, never a
   Senior/PWD or other statutory discount.
2. Storefront and POS use one shared commercial promo evaluator. The configured
   code, active state, percentage, target items, time window, and usage limit are
   server-authoritative.
3. Each matched promo rule's `used_count` is tenant-wide across Storefront and POS.
   POS and Storefront checkout lock the relevant setting row, validate the current
   value, and increment only the matched rule in the same database transaction as
   checkout.
4. Senior and PWD discounts remain POS statutory policies. Checkout requires a
   customer name, ID number, and at least one explicitly selected item/quantity.
   A selected item must also have `senior_pwd_discount_eligible = true`; the
   selected quantity cannot exceed the cart quantity. One application represents
   one documented Senior/PWD beneficiary and does not split the POS transaction.
5. Active `pos_discount_rules` own statutory rate/method and employee/manual rule
   constraints. Client values are preview intent only and cannot override a
   configured rule value or maximum discount.
6. Employee discount identity is resolved from an active tenant user by `user_id`.
   The persisted name is the server-resolved username, not submitted free text.
7. Employee and manual discounts require an individual approval PIN belonging to
   an active Admin or Manager. Only the Master Admin may set, replace, or clear
   that PIN, and APIs expose only whether it is configured. Checkout verifies the
   selected approver and persists `manager_approval_id` and approval time.
   Employee self-approval is prohibited.
8. Persist the active rule ID, canonical employee identity, commercial promo code,
   line allocations, and `pos-discount.v2` calculation version. Client-provided
   VAT and discount totals are ignored.
9. The POS modal keeps five visible type cards. Promo exposes only Promo Code;
   Method and Rate remain available only for Employee and Manual intent.
10. Storefront promo checkout persists a `pos_transaction_discounts` promo audit
    row and saved per-line allocations in the same tenant transaction as the
    order. POS details, receipts, and reports read these saved snapshots instead
    of reconstructing promo identity or redistributing targeted discounts.
11. Storefront payment state is server-derived. Only a webhook-confirmed QR Ph
    finalization is persisted as `paid` with provider metadata. Public checkout
    payment selections without verified collection remain `unpaid`; submitted
    client payment status, provider, and reference values are not authoritative.
12. Cash pickup collection is a POS-only, idempotent payment action. It is allowed
    only for an unpaid cash pickup order at `ready_for_pickup` with an active
    cashier shift. The server calculates change and persists collection time,
    cashier, shift, terminal, and an audit record in the same transaction. A
    pickup order cannot transition to `completed` until payment is `paid`.

13. Commercial promos may constrain sales channel (`storefront`, `pos`), Storefront
    fulfillment method (`delivery`, `pickup`), and order timing (`asap`, `scheduled`).
    Storefront scheduled orders evaluate promo date/time windows at `scheduled_for`
    in the tenant storefront timezone. The accepted transaction retains its saved
    promo allocation; it is not repriced after acceptance.
14. Governed POS discount audit evidence records the applying cashier, the selected
    employee identity for employee discounts, and the manager/admin approver when
    approval applies. These audit fields supplement, rather than replace, the saved
    transaction and `pos_transaction_discounts` snapshots.

## Boundary Consequences

The Settings module owns commercial promo configuration. The Users boundary owns
individual approver PIN enrollment and hash storage. Shared policy utilities
own deterministic commercial promo validation and usage-counter update targeting.
The POS use case orchestrates checkout, rule/employee resolution, individual approval
verification, and transactional promo consumption. The POS repository owns rule,
user, setting, and audit writes. The POS domain calculator owns allocation math
without database access.

Cash pickup collection extends the POS/payment boundary without changing any
Storefront route, payload, response, or online-payment webhook contract.

No architecture allowlist or exception is introduced.

## Migration and Rollback

Migration `20260707000001-add-pos-discount-promo-audit.cjs` adds nullable
`promo_code` audit storage and changes the default calculation version. Multiple
commercial promos are stored as JSON in `system_settings.storefront_promos`, so no
additional database table is required for this rollout slice. Rollback removes the
audit column and restores the v1 default. Existing transaction rows are not
rewritten.

Rolling back application code should be coordinated with the migration rollback.
Disabling the shared commercial promo settings immediately blocks new Promo use on
both Storefront and POS without affecting completed transactions.

## Validation

1. POS discount policy, calculator, and validator unit tests.
2. POS checkout database integration test with a configured test database.
3. POS frontend discount-card contract test and production build.
4. Backend lint, architecture guardrails, docs lint, and compliance gates.
5. Rendered POS checks for desktop and tablet before release approval.
6. Individual approval tests for invalid PIN, invalid role, self-approval, and
   persisted approver identity.
7. Storefront promo persistence tests covering canonical promo code, header
   totals, per-line allocation reconciliation, usage-counter atomicity, and POS
   report/receipt consumption.
8. Storefront payment tests proving unverified client metadata cannot create a
   paid order and webhook-confirmed QR Ph retains verified provider evidence.
9. Cash pickup tests for collection success, insufficient cash, closed shift,
   wrong method/order state, duplicate replay, and unpaid completion rejection.

## Authoritative Sources

- `docs/START_HERE.md`
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
- `docs/architecture/adr/0007-pos-storefront-and-payment-boundaries.md`
- `docs/architecture/adr/0017-fiscalization-boundary-and-government-api-adapters.md`
- `docs/architecture/adr/0025-bir-rmo-24-2023-fiscal-document-and-accreditation-closure.md`
