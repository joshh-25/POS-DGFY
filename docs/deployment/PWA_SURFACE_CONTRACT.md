---
status: reference
authority_level: reference
owner: frontend
last_reviewed: 2026-04-30
applies_to: pwa_installability_and_service_workers
topic: pwa_surface_contract
---

# PWA Surface Contract

## Source Documents

Planning and validation for PWA behavior must start with:

1. `docs/START_HERE.md`
2. `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
3. `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
4. ADR references:
   - `docs/architecture/adr/0006-skupervisor-expansion-program-boundaries.md`
   - `docs/architecture/adr/0014-multi-template-modes-pos-offline-sync-and-storefront-cache-contracts.md`
5. Domain references:
   - `docs/features/SETTINGS_INFORMATION_ARCHITECTURE.md`
   - `docs/testing/manual-qa-readiness-runbook-pos-ims-store.md`

## Current PWA Surfaces

| Surface | Source root | Manifest | Service worker | Build output |
|---|---|---|---|---|
| SKUpervisor admin shell | `frontend/` | `frontend/public/manifest.webmanifest` | `frontend/public/sw.js` | `frontend/dist/` |
| SKUpervisor app build | `frontend/apps/skupervisor/` | `frontend/apps/skupervisor/public/manifest.webmanifest` | `frontend/apps/skupervisor/public/sw.js` | `dist-apps/skupervisor/` |
| POS | `frontend/apps/pos/` | `frontend/apps/pos/manifest.webmanifest` | `frontend/apps/pos/public/sw.js` | `dist-apps/pos/` |
| Storefront | `frontend/apps/store/` | `frontend/apps/store/public/manifest.json` | `frontend/apps/store/public/sw.js` | `dist-apps/store/` |

## Admin/SKUpervisor Contract

The admin/SKUpervisor PWA is installable and uses conservative caching:

1. `index.html` includes manifest, theme color, Apple mobile-web-app metadata, and touch icon metadata.
2. `frontend/src/main.jsx` registers the admin service worker in production only.
3. Service-worker registration probes `sw.js` first and requires a script-like content type before registration.
4. Static shell resources are cacheable.
5. Navigation requests use network-first behavior with cached fallback when available.
6. `/api/` and `/uploads/` are bypassed by the service worker to avoid stale authenticated data, stale uploads, and incorrect tenant context.
7. Service-worker support is optional; registration failure must not block the admin shell.

## POS And Storefront Contract

POS and Storefront retain their existing service-worker entrypoints.

1. POS offline operation behavior is governed by ADR 0014 and the durable terminal operation queue contract.
2. Storefront discovery/catalog HTTP caching remains API-controlled; checkout, order, and mutation routes must remain `no-store`.
3. Public storefront PWA behavior must not cache checkout/order mutations.

## Validation Checklist

Run before rating PWA readiness as user-ready:

1. `npm --prefix frontend run build`
2. `npm --prefix frontend run build:skupervisor`
3. `npm --prefix frontend run build:all`
4. `node --check frontend/public/sw.js`
5. `node --check frontend/apps/skupervisor/public/sw.js`
6. Parse all manifest JSON files.
7. Confirm production build output contains:
   - `frontend/dist/manifest.webmanifest`
   - `frontend/dist/sw.js`
   - `dist-apps/skupervisor/manifest.webmanifest`
   - `dist-apps/skupervisor/sw.js`
   - `dist-apps/pos/sw.js`
   - `dist-apps/store/sw.js`
8. In a real browser or device, verify:
   - install prompt/add-to-home-screen eligibility
   - installed window title/icon
   - reload while online
   - reload after transient offline state
   - API/upload routes are not served stale from service-worker cache

## Current Readiness Rating

Source-level PWA infrastructure confidence is high after the 2026-04-30 admin/SKUpervisor additions.

Current rating: `8.8/10`.

Remaining work before a `10/10` rating:

1. Real-device install validation on Android Chrome and iOS Safari.
2. Visible "new version available" update prompt for long-lived installed sessions.
3. Dedicated offline fallback view for authenticated admin navigation.
4. Continued release-gate browser evidence across desktop and mobile PWA viewports.

## Cleanup Policy

Generated PWA/build outputs are disposable:

1. `frontend/dist/`
2. `dist-apps/`

Do not delete source PWA files under `frontend/public/` or `frontend/apps/*/public/`.
