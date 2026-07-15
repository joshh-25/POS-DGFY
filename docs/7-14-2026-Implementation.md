# July 14, 2026 Implementation Plan

## Scope

This plan addresses POS and Storefront settings defects found across laptop and tablet layouts.

## Confirmed Findings

- POS Setup Best Seller Auto Tagging is not implemented. The current checkboxes are display-only.
- Best Seller selection is browser-local `localStorage`, mobile-only, and cannot stay consistent across devices or users.
- The Edit Item Best Seller control is mobile-only, so it is absent on laptop and tablet.
- Sell filtering is incomplete. Out-of-stock items remain visible in All Items, and empty categories are hidden only on mobile.
- Stock color logic is mobile-only, uses a hard-coded threshold, and colors out-of-stock items despite the requirement to exclude them.
- Always Available has separate breakpoint-specific rendering, which can duplicate, hide, or overlap the item name.
- Storefront schedule confirmation is rendered after the schedule list, causing the tablet confirmation to appear below the list.
- History date inputs have a two-column wrapper, but their tablet layout still needs rendered validation.

## Delivery Order

### Phase 1: Catalog Rules And Best Seller Data

Risk: High.

Status: Completed locally on 2026-07-14.

- Move Best Seller from browser-local storage to server-owned data.
- Add POS Setup configuration for automatic Top 3 items by completed paid transaction quantity over the previous 30 days.
- Add per-item override values: Auto, Force Best Seller, and Never Best Seller.
- Return resolved `is_best_seller` from the POS catalog endpoint.
- Add migration, settings/API validation, transaction aggregation, catalog serialization, and backend/frontend tests.
- Update the applicable catalog ownership ADR because Settings, inventory, sales analytics, and POS catalog contracts are affected.

Implemented:

- Added `pos_catalog_overrides.pos_best_seller_mode` with `auto`, `force`, and `never` values.
- Added the tenant setting `pos_best_seller_settings`; the policy is enabled by default and resolves the Top 3 items by completed, paid quantity over the previous 30 days.
- Added the authenticated POS catalog field `is_best_seller` and removed browser-local Best Seller storage from the POS Sell screen.
- Added the saved POS Setup auto-tagging switch for laptop and tablet.
- Added migration `backend/migrations/20260714000002-add-pos-best-seller-contract.cjs` and verified it is applied locally.
- Kept Storefront routes, payloads, responses, and catalog output unchanged.

Validation completed:

- Backend focused tests: 13 passing.
- Frontend focused tests: 43 passing.
- Backend architecture guardrails and controller-boundary checks: passing.
- POS production build: generated successfully.
- Documentation lint: passing.

### Phase 2: Sell Availability And Stock Rules

Risk: High.

Status: Completed locally on 2026-07-14.

- Use the POS catalog's actual `current_stock`.
- Hide out-of-stock items by default, except service and Always Available items.
- Derive visible categories from the filtered catalog so categories with no available items are hidden on laptop and tablet.
- Use the configured low-stock threshold for stock classification.
- Do not apply a visible stock color to out-of-stock items because they are excluded from Sell.
- Add tests for services, Always Available items, low stock, normal stock, and zero stock.

Implemented:

- Applied one POS Sell availability predicate before category selection and pagination for laptop and tablet.
- Excluded zero-stock physical products from All Items and category views; service and Always Available items remain sellable.
- Derived category filters from the available catalog, hiding categories that no longer have a sellable item.
- Replaced the hard-coded stock color threshold with the tenant's configured POS low-stock threshold.
- Kept inventory validation server-owned and left Storefront contracts unchanged.

Validation completed:

- POS availability unit tests cover zero-stock, service, Always Available, low-stock, and normal-stock cases.
- Focused POS frontend tests: 46 passing.
- POS production build: generated successfully.

### Phase 3: Shared Sell Card Rendering

Risk: Medium.

Status: Completed locally on 2026-07-14.

- Use one shared badge area for Always Available and Best Seller on laptop and tablet.
- Render each badge once.
- Keep the item title in a separate flow area so tags cannot overlap it.
- Render the resolved Best Seller and stock state consistently at every supported breakpoint.

Implemented:

- Added one reusable POS catalog badge component for Service, Always Available, and server-resolved Best Seller state.
- Moved tablet badges above the independent title overlay so badges cannot overlap item names.
- Kept laptop and mobile badges in a dedicated row below the title, avoiding duplicate or competing title layouts.

### Phase 4: Item Management

Risk: Medium.

Status: Completed locally on 2026-07-14.

- Add the Best Seller override control to Edit Item on laptop and tablet.
- Persist the override through the server.
- Refresh the POS catalog immediately after a successful edit.

Implemented:

- Added the Best Seller mode control to the shared Edit Item form for laptop and tablet.
- Persisted the server-supported `auto`, `force`, and `never` values through the existing POS catalog override endpoint.
- Published a local POS catalog refresh event after a successful item save so Sell reloads the resolved tag and availability state without Storefront changes.

### Phase 5: Storefront Settings Layout

Risk: Low.

- Status: Complete
- Prevented the Storefront Media profile icon container from clipping by keeping the avatar outside the cover image clipping container at every breakpoint.
- Replaced native upload controls with design-system upload buttons while retaining existing cover and profile upload handlers and payloads.
- Applied the same upload-button treatment to Gallery Images. Gallery assets now use the existing authenticated `gallery` asset endpoint instead of temporary browser-only object URLs.
- Aligned From and To date input calendar icons to the right.
- Rendered Applying Time confirmation above scheduled sets on tablet through a document-level portal.
- Do not change Storefront routes, request payloads, or responses.

### Phase 6: Tablet Layout Repairs

Risk: Low.

- Status: Complete
- Place category actions beside the category name from the tablet breakpoint upward while retaining the mobile stacked layout.
- Verified History Date From and Date To already render as a two-column pair from the `sm` breakpoint upward, which includes tablet widths. No filter or history behavior was changed.
- Verify no overflow or broken alignment at laptop and tablet widths.

## Phase 7: Validation

Status: Complete with unrelated existing frontend-suite failures recorded below.

- Backend catalog and schema-audit tests: 13/13 passed.
- Frontend Phase 1-6 focused contracts: 54/54 passed.
- POS, Storefront, and SKUpervisor production builds passed.
- Architecture guardrails and controller-boundary checks passed for backend and DGFY API modules.
- Documentation lint and `git diff --check` passed.
- Full frontend suite result: 829 passed, 40 failed, 16 failed files. The failures are outside the POS phase scope, primarily Storefront discovery/account sessions, legal document version snapshots, onboarding, legacy Settings location-pin tests, and a legacy Settings Gallery selector that does not render the POS Settings component changed in this work.
- The builds report existing Browserslist stale-data and oversized-bundle warnings; neither is a build failure.
- Confirmed no changes to checkout, payments, receipts, Storefront API contracts, or existing inventory ownership boundaries.

## Onboarding Starter Item Repair

Status: Implemented locally on 2026-07-14.

- Added `pos_catalog_overrides.pos_best_seller_mode` to the tenant-schema repair registry so existing tenant databases receive the column required by POS catalog reads.
- Kept the existing Sequelize migration as the new-database and deployment migration path.
- Added an optional Starter Item photo field that uses the existing shared storefront catalog-image endpoint after item creation.
- Rendered the newly saved starter item as a confirmation card with its image, name, price, and stock.
- Refreshed onboarding setup data after a successful item creation so the Starter Item readiness check can unlock the next step.

Validation completed:

- Tenant schema dry run identified only the missing `pos_catalog_overrides.pos_best_seller_mode` column in 10 active local tenant databases.
- Applied the additive tenant-schema repair and verified all 10 active tenant schemas are healthy afterward.
- Backend tenant-schema and runtime-schema tests: 15/15 passed.
- POS production build passed.

### Desktop Starter Item And Best Seller Layout

Status: Implemented locally on 2026-07-14.

- Replaced the visible native Starter Item file field with a hidden input and styled upload action.
- After selecting one photo, display the preview, file name, and explicit Replace and Remove actions only.
- Kept the Starter Item photo limit at one image.
- Moved the desktop Sell Best Seller badge into the item title row and prevented the shared badge row from rendering it a second time.

### Category Management Copy

Status: Implemented locally on 2026-07-14.

- Removed the obsolete category-deactivation guidance banner from the POS Category Management header without changing deletion or reassignment behavior.

## POS Admin Company Switcher

Status: Implemented locally on 2026-07-14.

- Added an Admin Profile dropdown in the POS header that lists the current company and all companies accessible through the existing DGFY tenant-membership API.
- Switching uses the existing tenant-session switch endpoint, which replaces the tenant token and clears client caches before POS reloads.
- Company switching is blocked while a shift is active, and the previous tenant's terminal identifier is removed before the new company workspace loads.
- No Storefront route, payload, response, or checkout behavior was changed.

### Company Switch Terminal Lock Isolation

Status: Fixed locally on 2026-07-14.

- Clears the previous company's persisted terminal lock after the target company session is successfully issued.
- Prevents a previous `shift_closed` marker from clearing the new company session and returning the admin to login.
- The active-shift switch block remains enforced, and the target company does not inherit a terminal or shift from the previous company.

### Company Switch POS Session Handoff

Status: Fixed locally on 2026-07-14.

- Added a one-time, 60-second same-tab handoff after a successful company switch.
- The selected POS runtime may use the existing HttpOnly refresh cookie exactly once to restore its tenant session, then removes the handoff marker.
- The marker contains only tenant ID and creation time; no access token, refresh token, company token, or credentials are placed in browser storage or a URL.

### iMin Cash Drawer Routing

Status: Fixed locally on 2026-07-15.

- Cash In drawer events now call the iMin native `openCashDrawer()` bridge first.
- The USB ESC/POS device bridge is now only the non-iMin fallback.
- This prevents iMin terminals from showing USB-printer discovery errors when opening their native cash drawer.

### POS Report Food Category Alignment

Status: Implemented locally on 2026-07-15.

- POS reports now resolve an item's customer-facing Food Category from the assigned item folder.
- Report filtering, category options, top-item rows, print output, and CSV exports use that same Food Category.
- Legacy items without a folder retain the existing broad item type (`product`, `service`, and similar) as a fallback.
- This is a read-model change only: financial amounts are unchanged. Historical reports reflect the item's currently assigned category because transaction lines do not persist a category snapshot.

### POS Report Category Filter Availability

Status: Implemented locally on 2026-07-15.

- The POS Report Category selector now lists every active Food Category for the current company, including categories with no sales in the selected date range.
- Report queries filter by `folder_id`, so category renames do not break report filtering.
- Empty date ranges correctly retain the category selector while returning an empty report result.

### Storefront Location Pin Lifecycle Guard

- Added `DeliveryJob.location` to the tenant-location permanent-delete reference manifest so a location pin with delivery history cannot be removed.
- Enforced the existing inactive-first policy at the backend boundary: permanent deletion now returns `409` until the location is deactivated.
- Added regression coverage for inactive unused deletion, active-pin rejection, and reactivation of a non-primary storefront location while preserving the active primary pin.

### Storefront Location Pin Confirmation

- Corrected the POS storefront location actions to use the shared UI confirmation dialog. The previous legacy dialog expected a different `action` prop and rendered nothing when Delete Pin or Reactivate was clicked.
- Delete Pin and Reactivate now show their confirmation modal before calling the existing APIs. Permanent deletion remains limited to inactive pins with no operational references.
