---
status: reference
owner: frontend
last_reviewed: 2026-05-20
applies_to: storefront_customer_account_and_tracking
---

# Storefront Customer Account UX Backend Note

## Purpose
This document explains the current customer UX problem in DGFY storefront and the backend constraints behind it.

It is intended for the backend developer so frontend and backend can align on:
- what is confusing in the current customer flow
- what the current backend supports
- what backend support is missing for a simpler customer experience

## Documents reviewed
Authoritative and supporting references used for this note:
- `docs/START_HERE.md`
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
- `docs/api/specification.md`
- `docs/features/SERVICES_MODE.md`
- `docs/features/FOOD_AND_BEVERAGE_MODE.md`

## Current customer UX problem
From a customer point of view, DGFY feels like one marketplace.

But the current customer backend behavior is still store-scoped.

This creates confusion because:
- users expect one account across the whole DGFY storefront
- users expect one place to see their current orders and bookings
- users expect saved details to work everywhere after one login
- users do not expect to think about store context before using `Profile`

In practice, the current UX becomes hard to understand because:
- login feels tied to a store
- order history feels tied to a store
- bookings feel tied to a store
- saved addresses feel tied to a store
- guest users need to type details again every time
- tracking and account history feel split into too many paths

## Main UX expectation
Customers usually think in these simple flows:

### Flow A: I have an account
- sign in once
- save my details
- use saved details next time
- see my orders and bookings easily

### Flow B: I do not have an account
- continue as guest
- type my details manually
- place order or booking
- track it later on a separate tracking page

This is closer to the mental model of Grab and foodpanda in the Philippines.

## What the current backend supports
The current backend supports store-scoped customer actions.

### Auth
- `POST /api/v1/store/auth/register`
- `POST /api/v1/store/auth/login`
- `GET /api/v1/store/auth/me`

### Orders and tracking
- `GET /api/v1/store/orders`
- `GET /api/v1/store/track/:tracking_pin`
- `POST /api/v1/store/orders/:tracking_pin/claim`

### Saved addresses
- `GET /api/v1/store/addresses`
- `POST /api/v1/store/addresses`
- `PATCH /api/v1/store/addresses/:id/default`

### Services
- `GET /api/v1/store/services/bookings`
- `GET /api/v1/store/services/bookings/:public_reference`
- `POST /api/v1/store/services/bookings/:public_reference/claim`

### F&B
- `POST /api/v1/store/fnb/reservations`

## Important backend constraint
The customer backend is currently **store/tenant scoped**.

This means:
- requests depend on `x-store-slug`
- auth is under `/api/v1/store/*`
- customer account data is resolved inside one store context
- there is no marketplace-wide customer account contract yet

Because of this, the frontend cannot honestly provide:
- one global login for all stores
- one global customer profile for all stores
- one global merged order history
- one global merged booking history
- one global saved locations system across all stores

## Why the current UX feels confusing
The frontend can improve wording and reduce clicks, but the main confusion comes from a mismatch:

- **user expectation** = one marketplace account
- **current backend model** = one selected store context

So even if the UI is cleaned up, these problems remain underneath:
- customers need store context before account data is loaded
- saved details cannot be guaranteed across stores
- order and booking history cannot be merged safely across stores
- F&B reservation history cannot be shown globally if no read API exists

## Recommended customer flow with current backend
If backend stays the same, the cleanest UX is:

### For account users
- customer creates an account because it saves time
- saved name, phone, email, and supported saved locations can be reused
- account data is still store-scoped underneath
- `Profile` should clearly explain that account details are for the selected store

### For guest users
- customer can still order or book without creating account
- customer manually enters details every time
- customer tracks through a separate tracking page
- tracking should not require login

### Practical frontend direction with current backend
- `Profile` = for account users
- `Track Order` or `Track` = for guest users and quick status lookups
- checkout should offer:
  - `Sign In`
  - `Create Account`
  - `Continue as Guest`

This is the simplest backend-safe customer UX.

## What backend support is missing for a true one-login experience
If DGFY wants a clean marketplace-style experience, backend support is needed for a global customer model.

### Needed backend capabilities
- marketplace-level customer auth
- one customer identity across all stores
- one global customer profile
- one global saved locations model
- one global order history endpoint
- one global booking history endpoint
- one global track/recent activity endpoint
- clear store-to-customer linking rules

### Example future backend direction
Possible future API family:
- `POST /api/v1/customer/auth/register`
- `POST /api/v1/customer/auth/login`
- `GET /api/v1/customer/me`
- `GET /api/v1/customer/orders`
- `GET /api/v1/customer/bookings`
- `GET /api/v1/customer/addresses`
- `POST /api/v1/customer/addresses`
- `GET /api/v1/customer/activity`

This would let frontend build:
- one login for all stores
- one real customer profile page
- one recent orders page
- one recent bookings page
- one saved locations page

## Suggested backend decision paths

### Option 1: Keep current store-scoped backend
Best when:
- short-term delivery is the priority
- backend change should stay minimal

Frontend consequence:
- account remains store-based
- guest tracking stays separate
- customers may still feel some marketplace/account mismatch

### Option 2: Add limited marketplace helpers
Best when:
- backend is not ready for full global auth
- but UX needs to improve

Possible helpers:
- global recent order lookup by authenticated customer identity
- marketplace-level customer directory that maps store accounts
- lightweight recent transactions endpoint

Frontend consequence:
- simpler `My Activity` or `Recent Orders` view may become possible
- full global account still not complete

### Option 3: Build true marketplace customer backend
Best when:
- DGFY wants Grab/foodpanda-like customer UX
- long-term product direction is marketplace-first

Frontend consequence:
- clean and simple customer flow becomes possible
- one login can be honest, not just a UI illusion

## Recommended backend discussion questions
These should be answered before deeper frontend redesign:

1. Is DGFY intended to have one customer identity across all stores?
2. Should saved locations belong to the marketplace customer or to each store account?
3. Should order history and booking history be visible in one combined customer page?
4. Should guest order tracking remain public and separate even after global auth exists?
5. For services and F&B, what parts of customer data are safe to share across stores?

## Recommended short-term alignment
For now, the safest alignment is:
- do not pretend the customer has a true global account
- clearly separate `Profile` from `Track`
- encourage account creation for saved details and faster repeat checkout
- let guest users continue without account and track separately

## Conclusion
The current customer UX is confusing mainly because the product feels like one marketplace, while the backend customer model is still store-scoped.

Frontend can reduce friction, but a true simple one-login customer experience will need backend support for marketplace-level customer identity and customer activity aggregation.
