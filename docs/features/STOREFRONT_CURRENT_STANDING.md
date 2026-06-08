---
status: reference
authority_level: reference
owner: frontend
last_reviewed: 2026-06-08
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
- `docs/architecture/adr/0024-fulfilled-guest-item-reviews.md`

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
- Storefront map pins and shared-coordinate cluster pins use the same fixed MapLibre root anchor box and bottom-center coordinate anchor. Marker cards use the same above-pin popup offset for normal and shared pins, while the customer "your location" marker renders below storefront pins so overlapping store pins remain clickable.
- Pin clicks/taps synchronously select the pin, open or keep the Discover Nearby panel visible, and show the marker preview. Store navigation remains an explicit card/list action.
- Empty-state guidance for tenants without storefront-ready sellable items is active.
- Storefront follow/share controls are available where tenant flags enable them.
- Storefront headers expose `Log in / Sign up` as an immediately visible DGFY account action, separate from checkout-only account prompts.
- Storefront DGFY account registration uses the same backend-owned legal-terms endpoint and fail-closed acknowledgement contract as `/register-company`.
- Signed-in storefront sessions auto-load DGFY customer context, prefill empty checkout contact fields from the account profile, prefill an empty delivery address from the default saved address, and expose saved-address use/save actions across checkout, booking, and account surfaces.
- Signed-in account surfaces now prefer the unified DGFY history endpoint. The History panel filters all, Orders, F&B, Services, and Hospitality activities; rows preserve eligible track/cancel/reorder actions and expose typed review targets returned by the backend.
- Completed Storefront tracking can expose item-level `Review Item` entry points through fulfilled guest review invites. The invite path is separate from signed-in account history and creates pending moderated reviews only after token validation.
- `Register Your Business` routes to SKUpervisor company registration with the DGFY business-registration handoff (`source=dgfy`, `auth=login`, optional `handoff_token`, `#business-registration`).
- Checkout and Services booking confirmations render backend `account_action` signals so signed-in DGFY customers, signup-eligible guests, guests whose email already has an account, and download-only guests receive distinct guidance.
- Discovery map initialization is defensive. If MapLibre/WebGL cannot initialize in the browser, the Storefront discovery page remains usable, renders the `Log in / Sign up` account action, and shows a list fallback instead of blanking the page.
- Storefront map/search stabilization is locally validated as of 2026-06-06. Submitted text searches stay storefront-first, item matches render tenant storefront result cards, matching pins auto-open marker previews, repeated identical searches do not refit/flicker, and duplicate-coordinate results stay on exact IMS coordinates through a shared selectable marker card.
- Branch-level Storefront availability is preserved from IMS item and product draft saves as well as final create/update flows. Draft saves now apply submitted branch toggles through the same `storefront_location_item_overrides` path used by active item edits.
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
- F&B product detail pages include item review summary/detail sections, and completed F&B/order tracking can route eligible fulfilled item targets into the review flow.
- F&B contract anchors and storefront rendering expectations are currently satisfied by tests.

## 4) Simple Mode (`msme` presentation)
- Simplified product storefront presentation is active for fast browsing/order flow.
- Stock-aware product cards and simple-mode cart/checkout flow are active.
- Simple-mode hero, catalog, and footer/community sections are active with content fallback handling.
- Simple storefront contract coverage is active.

## Storefront Regression Standing (Latest Run)
Run date: `2026-06-08`

Targeted Storefront discovery/account commands:
- `npm --prefix frontend exec vitest run apps/store/src/__tests__/discoveryFlow.integration.test.jsx apps/store/src/__tests__/discoveryMapDom.test.js apps/store/src/__tests__/storefrontMarkerPreview.test.js apps/store/src/__tests__/discoveryPresentation.test.js --pool=threads`
- `npm --prefix backend test -- --runTestsByPath tests/storefrontDiscoveryRepository.test.js tests/storefrontDiscoveryMapPins.usecase.test.js`
- `npm --prefix frontend exec vitest run src/features/inventory/__tests__/itemProductWizard.contract.test.js apps/store/src/__tests__/storefrontMarkerCss.contract.test.js apps/store/src/__tests__/discoveryFlow.integration.test.jsx --pool=threads`
- `npm --prefix frontend exec vitest run apps/store/src/__tests__/storefrontMarkerCss.contract.test.js apps/store/src/__tests__/discoveryMapDom.test.js apps/store/src/__tests__/discoveryFlow.integration.test.jsx --pool=threads`
- `npm --prefix backend test -- --runTestsByPath tests/storefrontCatalogUseCases.test.js tests/servicesMode.usecases.test.js tests/storefrontDiscoveryIndexService.catalogVisibility.test.js tests/settingsUsecases.applicationResult.test.js`
- `npm --prefix frontend run build:store`
- `npm run check:architecture`
- `git diff --check`

Targeted matrix result:
- June 8 marker/draft hardening frontend slice: `PASS` (`39/39` targeted tests). npm printed the existing unknown `--pool` warning but executed the suites.
- June 8 fixed-anchor marker follow-up slice: `PASS` (`29/29` targeted tests). Coverage includes the fixed `38px` by `48px` MapLibre marker root anchor box, absolutely positioned marker visual, and the existing discovery flow behavior.
- June 8 marker/card consistency follow-up slice: `PASS` (`32/32` targeted tests). Coverage includes shared-coordinate cluster markers using the same bottom anchor as normal pins, consistent above-pin popup offsets, and user-location marker layering below storefront pins.
- June 8 backend branch catalog/services/handle slice: `PASS` (`73/73` targeted tests).
- Storefront discovery flow, map DOM, marker preview, and presentation suites: `PASS` (`42/42` targeted tests). npm printed the existing unknown `--pool` warning but executed the suites.
- Backend Storefront discovery repository and map-pin use-case suites: `PASS` (`19/19` targeted tests), including union store/item matching, out-of-stock inclusion, nearest matching branches, and degraded snapshot behavior.
- Storefront production build: `PASS`
- Architecture guardrails and controller-boundary checks: `PASS`
- Diff whitespace check: `PASS`
- Local rendered route health: `PASS` for `/map-dgfy` page identity, desktop search controls, map region, overlay-free render, search-field interaction, and zero relevant console warnings/errors. Production route smoke also passed for `https://dgfy.ph/map-dgfy` after deploying SHA `f72d5e93c3e96ee2f0b1ee305c32c37856016ca6`; seeded-data zoom QA remains useful for real-pin placement evidence.

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
- Storefront pins and shared-coordinate cluster pins keep a fixed MapLibre root anchor box and bottom-center anchor, and marker cards use one above-pin offset so zooming does not resize or shift the coordinate-owned DOM anchor.
- Storefront discovery index reconciliation is part of the guarded production deploy path by default, with a dry-run CLI for preflight impact review.

## Discovery Map Availability Standing (2026-05-28)
- `StoresMap` catches MapLibre initialization failures, logs a warning, and renders a store-list fallback instead of allowing a WebGL failure to crash the discovery route.
- `DeliveryPinMap` catches MapLibre initialization failures and renders a delivery-address fallback message so checkout/delivery flows do not blank when the map canvas is unavailable.
- The account header remains visible when map initialization fails, so DGFY login/signup and business-registration actions stay reachable before checkout.
