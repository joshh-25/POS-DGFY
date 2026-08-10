Re-verified all six causes against `develop` @ `274d3efd`. The technical substance holds — all six causes are real and Cause 1's `Vary: X-Store-Slug` safety argument checks out (confirmed deeper below). A few things need correcting before implementation, mostly because the repo moved out from under the audit:

## 1. Every path in this issue is stale

`frontend/` was moved to `apps/dgfy-web/apps/store/` in `94123841` (`refactor(frontend): move frontend/ into apps/dgfy-web`), and `backend/` was absorbed into `apps/dgfy-api/` in `50ec10d9` (`feat: absorb backend into apps/dgfy-api, ...`), per ADR 0054. **Every cited line number is still accurate** — only the directory prefix changed, e.g. `frontend/apps/store/src/shared/hooks/useStoreCatalogLoader.js` → `apps/dgfy-web/apps/store/src/shared/hooks/useStoreCatalogLoader.js`, `backend/src/routes/store.js` → `apps/dgfy-api/src/routes/store.js`. One exception: `requestJson.js` also changed subdirectory, from `src/shared/services/` to `src/services/`.

## 2. "Route-level code splitting — Working" is false

`src/router.jsx` doesn't exist anywhere in the current tree. Routing lives in `src/main.jsx`, which statically imports all six route components (`StorefrontApp`, `StorefrontLoginPage`, `StorefrontRegisterPage`, `StorefrontAffiliateAcceptPage`, `StorefrontResetPasswordPage`, `StorefrontBusinessGrowPage`) — the whole storefront sits behind a single catch-all `path="*"`. There are zero `React.lazy`, zero `<Suspense>`, and zero dynamic `import()` calls in app code (confirmed by grep). Cause 6 is broader than described: there's no code splitting at all today, not just no per-mode splitting.

## 3. MapLibre is not lazy-loaded, and this is the biggest bundle win not in this issue

`vite.config.js:111` has a comment claiming "MapLibre is lazy-loaded" to justify the relaxed chunk-size warning limit. That's not true of the storefront app: `maplibre-gl` is statically imported by `features/locations/components/DeliveryPinMap.jsx`, `features/tracking/components/DeliveryTrackingView.jsx`, `discovery/components/StoresMap.jsx`, and `tracking/TrackingRouteMap.jsx`, plus `import 'maplibre-gl/dist/maplibre-gl.css'` directly in `StorefrontApp.jsx:305`. The `vendor-maplibre` chunk (~1.1MB in the sibling admin build) therefore ships on every storefront page load, even though none of these four components render on the default storefront path (they're delivery-pin selection, order tracking, and discovery map — all conditional). This is likely a larger and cheaper win than the code-splitting items in this issue, since it's a single `React.lazy` wrap with no architectural untangling required.

## 4. Cause 3 is worse than described: up to 3 catalog fetches, not 2

`setSelectedStore(profile)` (`:113`) commits *before* the awaited `/store/locations` call (`:120`) resolves, so the location-aware effect (`:213-249`) fires once with no `location_id` while locations are still loading, fires again after `setSelectedLocationId` lands (`:155`), and `openStoreBySlug` (`:178`) issues its own catalog request on top. All three are ungated by a shared guard since the two paths use disjoint sequence refs (`storeLoadRequestSequenceRef` vs `locationCatalogRequestSequenceRef`).

## 5. Cause 1's "highest impact" ranking is overstated for cold load

`nginx/dgfy.ph.conf` has no `proxy_cache_path`/`proxy_cache` zone — there's no shared/intermediary cache in front of the API today, so `s-maxage` currently has no consumer. The win from dropping `no-store` is real but browser-cache-only: repeat views, re-mounts, back/forward navigation, and absorbing the Cause 3 duplicate. It does nothing for a first-time visitor's cold load, where Causes 2–4 dominate.

## 6. Caching safety, confirmed one level deeper

Verified past what the issue checked: `/store/catalog` and `/store/locations` have no customer-auth middleware on the route, so responses genuinely cannot vary per authenticated user (there's no session-scoped branching to leak). Tenant resolution for storefront routes (`tenantHandler.js`) reads only the request Host (custom domains) and the `x-store-slug` header — `x-tenant-slug`/`x-tenant-id`/`x-location-id`, which `requestJson` also sends, are never read server-side at all, so their absence from `varyHeaders` is harmless, not an oversight.

## 7. `StorefrontResponsiveImage` doesn't need an "eager variant" component

`loading` is already a prop (default `'lazy'`) and the component rest-spreads arbitrary props onto the underlying `<img>`, so `loading="eager"` + `fetchPriority="high"` already work at any call site today — no new variant needed. The actual blocker for hero images is different: `storefrontImageSources.js` builds `srcSet`/AVIF/WebP off `item.image_variants`, a catalog-item shape. Store branding fields (`storefront_cover_image_url`, `storefront_profile_image_url`) are plain URL strings with no variant payload exposed — that's a backend gap, not a frontend one. Good news: branding uploads already go through the same optimized-image pipeline as catalog items, so the variant files exist on disk; only the read-time exposure is missing.

## 8. Live bug in the one existing high-priority call site

`modes/fnb/storefront/components/FnbProductMediaGallery.jsx:127` sets `fetchPriority="high"` but doesn't pass `loading="eager"`, so it still inherits the component's `loading='lazy'` default — a self-defeating combination on what's likely a product-detail LCP image.

## 9. Minor count corrections

`modes/` is 191 files / 25,154 lines total (services is 36 files / 7,178 lines, not 31/6,729 — probably drifted since the audit was written). Bare `<img>` usage is 72 occurrences across 48 files, not just the 13 hero files named — Cause 4 also missed `ServicesHero.jsx:500` (gallery tile), `StorefrontShareQr.jsx:252` (logo overlay), and `StorefrontHeaderNav.jsx:326` (account-menu logo). Both `/storefront/discovery` cache configs (`discoveryListCacheControl`/`discoveryProfileCacheControl`) confirmed to genuinely have no `varyHeaders` — they don't need one since the slug is in the URL path, not a header.

The conclusion about the file-consolidation proposal being a small, capped win relative to these causes still holds and doesn't need revision.

I'm proceeding to implement items 1–7 with these corrections folded in, plus the MapLibre lazy-load from point 3.
