---
status: reference
authority_level: reference
owner: frontend
last_reviewed: 2026-06-22
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
- Duplicate-coordinate location pins and pins within the configured 13-meter near-cluster radius render as a single count marker. Clicking a cluster scopes the existing Discover Nearby/View Results panel to the stores inside that cluster instead of opening a large on-map list widget. Individual non-cluster pins still use their stored IMS coordinates.
- The Discover Nearby/View Results panel can be collapsed from its header on desktop and mobile, returning the customer to the compact View Results action without navigating away from the map or changing the scoped result set.
- Storefront map pins and shared-coordinate cluster pins now render as MapLibre GeoJSON source features through symbol/circle layers instead of DOM marker overlays. The map renderer owns the stored coordinate, icon anchor, zoom, and pan transforms, while marker cards remain DOM popups anchored to those same coordinates. The customer "your location" layer renders below storefront pins so overlapping store pins remain clickable.
- Pin hover opens a temporary marker preview that collapses when the pointer leaves the pin, even if the pointer moves over the preview card. Pin clicks/taps synchronously select the pin, open or keep the Discover Nearby panel visible, and show the marker preview until the customer closes it. Store navigation remains an explicit card/list action.
- Empty-state guidance for tenants without storefront-ready sellable items is active.
- Storefront follow/share controls are available where tenant flags enable them.
- Storefront headers expose `Log in / Sign up` as an immediately visible DGFY account action, separate from checkout-only account prompts.
- Storefront DGFY account registration uses the same backend-owned legal-terms endpoint and fail-closed acknowledgement contract as `/register-company`.
- Signed-in storefront sessions auto-load DGFY customer context, prefill empty checkout contact fields from the account profile, prefill an empty delivery address from the default saved address, and expose saved-address use/save actions across checkout, booking, and account surfaces. Saved delivery locations can include exact latitude/longitude pin coordinates; checkout keeps saved location, current GPS, manual map pin, and text-only fallback as separate choices.
- Signed-in account surfaces now prefer the unified DGFY history endpoint. The History panel filters all, Orders, F&B, Services, and Hospitality activities; rows preserve eligible track/cancel/reorder actions and expose typed review targets returned by the backend. Account drawer, routed account page, tracking drawer, and active signed-in order surfaces short-poll the DGFY dashboard/activity endpoints while visible so POS status changes move orders between active and history without a full page reload.
- DGFY account order reads refresh already-linked order snapshots from tenant POS data before returning dashboard, activity, or account tracking results. This preserves explicit account ownership while preventing stale activity rows when a POS status update was applied before the account panel refreshed.
- Production-deployed DGFY account notification plumbing now loads recent order-status notifications with the account panel and opens an authenticated `/api/v1/dgfy/customer/events` SSE stream while account or tracking surfaces are visible. The stream merges live `activity.updated`, `notification.created`, and `notification.read` events into local account state; the account-page bell panel shows unread counts, lists recent notifications, supports mark-one/mark-all-read actions, and sends order-reference notifications through the same tracking action. SSE uses in-process fanout with polling fallback; browser push, SMS, email, and closed-browser delivery are out of scope.
- Storefront customer auth returns consume `handoff_token` on `dgfy.ph`, strip the token from the URL, clear legacy browser-readable DGFY token keys, and validate `/api/v1/dgfy/auth/me` through the HttpOnly cookie before showing a signed-in account state. Stale `sessionStorage` tokens must not block cookie-backed rehydration. Explicit customer sign-out records a session-scoped suppression marker, remembers only the last normalized signed-out email for the current browser session, clears account route state and checkout-auth resume draft state, and prevents the next discovery/storefront **Log in / Sign up** action from reopening the old account dashboard until a new login/signup or handoff succeeds. That next auth route includes `reason=signed-out` and the email prefill, skips cookie auto-restore, leaves password blank, and relies on the browser password manager rather than app-managed password storage.
- Completed Storefront tracking can expose item-level `Review Item` entry points through fulfilled guest review invites. The invite path is separate from signed-in account history and creates pending moderated reviews only after token validation.
- `Register Your Business` routes to SKUpervisor company registration with the DGFY business-registration handoff (`source=dgfy`, `auth=login`, optional `handoff_token`, `#business-registration`).
- Checkout and Services booking now keep public browsing open and use a shared guest-or-account entry gate before step 1. Customers can create or sign in to a DGFY account, or continue as a guest. The storefront preserves non-sensitive cart or booking draft state through the auth redirect, returns the customer to step 1 of the active flow after auth, shows read-only DGFY account identity on authenticated paths, and keeps guest contact details device-local for later reuse without adopting guest activity into a later account.
- Coordinate-backed delivery checkout persists the selected customer delivery pin onto the online POS transaction. The POS incoming queue can then show the delivery address, coordinate text, and map-navigation action without requiring buyer fiscal fields for non-fiscal checkout.
- Mobile checkout delivery maps use concrete responsive heights instead of aspect-ratio-only sizing. The normal delivery map keeps the wrapper, MapLibre root, and canvas at `height: 100%`; the expanded **Large Map** uses a safe viewport-based height and resizes MapLibre after it becomes visible so iOS/Android browser chrome does not leave blank internal space. The map frame now uses `ResizeObserver`, `visualViewport` resize handling, requestAnimationFrame plus delayed retry resizing, and stable rendered-QA selectors so the MapLibre canvas cannot be sized by overlay controls. `Use Current Location`, the expand control, the pin action, and attribution remain positioned inside the map, and the expanded map uses DGFY blue branding instead of the orange fallback border.
- Discovery map initialization is defensive. If MapLibre/WebGL cannot initialize in the browser, the Storefront discovery page remains usable, renders the `Log in / Sign up` account action, and shows a list fallback instead of blanking the page.
- Storefront map/search stabilization is locally validated as of 2026-06-09. Submitted text searches stay storefront-first, item matches render tenant storefront result cards without auto-opening marker preview cards, repeated identical searches do not refit/flicker, duplicate-coordinate and 13-meter near-coordinate groups render as count pins that scope the existing results panel, hover previews collapse on pin leave, click/tap previews persist until closed, and visible discovery pins are renderer-owned map layer symbols rather than detached DOM overlays.
- Storefront map pin stability is production-live in SHA `744aa83e652a2847e362b12a8c55e0b18344cc5c` after restoring the renderer-owned discovery layer contract that replaced the older DOM `maplibregl.Marker` path. Storefront discovery pins and count clusters stay anchored to stored IMS coordinates across zoom/pan, marker preview popups remain anchored above normal pins, and count-cluster clicks scope the right-side results panel instead of rendering an on-map list.
- Branch-level Storefront availability is preserved from IMS item and product draft saves as well as final create/update flows. Draft saves now apply submitted branch toggles through the same `storefront_location_item_overrides` path used by active item edits.
- F&B product detail pages render ordered item galleries as a carousel with previous/next controls, dot navigation, thumbnails, touch swipe support, and ARIA carousel labels. Gallery data is preserved from `storefront_image_gallery` JSON before legacy single-image fallback so multi-image customer-facing media remains available after catalog reads.
- Storefront discovery search uses the PR #18 relevance closeout: Fuse.js ranking, exact/token fallback ordering, and map-pin fallback for search results without usable coordinates are production-live in SHA `744aa83e652a2847e362b12a8c55e0b18344cc5c`.
- The routed DGFY customer dashboard uses the updated overview/orders/business layout and is production-live in SHA `744aa83e652a2847e362b12a8c55e0b18344cc5c`; dashboard/order surfaces must retain tracking actions and business registration while avoiding customer-visible `company_token`.
- The merged storefront pilot keeps mode-specific view-model logic in the storefront app while preserving existing backend/source-of-truth contracts.

## Mode Standing

## 1) Default Storefront (Fallback / General)
- Hero + catalog + checkout flow is active.
- Discovery-to-store handoff with preferred location support is active.
- Catalog search, availability checks, cart building, and guest-or-account checkout entry are active.
- Mode-specific fallback copy is applied when tenant content is partial or missing.

## 2) Services Mode (`services`)
- Independent service storefront presentation is active (service-specific hero, tabs, filters, catalog cards).
- Service booking flow supports schedule selection, intake fields, quantity, and guest-or-account customer entry before step 1.
- Service draft multiplicity and batch booking submission are active.
- Service availability, short-lived holds, edited-draft hold replacement, and hold-backed checkout are wired to the current storefront contract.
- Services + product cart surfaces coexist with mode-aware controls and validation.
- Confirmation rendering handles every booking reference and every per-booking payment handoff returned by batch checkout.

## 3) Food & Beverage Mode (`fnb`)
- Restaurant/menu-style storefront presentation is active.
- F&B view model, menu grouping, default modifier selection, allergen presentation, and mode-specific catalog sections are active.
- F&B ordering flow supports mode-aware checkout progression with a shared guest-or-account entry gate before step 1.
- F&B reservation entry is active through the restaurant reservation surface.
- F&B product detail pages include item review summary/detail sections, and completed F&B/order tracking can route eligible fulfilled item targets into the review flow.
- F&B contract anchors and storefront rendering expectations are currently satisfied by tests.

## 4) Simple Mode (`msme` presentation)
- Simplified product storefront presentation is active for fast browsing/order flow.
- Stock-aware product cards and simple-mode cart/guest-or-account checkout flow are active.
- Simple-mode hero, catalog, and footer/community sections are active with content fallback handling.
- Simple storefront contract coverage is active.

## Storefront Regression Standing (Latest Run)
Run date: `2026-06-22`

Targeted Storefront discovery/account commands:
- `npm --prefix frontend exec vitest run apps/store/src/__tests__/discoveryFlow.integration.test.jsx apps/store/src/__tests__/discoveryMapDom.test.js apps/store/src/__tests__/storefrontMarkerPreview.test.js apps/store/src/__tests__/discoveryPresentation.test.js --pool=threads`
- `npm --prefix backend test -- --runTestsByPath tests/storefrontDiscoveryRepository.test.js tests/storefrontDiscoveryMapPins.usecase.test.js`
- `npm --prefix frontend exec vitest run src/features/inventory/__tests__/itemProductWizard.contract.test.js apps/store/src/__tests__/storefrontMarkerCss.contract.test.js apps/store/src/__tests__/discoveryFlow.integration.test.jsx --pool=threads`
- `npm --prefix frontend exec vitest run apps/store/src/__tests__/storefrontMarkerCss.contract.test.js apps/store/src/__tests__/discoveryMapDom.test.js apps/store/src/__tests__/discoveryFlow.integration.test.jsx --pool=threads`
- `npm --prefix backend test -- --runTestsByPath tests/storefrontCatalogUseCases.test.js tests/servicesMode.usecases.test.js tests/storefrontDiscoveryIndexService.catalogVisibility.test.js tests/settingsUsecases.applicationResult.test.js`
- `npm --prefix frontend run build:store`
- `npm run check:architecture`
- `git diff --check`
- `npm --prefix frontend exec vitest run apps/store/src/__tests__/discoveryMapLayers.test.js apps/store/src/__tests__/discoveryMapDom.test.js apps/store/src/__tests__/storefrontMarkerPreview.test.js apps/store/src/__tests__/storefrontMarkerCss.contract.test.js apps/store/src/__tests__/storefrontStoresMapSource.contract.test.js`
- `npm --prefix frontend test -- Pages/__tests__/RegisterCompanyLoginHandoff.test.jsx`
- `npm --prefix frontend test -- apps/store/src/__tests__/discoveryHeaderAccount.integration.test.jsx --testTimeout 15000`
- `npm --prefix frontend test -- apps/store/src/__tests__/fnbStorefront.contract.test.js`
- `npm --prefix frontend test -- src/services/__tests__/dgfyAuthService.cookieSession.test.js src/services/__tests__/browserTokenStorage.guard.test.js`
- `npm --prefix backend test -- --runTestsByPath tests/dgfyTenantSession.transport.test.js tests/dgfyAuthUseCases.test.js`

Targeted matrix result:
- June 8 marker/draft hardening frontend slice: `PASS` (`39/39` targeted tests). npm printed the existing unknown `--pool` warning but executed the suites.
- June 8 fixed-anchor marker follow-up slice: `PASS` (`29/29` targeted tests). Coverage includes the fixed `38px` by `48px` MapLibre marker root anchor box, absolutely positioned marker visual, and the existing discovery flow behavior.
- June 8 marker/card consistency follow-up slice: `PASS` (`32/32` targeted tests). Coverage includes shared-coordinate cluster markers using the same bottom anchor as normal pins, consistent above-pin popup offsets, and user-location marker layering below storefront pins.
- June 9 13-meter cluster/hover follow-up slice: `PASS` (`36/36` targeted frontend tests plus Storefront production build, docs lint, and architecture checks). Coverage includes 13-meter near-coordinate count-pin grouping, placeholder-coordinate multi-store count clustering, single-placeholder suppression, hover-preview collapse on pin leave, click-preview retention, renderer-owned pin layers, and Storefront production build. Rendered browser proof on local `/map-dgfy` showed one MapLibre canvas, zero old `.business-mode-marker` storefront markers, zero `.maplibregl-marker` DOM markers, and no relevant console warnings/errors.
- June 8 backend branch catalog/services/handle slice: `PASS` (`73/73` targeted tests).
- June 9 cluster panel/strict-hover follow-up slice: `PASS` (`39/39` targeted frontend tests). Coverage includes strict hover-preview dismissal when the pointer leaves a pin, click-preview persistence, duplicate-coordinate and 13-meter cluster count pins, cluster click routing into the existing results panel instead of a map list widget, and non-scaling View Results pulse CSS.
- June 9 non-PayMongo frontend polish deployment slice: `PASS` (`42/42` targeted frontend tests). Coverage includes Storefront results-panel collapse behavior, route-aware tenant permission reload after login navigation, and fixed IMS item modal dimensions.
- June 9 IMS item/product wizard sizing follow-up: `PASS` (`12/12` targeted frontend tests plus SKUpervisor build). Coverage includes the CSS-owned fixed wizard shell and standardized create/edit item/product modal dimensions across wizard steps.
- June 22 runtime standing: latest production evidence available in this workspace records deployed code SHA `744aa83e652a2847e362b12a8c55e0b18344cc5c`; production deploy summary `/var/www/skupervisor/logs/deploy/deploy_20260622_095434.summary.txt`, production `.deploy-state/last_deployed_commit`, production remote `HEAD`, and live `/api/v1/health.services.observability.runtime_sha` match that SHA. This includes Storefront gallery preservation, wizard image-upload corrections, Storefront access-mode ceiling UI correction, PR #18 discovery ranking/pin fallback, PR #20 DGFY Storefront customer-flow updates, F&B mobile hero stabilization, restored customer dashboard layout, shared CSRF header propagation for unsafe cookie-authenticated frontend requests, Storefront/POS browser-authenticated request consolidation, iMin receipt preview scroll controls, Storefront auth/order tracking hardening, DGFY account notification/SSE plumbing, explicit sign-out restore suppression, mobile delivery-map sizing/branding fixes, delivery-map blank-space hardening, canonical side-tracking-drawer cleanup, business-registration IMS handoff event hotfix, founder tenant-user linkage fallback, unique DGFY session-token hardening, IMS storefront location map pinning reliability, PH-local reverse-geocode metadata, same-origin `/openfreemap` MapLibre resource routing, multi-interval Storefront business hours, and the Storefront discovery map pin-stability restore in the deployed commit chain. Read-only production checks confirmed public Storefront/IMS/POS route reachability, live runtime SHA parity, frontend asset parity, deployed bundle/source inclusion, Storefront discovery reconciliation `healthy` with `failed=0`, `https://dgfy.ph/map-dgfy` route smoke, and protected notification endpoints fail cleanly when unauthenticated. Controlled production DGFY business-registration UAT passed with evidence `.tmp/production-uat/dgfy-business-handoff/evidence-20260620054511.json`; controlled production order-mutation and production-authenticated map/hours route UAT are still needed to prove live POS status propagation and human browser behavior on production data. Space Bar remains requested `transaction` but effective `catalog`; checkout is intentionally unavailable until registration readiness permits effective `transaction`.
- June 20 source-current DGFY login-prefill and business handoff limiter slice: `PASS` for backend `dgfyTenantSessionLimiter` account+tenant keying, tenant-session route ordering after DGFY authentication, tenant-session cookie transport, DGFY auth `reason=signed-out` no-restore behavior with email-only prefill and blank password, discovery **Log in / Sign up** routing after sign-out with remembered email, and RegisterCompany no-retry fallback on tenant-session `429`.
- June 20 controlled production DGFY business-registration UAT: `PASS` for OTP-backed QA account creation, explicit logout suppression of cookie-backed auto-restore, re-login after logout without revoked-token reuse, production company registration, IMS tenant-session creation, second tenant-session non-rate-limit behavior, founder membership/ownership persistence, and QA tenant/account/database cleanup. Evidence: `.tmp/production-uat/dgfy-business-handoff/evidence-20260620054511.json`.
- June 19 source-current batch-findings slice: `PASS` for RegisterCompany cookie-backed company registration plus tenant-session handoff and fallback copy, DGFY auth explicit-sign-out suppression, Storefront discovery Login / Signup routing after sign-out, browser-token guard coverage, Storefront delivery map sizing contract, backend DGFY auth/session transport, Storefront production build, docs lint, diff whitespace, and architecture guardrails. Rendered checkout-map smoke passed locally through `scripts/smoke-storefront-delivery-map.js` at `390x844`, `360x740`, `320x568`, and `1366x900`: normal and expanded map frames were visible, MapLibre roots/canvases filled their frames, overlay controls stayed inside the frame, the pin action remained visible/clickable, no fallback/error overlay appeared, and no relevant console errors were recorded. The live production Storefront asset contains the deterministic map selectors, resize observer path, visual viewport handling, normal/expanded height clamps, side-tracker copy, and no longer contains the removed standalone tracking-list copy.
- Production-deployed CSRF closure: Storefront shared `requestJson` now owns credentials, Storefront context headers, bearer propagation, and unsafe-method CSRF header injection for Storefront browser requests. Hospitality booking uses that shared helper instead of a local direct-fetch wrapper, so its quote, hold, booking, history, and claim calls inherit the same browser-session contract.
- Storefront discovery flow, map DOM, marker preview, and presentation suites: `PASS` (`42/42` targeted tests). npm printed the existing unknown `--pool` warning but executed the suites.
- Backend Storefront discovery repository and map-pin use-case suites: `PASS` (`19/19` targeted tests), including union store/item matching, out-of-stock inclusion, nearest matching branches, and degraded snapshot behavior.
- Storefront production build: `PASS`
- Architecture guardrails and controller-boundary checks: `PASS`
- Diff whitespace check: `PASS`
- Local rendered route health: `PASS` for `/map-dgfy` page identity, desktop search controls, map region, overlay-free render, search-field interaction, and zero relevant console warnings/errors. June 22 Storefront map regression validation passed the layer-model, DOM, marker preview, marker CSS, and `StoresMap` source-contract suites (`5` files / `17` tests), `npm --prefix frontend run build:store`, `npm run check:architecture`, and `git diff --check`. Production route smoke passed for `https://dgfy.ph/map-dgfy` after deploying SHA `744aa83e652a2847e362b12a8c55e0b18344cc5c`. The latest production evidence available in this workspace is deploy summary `/var/www/skupervisor/logs/deploy/deploy_20260622_095434.summary.txt` for SHA `744aa83e652a2847e362b12a8c55e0b18344cc5c`, reporting Storefront runtime evidence through public endpoint checks, frontend asset parity passing, Storefront discovery reconciliation `healthy` with `failed=0`, protected notification endpoint unauthenticated `401` checks, live Storefront bundle inclusion checks, live runtime SHA health proof, and deployed Storefront map bundle/source inclusion checks. Seeded-data zoom QA remains useful for real-pin placement evidence.

## Notes
- This file intentionally tracks the frontend standing and test evidence snapshot only.
- Backend/contract evolution remains governed by ADRs and API docs.

## Discovery Map/Search Fix Standing (2026-05-21)
- Public Storefront discovery search uses the authoritative `/api/v1/storefront/discovery` flow for visible results; the client no longer swaps in transient `/geo-search` no-match states.
- Search and Near Me actions use intent sequencing and request cancellation so stale geolocation callbacks or older discovery fetches cannot overwrite newer results.
- Public search alias expansion is intentionally bounded and lives in the shared backend policy so index text and query matching agree. It currently covers common `aircon`/`A/C`/`air conditioning` variants without introducing broad fuzzy matching.
- Single-result searches focus the exact pin without opening a marker preview automatically; multi-result searches fit the exact unique marker coordinates.
- Pin click opens/keeps the Discover Nearby results panel and marker preview synchronously. Hover-only previews close when the pointer leaves the pin. Store navigation is an explicit card/list action.
- Duplicate-coordinate and 13-meter near-coordinate clusters now scope the existing Discover Nearby/View Results panel to the grouped storefronts rather than rendering a large selectable list widget over the map.
- Storefront pins and shared-coordinate cluster pins are MapLibre layer symbols with a bottom icon anchor. Marker cards use one above-pin popup offset and remain anchored to the same source feature coordinates; there is no Storefront DOM marker element that can drift separately from the map during zoom.
- Storefront discovery index reconciliation is part of the guarded production deploy path by default, with a dry-run CLI for preflight impact review.

## Discovery Map Availability Standing (2026-05-28)
- `StoresMap` catches MapLibre initialization failures, logs a warning, and renders a store-list fallback instead of allowing a WebGL failure to crash the discovery route.
- `DeliveryPinMap` catches MapLibre initialization failures and renders a delivery-address fallback message so checkout/delivery flows do not blank when the map canvas is unavailable. The checkout map wrapper, MapLibre root, and canvas own explicit heights in normal and expanded mobile views, and the component resizes MapLibre after load and after effective height changes.
- The account header remains visible when map initialization fails, so DGFY login/signup and business-registration actions stay reachable before checkout.
