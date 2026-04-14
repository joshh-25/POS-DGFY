# SKU Expansion User Experience Walkthrough (App Usage Only)

Date: 2026-03-31  
Status: active  
Scope: actual user interaction experience inside the current app UI

## 0) Prerequisites (Completed Baseline)

Completed on: 2026-03-31 (Asia/Manila)

- [x] Backend process online (`pm2: sku-backend`)
- [x] Frontend process online (`pm2: sku-frontend`)
- [x] Database schema up to date (`npm --prefix backend run migrate`)
- [x] Seed data applied (`npm --prefix backend run seed`)
- [x] Architecture checks pass (`npm run check:architecture`)
- [x] Documentation lint passes (`npm run lint:docs`)
- [x] Runtime doctor healthy (`npm --prefix backend run doctor:runtime`)
- [x] Index audit healthy (`npm --prefix backend run audit:indexes`)
- [x] POS smoke checks pass (`npm --prefix backend run smoke:pos-local`)

Login baseline for immediate testing:

1. URL: `http://localhost:5173`
2. Email: `admin@test.com`
3. Password: `Admin123!`
4. Company Token: `token-original`

Quick note:

1. `GET /api/v1/tenant-locations` responds successfully with authenticated tenant context.
2. `GET /api/v1/pos/incoming-orders` is Premium-gated and requires valid tenant context (company token + authenticated user).
3. After frontend changes, do a hard refresh (`Ctrl+Shift+R`) on POS pages to avoid stale cached bundles.
4. If stale behavior persists, clear site data/service worker for `localhost` and reload once.

## 1) Personas

1. Tenant Admin: configures store and operations.
2. Cashier: runs daily selling flow in POS Terminal.
3. Manager/Owner: verifies business outputs (sales and stock impact).

## 2) Phase 0 - Access And First Impression

Goal: confirm the app feels stable from login to major pages.

User actions:

1. Open the app at `http://localhost:5173`.
2. Log in as Tenant Admin.
3. Visit these pages from the sidebar/navigation:
4. Dashboard
5. Items
6. Settings
7. POS
8. Terminal

User experience expectations:

1. Navigation feels smooth and fast.
2. No blocking error toast on page load.
3. No sudden redirect loops or blank screens.

Gate:

1. Stop here if any page is unusable.

## 3) Phase 1 - Tenant Admin Experience (Settings And Location Management)

Goal: verify how natural it is for an admin to configure storefront operations.

User actions:

1. Go to `Settings`.
2. Find storefront/POS operational settings.
3. Update delivery fee, visibility, slug, and open/closed status.
4. Save changes.
5. Scroll to location management.
6. Add one location with address and map coordinates.
7. Set radius and wait time.
8. Toggle delivery/pickup/dine-in support.
9. Save location.
10. Edit that location and save again.
11. Deactivate one location.

User experience expectations:

1. Labels are understandable for non-technical users.
2. Save actions provide clear success feedback.
3. Updated values persist after refresh.
4. Active/inactive and open/closed badges are clear at a glance.

Gate:

1. Do not continue if admin cannot confidently configure locations/settings.

## 4) Phase 2 - Cashier Experience (Live POS Checkout)

Goal: validate real cashier usability during a selling session.

User actions:

1. Open `Terminal`.
2. Review top workspace tabs (`Checkout`, `History`, `Receipt Preview`).
3. In `Checkout`, search and add at least 2 items.
4. Change order method (including `Pickup`).
5. Confirm payment type selection works.
6. Complete one sale.
7. Switch to `History` and verify the new transaction appears.
8. Open `Receipt Preview` and confirm the receipt details are readable.
9. Check right-side shift panel context (user, shift status, sales total).

User experience expectations:

1. Cashier can complete a sale without confusion.
2. Totals update clearly when items and methods change.
3. Workflow stays fast with no disruptive error popups.
4. History and receipt views are easy to follow.

Gate:

1. Stop if cashier cannot finish checkout smoothly end-to-end.

## 5) Phase 3 - Cashier Experience (Incoming Online Queue Behavior)

Goal: validate how POS behaves for online-order operations from a cashier viewpoint.

User actions:

1. Stay in `Terminal`.
2. Select location in the sidebar/location controls.
3. Check the incoming online order area.
4. If an online order is available, process status forward using available actions.
5. If no online order is present, verify the empty-state message is understandable.

User experience expectations:

1. Location context is clear and visible.
2. Incoming queue state is obvious:
3. If user has `pos:view`, show cards or explicit empty-state.
4. If user lacks `pos:view`, show explicit permission-denied state (not empty queue message).
5. Status actions communicate what happened after each click.
6. If user lacks `pos:transact`, status action buttons are visibly disabled with reason text.

Gate:

1. Stop if status actions are unclear or location behavior feels inconsistent.

## 6) Phase 4 - Manager Experience (Business Confidence Check)

Goal: verify that business users can trust the output after operations.

User actions:

1. Open `Sales` and review today’s transactions.
2. Open `Items` (or related inventory view) and check stock impact.
3. Cross-check the sale completed in Phase 2.
4. Return to `Settings` and confirm operational settings still reflect intended values.

User experience expectations:

1. Data feels coherent across modules.
2. Manager can explain what happened without technical help.
3. No contradictory numbers across POS, Sales, and stock displays.

## 7) Phase 5 - Current UX Boundary (Updated)

Current user-facing boundary in this build:

1. Dedicated Storefront customer UI (`store` app on `http://localhost:5175`) is now wired with:
2. General store discovery (`list`, `grid`, `map`)
3. Store selection by slug profile
4. Guest catalog browse
5. Guest quote/checkout
6. Public tracking
7. Discovery indexing is landlord index-backed (`storefront_discovery_index`) with periodic reconciliation.

Expected behavior right now:

1. Admin and POS user experience are usable.
2. Guest storefront flow is usable end-to-end for local validation.
3. Stage 3 hardening is complete for index-backed discovery posture; continue monitoring reconciliation health in runtime logs.

## 8) Phase 6 - Signoff From User Standpoint

Capture signoff using plain language:

1. Admin: "I can set up and maintain store operations without confusion."
2. Cashier: "I can finish checkout and operate terminal views smoothly."
3. Manager: "I can trust business outputs after transactions."

Evidence to save:

1. Screenshots per phase in `docs/testing/evidence/sku-expansion-2026-03-31/`.
2. Notes on friction points, confusing labels, and any blocking flow.
