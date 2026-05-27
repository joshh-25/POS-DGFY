---
status: authoritative
authority_level: authoritative
owner: product
last_reviewed: 2026-05-24
applies_to: dgfy_customer_account, storefront_account, customer_tracking
topic: dgfy_customer_account
---

# DGFY Customer Account

## Current Contract

The public DGFY surface has two account-related entry points:

1. **Log in / Sign up** opens the front-facing DGFY customer account experience.
2. **Register Your Business** routes to company registration and must not be used as the general customer login path.

DGFY accounts are landlord-scoped. Tenant-local `store_customers` remain tenant-isolated compatibility rows and can be lazily linked to a DGFY account with `dgfy_account_id`.

## Guest Users

Guest users can:

- Browse discovery, tenant storefronts, catalogs, services, and mode-specific storefront views.
- Quote and checkout when Customer Access Mode allows transactions.
- Receive a tracking PIN or public booking reference.
- Track a known reference.
- Request tracking recovery with an email or phone lookup. Production responses are always generic and do not expose whether a match or delivery channel exists.
- Create or sign in to a DGFY account from the customer account surface.

## Signed-In DGFY Users

Signed-in DGFY users can:

- View their DGFY profile, email, phone, order activity, bookings, tickets, addresses, and loyalty summary.
- Use their DGFY JWT on storefront routes; the backend links or creates the tenant-local store customer row.
- See cross-store customer activity through `/api/v1/dgfy/customer/dashboard`. The dashboard opportunistically backfills recent tenant order activity by account email and common Philippine phone variants before returning the landlord activity index.
- Operators can run a full historical customer activity backfill with `npm run backfill:dgfy-customer-activity:apply`. Apply mode runs landlord migrations first, then scans customer-facing activity across tenant databases. The dry-run command is `npm run backfill:dgfy-customer-activity -- ...`; it pages all DGFY accounts and tenants without writing activity rows. Historical backfill covers POS customer orders, Services bookings, and Hospitality reservations, writes a `dgfy_customer_backfill_runs` audit row in apply mode, and supports `--fail-fast`, `--include-inactive-tenants`, `--tenant-page-size`, `--order-batch-size`, `--account-page-size`, `--transaction-limit-per-tenant`, and `--require-activity-types=order,service_booking,hospitality_booking`. Use the required activity type gate in production dry-runs when the release must prove Hospitality rows exist before apply. Dry-run may continue without a run-log row when the audit table is not present, but apply mode is schema-strict after migration.
- Track account-linked references through `/api/v1/dgfy/customer/track`.
- Cancel eligible account-linked orders while the order is `placed` or `confirmed`.
- Request reorder cart lines for an eligible prior order. Checkout still revalidates current price, stock, visibility, Customer Access Mode, and fulfillment rules.
- Submit product reviews only for purchased items from paid or completed account activity. Reviews start as pending approval.
- Manage global saved addresses, including create, update, delete, and set default.
- View read-only loyalty balance and recent transactions. The balance is calculated from all DGFY loyalty transactions, not only the visible recent row limit.
- See company memberships and invitations through the existing DGFY account contract.

## API Surface

Global customer endpoints:

- `GET /api/v1/dgfy/customer/dashboard`
- `GET /api/v1/dgfy/customer/orders`
- `GET /api/v1/dgfy/customer/bookings`
- `POST /api/v1/dgfy/customer/track`
- `POST /api/v1/dgfy/customer/orders/:reference/cancel`
- `POST /api/v1/dgfy/customer/orders/:reference/reorder`
- `GET /api/v1/dgfy/customer/addresses`
- `POST /api/v1/dgfy/customer/addresses`
- `PUT /api/v1/dgfy/customer/addresses/:address_id`
- `PATCH /api/v1/dgfy/customer/addresses/:address_id`
- `PATCH /api/v1/dgfy/customer/addresses/:address_id/default`
- `DELETE /api/v1/dgfy/customer/addresses/:address_id`
- `GET /api/v1/dgfy/customer/loyalty`
- `POST /api/v1/dgfy/customer/reviews`
- `POST /api/v1/dgfy/customer/tracking-recovery/request`
- `POST /api/v1/dgfy/customer/tracking-recovery/verify`

## Deferred Risks

- Phone verification is intentionally deferred. Phone numbers are contact data only and must not be presented as verified.
- Loyalty redemption is not included in this rollout.
- Public display and moderation management for product reviews remain separate merchant/admin UX work.
- Tracking recovery currently sends email when an order email is available; phone OTP delivery remains future work. Phone lookup accepts common Philippine formats for matching only.
- The dashboard's request-time recent backfill remains intentionally bounded for latency safety. Full historical completeness for POS orders, Services bookings, and Hospitality reservations is handled by the explicit operator backfill command, not by broad request-time scans.

## Validation

Current validation must include:

- `npm run check:architecture`
- `npm run lint:docs`
- `npm --prefix backend test -- --runInBand tests/dgfyCustomerUseCases.test.js`
- `npm run backfill:dgfy-customer-activity -- --tenant-page-size 1 --transaction-limit-per-tenant 1`
- `npm run backfill:dgfy-customer-activity -- --all-transactions --require-activity-types=order,service_booking,hospitality_booking` when production release evidence must prove all three customer-facing modes are present.
- DGFY auth and Storefront checkout/order regression tests.
- `npm --prefix frontend run build:store`
- Rendered desktop and mobile storefront smoke checks for the discovery account drawer, recovery panel, address controls, loyalty summary, order actions, and company-registration separation.
