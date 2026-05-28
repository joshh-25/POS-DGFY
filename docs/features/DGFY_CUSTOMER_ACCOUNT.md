---
status: authoritative
authority_level: authoritative
owner: product
last_reviewed: 2026-05-28
applies_to: dgfy_customer_account, storefront_account, customer_tracking
topic: dgfy_customer_account
---

# DGFY Customer Account

## Current Contract

The public DGFY surface has two account-related entry points:

1. **Log in / Sign up** opens the front-facing DGFY customer account experience.
2. **Register Your Business** routes to company registration and must not be used as the general customer login path.

Tenant storefront headers expose **Log in / Sign up** directly so customers can authenticate or create an account without waiting until checkout.

DGFY accounts are landlord-scoped. Tenant-local `store_customers` remain tenant-isolated compatibility rows and can be lazily linked to a DGFY account with `dgfy_account_id`.

## Guest Users

Guest users can:

- Browse discovery, tenant storefronts, catalogs, services, and mode-specific storefront views.
- Quote and checkout when Customer Access Mode allows transactions.
- Receive a tracking PIN or public booking reference.
- Complete checkout or booking as a guest when the storefront policy allows it.
- Track a known reference.
- Request tracking recovery with an email or phone lookup. Production responses are always generic and do not expose whether a match or delivery channel exists.
- Create or sign in to a DGFY account from the customer account surface. Registration collects Last Name, First Name, Optional Middle Name, email, contact number, password, and confirm password, with password visibility toggles.

## Signed-In DGFY Users

Signed-in DGFY users can:

- View their DGFY profile, email, phone, unified cross-store history, tickets, addresses, and loyalty summary.
- Use their DGFY JWT on storefront routes; the backend links or creates the tenant-local store customer row.
- See cross-store customer activity through `/api/v1/dgfy/customer/dashboard` and the canonical paginated `/api/v1/dgfy/customer/activities` endpoint. The activities endpoint supports `type`, `tenant_id`, `store_slug`, `status`, `payment_status`, `date_from`, `date_to`, `page`, and `limit` filters and returns normalized activity cards with store, reference, status, total, summary lines, allowed actions, and typed review targets.
- Operators can run a full historical customer activity backfill with `npm run backfill:dgfy-customer-activity:apply`. Apply mode runs landlord migrations first, then scans customer-facing activity across tenant databases. The dry-run command is `npm run backfill:dgfy-customer-activity -- ...`; it pages all DGFY accounts and tenants without writing activity rows. Historical backfill covers POS customer orders, F&B checks linked through POS transactions, Services bookings, and Hospitality reservations, writes a `dgfy_customer_backfill_runs` audit row in apply mode, and supports `--fail-fast`, `--include-inactive-tenants`, `--tenant-page-size`, `--order-batch-size`, `--account-page-size`, `--transaction-limit-per-tenant`, and `--require-activity-types=order,service_booking,hospitality_booking,fnb_order`. Use the required activity type gate in production dry-runs when the release must prove all customer-facing modes exist before apply. Dry-run may continue without a run-log row when the audit table is not present, but apply mode is schema-strict after migration.
- Track account-linked references through `/api/v1/dgfy/customer/track`.
- Cancel eligible account-linked orders while the order is `placed` or `confirmed`.
- Request reorder cart lines for an eligible prior order. Checkout still revalidates current price, stock, visibility, Customer Access Mode, and fulfillment rules.
- Submit typed reviews only for eligible paid or completed account activity. Supported targets are `product`, `service`, `hospitality_booking`, `fnb_order`, and `fnb_item`; reviews start as pending approval and duplicate account/activity/target reviews are rejected.
- Manage global saved addresses, including create, update, delete, and set default.
- Storefront pages with an existing DGFY customer token auto-load the signed-in customer context. Before tenant context is available, the aggregate `/api/v1/dgfy/customer/dashboard` can supply account/profile/address context; once a tenant store context is active, the account panel refresh uses store-scoped account endpoints plus global DGFY address/loyalty reads. Empty checkout contact fields are prefilled from the signed-in profile, and an empty delivery address is prefilled from the default saved address when the customer is on a delivery checkout/booking path.
- Use saved addresses from checkout/booking forms or the account panel. Saving the current checkout address writes a global DGFY saved address and includes the current delivery pin coordinates when the map pin is available.
- View read-only loyalty balance and recent transactions. The balance is calculated from all DGFY loyalty transactions, not only the visible recent row limit.
- See company memberships and invitations through the existing DGFY account contract.
- Launch **Register Your Business** from the DGFY surface. Storefront-originated business registration routes to `/register-company?source=dgfy&auth=login#dgfy-profile`, shows DGFY login first, then focuses the authenticated personal profile/company-creation area.

## Checkout And Booking Account Actions

Storefront order checkout and Services booking responses return `account_action` so the UI can separate customers with accounts from guests:

- `linked_authenticated`: the transaction is linked to the signed-in DGFY account.
- `offer_signup`: the guest email does not currently match a DGFY account, so the customer can create one to save future activity.
- `existing_account_download_only`: the guest email already belongs to a DGFY account, so the customer should sign in instead of creating a duplicate account.
- `download_only_guest_no_email`: no usable email/account signal exists; the customer receives only the downloadable/tracking confirmation.

Copy must be order- or booking-specific. Guest service bookings should not be described as generic checkout orders.

## API Surface

Global customer endpoints:

- `GET /api/v1/dgfy/customer/dashboard`
- `GET /api/v1/dgfy/customer/activities`
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
- Public display and moderation management supports typed review targets at the API level; richer merchant/admin UX remains incremental work.
- Tracking recovery currently sends email when an order email is available; phone OTP delivery remains future work. Phone lookup accepts common Philippine formats for matching only.
- The dashboard's request-time recent backfill remains intentionally bounded for latency safety. Full historical completeness for POS orders, F&B checks, Services bookings, and Hospitality reservations is handled by the explicit operator backfill command, not by broad request-time scans.
- Full phone OTP verification, loyalty redemption, and DGFY email-change flows remain separate governed work.

## Validation

Current validation must include:

- `npm run check:architecture`
- `npm run lint:docs`
- `npm --prefix backend test -- --runInBand tests/dgfyCustomerHandlers.transport.test.js`
- `npm --prefix backend test -- --runInBand tests/dgfyCustomerUseCases.test.js`
- `npm --prefix frontend test -- apps/store/src/__tests__/discoveryFlow.integration.test.jsx --testTimeout 15000`
- `npm run backfill:dgfy-customer-activity -- --tenant-page-size 1 --transaction-limit-per-tenant 1`
- `npm run backfill:dgfy-customer-activity -- --all-transactions --require-activity-types=order,service_booking,hospitality_booking,fnb_order` when production release evidence must prove all customer-facing modes are present.
- DGFY auth and Storefront checkout/order regression tests.
- `npm --prefix frontend run build:store`
- Rendered desktop and mobile storefront smoke checks for the discovery account drawer, recovery panel, address controls, loyalty summary, order actions, and company-registration separation.
