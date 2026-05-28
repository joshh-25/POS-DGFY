---
status: reference
authority_level: reference
owner: frontend
last_reviewed: 2026-05-28
applies_to: storefront_all_modes
topic: storefront_current_standing
---

# Storefront: Current Standing (All Modes)

## Purpose
This document records the current storefront status across all active mode presentations in one place.
This is a frontend capability/status reference, not a new architecture decision.

## Authoritative Inputs Used
- `docs/START_HERE.md` (authoritative, last_reviewed: 2026-03-06)
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md` (authoritative, last_reviewed: 2026-03-06)
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md` (authoritative, last_reviewed: 2026-05-21)
- `docs/architecture/adr/0010-storefront-discovery-item-match-index-and-union-query.md`
- `docs/architecture/adr/0014-multi-template-modes-pos-offline-sync-and-storefront-cache-contracts.md`
- `docs/architecture/adr/0016-services-mode-independent-booking-and-ticketing.md`
- `docs/architecture/adr/0019-food-and-beverage-mode-full-service-restaurant.md`
- `docs/architecture/adr/0022-global-dgfy-account-business-registration.md`
- `docs/architecture/adr/0023-front-facing-dgfy-customer-account.md`

## Classification
- Change class for this documentation update: `within-existing-boundary`
- Scope: storefront frontend status reporting only
- ADR update required by this doc-only change: `not needed`

## Shared Storefront Standing (Cross-Mode)
- Discovery and tenant entry flow are active (search/list/map + store slug page handoff).
- Discovery visible-result search is backed by `/api/v1/storefront/discovery`; `/geo-search` is not used as a visible no-match authority in the Storefront web client.
- Public discovery search now applies bounded customer-facing aliases for common service terms such as `aircon`, `A/C`, `AC`, `air conditioning`, and `air conditioner`.
- Mode selection is template-driven through the storefront mode presentation registry and template registry.
- Catalog and checkout visibility are controlled by customer access and inventory display policy.
- Tenant profile/cover branding, branch selection, and map marker previews are active.
- Duplicate-coordinate location pins render as a single exact-coordinate cluster marker. The cluster opens a compact selectable list that shows all entries with internal scrolling for dense same-coordinate locations; stored IMS coordinates remain the only marker, popup, and map-bounds source.
- Pin clicks/taps synchronously select the pin, open or keep the Discover Nearby panel visible, and show the marker preview. Store navigation remains an explicit card/list action.
- Empty-state guidance for tenants without storefront-ready sellable items is active.
- Storefront follow/share controls are available where tenant flags enable them.
- Storefront headers expose `Log in / Sign up` as an immediately visible DGFY account action, separate from checkout-only account prompts.
- Storefront DGFY account registration uses the same backend-owned legal-terms endpoint and fail-closed acknowledgement contract as `/register-company`.
- Signed-in storefront sessions auto-load DGFY customer context, prefill empty checkout contact fields from the account profile, prefill an empty delivery address from the default saved address, and expose saved-address use/save actions across checkout, booking, and account surfaces.
- Signed-in account surfaces now prefer the unified DGFY history endpoint. The History panel filters all, Orders, F&B, Services, and Hospitality activities; rows preserve eligible track/cancel/reorder actions and expose typed review targets returned by the backend.
- `Register Your Business` routes to SKUpervisor company registration with the DGFY login/profile handoff (`source=dgfy`, `auth=login`, `#dgfy-profile`).
- Checkout and Services booking confirmations render backend `account_action` signals so signed-in DGFY customers, signup-eligible guests, guests whose email already has an account, and download-only guests receive distinct guidance.
- Discovery map initialization is defensive. If MapLibre/WebGL cannot initialize in the browser, the Storefront discovery page remains usable, renders the `Log in / Sign up` account action, and shows a list fallback instead of blanking the page.
- The merged storefront pilot keeps mode-specific view-model logic in the storefront app while preserving existing backend/source-of-truth contracts.

## Mode Standing

## 1) Default Storefront (Fallback / General)
- Hero + catalog + checkout flow is active.
- Discovery-to-store handoff with preferred location support is active.
- Catalog search, availability checks, and customer cart/checkout entry are active.
- Mode-specific fallback copy is applied when tenant content is partial or missing.

## 2) Services Mode (`services`)
- Independent service storefront presentation is active (service-specific hero, tabs, filters, catalog cards).
- Service booking flow supports schedule selection, intake fields, quantity, and customer details.
- Service draft multiplicity and batch booking submission are active.
- Service availability, short-lived holds, edited-draft hold replacement, and hold-backed checkout are wired to the current storefront contract.
- Services + product cart surfaces coexist with mode-aware controls and validation.
- Confirmation rendering handles every booking reference and every per-booking payment handoff returned by batch checkout.

## 3) Food & Beverage Mode (`fnb`)
- Restaurant/menu-style storefront presentation is active.
- F&B view model, menu grouping, default modifier selection, allergen presentation, and mode-specific catalog sections are active.
- F&B ordering flow supports customer/order details and mode-aware checkout progression.
- F&B reservation entry is active through the restaurant reservation surface.
- F&B contract anchors and storefront rendering expectations are currently satisfied by tests.

## 4) Simple Mode (`msme` presentation)
- Simplified product storefront presentation is active for fast browsing/order flow.
- Stock-aware product cards and simple-mode cart/checkout flow are active.
- Simple-mode hero, catalog, and footer/community sections are active with content fallback handling.
- Simple storefront contract coverage is active.

## Storefront Regression Standing (Latest Run)
Run date: `2026-05-28`

Targeted Storefront discovery/account commands:
- `npm --prefix backend test -- --runInBand tests/dgfyCustomerHandlers.transport.test.js`
- `npm --prefix backend test -- --runInBand tests/dgfyCustomerUseCases.test.js`
- `npm --prefix frontend test -- apps/store/src/__tests__/discoveryFlow.integration.test.jsx --testTimeout 15000`
- `npm --prefix frontend run build:store`
- `npm run check:architecture`
- `npm run lint:docs`
- `git diff --check`

Targeted matrix result:
- DGFY customer handler transport tests: `PASS` (`2/2` targeted tests)
- DGFY customer use-case tests: `PASS` (`16/16` targeted tests)
- Storefront discovery/account integration tests: `PASS` (`21/21` targeted tests)
- Storefront production build: `PASS`
- Architecture guardrails and controller-boundary checks: `PASS`
- Governed docs lint: `PASS`
- Diff whitespace check: `PASS`
- Local rendered QA: `PASS` on desktop and mobile for `/tenant-store/alpha` with mocked API responses, signed-in DGFY token, default saved address prefilled in checkout inputs, visible saved-address/order action controls, and unified History filters proving F&B and Services rows render from the account activity endpoint. Browser plugin tooling was not exposed in this session, so evidence was collected through a Playwright fallback against a local Vite store server.

## Notes
- This file intentionally tracks the frontend standing and test evidence snapshot only.
- Backend/contract evolution remains governed by ADRs and API docs.

## Discovery Map/Search Fix Standing (2026-05-21)
- Public Storefront discovery search uses the authoritative `/api/v1/storefront/discovery` flow for visible results; the client no longer swaps in transient `/geo-search` no-match states.
- Search and Near Me actions use intent sequencing and request cancellation so stale geolocation callbacks or older discovery fetches cannot overwrite newer results.
- Public search alias expansion is intentionally bounded and lives in the shared backend policy so index text and query matching agree. It currently covers common `aircon`/`A/C`/`air conditioning` variants without introducing broad fuzzy matching.
- Single-result searches auto-focus the exact pin and preview; multi-result searches fit the exact unique marker coordinates.
- Pin click opens/keeps the Discover Nearby results panel and marker preview synchronously. Store navigation is an explicit card/list action.
- Duplicate-coordinate cluster previews now show all same-coordinate storefronts in a bounded scrollable card rather than hiding overflow entries.
- Storefront discovery index reconciliation is part of the guarded production deploy path by default, with a dry-run CLI for preflight impact review.

## Discovery Map Availability Standing (2026-05-28)
- `StoresMap` catches MapLibre initialization failures, logs a warning, and renders a store-list fallback instead of allowing a WebGL failure to crash the discovery route.
- `DeliveryPinMap` catches MapLibre initialization failures and renders a delivery-address fallback message so checkout/delivery flows do not blank when the map canvas is unavailable.
- The account header remains visible when map initialization fails, so DGFY login/signup and business-registration actions stay reachable before checkout.
