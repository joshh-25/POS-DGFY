# Manual QA Readiness Runbook (POS, IMS, Store)

Date baseline: 2026-05-05
Status: active
Scope: manual end-to-end validation before new feature development or bug-finding cycles

## 1) Runtime Prerequisites

Run these first:

```bash
npm run doctor:runtime
npm -C backend run audit:indexes:local
npm run check:architecture
npm run check:compliance
```

Start apps:

```bash
npm run dev:backend
npm run dev:skupervisor
npm run dev:pos
npm run dev:store
```

Expected local URLs:
1. IMS (Skupervisor): `http://localhost:5173`
2. POS: `http://localhost:5174`
3. Store: `http://localhost:5175` by default, or the Vite-assigned preview/dev port shown in the terminal (for example `http://127.0.0.1:4175`)
4. Backend health: `http://localhost:5000/health`

Baseline test account (if seed/default exists):
1. Email: `admin@test.com`
2. Password: `Admin123!`
3. Company token: `token-original`

## 2) Test Data Baseline

Prepare at least:
1. Tenant A: non-compliant mode
2. Tenant B: compliant or compliant-pending mode
3. Two users with different roles (admin and limited staff)
4. Three products:
   - in-stock
   - low-stock
   - out-of-stock
5. Two tenant locations:
   - one active primary storefront
   - one inactive or non-primary location

## 3) Execution Log Template

Use this log while testing:

| ID | Area | Step | Expected | Actual | Result (PASS/FAIL) | Evidence (screenshot/video/log) | Defect ID |
|---|---|---|---|---|---|---|---|
| R-01 | IMS | Login with valid tenant token | Dashboard loads without 5xx/blank state |  |  |  |  |

## 4) Phase A - Access, Auth, and Role Boundaries

1. Login and logout in all three apps.
2. Verify invalid credentials show clear error (no crash, no blank page).
3. Verify limited-role user cannot access admin-only pages/actions.
4. Verify session expiry behavior (token invalidation or forced re-login).

Pass gate:
1. No auth flow blocks normal usage.
2. Role restrictions are fail-closed.

## 5) Phase B - IMS (Skupervisor) Manual Flow

1. Open Dashboard, Items, Settings, POS, Sales pages.
2. Create and edit an item, then archive/delete one item.
3. For finished goods, use the item/product wizard `POS Setup` section and resolve all blockers:
   - POS visibility
   - POS image
   - folder assignment + POS filter visibility
   - explicit sale price (`default_sale_price > 0`; cost must not be used as a fallback)
   - stock sanity
4. Verify POS image upload validation:
   - upload a valid image file (`.png`/`.jpg`) -> expect success
   - attempt non-image upload -> expect fail-closed `422`
5. Verify the same uploaded image renders in:
   - IMS item POS setup panel
   - POS terminal catalog card/image preview
   - Storefront item/cart tile
6. Confirm direct host asset fetch succeeds on all local surfaces:
   - `http://localhost:5000/uploads/...`
   - `http://localhost:5173/uploads/...`
   - `http://localhost:5174/uploads/...`
   - `http://localhost:5175/uploads/...`
   - expected: `200` with `image/*` content type
7. Perform stock movement:
   - stock-in adjustment
   - stock-out adjustment
   - void movement
   - attempt the same movement against a pure Services row and verify it fails as stock-exempt
8. Create purchase order and receive it; confirm stock increase.
9. Validate PO create quantity UX:
   - UOM badge is abbreviation-only
   - UOM never overlays typed quantity value
   - right-side vertical `+/-` controls are tappable on desktop and mobile
10. Validate JO create/edit quantity UX:
   - bulk and edit modes use the same stepper placement/order
   - stock/min/suggested/summary units are abbreviation-only
   - quantity changes still update ingredient shortage calculations
11. Update settings:
   - company/store details
   - storefront visibility
   - location settings (open/closed, delivery/pickup toggles)
12. Verify persisted values after browser refresh.
13. If testing compliance activation, complete Final Review documentary requirements in Settings > Compliance > Final review (upload or external URL) and save sign-off metadata.
14. Assign barcode identities on one product:
   - attach an existing manufacturer code
   - generate an internal code
   - add a package/case alias with `quantity_multiplier > 1`
   - print/preview item and package labels
15. Attempt to assign the same active code to another item and verify the conflict panel requires an explicit action (`keep_existing`, `move_code`, `add_package_alias`, or `reject_import`). For `add_package_alias`, verify the alias keeps one item owner and records the intended package multiplier.
16. In PO receiving and Stock Movements, scan the product/package label only after selecting location context; verify the scan prefills item/quantity but final submit still uses the existing receipt/movement validation.

Pass gate:
1. CRUD and stock flows behave consistently.
2. No contradictory totals between inventory and movement history.
3. Pure service rows are absent from stock aging, low-stock, surplus/shortage, inventory valuation, FIFO, and stock-movement reports, while physical add-ons/products remain present.

## 6) Phase C - POS Manual Flow

1. Open terminal and select terminal identity at unlock/sign-in.
2. Verify catalog list, pricing, and search.
3. Confirm status rail accuracy (connectivity, queue, shift, compliance).
4. Add multiple items, adjust quantities, verify totals.
5. Validate POS checkout keyboard step behavior:
   - cart quantity `ArrowUp/ArrowDown` adjusts by 1
   - editable price `ArrowUp/ArrowDown` adjusts by 1
6. Complete one checkout.
7. Verify transaction appears in POS history.
8. Verify receipt preview readability and core fields.
9. Execute one void/cancel/refund path (if enabled) and confirm audit/history reflects it.
10. Run close-shift or end-of-day flow (if available in environment).
11. Scan the unit barcode and confirm it adds one eligible item after POS checks pass.
12. Scan the package/case barcode and confirm the suggested cart quantity equals its multiplier.
13. Scan blocked cases and record reason codes:
   - hidden from POS -> `NOT_POS_VISIBLE`
   - inactive/draft/deleted -> `ITEM_INACTIVE`
   - missing price -> `MISSING_PRICE`
   - out of stock product -> `OUT_OF_STOCK`
   - wrong barcode scope for POS -> `BARCODE_SCOPE_NOT_POS`
   - ticket-scope code that is not cartable -> `TICKET_SCAN_NOT_CARTABLE`
   - unauthorized or missing location -> `UNAUTHORIZED_LOCATION` or `LOCATION_CONTEXT_REQUIRED`
   - compliance blocked -> `COMPLIANCE_BLOCKED`
14. Scan through the always-ready keyboard-wedge listener while focus is outside the explicit scan input and verify the scan still submits without typing into an unrelated field.
15. Scan a service booking/ticket QR such as `SERVICE_BOOKING:<reference>` and verify POS returns routed feedback (`SERVICE_BOOKING_SCAN_ROUTED`), does not add a cart line, and directs the operator to Services > Bookings.
16. Queue an offline checkout with scan metadata, restore connectivity, and verify replay revalidates server state before commit.

Compliance checks:
1. In non-compliant tenant, verify non-fiscal behavior path.
2. In compliant-active tenant, verify required fiscal/compliance behavior path.
3. In compliant-pending/setup-required state, verify blocked actions and clear reason messaging.

Pass gate:
1. Cashier flow can complete end-to-end without hidden blockers.
2. Compliance gating behaves correctly per tenant state.

## 7) Phase D - Store Manual Flow

1. Open public storefront and verify page load/performance baseline.
2. Confirm only storefront-visible products are shown.
3. Add item to cart and complete checkout submission.
4. Validate empty cart and invalid-input error handling.
5. Validate order tracking:
   - valid tracking ref
   - invalid tracking ref
6. Confirm inactive/non-primary locations are not incorrectly exposed.
7. Open a Storefront QR/deep-link route for a Storefront-visible item:
   - `ghost` mode -> item detail blocked
   - `catalog` mode -> item detail only
   - `inquiry` mode -> item detail plus contact path
   - `transaction` mode -> cart handoff allowed after normal checkout gates
8. Confirm QR responses and UI expose `default_sale_price` as the customer price and do not expose `cost_per_unit`, weighted cost, FIFO cost, inventory value, or raw `current_stock`; use only the public `inventory_display` label/quantity contract.

Pass gate:
1. Guest flow works end-to-end with expected visibility controls.

## 8) Phase E - Cross-App Consistency (Critical)

1. IMS item update -> confirm reflected in POS catalog and Store listing.
2. POS checkout -> confirm stock decrement in IMS.
3. IMS storefront visibility toggle -> confirm Store updates accordingly.
4. From POS History/Receipt, hand off to Sales (`Open in Sales Report`) and verify filters/transaction context are preserved.
5. Change tenant compliance state in IMS/admin path -> confirm POS behavior changes accordingly.
6. Barcode scan in IMS/POS/Storefront must not bypass POS visibility, Storefront visibility, location, stock, compliance, payment, or item status rules.
7. Service booking QR/deep-link resolution must open booking/ticket context, redact customer email/phone in public views, and avoid cart/checkout handoff.

Pass gate:
1. No data-sync mismatch across IMS, POS, and Store for tested scenarios.

## 9) Phase F - Services Mode QA Path

Run this phase for a tenant whose workflow/business mode is `services`.

IMS Services:
1. Login to SKUpervisor and open `/services`.
2. Confirm the Services workspace renders Today, Calendar, Services, Team & Resources, Waitlist, Reminders, and Clients.
3. Confirm dashboard cards show future bookings, expected revenue, postpaid aging, and no-show signals without API errors.
4. Create or verify one service catalog row:
   - `category=service`
   - duration and explicit sale price configured
   - optional internal service cost is hidden unless enabled/stored
   - `visible_in_pos=true`
   - `visible_in_storefront=true`
   - `bookable=true`
   - at least one intake question when the service requires customer preparation.
5. Confirm provider/resource assignment, waitlist entry creation, reminder queue, and client history views load without manufacturing/job-order language.

Storefront Services:
1. Open `tenant-store/<services-slug>`.
2. Confirm the service appears as a service/booking offer, not as a stock-controlled product.
3. Select a service, choose appointment date/time, complete required intake fields, and submit a postpaid booking.
4. Expected result:
   - booking/ticket reference is returned
   - payment status is unpaid for postpaid
   - ticket/receipt image download option is available
   - account/register prompt follows the account rules from ADR 0016.
5. Verify public booking lookup by reference redacts customer contact data.

POS Services:
1. Open POS for the same tenant.
2. Confirm Services Queue shows active requested/confirmed/check-in/in-service bookings.
3. Move one booking through an allowed status transition and verify invalid lifecycle jumps are blocked.
4. Confirm the service appears in POS catalog with `Service sale` (not `Out of stock`) even when inventory stock is zero.
5. Add the service to cart and confirm order method includes `Appointment`.
6. Complete a non-fiscal cash checkout for the service and verify the transaction appears in POS history/Sales without stock deduction.
7. Scan a service barcode in POS and confirm it resolves as a service-sale row even when `current_stock=0`.
8. Scan/lookup a booking or ticket QR and verify public lookup redacts customer contact data unless authenticated/claim rules allow it.
9. In POS, scan the same booking/ticket QR and verify it routes to the Services booking context with `SERVICE_BOOKING_SCAN_ROUTED` instead of creating a cart line.

Pass gate:
1. Services Mode works across IMS, Storefront, and POS without manufacturing copy or stock-only product assumptions.
2. Booking, ticket, intake, queue, and postpaid POS collection paths complete end-to-end.

## 10) Phase G - High-Value Negative Tests

1. Attempt compliance-sensitive actions without required setup/declaration context.
2. Attempt restricted actions with limited role.
3. Attempt checkout with out-of-stock item.
4. Test multi-tab behavior for stale session/token.
5. Reload during active operation (checkout/settings save) and verify safe recovery.
6. Scan a deactivated barcode and verify it does not become sellable/public.
7. Scan a manufacturer code that another tenant also uses and confirm it is tenant-local, not globally rejected.

Pass gate:
1. App fails closed on policy/security/compliance constraints.
2. User receives clear, non-ambiguous error feedback.

## 11) Phase H - PWA Readiness Checks

1. Build all frontend surfaces with `npm --prefix frontend run build:all`.
2. Confirm production output contains manifest and service-worker files for SKUpervisor, POS, and Storefront.
3. In browser devtools Application panel, confirm each surface exposes the expected manifest and service worker.
4. Install SKUpervisor/admin shell on desktop Chrome or Edge and verify:
   - app title and icon are correct
   - Settings opens in standalone mode
   - Settings tabs scroll and remain usable on a narrow/mobile viewport
   - Save/revert controls remain reachable above the mobile safe area
5. Install or add to home screen on a real mobile device when available.
6. Temporarily go offline after a successful load:
   - static shell reload may use cached assets
   - `/api/` and `/uploads/` must not be served stale from service-worker cache
   - authenticated data errors must remain explicit, not silent or blank

Pass gate:
1. Installability metadata is present and accepted by the browser.
2. Installed/mobile Settings remains usable.
3. No stale API/upload data is served by the service worker.

## 12) Release-Ready Signoff Criteria

All must be true:
1. All critical paths in Phases A-E are PASS.
2. No Severity-1 or Severity-2 defects remain open.
3. Compliance-state behavior is validated in at least two tenant states.
4. Cross-app data consistency checks all PASS.
5. Evidence links/screenshots/logs are attached to each FAIL or suspicious PASS.
6. Role-based journey in `docs/features/IMS_POS_SALES_UX_JOURNEY.md` passes without blocker.
7. PWA readiness checks in Phase H pass for all release-targeted surfaces.

## 13) Defect Severity Guide

1. Sev-1: data corruption, security/compliance bypass, checkout blocked for all users.
2. Sev-2: major flow broken for one app/persona, incorrect totals/stock sync.
3. Sev-3: partial feature issue with workaround.
4. Sev-4: cosmetic/usability copy/layout issue only.
