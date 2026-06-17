# Storefront Frontend Stabilization Handoff

Date: June 16, 2026

Scope:
- discovery of stores and items
- storefront browsing
- add to cart / booking draft
- guest and signed-in checkout entry
- checkout and booking flow
- order success
- tracking
- delivered / pickup / completed states

Out of scope:
- IMS
- POS
- backend contract redesign
- new product features unrelated to storefront flow stability

## Main Rule

The next frontend work must preserve:
- latest UI state
- latest storefront flow
- current backend support per storefront mode

This work is a frontend cleanup and stabilization effort only.

Do not treat cleanup as permission to:
- redesign the UI
- rewrite the flow
- change payload contracts
- change backend assumptions

## Current Risk

The main storefront frontend is functional, but too much logic is concentrated in:

- [StorefrontApp.jsx](C:\xampp\htdocs\SKU-Inventory-Manager\frontend\apps\store\src\StorefrontApp.jsx)

This creates risk for:
- regressions during push to `master`
- shared-state bugs
- harder onboarding for other frontend developers
- slower debugging when high-traffic storefront flows fail

## Current Focus

Treat the storefront like a QA-critical customer journey.

The stable path that must be protected is:

1. Customer discovers a store or item
2. Customer opens a storefront
3. Customer adds item or service to cart / booking draft
4. Customer goes through checkout or booking flow
5. Customer submits order or booking
6. Customer sees success state
7. Customer tracks active order or booking
8. Customer reaches delivered / pickup / completed state

## Storefront Modes That Must Stay Stable

### 1. F&B

Must remain stable for:
- item browsing
- modifiers / add-ons
- cart updates
- guest checkout
- signed-in checkout
- delivery / pickup
- saved addresses
- success screen
- tracking until delivered or picked up

### 2. Services

Must remain stable for:
- service browsing
- booking draft
- schedule / time selection
- guest booking
- signed-in booking
- saved addresses when delivery/address is involved
- success screen
- tracking until completed

### 3. Simple

Must remain stable for:
- product browsing
- cart updates
- guest checkout
- signed-in checkout
- fulfillment flow
- success screen
- tracking until completed

## QA Priority

The next frontend developer should work like a QA engineer first.

Before doing any new feature work, verify these areas:

### Discovery
- discovery page loads correctly
- store list and item discovery remain responsive
- no broken navigation from discovery to storefront
- no broken filters or search behavior
- no blank states caused by missing storefront fields

### Storefront Browsing
- catalog loads correctly per mode
- product and service cards render without layout break
- item details open correctly
- responsive behavior remains correct on mobile and desktop

### Cart / Draft
- add to cart works
- quantity update works
- remove item works
- booking draft update works
- no duplicate lines from repeated clicks

### Checkout / Booking
- step order remains correct
- guest path works
- signed-in path works
- required fields behave correctly
- saved details behave correctly
- saved addresses behave correctly
- delivery map behavior works
- current-location behavior works
- drag-to-pin behavior works

### Submit / Success
- submit is locked during request
- no duplicate submit from rapid click
- order success renders correctly
- booking success renders correctly
- tracking handoff works after success

### Tracking
- guest tracking works
- account tracking works
- tracking drawer works
- active order refresh works
- delivered / pickup / completed state is visible correctly

## Strict Do / Do Not

### Do
- keep current UI exactly unless there is a separate approved UI task
- keep current flow exactly unless there is a separate approved flow task
- keep current backend contract exactly
- refactor only one concern at a time
- verify all storefront modes after each meaningful change
- treat checkout, tracking, and saved addresses as highest-risk flows

### Do Not
- do not rewrite [StorefrontApp.jsx](C:\xampp\htdocs\SKU-Inventory-Manager\frontend\apps\store\src\StorefrontApp.jsx) from scratch
- do not mix redesign and cleanup in one task
- do not change backend payload shape
- do not change backend routes
- do not remove fallback behavior without verification
- do not push local-only runtime or testing patches

## File-Level Refactor Targets

These are the safest first extractions for cleanup without changing UI or backend compatibility:

### 1. Checkout Flow

Target:
- move step logic out of [StorefrontApp.jsx](C:\xampp\htdocs\SKU-Inventory-Manager\frontend\apps\store\src\StorefrontApp.jsx)

Suggested new file:
- `frontend/apps/store/src/checkout/useCheckoutFlow.js`

### 2. Delivery Address + Map Flow

Target:
- move saved addresses, map pinning, current location, and delivery address state out of [StorefrontApp.jsx](C:\xampp\htdocs\SKU-Inventory-Manager\frontend\apps\store\src\StorefrontApp.jsx)

Suggested new file:
- `frontend/apps/store/src/checkout/useDeliveryAddresses.js`

### 3. Tracking Flow

Target:
- move guest and signed-in tracking logic out of [StorefrontApp.jsx](C:\xampp\htdocs\SKU-Inventory-Manager\frontend\apps\store\src\StorefrontApp.jsx)

Suggested new file:
- `frontend/apps/store/src/tracking/useOrderTracking.js`

### 4. API / Request Layer

Target:
- move storefront request logic and payload builders out of [StorefrontApp.jsx](C:\xampp\htdocs\SKU-Inventory-Manager\frontend\apps\store\src\StorefrontApp.jsx)

Suggested new files:
- `frontend/apps/store/src/services/storefrontCheckoutService.js`
- `frontend/apps/store/src/services/storefrontTrackingService.js`
- `frontend/apps/store/src/services/storefrontAddressService.js`

## Release-Critical Verification Checklist

Use this after every meaningful storefront refactor:

- [ ] F&B desktop still works
- [ ] F&B mobile still works
- [ ] Services desktop still works
- [ ] Services mobile still works
- [ ] Simple desktop still works
- [ ] Simple mobile still works
- [ ] Guest flow still works
- [ ] Signed-in flow still works
- [ ] Saved address flow still works
- [ ] Tracking still works
- [ ] Build still passes

Recommended verification command:

- `npm --prefix frontend run build:store`

## Final Instruction For The Next Frontend Developer

Do not start with visual redesign.

Start with stabilization:
- preserve the working UI
- preserve the working flow
- preserve backend support
- reduce risk in the code structure behind the storefront

The first success metric is not “new look”.

The first success metric is:
- no regression from discovery to delivered / pickup / completed state
