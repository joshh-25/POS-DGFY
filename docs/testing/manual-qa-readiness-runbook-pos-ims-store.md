# Manual QA Readiness Runbook (POS, IMS, Store)

Date baseline: 2026-04-07  
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
3. Store: `http://localhost:5175`
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
   - sale price
   - stock sanity
4. Perform stock movement:
   - stock-in adjustment
   - stock-out adjustment
   - void movement
5. Create purchase order and receive it; confirm stock increase.
6. Update settings:
   - company/store details
   - storefront visibility
   - location settings (open/closed, delivery/pickup toggles)
7. Verify persisted values after browser refresh.
8. If testing compliance activation, complete Final Review documentary requirements in Settings > Compliance > Final review (upload or external URL) and save sign-off metadata.

Pass gate:
1. CRUD and stock flows behave consistently.
2. No contradictory totals between inventory and movement history.

## 6) Phase C - POS Manual Flow

1. Open terminal and select terminal identity at unlock/sign-in.
2. Verify catalog list, pricing, and search.
3. Confirm status rail accuracy (connectivity, queue, shift, compliance).
4. Add multiple items, adjust quantities, verify totals.
5. Complete one checkout.
6. Verify transaction appears in POS history.
7. Verify receipt preview readability and core fields.
8. Execute one void/cancel/refund path (if enabled) and confirm audit/history reflects it.
9. Run close-shift or end-of-day flow (if available in environment).

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

Pass gate:
1. Guest flow works end-to-end with expected visibility controls.

## 8) Phase E - Cross-App Consistency (Critical)

1. IMS item update -> confirm reflected in POS catalog and Store listing.
2. POS checkout -> confirm stock decrement in IMS.
3. IMS storefront visibility toggle -> confirm Store updates accordingly.
4. From POS History/Receipt, hand off to Sales (`Open in Sales Report`) and verify filters/transaction context are preserved.
5. Change tenant compliance state in IMS/admin path -> confirm POS behavior changes accordingly.

Pass gate:
1. No data-sync mismatch across IMS, POS, and Store for tested scenarios.

## 9) Phase F - High-Value Negative Tests

1. Attempt compliance-sensitive actions without required setup/declaration context.
2. Attempt restricted actions with limited role.
3. Attempt checkout with out-of-stock item.
4. Test multi-tab behavior for stale session/token.
5. Reload during active operation (checkout/settings save) and verify safe recovery.

Pass gate:
1. App fails closed on policy/security/compliance constraints.
2. User receives clear, non-ambiguous error feedback.

## 10) Release-Ready Signoff Criteria

All must be true:
1. All critical paths in Phases A-E are PASS.
2. No Severity-1 or Severity-2 defects remain open.
3. Compliance-state behavior is validated in at least two tenant states.
4. Cross-app data consistency checks all PASS.
5. Evidence links/screenshots/logs are attached to each FAIL or suspicious PASS.
6. Role-based journey in `docs/features/IMS_POS_SALES_UX_JOURNEY.md` passes without blocker.

## 11) Defect Severity Guide

1. Sev-1: data corruption, security/compliance bypass, checkout blocked for all users.
2. Sev-2: major flow broken for one app/persona, incorrect totals/stock sync.
3. Sev-3: partial feature issue with workaround.
4. Sev-4: cosmetic/usability copy/layout issue only.
