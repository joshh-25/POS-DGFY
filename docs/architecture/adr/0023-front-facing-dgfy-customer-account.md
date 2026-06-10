---
status: authoritative
authority_level: authoritative
owner: architecture
last_reviewed: 2026-06-08
applies_to: dgfy_accounts, storefront_account, customer_orders, customer_tracking
topic: front_facing_dgfy_customer_account
---

# ADR 0023: Front-Facing DGFY Customer Account

## Context

DGFY account registration now precedes company registration. The same global DGFY identity must also support the public customer experience: profile, order tracking, order history, bookings, addresses, reviews, loyalty, and company invitations. ADR 0006 remains valid: tenant-local store customers are not the global account; they are tenant-scoped compatibility records.

## Decision

1. `dgfy.ph` exposes two separate public actions:
   - `Log in / Sign up` opens the global DGFY customer account surface.
   - `Register Your Business` opens the SKUpervisor company-registration flow.
   Tenant storefront headers must expose `Log in / Sign up` directly instead of hiding account access behind checkout-only navigation.
2. A DGFY JWT can authenticate storefront customer routes through the existing store-auth bridge.
3. Tenant-local `store_customers` rows gain nullable `dgfy_account_id`; DGFY account linkage is preferred over email fallback.
4. A landlord-scoped DGFY customer activity index stores account-facing order, F&B order, booking, and ticket snapshots across tenants. Dashboard and history surfaces must show only activity explicitly linked to the DGFY account through `dgfy_account_id`; guest email or phone matches must not auto-adopt prior tenant activity into a newly created account.
5. Global DGFY customer endpoints live under `/api/v1/dgfy/customer/*` and require DGFY account auth except tracking-recovery request/verify.
6. Customer reviews created through the signed-in DGFY account surface are account-gated, purchase-gated, limited to paid or completed account activity, and saved as pending approval by default. Review targets are typed as `product`, `service`, `hospitality_booking`, `fnb_order`, or `fnb_item`; the account activity snapshot must prove that the target is eligible before the review can be created. ADR 0024 adds a separate fulfilled guest review-invite path and does not weaken this signed-in account gate.
7. Loyalty is DGFY-account scoped and read-only in this rollout; balance is aggregated from all DGFY loyalty transactions and redemption requires a separate governed design.
8. Tracking recovery uses email delivery when a matching activity email exists. Phone OTP remains deferred and phone numbers must not be treated as verified. Production recovery responses are generic and must not reveal match or delivery status.
9. Reorder returns reusable cart lines only; checkout still revalidates current catalog visibility, price, inventory, access mode, and fulfillment rules.
10. The front-facing account drawer exposes tracking recovery, authenticated reference tracking, a unified history view with store/mode filters, eligible cancel/reorder actions, typed review submission, saved-address management, loyalty summary, and the separate business-registration route. Storefront DGFY registration uses the same account legal-terms endpoint and acknowledgement payload as `/register-company`, and the drawer/header account action must remain immediately visible as `Log in / Sign up`.
11. Storefront checkout and service booking responses must return an `account_action` that clearly separates authenticated DGFY account linkage, guest checkout with a new email eligible for account signup, guest checkout with an existing DGFY email, and download-only guest fallback. Frontend copy must use order/booking-specific wording so guest service bookings are not described as generic checkout orders.
12. Full historical customer activity migration is handled by the governed operator command `npm run backfill:dgfy-customer-activity:apply`. The apply command runs landlord migrations first, then scans all active DGFY accounts and tenants. The dry-run command `npm run backfill:dgfy-customer-activity -- ...` pages tenants/accounts without writing activity rows. Historical backfill covers POS customer orders, F&B checks linked through POS transactions, Services bookings, and Hospitality reservations. It records `dgfy_customer_backfill_runs` in apply mode, supports inactive tenants only by explicit flag, and can fail fast for deployment gates. Operators can require mode discovery with `--require-activity-types=order,service_booking,hospitality_booking,fnb_order`; this is the production evidence gate for deployments that must prove all customer-facing modes exist before apply. Dry-run can continue without the run-log table so operators can preview pre-migration environments; apply mode remains schema-strict after migration.

## Consequences

1. Storefront customer UI can become global-first without breaking tenant-local Store JWT compatibility.
2. Guest checkout remains allowed when Customer Access Mode permits it.
3. Existing tenant-local customer history remains readable through the compatibility bridge, but new cross-store account views read from the landlord activity index.
4. Recovery, reviews, loyalty, reorder, and address management have backend and storefront contracts before future native mobile or admin moderation surfaces expand the product.
5. Dashboard loading stays deterministic and account-owned. Historical import work must preserve explicit DGFY account linkage rather than inferring ownership from guest contact data.
6. Guest review invites must remain separate from signed-in DGFY account history. A guest invite token can validate and submit a pending review for its fulfilled order target, but it must not create, mutate, or replace account-owned activity/history state.

## Validation

Required validation for this flow:

1. `npm run check:architecture`
2. `npm run lint:docs`
3. Backend DGFY customer use-case tests for dashboard, account tracking, recovery replay rejection, review status/payment eligibility, phone lookup normalization, and production-generic recovery response.
4. Existing Storefront checkout/order tests proving DGFY-linked store-customer behavior does not regress, plus Services booking tests proving guest signup eligibility and authenticated-account linkage.
5. Historical backfill tests proving dry-run/apply behavior, account matching, unbounded tenant/activity traversal when requested, POS order activity, F&B order activity, Services booking activity, Hospitality reservation activity, and run audit updates.
6. Storefront build and rendered smoke for the discovery header showing both public account and business-registration actions.
