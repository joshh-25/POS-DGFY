---
status: reference
authority_level: reference
owner: frontend
last_reviewed: 2026-06-10
applies_to: storefront_frontend, dgfy_customer_frontend
topic: storefront_customer_frontend_handoff
---

# Storefront And Customer Frontend Handoff

Date: June 10, 2026

## Purpose

This note is for the next frontend developer.

It covers only:
- storefront frontend
- discovery frontend (`dgfy.ph`)
- customer login/signup frontend
- customer dashboard frontend
- business registration frontend handoff from customer side

It does not cover:
- IMS
- POS
- local-only test/runtime files

## Main Rule

Keep these two parts separate:

1. Storefront side
- this is the public browsing side
- this should send users to the correct auth or account page
- this should not own a second full login/signup system

2. Customer side
- this owns login, signup, OTP verification, reset password, and customer dashboard
- this also connects the signed-in customer to business registration

## Main Files

### Storefront files
- `frontend/apps/store/src/StorefrontApp.jsx`
- `frontend/apps/store/src/router.jsx`
- `frontend/apps/store/src/Components/store/DiscoveryResponsiveLayout.jsx`
- `frontend/apps/store/src/Components/storefront/pages/DgfyCustomerAuthModal.jsx`
- `frontend/apps/store/src/Components/storefront/pages/SolutionsPage.jsx`
- `frontend/apps/store/src/businessRegistrationUrl.js`
- `frontend/apps/store/src/modePresentationRegistry.js`
- `frontend/apps/store/src/normalizeStorefrontPageModel.js`

These handle:
- storefront entry to login/signup
- storefront entry to customer account
- storefront entry to register business
- redirecting to the correct page
- restoring signed-in state after refresh
- mode-based storefront UI behavior

### Customer auth and account files
- `frontend/Pages/DgfyAuthPage.jsx`
- `frontend/Pages/DgfyResetPasswordPage.jsx`
- `frontend/Pages/RegisterCompany.jsx`
- `frontend/Pages/LegalDocument.jsx`
- `frontend/apps/store/src/Components/storefront/pages/DgfyCustomerAccountPage.jsx`
- `frontend/src/features/dgfyRouteHelpers.js`
- `frontend/src/services/dgfyAuthService.js`
- `frontend/src/services/publicRoutePolicy.js`
- `frontend/src/features/dgfy/components/DgfyAuthHero.jsx`
- `frontend/src/features/dgfy/components/DgfyLegalAcknowledgementBox.jsx`
- `frontend/src/features/dgfy/components/DgfyPasswordInput.jsx`

These handle:
- sign in
- create account
- email OTP verification
- reset password
- legal terms return flow
- customer dashboard
- register-business handoff

## Current Routes

### Customer auth
- `/dgfy/auth`
- `/dgfy/reset-password`

Supported query params:
- `mode=sign-in`
- `mode=create-account`
- `intent=customer`
- `intent=register-business`
- `return_to=<encoded route>`

### Customer dashboard
- `/map-dgfy/account`
- tenant storefront account route pattern: `/tenant-store/:slug/account`

### Business registration
- `/register-company`

## Current Flow

### 1. Customer login or signup
- User clicks `Log in / Sign up` from storefront/discovery.
- User goes to `/dgfy/auth`.
- Storefront should route to this page, not duplicate the full auth form.

### 2. Customer creates account
Current fields:
- Last Name
- First Name
- Optional Middle Name
- Email
- Contact Number
- Password
- Confirm Password
- Legal acknowledgement

### 3. Email OTP verification
- After account creation, user goes to OTP verification state.
- System sends a 6-digit code to the email.
- User must verify before continuing.

The UI should clearly show:
- code sent
- resend state
- invalid code
- expired code
- blocked state if verification is not complete

### 4. After OTP success
- User returns to sign-in mode.
- Email should already be filled in.
- User signs in with the new account.

### 5. After login
- User should go to the customer dashboard.
- Current target is `/map-dgfy/account`.
- Signed-in state should stay after refresh using cookie-backed session restore.

### 6. Register business
- User can click `Register Your Business` from storefront or dashboard.
- If not signed in, user must go to `/dgfy/auth?intent=register-business&return_to=/register-company`.
- If already signed in, user continues to `/register-company`.

## 1. Discovery Page (`dgfy.ph`)

Note:
- map logic itself is not part of this handoff
- this section is only for current frontend UI standing

### Current discovery direction
- discovery is active
- search, list, and map entry flow are active
- account entry is active
- business registration entry is active
- signed-in customer routing is active

### Discovery desktop UI issues to fix
- remove the `View all Stores` button below the `Search` button
- fix list-view pagination because it is too large and too bold on desktop
- grid view currently lacks pagination
- the map after results has too much white space at the bottom
- the `Live Map` button inside the map should stay on one line

### Discovery mobile UI issues to fix
- footer is not responsive and currently becomes two columns
- remove the `View all Stores` button below the `Search` button

### Solutions page issues

Desktop:
- hero section `Get Started` needs a working redirection link
- remove `Powered by skupervisor, Operational backbone for stock and procurement`

Mobile:
- footer is not responsive
- `Register Your Business` CTA label should stay on one line
- `Get Started` and `Explore Live Map` should stay on one row
- remove `Powered by skupervisor, Operational backbone for stock and procurement`

## 2. Customer Dashboard

This section is mostly UI work only.

Current page owner:
- `frontend/apps/store/src/Components/storefront/pages/DgfyCustomerAccountPage.jsx`

### Current customer dashboard purpose
- show customer overview
- show active orders
- show order history
- show bookings
- show saved addresses
- show loyalty
- show register-business CTA

### Current customer dashboard standing
- notification bell is UI only and not yet connected to real-time notifications
- active orders, past orders, bookings, addresses, and loyalty points still need more real flow testing through actual ordering/booking
- add-address flow is still incomplete
- current map direction for address work uses MapLibre
- account editing is still lacking
- customer email in the account area still has cases where the real signed-in email does not appear correctly
- business created by the customer does not yet reflect properly in the dashboard business module/page

### Future frontend improvement
- add customer profile image upload

### Hard rule
- dashboard should only show activity owned by the signed-in DGFY account
- guest activity must not be attached to a new account just because email/phone matches

## 3. Storefront Modes

The full list of storefront types in product direction:
1. Food and Beverage
2. Services
3. Simple MSME
4. Ticketing & Support
5. Hospitality
6. Healthcare
7. Logistics & Distribution
8. Education & Institutions
9. Retail
10. Food Manufacturing

Currently with active UI work:
- Food and Beverage
- Services
- Simple MSME

## Storefront General Notes

- storefront is content-driven and data-driven
- most displayed content comes from SKUpervisor / IMS
- the UI must stay balanced even when some content is missing
- before frontend implementation, check that the needed backend support already exists
- each storefront mode can use a different color palette
- all storefronts use the same shared structure for:
  - Hero
  - Promo Section
  - Customer Reviews
  - Footer
- branches in the header only appear if there are 2 or more branches
- some storefront flows are similar and can reuse the same ordering pattern
- header profile icon should use the current customer initials style across storefronts
- category filters in storefront modes are based on the IMS foldering system

## 4. Food And Beverage Storefront Current State

### Current standing
- this is the strongest storefront mode right now
- current flow is around 90% complete from add-to-cart to delivered-order tracking
- menu-style storefront is active
- product details, cart, checkout, and order tracking are active
- reservation entry is active

### Important note
- always test flows that involve both Storefront and POS, especially real-time order/tracking states
- online payment target is PayMongo

### Responsiveness
- works on desktop and mobile
- still needs recheck for full responsiveness

## 5. Services Storefront Current State

### Current standing
- services storefront is active
- booking flow is active
- service-first layout exists
- service hero, catalog, tabs, filters, reviews, and footer are active

### Current UI issues
- hero section, customer reviews, promo section, footer, and cart should match the latest F&B storefront UI more closely
- use F&B storefront as the basis for the newest shared UI standard
- mobile cart drawer is not aligned with F&B behavior
- mobile cart currently opens from the right instead of from the bottom
- search bar and product/service filters are still not in the right place visually

### Responsiveness
- works on desktop and mobile
- still needs recheck for full responsiveness
- similar shared sections are not yet visually aligned with F&B

## 6. Simple MSME Storefront Current State

### Current standing
- Simple MSME mode is active
- it is the simple product-first storefront
- it is meant for fast browsing and straightforward ordering
- stock-aware product cards are active
- simple-mode cart and checkout flow are active
- simple hero, catalog, promo/reviews/footer structure, and fallback handling are active

### Current UI and flow behavior
- simple mode uses a simplified hero and product browsing flow
- simple mode supports grouped product browsing
- simple mode has its own cart and checkout steps
- simple mode is designed for quick ordering with less visual weight than F&B
- simple mode shares the same general section pattern as other storefronts, but with lighter copy and simpler product-first presentation

### Current simple-mode checkout direction
- step-based flow is active inside the storefront
- simple cart and customer-info steps are already present
- order result/confirmation state is already present
- designed for direct and short ordering flow

### Current things to recheck
- recheck full desktop responsiveness
- recheck full mobile responsiveness
- recheck if category filters and search placement feel correct in actual content-heavy stores
- recheck if the shared sections match the latest visual quality expected from F&B
- recheck if the checkout step layout stays clean on smaller screens

### Design note
- simple mode should stay simple
- do not over-design it like F&B
- keep it fast, clean, product-first, and easy to order from

## Customer Auth And Business Registration Rules

### Customer auth
- canonical customer auth route is `/dgfy/auth`
- storefront should route to it instead of owning a second full auth system
- reset password is `/dgfy/reset-password`
- legal terms return flow must preserve the create-account form state

### Business registration
Current page owner:
- `frontend/Pages/RegisterCompany.jsx`

Important rules:
- this page should not become a second signup/login system
- founder identity comes from the signed-in DGFY account
- frontend should not ask again for founder email/password like a new auth flow

Current business form focus:
- Company Name
- Business Industry
- Legal acknowledgement

## Safe Frontend Improvements

### Storefront
Safe to improve:
- header layout
- login/signup CTA design
- register-business CTA design
- launcher UI
- mobile responsiveness
- account entry visuals
- shared sections visual consistency across modes
- discovery pagination UI
- discovery and solutions page footer responsiveness

### Customer side
Safe to improve:
- login page UI
- signup page UI
- reset password page UI
- OTP verification UI
- customer dashboard layout
- loading states
- empty states
- error states
- account overview design
- future business page reflection in account area

## Things Not To Break

Do not break:
- redirect flow
- refresh session restore
- OTP verification flow
- legal terms return flow
- business registration handoff
- strict account-owned dashboard activity
- storefront mode-specific backend-supported flow

## Testing After Frontend Changes

Minimum checks:
- `npm run check:architecture`
- `npm run lint:docs`
- `npm --prefix frontend run build`
- `npm --prefix frontend run build:store`

Check these pages locally:
- `/dgfy/auth`
- `/dgfy/reset-password`
- `/register-company`
- storefront/discovery login/signup entry
- customer dashboard page
- F&B storefront
- Services storefront
- Simple MSME storefront

Check desktop and mobile when practical.

## Out Of Scope For This Handoff

Ignore these for this handoff:
- `frontend/apps/pos/**`
- `frontend/src/features/pos/**`
- IMS internal pages not tied to storefront/customer flow
- local temp files
- local QA files
- local mail/test sink files
- local-only runtime config edits unless intentionally promoted

## Quick Working Guide

If working on discovery/storefront only:
- stay mostly in `frontend/apps/store/src/**`
- treat auth as a routed dependency
- keep shared sections consistent across F&B, Services, and Simple MSME

If working on customer auth/account only:
- stay mostly in:
  - `frontend/Pages/DgfyAuthPage.jsx`
  - `frontend/Pages/DgfyResetPasswordPage.jsx`
  - `frontend/Pages/RegisterCompany.jsx`
  - `frontend/apps/store/src/Components/storefront/pages/DgfyCustomerAccountPage.jsx`
  - `frontend/src/features/dgfy/**`
  - `frontend/src/features/dgfyRouteHelpers.js`
  - `frontend/src/services/dgfyAuthService.js`

If working on both:
- keep storefront and customer-account ownership separate
- keep auth before business registration
- keep session restore working
- keep dashboard activity account-owned only
