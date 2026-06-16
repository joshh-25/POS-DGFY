---
status: authoritative
authority_level: authoritative
owner: product
last_reviewed: 2026-06-16
applies_to: dgfy_customer_account, storefront_account, customer_tracking
topic: dgfy_customer_account
---

# DGFY Customer Account

## Current Contract

The public DGFY surface now has one canonical authentication route plus a launcher entry point:

1. **Log in / Sign up** from discovery or storefront opens a lightweight customer-account launcher.
2. The launcher routes create-account and sign-in actions to the canonical `/dgfy/auth` route.
3. **Register Your Business** routes to company registration and must not be used as the general customer login path.
4. Password recovery lives on the dedicated `/dgfy/reset-password` route and returns the user to the same customer or business intent after completion.

Tenant storefront headers expose **Log in / Sign up** directly so customers can authenticate or create an account without waiting until checkout. On a tenant storefront, **My Account** / profile actions route to the standalone `/:store_tenant_slug/account` page instead of opening the account dashboard as a modal. On the discovery page, signed-in DGFY customers use the global `/map-dgfy/account` page for cross-store orders, bookings, saved locations, loyalty activity, and business registration. Signed-out discovery users still get the authentication dialog.

DGFY accounts are landlord-scoped. Tenant-local `store_customers` remain tenant-isolated compatibility rows and can be lazily linked to a DGFY account with `dgfy_account_id`.

Customer account sign-in or signup that starts on `dgfy.ph` and completes on `skupervisor.dgfy.ph/dgfy/auth` must return to the Storefront with a one-time `handoff_token` appended to the absolute return URL. The Storefront consumes `/api/v1/dgfy/auth/handoff/exchange` before showing guest state, stores only the current in-page DGFY session token, removes `handoff_token` from the URL, and then loads the account page or account launcher as signed in. This cross-origin handoff is required even though DGFY auth also issues an HttpOnly `sku_dgfy_session` cookie, because production cookies are host-only unless `SESSION_COOKIE_DOMAIN=.dgfy.ph` is explicitly configured under ADR 0026.

## Production UAT Status

The controlled production mutation UAT passed on June 13, 2026 with dedicated QA data and evidence in `.tmp/production-uat/dgfy-production-uat.json`. The approved run proved OTP delivery, fresh DGFY account registration, automatic company activation, IMS tenant-session handoff, onboarding item creation, DGFY-authenticated Storefront checkout, POS completion, inventory decrement from `10` to `9`, and completed-order visibility in the DGFY customer account. The release evidence slice was deployed at SHA `1850188b9063ef80db27b488f6204d0b7261e01c` with deploy summary `/var/www/skupervisor/logs/deploy/deploy_20260613_213041.summary.txt`; local `master`, `origin/master`, production remote `HEAD`, and `.deploy-state/last_deployed_commit` matched that SHA at proof time.

The UAT ratings recorded by the gate are DGFY account UI shell `9.2`, DGFY signup/business registration `9.2`, e-commerce Storefront checkout `9.2`, POS order/inventory flow `9.2`, admin/payment/capability operations `9.1`, and production readiness `9.2`. The QA tenant, item, location, order, and account records are retained for audit cleanup and must not be treated as customer/operator data.

The DGFY multi-company switching and email-only business step-up rollout was production-deployed at SHA `039f048033577cad1de7470e79a162eabc3e5e75` with deploy summary `/var/www/skupervisor/logs/deploy/deploy_20260616_163311.summary.txt`. The IMS tenant-session membership bridge follow-up is production-deployed at SHA `65545b23f6e667e2417b1299df4cb52f859e9a14` with deploy summary `/var/www/skupervisor/logs/deploy/deploy_20260616_170249.summary.txt`. The deployed contract includes IMS company switching, Storefront account Business / Your Businesses invitation visibility, pending invitation acceptance after `dgfy_business_step_up`, selected-company opening into SKUpervisor, no `company_token` exposure in the new switcher or invitation-acceptance payloads, and direct IMS switcher loading only when the tenant-local user is linked to an accepted DGFY membership. Production migration status reports `up 20260616000001-add-dgfy-company-switching.cjs`; unauthenticated route smoke for `/api/v1/dgfy/account/companies` returned `401`, proving the route is mounted and protected.

## Guest Users

Guest users can:

- Browse discovery, tenant storefronts, catalogs, services, and mode-specific storefront views.
- Quote and checkout when Customer Access Mode allows transactions.
- Receive a tracking PIN or public booking reference.
- Complete checkout or booking as a guest when the storefront policy allows it.
- Track a known reference.
- Request tracking recovery with an email or phone lookup. Production responses are always generic and do not expose whether a match or delivery channel exists.
- Submit a fulfilled-order guest review only when the completed tracking response returns a valid review invite. Guest review invites are token-scoped, single-use, and separate from signed-in DGFY account history.
- Create or sign in to a DGFY account from the canonical `/dgfy/auth` route after launching from the storefront or discovery customer-account surface. Registration collects Last Name, First Name, Optional Middle Name, email, contact number, password, and confirm password, with password visibility toggles.

## Signed-In DGFY Users

Signed-in DGFY users can:

- View their DGFY profile, email, phone, unified cross-store history, tickets, saved locations, and loyalty summary.
- Use their DGFY JWT on storefront routes; the backend links or creates the tenant-local store customer row.
- See cross-store customer activity through `/api/v1/dgfy/customer/dashboard` and the canonical paginated `/api/v1/dgfy/customer/activities` endpoint. The activities endpoint supports `type`, `tenant_id`, `store_slug`, `status`, `payment_status`, `date_from`, `date_to`, `page`, and `limit` filters and returns normalized activity cards with store, reference, status, total, summary lines, allowed actions, and typed review targets. Only activity explicitly linked to the signed-in DGFY account is shown; guest orders or bookings are not adopted into a newly created account by email or phone matching.
- Operators can run a full historical customer activity backfill with `npm run backfill:dgfy-customer-activity:apply`. Apply mode runs landlord migrations first, then scans customer-facing activity across tenant databases. The dry-run command is `npm run backfill:dgfy-customer-activity -- ...`; it pages all DGFY accounts and tenants without writing activity rows. Historical backfill covers POS customer orders, F&B checks linked through POS transactions, Services bookings, and Hospitality reservations, writes a `dgfy_customer_backfill_runs` audit row in apply mode, and supports `--fail-fast`, `--include-inactive-tenants`, `--tenant-page-size`, `--order-batch-size`, `--account-page-size`, `--transaction-limit-per-tenant`, and `--require-activity-types=order,service_booking,hospitality_booking,fnb_order`. Historical imports preserve explicit `dgfy_account_id` linkage only; they must not infer account ownership from guest email or phone values. Use the required activity type gate in production dry-runs when the release must prove all customer-facing modes are present before apply. Dry-run may continue without a run-log row when the audit table is not present, but apply mode is schema-strict after migration.
- Track account-linked references through `/api/v1/dgfy/customer/track`.
- Cancel eligible account-linked orders while the order is `placed` or `confirmed`.
- Request reorder cart lines for an eligible prior order. Checkout still revalidates current price, stock, visibility, Customer Access Mode, and fulfillment rules.
- Submit typed reviews only for eligible paid or completed account activity. Supported targets are `product`, `service`, `hospitality_booking`, `fnb_order`, and `fnb_item`; reviews start as pending approval and duplicate account/activity/target reviews are rejected.
- Manage global saved delivery locations, including create, update, delete, set default, readable address text, and optional exact latitude/longitude pin coordinates.
- Storefront pages with an existing DGFY customer token or HttpOnly `sku_dgfy_session` cookie auto-load the signed-in customer context. Before tenant context is available, the aggregate `/api/v1/dgfy/customer/dashboard` can supply account/profile/address context; once a tenant store context is active, Storefront quote, checkout, booking, follow/status, and authenticated Store routes use the DGFY-capable Store auth bridge before falling back to tenant-local Store JWTs. Empty checkout contact fields are prefilled from the signed-in profile, and an empty delivery address is prefilled from the default saved address when the customer is on a delivery checkout/booking path. The sign-in dialog's **Remember me** behavior is cookie-session rehydration only; the frontend must not persist DGFY tokens in `localStorage` or `sessionStorage`.
- Storefront-originated customer sign-in/signup uses the same DGFY handoff endpoint as business registration when the auth page returns to an absolute Storefront URL such as `/map-dgfy?dgfy_account=1`. The DGFY auth page creates the short-lived handoff token after successful login/signup or existing-session detection, appends it to the Storefront return URL, and falls back to the original return URL if handoff creation fails. The Storefront consumes the token before the unauthenticated `/api/v1/dgfy/auth/me` probe so a successful signup does not reopen the guest launcher.
- Account page loading validates `/api/v1/dgfy/auth/me` before loading dashboard, activity, or loyalty data. When the in-memory DGFY token is empty after a browser reload, the frontend must still call `/api/v1/dgfy/auth/me` with `credentials: include` so the backend can authenticate the HttpOnly cookie. A `401` clears stale browser token/session state and shows a sign-in-required account page instead of repeatedly calling account dashboard endpoints with an invalid session.
- Successful authenticated checkout or booking refreshes the DGFY account panel so active orders, order history, bookings, saved locations, loyalty, and current tracking can reflect the latest POS/storefront transaction without requiring a full page reload.
- The routed account page wires account order actions to `/api/v1/dgfy/customer/orders/:reference/cancel` and `/api/v1/dgfy/customer/orders/:reference/reorder`. Buttons are enabled only when the activity `allowed_actions` contract permits the action. Cancel opens an explicit confirmation panel before calling the backend. Reorder repopulates the Storefront cart from reusable backend line data, then checkout revalidates current catalog visibility, price, stock, and access-mode rules. If the original order belongs to a different storefront, the client navigates to that storefront, waits for the catalog to load, and then applies the reusable line data. When prior line items no longer map to the current catalog, the UI names unavailable items instead of only showing a generic failure.
- Saved location management is live on the routed account page. Customers can add, edit, delete, set a default address, pin an exact delivery or service location on the map, use current-device geolocation, and apply a saved location to checkout. Address mutations call the DGFY customer address endpoints and refresh the account page after completion.
- Use saved locations from checkout/booking forms or the account panel. Saving the current checkout address writes a global DGFY saved address and includes the current delivery pin coordinates when the map pin is available. This is additive to the existing checkout choices: account-saved location, temporary checkout location, recommended store or branch location, current GPS location, manual map pin, and text-address fallback must remain separate selectable paths. Text-only delivery addresses remain valid when map/geolocation is unavailable; coordinate-backed delivery checkouts persist coordinates onto the online POS transaction so the live POS incoming queue can show the address, coordinate text, and map-navigation link.
- Storefront location copy is mode-aware. F&B delivery uses drop-off/driver language, simple delivery uses delivery address/pin language, and Services or on-site booking flows use service/site/technician language. Pickup, dine-in, and other non-location flows must not show pin-save controls unless the flow exposes a relevant location field.
- Customer-typed address text is authoritative. Map reverse geocoding can populate an empty address field or helper text, but it must not overwrite text the customer already typed. Stale reverse-geocode results from older pin clicks must be ignored.
- View read-only loyalty balance and recent transactions. The balance is calculated from all DGFY loyalty transactions, not only the visible recent row limit.
- See accepted company memberships and pending IMS-created email invitations in the Business / Your Businesses account area. Founder/master-admin companies are shown as accepted companies after the verified-email founder mirror creates an explicit `source='founder'` membership; they are not shown as invitations. Pending staff/user invitations require an email security code sent to the DGFY account email before acceptance. Accepted companies can be opened in SKUpervisor, where the IMS company switcher handles secure tenant-session switching.
- Launch **Register Your Business** from the DGFY account launcher or signed-in account surface. Storefront-originated business registration creates a short-lived DGFY handoff token when possible, routes to `/register-company?source=dgfy&auth=login&handoff_token=<token>#business-registration`, exchanges the token on SKUpervisor, removes the one-time `handoff_token` from the URL, and focuses the company-registration form. If no valid DGFY session exists, the storefront routes the user to `/dgfy/auth?intent=register-business&return_to=/register-company#business-registration` first. If the handoff is expired or already consumed, the registration page returns the user to `/dgfy/auth` and still focuses the business-registration area after successful sign-in. Public DGFY registration routes do not invoke tenant-session `/auth/refresh-token` recovery. The business form collects only company name and Business Industry as business data, remains gated by current company and marketplace terms acknowledgement, and after active tenant provisioning the registration page immediately starts the normal IMS session through `/api/v1/dgfy/auth/tenant-session` without asking for SKUpervisor credentials again. If the session exchange fails, the active tenant remains created and the UI routes to manual SKUpervisor login with company context prefilled.

## DGFY Company Switching

IMS exposes a current-company switcher for DGFY-authenticated users with accepted company memberships. Direct IMS logins can also load the switcher when the current tenant-local user id and tenant id match an accepted `DgfyAccountTenantMembership`; this is the only allowed tenant-auth bridge and it must not infer identity from email or phone at request time. Mixed DGFY/IMS account routes distinguish token scope so a normal IMS tenant bearer token can reach the tenant-membership bridge instead of being treated as an invalid DGFY token.

Verified DGFY accounts can automatically receive accepted founder memberships for legacy companies only when all bootstrap checks pass: landlord email-to-tenant mapping exists, tenant is active, the tenant-local user email matches the verified DGFY email, the tenant-local user is active and not deleted, and the tenant-local user is `is_master_admin=true`. That bootstrap creates the explicit accepted membership before the company appears as switchable. Staff/user invitations remain pending invitations until accepted with email step-up.

The switcher lists accepted companies, pending invitations, and a Register New Company action. Switching requires a `dgfy_business_step_up` email OTP unless the DGFY account has a still-valid recent business step-up, then starts the normal SKUpervisor tenant session. Pending invitations are visible but not switchable until accepted. Company switching never relies on email or phone matching alone, and switcher/invitation payloads do not expose tenant `company_token`.

## Checkout And Booking Account Actions

Storefront order checkout and Services booking responses return `account_action` so the UI can separate customers with accounts from guests:

- `linked_authenticated`: the transaction is linked to the signed-in DGFY account.
- `offer_signup`: the guest email does not currently match a DGFY account, so the customer can create one to save future activity.
- `existing_account_download_only`: the guest email already belongs to a DGFY account, so the customer should sign in instead of creating a duplicate account.
- `download_only_guest_no_email`: no usable email/account signal exists; the customer receives only the downloadable/tracking confirmation.

Copy must be order- or booking-specific. Guest service bookings should not be described as generic checkout orders.

## Fulfilled Guest Review Invites

Guest review invites are additive to the signed-in account review contract. When Storefront tracking resolves a completed order, the backend can return `review_invites` for eligible fulfilled item targets. The storefront can show `Review Item` entry points from the completed tracking view and F&B product-detail review surface.

Invite tokens are stored as hashes, are scoped to the fulfilled activity target, expire, and become unusable after submission or revocation. `GET /api/v1/dgfy/customer/review-invites/:token` validates a token and returns safe target metadata. `POST /api/v1/dgfy/customer/review-invites/:token/submit` creates a pending review and marks the invite submitted. This path must not create a DGFY account, link tenant-local `store_customers`, or mutate the signed-in customer activity index.

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
- `GET /api/v1/dgfy/customer/review-invites/:token`
- `POST /api/v1/dgfy/customer/review-invites/:token/submit`
- `POST /api/v1/dgfy/customer/tracking-recovery/request`
- `POST /api/v1/dgfy/customer/tracking-recovery/verify`

## Deferred Risks

- Phone verification is intentionally deferred. Phone numbers are contact data only and must not be presented as verified.
- Loyalty redemption is not included in this rollout.
- Public display and moderation management supports typed review targets at the API level; richer merchant/admin UX remains incremental work.
- Guest invite review submission is limited to fulfilled tracking targets and remains pending moderation. Merchant/admin moderation UX can expand later without changing the token contract.
- Tracking recovery currently sends email when an order email is available; phone OTP delivery remains future work. Phone lookup accepts common Philippine formats for matching only.
- The dashboard no longer performs request-time guest-activity adoption. Full historical completeness for POS orders, F&B checks, Services bookings, and Hospitality reservations is handled by the explicit operator backfill command, and that import preserves only explicit DGFY account linkage.
- Full phone OTP verification, loyalty redemption, and DGFY email-change flows remain separate governed work.

## Validation

Current validation must include:

- `npm run check:architecture`
- `npm run lint:docs`
- `npm --prefix backend test -- --runInBand tests/dgfyCustomerHandlers.transport.test.js`
- `npm --prefix backend test -- --runInBand tests/dgfyCustomerUseCases.test.js`
- `npm --prefix backend test -- --runTestsByPath tests/dgfyCustomerUseCases.test.js tests/dgfyCustomerHandlers.transport.test.js tests/storefrontBusinessHours.test.js tests/storeRepository.locationStockFallback.test.js`
- `npm --prefix frontend test -- apps/store/src/__tests__/discoveryFlow.integration.test.jsx --testTimeout 15000`
- `npm --prefix frontend test -- --run apps/store/src/__tests__/fnbOrderTracking.contract.test.js apps/store/src/__tests__/fnbStorefront.contract.test.js apps/store/src/__tests__/profileLauncher.integration.test.jsx apps/store/src/__tests__/discoveryHeaderAccount.integration.test.jsx apps/store/src/__tests__/checkoutRules.test.js apps/store/src/__tests__/discoveryFlow.integration.test.jsx apps/store/src/__tests__/storefrontFollow.integration.test.jsx apps/store/src/__tests__/storefrontErrorMessages.test.js apps/store/src/__tests__/normalizeStorefrontPageModel.test.js --testTimeout 20000`
- `npm --prefix frontend test -- --run src/services/__tests__/dgfyAuthService.cookieSession.test.js src/services/__tests__/browserTokenStorage.guard.test.js`
- `npm --prefix backend test -- --runTestsByPath tests/dgfyAuthMiddleware.test.js tests/dgfyAuthUseCases.test.js tests/dgfyTenantSession.transport.test.js`
- `npm --prefix frontend test -- Pages/__tests__/RegisterCompanyLoginHandoff.test.jsx apps/store/src/__tests__/discoveryHeaderAccount.integration.test.jsx`
- `npm run backfill:dgfy-customer-activity -- --tenant-page-size 1 --transaction-limit-per-tenant 1`
- `npm run backfill:dgfy-customer-activity -- --all-transactions --require-activity-types=order,service_booking,hospitality_booking,fnb_order` when production release evidence must prove all customer-facing modes are present.
- `npm run uat:production:dgfy` when controlled production mutation UAT is approved and a dedicated QA account, tenant, item, checkout, POS operator path, inventory record, and cleanup/signoff rule are available.
- DGFY auth and Storefront checkout/order regression tests.
- `npm --prefix frontend run build:store`
- Rendered desktop and mobile storefront smoke checks for the discovery auth dialog, routed account page, recovery panel, address controls, loyalty summary, order actions, and company-registration separation.
- `npm --prefix frontend test -- --run src/features/pos/__tests__/terminalLocationScope.integration.test.jsx`
- Loyalty redemption and phone OTP verification remain deferred UI hardening items. The current routed page manages saved locations, including optional exact map pins, confirms cancellation before mutation, explains unavailable reorder lines when catalog mapping fails, calls existing account order action endpoints, and relies on checkout revalidation for reordered cart lines.
- Rendered smoke evidence for the routed account page was captured with Microsoft Edge headless against the Storefront production preview:
  - `artifacts/rendered-qa/dgfy-account-after-gaps-desktop.png`
  - `artifacts/rendered-qa/dgfy-account-after-gaps-mobile.png`
