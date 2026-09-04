---
status: reference
authority_level: reference
owner: frontend
last_reviewed: 2026-09-04
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
   - `docs/architecture/adr/0071-frontend-split-into-three-apps.md`
5. Domain references:
   - `docs/features/SETTINGS_INFORMATION_ARCHITECTURE.md`
   - `docs/testing/manual-qa-readiness-runbook-pos-ims-store.md`

## Current PWA Surfaces

Each surface is now its own independent Vite app (ADR 0071). There is no longer a shared
admin shell package with a second nested SKUpervisor build — SKUpervisor/IMS owns exactly one
manifest and one service worker.

| Surface | App root | Manifest | Service worker | Build output | Build command |
|---|---|---|---|---|---|
| SKUpervisor / IMS | `apps/dgfy-ims/` | `apps/dgfy-ims/public/manifest.webmanifest` | `apps/dgfy-ims/public/sw.js` | `apps/dgfy-ims/dist/` | `npm run build:skupervisor` |
| POS | `apps/dgfy-pos/` | `apps/dgfy-pos/manifest.webmanifest` | `apps/dgfy-pos/public/sw.js` | `apps/dgfy-pos/dist/` | `npm run build:pos` |
| Storefront | `apps/dgfy-storefront/` | `apps/dgfy-storefront/public/manifest.json` | `apps/dgfy-storefront/public/sw.js` | `apps/dgfy-storefront/dist/` | `npm run build:store` |

Known discrepancy worth verifying before rating Storefront PWA readiness: `apps/dgfy-storefront/
index.html` links `/manifest.webmanifest`, but the file that actually ships to
`apps/dgfy-storefront/dist/` is `manifest.json` (a stray `apps/dgfy-storefront/manifest.webmanifest`
exists at the app root but is outside `public/` and is not copied). Confirm which one the built
storefront serves before claiming install eligibility.

Shared frontend code used by all three surfaces lives in `packages/web-core`
(`@sieitzz/web-core`). `packages/web-core` has no build step and owns no manifest or service
worker of its own — PWA assets are per-app and stay per-app.

## Admin/SKUpervisor Contract

The admin/SKUpervisor PWA is installable and uses conservative caching:

1. `index.html` includes manifest, theme color, Apple mobile-web-app metadata, and touch icon metadata.
2. `apps/dgfy-ims/src/main.jsx` registers the admin service worker in production only.
3. Service-worker registration probes `sw.js` first and requires a script-like content type before registration.
4. Static shell resources are cacheable.
5. Navigation requests use network-first behavior with cached fallback when available.
6. `/api/` and `/uploads/` are bypassed by the service worker to avoid stale authenticated data, stale uploads, and incorrect tenant context.
7. Service-worker support is optional; registration failure must not block the admin shell.

## Version Observability Surface

Added Phase 278 (#1576, epic #1548 Wave 3), following Phase 277's `APP_VERSION` build-arg
(#1575). Not itself a PWA-installability concern, but it lives here because #276's PWA
"new version available" toast (below, "Remaining work" item 2) is the concrete consumer this
surface exists to feed, alongside #633's Sentry release tagging on the backend.

Per app, three build-time-derived reads of the same value (ADR 0081 Decision 4: `APP_VERSION`,
falling back to that app's own `package.json` `version` when unset — see
`packages/web-core/vite/buildStampPlugin.js`, the one shared helper all three frontends call
rather than three separate implementations):

| Surface | Shape | Where it's generated |
|---|---|---|
| `import.meta.env.VITE_APP_VERSION` | bare version string, e.g. `"1.5.2-staging"` or `"1.1.0"` | each app's own `vite.config.js` `define` block, alongside its existing `VITE_APP_SURFACE` (`dgfy-ims`/`dgfy-pos`) or `VITE_BUILD_STAMP` (`dgfy-storefront`) entries |
| `<meta name="dgfy-version" content="...">` | HTML meta tag, `content` is the same bare version string | injected into the built `index.html` by `buildStampPlugin`'s `transformIndexHtml` hook — not present in `apps/*/index.html` source, only in the built output |
| `public/version.json` (served at each app's own root, e.g. `/version.json`) | `{"version": "..."}` | emitted into the build output (`dist/version.json`) by `buildStampPlugin`'s `generateBundle` hook via Rollup's `emitFile` — **not** hand-committed under `apps/*/public/`, since it's build-derived and would go stale the moment it stopped being regenerated every build |

The backend equivalent is `apps/dgfy-api`'s `/health` response: `services.observability.version`
(and sibling `services.observability.version_source`, `"env:APP_VERSION"` or `"package_json"`),
next to the existing `runtime_sha` field — same shape, not a separate endpoint. See
`apps/dgfy-api/src/services/healthService.js`'s `resolveAppVersionInfo`.

This issue only produces the surface — it does not wire #633's Sentry release tagging or #276's
toast-polling logic; both were handed the exact field names/shapes above by comment once this
phase merged (ADR 0081 Decision 5).

## POS And Storefront Contract

POS and Storefront retain their existing service-worker entrypoints.

1. POS offline operation behavior is governed by ADR 0014 and the durable terminal operation queue contract.
2. Storefront discovery/catalog HTTP caching remains API-controlled; checkout, order, and mutation routes must remain `no-store`.
3. Public storefront PWA behavior must not cache checkout/order mutations.
4. Local standalone POS development runs on port `5174` through `npm run dev:pos` (or as part of `npm run dev:local-pos-stack`). The POS entrypoint does not register a production worker in development.
5. Before mounting in development, the standalone POS unregisters stale root-scoped workers and clears only `sku-admin-*` / `sku-pos-*` caches. If a prior admin/POS build controlled port `5174`, this one-time reset prevents an old cached HTML shell from requesting missing hashed assets and rendering a white terminal.
6. A public registration that is still awaiting Platform Admin approval must never navigate to POS. The Storefront registration surface opens the applicant status page instead; POS handoff is available only after approved provisioning creates an accepted active membership.

## Validation Checklist

Run before rating PWA readiness as user-ready:

Run only the app(s) actually affected; there is no aggregate `build:all` script.

1. `npm run build:skupervisor` (equivalently `npm --prefix apps/dgfy-ims run build`)
2. `npm run build:pos` (equivalently `npm --prefix apps/dgfy-pos run build`)
3. `npm run build:store` (equivalently `npm --prefix apps/dgfy-storefront run build`)
4. `node --check apps/dgfy-ims/public/sw.js`
5. `node --check apps/dgfy-pos/public/sw.js` and `node --check apps/dgfy-storefront/public/sw.js`
6. Parse all manifest JSON files.
7. Confirm production build output contains:
   - `apps/dgfy-ims/dist/manifest.webmanifest`
   - `apps/dgfy-ims/dist/sw.js`
   - `apps/dgfy-pos/dist/sw.js`
   - `apps/dgfy-storefront/dist/manifest.json`
   - `apps/dgfy-storefront/dist/sw.js`
8. In a real browser or device, verify:
   - install prompt/add-to-home-screen eligibility
   - installed window title/icon
   - reload while online
   - reload after transient offline state
   - API/upload routes are not served stale from service-worker cache
   - local `http://localhost:5174/terminal` renders nonblank with `/@vite/client` and `/src/main.jsx` returning `200`
   - development has no stale service-worker controller after the automatic reset

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

1. `apps/dgfy-ims/dist/`
2. `apps/dgfy-pos/dist/`
3. `apps/dgfy-storefront/dist/`

Do not delete source PWA files under `apps/dgfy-ims/public/`, `apps/dgfy-pos/public/`,
`apps/dgfy-pos/manifest.webmanifest`, or `apps/dgfy-storefront/public/`.
