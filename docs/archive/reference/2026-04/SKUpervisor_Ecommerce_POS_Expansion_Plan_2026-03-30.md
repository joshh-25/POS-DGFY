# SKUpervisor E-Commerce & POS Expansion — Implementation Plan

---

**Document Status:** Authoritative  
**Applies To:** SKU-Inventory-Manager Monorepo (all layers)  
**Last Reviewed:** 2026-03-30  
**Mandatory Prerequisite Docs:** `docs/START_HERE.md`, `docs/architecture/ARCHITECTURE_BOUNDARIES.md`, `docs/architecture/ARCHITECTURE_GOVERNANCE.md`

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Overview & Domain Map](#2-system-overview--domain-map)
3. [Architecture Boundaries & Compliance](#3-architecture-boundaries--compliance)
4. [Database Schema Additions & Migrations](#4-database-schema-additions--migrations)
5. [Phase 0 — Foundation & Monorepo Setup](#phase-0--foundation--monorepo-setup)
6. [Phase 1 — SKUpervisor IMS: Location & Storefront Settings](#phase-1--skupervisor-ims-location--storefront-settings)
7. [Phase 2 — General Store: Discovery, Search & Map](#phase-2--general-store-discovery-search--map)
8. [Phase 3 — Tenant Storefront: Catalog & Checkout](#phase-3--tenant-storefront-catalog--checkout)
9. [Phase 4 — POS Terminal: Multi-Location & Order Acceptance](#phase-4--pos-terminal-multi-location--order-acceptance)
10. [Phase 5 — Order Lifecycle & Customer Tracking](#phase-5--order-lifecycle--customer-tracking)
11. [Phase 6 — PWA, Responsiveness & Cross-App Polish](#phase-6--pwa-responsiveness--cross-app-polish)
12. [Phase 7 — Integration Testing & Architecture Compliance](#phase-7--integration-testing--architecture-compliance)
13. [Deployment & Subdomain Routing](#deployment--subdomain-routing)
14. [Scope Exclusions (Current Phase)](#scope-exclusions-current-phase)

---

## 1. Executive Summary

This plan describes the full implementation of the SKUpervisor E-Commerce and POS Expansion. The project introduces a public multi-tenant marketplace (`store.surebizcorp.com`), upgrades the POS terminal (`pos.surebizcorp.com`) into a full order-acceptance and fulfillment hub, and enhances the SKUpervisor IMS (`skupervisor.surebizcorp.com`) with multi-location management and public storefront configuration.

The three applications are co-located inside the existing SKU-Inventory-Manager monorepo, sharing the same backend API, database infrastructure, and a common component library. Each frontend app is independently built and served via a multi-entry Vite configuration, deployed to its respective subdomain.

The checkout and order tracking patterns are adapted from the `meats` repository, specifically its guest/account checkout flow, autofill logic from prior orders and saved addresses, idempotency-keyed checkout submission, and the `StatusStepper` order journey UI. The admin-side order status update pattern from the `meats` Filament admin (`OrderForm.php`) is replicated in the POS terminal as the cashier's order management interface.

---

## 2. System Overview & Domain Map

| Domain | Application | Users | Description |
|---|---|---|---|
| `skupervisor.surebizcorp.com` | SKUpervisor IMS | Tenant admins, staff | Inventory management, location setup, storefront settings, POS settings |
| `pos.surebizcorp.com` | POS Terminal (PWA) | Cashiers | In-person sales, incoming online order acceptance, order status updates |
| `store.surebizcorp.com` | General Store (PWA) | Buyers / Guests / Registered users | Cross-tenant product search, map-based discovery, browsing |
| `store.surebizcorp.com/:tenant-slug` | Tenant Storefront (PWA) | Buyers / Guests / Registered users | Single-tenant catalog, cart, checkout, order tracking |

### Order Flow Overview

```
Buyer searches on store.surebizcorp.com
        ↓
Selects a tenant from map/list/board results
        ↓
Redirected to store.surebizcorp.com/:tenant-slug
  (selected item auto-added to cart)
        ↓
Checkout (Guest or Registered)
  → Selects: Order Method, Payment Method, Location, Date/Time
  → Receives: Tracking PIN
        ↓
POS Terminal receives the order automatically (polling)
        ↓
Cashier: Accept or Decline
  → Accepted: Status progresses (Confirmed → Preparing → Ready → Completed)
  → Declined: Tracking PIN becomes invalid for the buyer
        ↓
Buyer tracks order via store.surebizcorp.com/track?pin=XXXX
```

---

## 3. Architecture Boundaries & Compliance

All implementation must comply with the existing architecture guardrails documented in `docs/architecture/ARCHITECTURE_BOUNDARIES.md`.

**Mandatory rules:**

- Controllers are transport-only. No business logic in controllers.
- Controllers must not import Sequelize models directly.
- Business logic belongs in use cases.
- Data access belongs in repositories.
- All new Sequelize models must be registered in `backend/src/models/index.js` and `backend/src/utils/tenantModelFactory.js`.
- All new modules follow the `routes → controllers → usecases → repositories → models` pattern.
- Architecture compliance scripts (`npm run check:architecture`, `npm run check:controller-boundaries`) must pass before any phase is considered complete.

**New Backend Modules Required:**

| Module | Purpose |
|---|---|
| `store` | Cross-tenant search, public catalog API, tenant location discovery |
| `storeOrders` | Online order creation, tracking PIN lookup, cancellation, status query |
| `storeCustomers` | Registered buyer accounts, saved addresses, order history |

**Modified Backend Modules:**

| Module | Change |
|---|---|
| `pos` | Add location filtering, incoming order queue, status update use cases |
| `tenants` | Add multi-location management use cases and repository methods |
| `settings` | Add new POS and storefront settings keys via migration |

---

## 4. Database Schema Additions & Migrations

All migrations follow the existing naming convention (`YYYYMMDDHHMMSS-description.cjs`) and use the `queryInterface` + `describeTable` idempotency guard pattern established in the project.

### Migration 1: `create-tenant-locations`

Creates the `tenant_locations` table to support multiple physical store locations per tenant, each with its own geographic pin, delivery radius, operating hours, and storefront settings.

```sql
CREATE TABLE tenant_locations (
    location_id        INT PRIMARY KEY AUTO_INCREMENT,
    tenant_id          INT NOT NULL,
    name               VARCHAR(255) NOT NULL,
    address_line       TEXT NOT NULL,
    latitude           DECIMAL(10, 8) NOT NULL,
    longitude          DECIMAL(11, 8) NOT NULL,
    delivery_radius_km DECIMAL(5, 2) DEFAULT 5.00,
    is_open            BOOLEAN DEFAULT true,
    is_active          BOOLEAN DEFAULT true,
    operating_hours    JSON NULL,
    current_wait_time_minutes INT DEFAULT 15,
    allow_out_of_stock_sales  BOOLEAN DEFAULT false,
    created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
);
```

### Migration 2: `expand-pos-transactions-for-online-orders`

Extends the existing `pos_transactions` table to support the full online order lifecycle. The `order_source` field distinguishes in-store POS transactions from online store checkouts. The `fulfillment_status` field drives the order journey visible to the buyer.

```sql
ALTER TABLE pos_transactions
    ADD COLUMN order_source         ENUM('in_store', 'online_store') NOT NULL DEFAULT 'in_store',
    ADD COLUMN fulfillment_status   ENUM(
                                        'placed',
                                        'confirmed',
                                        'preparing',
                                        'ready_for_pickup',
                                        'out_for_delivery',
                                        'completed',
                                        'cancelled',
                                        'rejected'
                                    ) NULL DEFAULT NULL,
    ADD COLUMN location_id          INT NULL,
    ADD COLUMN tracking_pin         VARCHAR(20) NULL UNIQUE,
    ADD COLUMN customer_name        VARCHAR(255) NULL,
    ADD COLUMN customer_phone       VARCHAR(50) NULL,
    ADD COLUMN customer_email       VARCHAR(255) NULL,
    ADD COLUMN delivery_address     TEXT NULL,
    ADD COLUMN delivery_latitude    DECIMAL(10, 8) NULL,
    ADD COLUMN delivery_longitude   DECIMAL(11, 8) NULL,
    ADD COLUMN scheduled_for        DATETIME NULL,
    ADD COLUMN special_instructions TEXT NULL,
    ADD COLUMN delivery_fee         DECIMAL(14, 4) NOT NULL DEFAULT 0,
    ADD COLUMN store_customer_id    INT NULL,
    ADD COLUMN outside_radius_flag  BOOLEAN DEFAULT false,
    ADD INDEX idx_tracking_pin (tracking_pin),
    ADD INDEX idx_fulfillment_status (fulfillment_status),
    ADD INDEX idx_location_id (location_id);
```

> **Note on `order_method` ENUM:** The existing `order_method` ENUM (`dine_in`, `takeout`, `delivery`, `online`) must be expanded to include `pickup`. A separate migration will alter this column.

### Migration 3: `add-pickup-to-order-method`

```sql
ALTER TABLE pos_transactions
    MODIFY COLUMN order_method ENUM(
        'dine_in',
        'takeout',
        'pickup',
        'delivery',
        'online'
    ) NOT NULL DEFAULT 'dine_in';
```

### Migration 4: `create-store-customers`

Stores registered buyer accounts for the public store. These are entirely separate from the tenant's internal `users` table.

```sql
CREATE TABLE store_customers (
    customer_id    INT PRIMARY KEY AUTO_INCREMENT,
    email          VARCHAR(255) UNIQUE NOT NULL,
    password_hash  VARCHAR(255) NOT NULL,
    name           VARCHAR(255) NOT NULL,
    phone          VARCHAR(50) NULL,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE customer_addresses (
    address_id    INT PRIMARY KEY AUTO_INCREMENT,
    customer_id   INT NOT NULL,
    label         VARCHAR(100) NOT NULL,
    address_line  TEXT NOT NULL,
    latitude      DECIMAL(10, 8) NULL,
    longitude     DECIMAL(11, 8) NULL,
    is_default    BOOLEAN DEFAULT false,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES store_customers(customer_id)
);
```

### Migration 5: `add-storefront-and-pos-settings`

Inserts new key-value rows into the existing `system_settings` table for each tenant. These settings control public-facing storefront behavior and new POS operational settings.

| Setting Key | Data Type | Description |
|---|---|---|
| `store_delivery_fee` | number | Fixed delivery fee shown at checkout |
| `store_tenant_slug` | string | URL-safe slug for `store.surebizcorp.com/:slug` |
| `store_is_visible` | boolean | Whether this tenant appears in the general store |
| `pos_open_status` | boolean | Open/Closed status reflected on the store map |
| `pos_wait_time_minutes` | number | Current estimated wait time shown on store map pins |

---

## Phase 0 — Foundation & Monorepo Setup

**Goal:** Configure the monorepo to serve three independent frontend apps from a single codebase and shared backend.

### Checklist

- [ ] **Vite Multi-Entry Configuration**: Restructure `frontend/` into three Vite app entries: `apps/skupervisor`, `apps/pos`, `apps/store`. Each app has its own `index.html`, `vite.config.js`, and `src/` directory.
- [ ] **Shared Package**: Create a `packages/ui` directory containing shared React components (buttons, inputs, modals, the `StatusStepper`, map utilities) and shared API client utilities (`api.js`, `format.js`, `cartStore`).
- [ ] **Shared Types**: Define shared TypeScript/JSDoc types for `PosTransaction`, `TenantLocation`, `StoreCustomer`, `OrderStatus`, `FulfillmentType`, and `OrderMethod` in `packages/types`.
- [ ] **Root `package.json` Scripts**: Add `dev:store`, `build:store`, `dev:pos`, `build:pos` scripts to the root `package.json`.
- [ ] **Environment Variables**: Define `VITE_API_BASE_URL`, `VITE_APP_NAME`, and `VITE_OSM_TILE_URL` per app in `.env` files.
- [ ] **PWA Manifest**: Add `manifest.json` and service worker configuration for both the POS app and the Store app.
- [ ] **Architecture Compliance**: Run `npm run check:architecture` and confirm it passes before proceeding.

---

## Phase 1 — SKUpervisor IMS: Location & Storefront Settings

**Goal:** Allow tenant admins to configure multiple physical locations with map pins, and manage storefront-facing settings.

### Backend

- [ ] **Model**: Create `TenantLocation` Sequelize model. Register in `models/index.js` and `tenantModelFactory.js`.
- [ ] **Repository**: Create `tenantLocationRepository.js` with methods: `findAllByTenantId`, `findById`, `create`, `update`, `deactivate`.
- [ ] **Use Cases**: Implement `createTenantLocationUseCase`, `updateTenantLocationUseCase`, `listTenantLocationsUseCase`, `deactivateTenantLocationUseCase`.
- [ ] **Controller**: Add `tenantLocationHandlers.js` (transport-only, delegates to use cases).
- [ ] **Routes**: Register `GET/POST /api/v1/tenant-locations`, `PUT/DELETE /api/v1/tenant-locations/:id` under the existing tenant auth middleware.
- [ ] **Settings Use Cases**: Extend `updateSettingByKeyUseCase` to support the five new storefront/POS settings keys.
- [ ] **Validation**: Add `tenantLocationValidator.js` enforcing required fields (`name`, `address_line`, `latitude`, `longitude`).

### Frontend (SKUpervisor IMS)

- [ ] **Settings Page — "Storefront & Locations" Tab**: Add a new tab in the existing Settings page.
- [ ] **Location List**: Display all tenant locations in a card list with Name, Address, Active/Inactive toggle, and Edit/Delete actions.
- [ ] **Add/Edit Location Form**: Form fields for Name, Address (text), and an embedded interactive map (React-Leaflet + OpenStreetMap) where the admin drops a pin to set latitude/longitude. The address text field and the map pin are kept in sync.
- [ ] **Location Dropdown (IMS)**: On the IMS dashboard header or sidebar, add a location selector (matching the design of the uploaded reference image — a styled dropdown listing all active locations). This allows the admin to view inventory and reports scoped to a specific location.
- [ ] **Storefront Settings Panel**: Toggles and inputs for: Tenant Slug, Delivery Fee, Open/Closed toggle, Wait Time (minutes), Out-of-Stock selling toggle, Store Visibility toggle.
- [ ] **POS Settings Panel**: Display existing POS settings (Business Name, TIN, Address, PTU, MIN, Accreditation Number, Receipt Footer) alongside the new operational settings (Open/Closed, Wait Time). These are the same settings visible in the POS terminal, ensuring consistency.

---

## Phase 2 — General Store: Discovery, Search & Map

**Goal:** Build `store.surebizcorp.com` — the public marketplace where buyers search for products across all tenants and discover stores on a map.

### Backend

- [ ] **Cross-Tenant Search Endpoint**: `GET /api/v1/store/search?q=&lat=&lng=&radius=&min_price=&max_price=&category=&page=`
  - Queries across all tenant databases for items matching the search term using LIKE/fuzzy matching on `items.name` and `items.category`.
  - If the query matches a tenant slug or name exactly, returns that tenant as the top result.
  - Applies the Haversine formula to calculate distance from the user's coordinates to each `tenant_location`.
  - Filters out locations where `is_active = false` or `store_is_visible = false`.
  - Returns a ranked list of tenants (proximity first, relevance second, popularity third) with their location metadata.
- [ ] **Tenant Public Profile Endpoint**: `GET /api/v1/store/tenants/:slug` — Returns the tenant's public metadata (name, logo, locations, open/closed status, wait time, delivery radius).
- [ ] **Public Catalog Endpoint**: `GET /api/v1/store/tenants/:slug/catalog?location_id=` — Returns the item catalog for a specific tenant, respecting the `allow_out_of_stock_sales` flag per location.
- [ ] **Rate Limiting**: Apply `throttle:store-search` middleware to the search endpoint.

### Frontend (General Store)

- [ ] **App Shell**: Build the Store app layout with a persistent header containing the enhanced search bar, a location detector button (GPS auto-detect or manual text input), and a navigation link back to the main store.
- [ ] **Search Bar**: Full-width, prominent search bar with real-time debounced suggestions as the user types. Suggestions show both item names and tenant names. Selecting a tenant name navigates directly to `store.surebizcorp.com/:tenant-slug`.
- [ ] **View Toggle**: Three view modes for search results — **List**, **Map**, and **Board**.
  - **List View**: Ranked cards showing Tenant Name, Distance, Open/Closed badge, Wait Time, and matching items.
  - **Map View**: Full-screen OpenStreetMap (React-Leaflet) with pins for each matching tenant location. Clicking a pin opens a popup widget showing: Tenant Name, Open/Closed, Wait Time, Delivery Radius, Distance from user, and a "View Store" button.
  - **Board View**: A Kanban-style grid of tenant cards grouped by proximity bands (e.g., Under 1km, 1–3km, 3–5km).
- [ ] **Filter Panel**: A collapsible filter sidebar/drawer with:
  - **Distance**: Slider for max radius (1km, 3km, 5km, 10km, Any).
  - **Price Range**: Min/Max price inputs.
  - **Category**: Multi-select from available item categories across tenants.
  - **Open Now**: Toggle to show only currently open locations.
  - **Order Method**: Filter by tenants that support a specific method (Delivery, Pickup, Dine-in).
- [ ] **User Location**: Browser geolocation API prompt on first visit. If denied, show a manual address input field. Store the resolved coordinates in `localStorage` for the session.
- [ ] **Proximity Warning on Map Pins**: Each map pin widget displays the user's distance to that location and a colored indicator if the user is outside the delivery radius.

---

## Phase 3 — Tenant Storefront: Catalog & Checkout

**Goal:** Build `store.surebizcorp.com/:tenant-slug` — the individual tenant's e-commerce page with a full checkout flow.

### Backend

- [ ] **Checkout Endpoint**: `POST /api/v1/store/checkout` — Creates a `pos_transaction` record with `order_source = 'online_store'` and `fulfillment_status = 'placed'`. Generates a unique `tracking_pin`. Applies idempotency key validation (same pattern as the existing POS checkout use case).
- [ ] **Cart Quote Endpoint**: `POST /api/v1/store/cart/quote` — Returns a price summary (subtotal, delivery fee, total) before checkout submission.
- [ ] **Order Cancellation Endpoint**: `PATCH /api/v1/store/orders/:tracking_pin/cancel` — Cancels the order only if `fulfillment_status = 'placed'`. Returns an error if the cashier has already accepted.
- [ ] **Store Customer Auth Endpoints**: `POST /api/v1/store/auth/register`, `POST /api/v1/store/auth/login`, `GET /api/v1/store/auth/me`.
- [ ] **Saved Addresses Endpoints**: `GET/POST /api/v1/store/addresses`, `PUT /api/v1/store/addresses/:id`, `PATCH /api/v1/store/addresses/:id/default`, `DELETE /api/v1/store/addresses/:id`.
- [ ] **Order History Endpoint** (registered users only): `GET /api/v1/store/orders` — Returns paginated order history for the authenticated store customer.
- [ ] **Tracking Endpoint** (public): `GET /api/v1/store/track/:tracking_pin` — Returns the current `fulfillment_status`, order summary, and item list for any valid tracking PIN.

### Frontend (Tenant Storefront)

- [ ] **Storefront Header**: Tenant name, logo, Open/Closed badge, Wait Time, and a prominent "← Back to Main Store" link.
- [ ] **Catalog Page**: Grid of item cards showing name, price, stock status. If `allow_out_of_stock_sales = true` for the selected location, out-of-stock items appear normally with no warning label.
- [ ] **Item Detail / Add to Cart**: Clicking an item adds it to the cart. If the user arrived from the general store with a pre-selected item, that item is automatically added to the cart on page load.
- [ ] **Cart Drawer**: Slide-in cart panel (matching the `meats` `CartDrawer` pattern) showing items, quantities, subtotal, and a "Proceed to Checkout" button.
- [ ] **Checkout Page** (adapted from `meats` `CheckoutPage.tsx`):
  - **Autofill Logic**: For registered users, pre-fill Name, Phone, Email from account. Pre-fill Address from default saved address. For guests, pre-fill from `localStorage` (`checkout_last`) if available.
  - **Order Method Selector**: Dine-in, Takeout, Pickup, Delivery, Online. The delivery address and map pin fields appear only when Delivery is selected.
  - **Dine-in Reservation**: When Dine-in is selected, show a date/time picker for the reservation slot and a phone/messenger field for confirmation contact.
  - **Location Selector**: If the tenant has multiple locations, show a dropdown to select which location to order from.
  - **Delivery Address**: Text input + an embedded mini-map (React-Leaflet) where the user can drop a pin for their delivery location. Auto-detect button available.
  - **Delivery Radius Warning**: If the user's pinned delivery location is outside the selected tenant location's `delivery_radius_km`, display a visible warning banner ("Your location may be outside the delivery area. The store will confirm."). Do not block checkout.
  - **Payment Method**: Dropdown locked upon submission. Options are the payment types configured in the tenant's POS settings.
  - **Pre-Order Toggle**: Checkbox to schedule the order for a future date/time.
  - **Price Summary**: Live-updating summary card showing subtotal, delivery fee (fixed from tenant settings), and total.
  - **Guest Checkout**: No account required. After submission, display the `tracking_pin` prominently with a clear instruction: "Save this PIN — it is the only way to track your order."
  - **Post-Checkout Account Prompt**: After a successful guest checkout, offer an optional "Create an account to save your order history" prompt. If accepted, register the account and link the just-placed order to it.
  - **Saved Addresses** (registered users): Show a dropdown of saved addresses. Selecting one fills the delivery address and map pin. Allow saving a new address during checkout.
- [ ] **Order Confirmation Page**: Displays the `tracking_pin`, order summary, selected order method, and a link to the tracking page.
- [ ] **Account Page**: Profile management (name, phone, email, password), saved addresses management, and order history list (registered users only).

---

## Phase 4 — POS Terminal: Multi-Location & Order Acceptance

**Goal:** Upgrade `pos.surebizcorp.com` to handle multi-location switching, incoming online orders, and the full order acceptance/status workflow.

### Backend

- [ ] **Incoming Orders Endpoint**: `GET /api/v1/pos/incoming-orders?location_id=` — Returns all `pos_transactions` where `order_source = 'online_store'` and `fulfillment_status = 'placed'`, scoped to the selected location.
- [ ] **Order Status Update Endpoint**: `PATCH /api/v1/pos/orders/:pos_transaction_id/status` — Updates `fulfillment_status`. Validates allowed transitions (e.g., cannot go from `completed` back to `preparing`). Requires POS auth.
- [ ] **Accept Order Use Case**: Sets `fulfillment_status = 'confirmed'`. Records the accepting cashier's `user_id`.
- [ ] **Decline Order Use Case**: Sets `fulfillment_status = 'rejected'`. The `tracking_pin` query on the store side will return a "This order was not accepted" response.
- [ ] **POS Settings Read Endpoint**: `GET /api/v1/pos/settings` — Returns all settings with `setting_key` prefixed by `pos_` and `store_` for display in the POS terminal.

### Frontend (POS Terminal)

- [ ] **Location Switcher (Left Sidebar)**: A persistent sidebar element showing the currently active location. Clicking it opens a dropdown of all active tenant locations (matching the design reference image provided). Switching location refreshes the catalog and incoming order queue.
- [ ] **Incoming Orders Panel**: A new panel/tab in the POS layout showing a real-time-refreshing (polling every 10–15 seconds) list of incoming online orders. Each order card shows:
  - Customer Name, Phone, Messenger (if provided)
  - Order Method badge (color-coded: Dine-in, Takeout, Pickup, Delivery, Online)
  - Payment Method badge
  - Items summary
  - Scheduled date/time (if reservation)
  - Delivery address + outside-radius warning flag (if applicable)
  - Tracking PIN
  - **Accept** and **Decline** action buttons
- [ ] **Order Method Update**: Add `pickup` to the order method selector in the existing `POSCheckoutTerminal` component (currently missing from the ENUM).
- [ ] **Order Status Controls**: For accepted orders, show a status progression panel with buttons: `Mark as Preparing`, `Mark as Ready`, `Mark as Completed`. Each button advances the `fulfillment_status` by one step.
- [ ] **POS Settings Panel**: A settings view within the POS terminal that mirrors the storefront/POS settings from SKUpervisor (Open/Closed toggle, Wait Time, Delivery Fee). Admins with the correct permissions can edit these directly from the POS. Read-only for cashiers without admin permissions.
- [ ] **In-Store Checkout (Existing + Updated)**: The existing `POSCheckoutTerminal` continues to function for walk-in customers. The `order_source` is set to `in_store` and `fulfillment_status` is set to `completed` immediately (no lifecycle needed for in-store transactions, preserving existing behavior).

---

## Phase 5 — Order Lifecycle & Customer Tracking

**Goal:** Provide full order journey visibility to buyers and ensure the tracking PIN system works end-to-end.

### Backend

- [ ] **Tracking PIN Generation**: Implement a utility function in the `storeOrders` use case that generates a unique, human-readable PIN (e.g., `SK-A3X9`) using a random alphanumeric pattern. Enforce uniqueness with a DB unique index.
- [ ] **Tracking Query Logic**:
  - If `fulfillment_status = 'rejected'`: Return a `410 Gone` or a specific error message ("This order was declined by the store.").
  - If `fulfillment_status = 'cancelled'`: Return a cancelled status.
  - Otherwise: Return the current `fulfillment_status`, order summary, and item list.
- [ ] **Cancellation Guard**: The cancellation use case must check `fulfillment_status = 'placed'` before allowing cancellation. If already `confirmed` or beyond, return a `409 Conflict` with message "This order has already been accepted and cannot be cancelled."

### Frontend (Store App — Track Page)

- [ ] **Track Page** (`/track?pin=XXXX`): Accessible without login. Input field for the tracking PIN. On submit, fetches order status.
- [ ] **StatusStepper Component** (adapted from `meats` `StatusStepper.tsx`): Visual step-by-step order journey. Steps:
  1. Order Placed
  2. Confirmed by Store
  3. Preparing
  4. Ready for Pickup / Out for Delivery *(label changes based on order method)*
  5. Completed
- [ ] **Declined/Cancelled State**: If the PIN returns a rejected/cancelled status, display a clear message and remove the stepper. The PIN entry field is cleared.
- [ ] **Cancel Order Button**: Visible on the Track Page only when `fulfillment_status = 'placed'`. On click, shows a confirmation dialog. If the cashier has already accepted, the button is hidden and a message reads: "Your order has been accepted and can no longer be cancelled."
- [ ] **Order Summary on Track Page**: Below the stepper, display: Order Method, Payment Method, Items, Total, Delivery Address (if applicable), Scheduled Time (if reservation).
- [ ] **Order History Page** (registered users only, `/orders`): Paginated list of past orders. Each row shows: Tracking PIN, Date, Total, Status, and a "Track" link. Clicking "Track" navigates to `/track?pin=XXXX`.

---

## Phase 6 — PWA, Responsiveness & Cross-App Polish

**Goal:** Ensure both the Store and POS apps are fully installable PWAs with mobile-first responsive design.

### Checklist

- [ ] **PWA Manifest (Store App)**: `name: "SKUpervisor Store"`, `short_name: "SKU Store"`, `display: standalone`, `theme_color`, `background_color`, icons at 192px and 512px.
- [ ] **PWA Manifest (POS App)**: `name: "SKUpervisor POS"`, `short_name: "SKU POS"`, `display: standalone`, icons at 192px and 512px.
- [ ] **Service Worker (Store App)**: Cache the app shell, static assets, and the OpenStreetMap tile layer for offline browsing of previously loaded areas.
- [ ] **Service Worker (POS App)**: Cache the app shell and catalog. The incoming orders queue should gracefully degrade when offline (show a "No connection" banner).
- [ ] **Responsive Layouts**:
  - Store App: Mobile-first grid. Search bar full-width on mobile. Map view takes full viewport height on mobile. Filter panel becomes a bottom sheet drawer on mobile.
  - POS App: Three-column layout on desktop/tablet. On mobile, the catalog, cart, and incoming orders panels become separate tabs in a bottom navigation bar.
- [ ] **OpenStreetMap Tile Attribution**: Ensure `© OpenStreetMap contributors` attribution is always visible on all map instances, as required by the OSM tile usage policy.
- [ ] **Leaflet.js Integration**: Install `leaflet` and `react-leaflet`. Configure the default icon path fix for Vite/Webpack builds. Implement custom marker icons for tenant location pins.
- [ ] **Dark Mode**: Inherit the existing dark mode toggle from the SKUpervisor IMS for the POS app. The Store app can have its own light/dark preference stored in `localStorage`.

---

## Phase 7 — Integration Testing & Architecture Compliance

**Goal:** Validate the full system end-to-end and ensure all architecture guardrails pass.

### Checklist

- [ ] **Unit Tests — Use Cases**:
  - `createTenantLocationUseCase`: Valid creation, duplicate slug rejection.
  - `storeCheckoutUseCase`: Idempotency replay, out-of-radius flag, tracking PIN generation.
  - `updateOrderStatusUseCase`: Valid transitions, invalid transition rejection.
  - `cancelOrderUseCase`: Cancel when `placed`, reject when `confirmed` or beyond.
- [ ] **Integration Tests — API**:
  - `POST /api/v1/store/checkout`: Full checkout flow with guest and registered user.
  - `GET /api/v1/store/track/:pin`: Valid PIN, rejected PIN, cancelled PIN.
  - `GET /api/v1/store/search`: Proximity ranking, tenant name exact match, category filter.
  - `PATCH /api/v1/pos/orders/:id/status`: Accept, decline, status progression.
  - `GET /api/v1/pos/incoming-orders`: Location-scoped filtering.
- [ ] **Frontend Smoke Tests**:
  - Store app: Search → Map pin click → Tenant storefront → Add to cart → Checkout (guest) → Track page.
  - POS app: Location switch → Incoming order appears → Accept → Status update to Completed.
  - SKUpervisor IMS: Add location with map pin → Settings saved → Reflected in POS settings panel.
- [ ] **Architecture Compliance**:
  - `npm run check:architecture` passes.
  - `npm run check:controller-boundaries` passes.
  - `npm run lint:docs` passes.
  - All new modules have a `README.md` following the existing module documentation template.
- [ ] **Schema Audit**: Run `npm run check:schema-index` (or equivalent) to confirm all new tables have appropriate indexes.
- [ ] **PWA Audit**: Run Lighthouse PWA audit on both Store and POS apps. Target score ≥ 90.

---

## Deployment & Subdomain Routing

The deployment strategy follows the existing `DEPLOYMENT_GUIDE.md` and `ecosystem.prod.config.cjs` patterns.

| Subdomain | Vite Build Output | Nginx/Reverse Proxy Config |
|---|---|---|
| `skupervisor.surebizcorp.com` | `frontend/apps/skupervisor/dist` | Existing config, no change |
| `pos.surebizcorp.com` | `frontend/apps/pos/dist` | New server block, serve `index.html` for all routes |
| `store.surebizcorp.com` | `frontend/apps/store/dist` | New server block, serve `index.html` for all routes |

The backend API remains a single Express server. All three frontends point to the same `VITE_API_BASE_URL`. CORS must be updated to allow requests from all three subdomains.

---

## Scope Exclusions (Current Phase)

The following features are explicitly out of scope for this implementation phase and are documented here for future planning:

| Feature | Reason for Exclusion |
|---|---|
| Real-time WebSocket notifications (order alerts) | Deferred; polling is sufficient for current scale |
| SMS/push notifications at order status updates | Deferred; no notification system in current phase |
| Guest PIN recovery via SMS OTP | Excluded entirely for this phase |
| Delivery fee calculation based on distance | Fixed delivery fee only; dynamic calculation is a future phase |
| Table availability / capacity management for Dine-in | Cashier accept/decline is sufficient; no capacity system needed |
| Payment gateway integration for online orders | Payment method is selected but processing is handled in-store |
| BIR certification for online orders | Out of scope; POS BIR compliance is a separate workstream |
| Multi-currency support | Single currency (PHP) for all transactions |
| Tenant ratings and reviews | Future phase |
| Loyalty points for store customers | Future phase |

---

*This document must be updated whenever a new ADR is created, a migration is added, or a scope change is agreed upon. All implementation agents must read this document before beginning any phase.*
