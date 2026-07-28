# Storefront Default-Industry Standardization and Mobile Action-Row Fix (2026-07-28)

Branch: `layout/storefront_desktop2`

---

## 1. Modification Name: Standardized UI/UX for all industries (Hero, Promo, Customer Reviews, Footer — Products section unchanged)

**Files modified:**
- `frontend/apps/store/src/shared/components/DefaultStorefrontHero.jsx`
- `frontend/apps/store/src/shared/hooks/useStorefrontCatalog.js`
- `frontend/apps/store/src/shared/components/storefront/StorefrontClassicCatalog.jsx`
- `frontend/apps/store/src/app/pages/StorefrontHeroBandContainer.jsx`
- `frontend/apps/store/src/app/hooks/useStorefrontCatalogRouteProps.js`
- `frontend/apps/store/src/app/pages/StorefrontCatalogRouteContainer.jsx`
- `frontend/apps/store/src/StorefrontApp.jsx`

**Modification:**
Every non-F&B/Services/Simple industry (hospitality, healthcare, retail, food manufacturing, ticketing/transport, logistics/distribution, education, etc.) previously rendered through a bespoke, minimal `DefaultStorefrontHero` (a plain gradient banner with a share/checkout button and a placeholder "Browse the store categories and products below" block) and a separate, unstyled "Location Map Snapshot" section. This is replaced by reusing F&B's own hero building blocks verbatim (header nav, branch selector, branding section, gallery, contact & location map, why-choose-us, mobile overview/info cards) via `buildFnbHeroViewModel`, so the Hero Section now matches F&B/Services/Simple exactly for every other industry. `buildFnbHeroViewModel` is a pure data-shaping function despite its name — an `EMPTY_FNB_VIEW_MODEL` placeholder disables only the one truly F&B-specific bit it renders (the "Starts at ₱X" badge), which has no equivalent elsewhere.

A new `defaultStorefrontModel` (mirroring `simpleStorefrontModel`'s shape for the fields the shared Promo/Reviews/Footer sections consume) feeds the same shared `SharedStorefrontPromoSection`, `SharedStorefrontReviewsSection`, and `SharedStorefrontFooterSection` components that F&B/Services/Simple already use, plus a review submission modal. The Products/catalog section (Zone 4, rendered separately by `StorefrontCatalogRouteContainer`) is completely untouched by this change.

**Code lines:**
- `DefaultStorefrontHero.jsx:4-12` — imports F&B's hero building blocks (`buildFnbHeroViewModel`, `FnbHeroBranchSelector`, `FnbHeroBrandingSection`, `FnbHeroDesktopAboutGallery`, `FnbHeroDesktopContactLocation`, `FnbHeroDesktopWhyChooseUs`, `FnbHeroMobileInfoCards`, `FnbHeroMobileOverview`).
- `DefaultStorefrontHero.jsx:27` — `EMPTY_FNB_VIEW_MODEL = Object.freeze({})` placeholder.
- `DefaultStorefrontHero.jsx:71-73` — `buildFnbHeroViewModel({ ..., fnbViewModel: EMPTY_FNB_VIEW_MODEL, ... })`.
- `DefaultStorefrontHero.jsx:159,182,212,222,264,277,296` — each F&B building block rendered in place of the old bespoke markup.
- `useStorefrontCatalog.js:366` — `defaultStorefrontModel` `useMemo`, returned at line 461.
- `StorefrontClassicCatalog.jsx:688` — `!isServicesMode && !isFnbMode && !isSimpleMode && defaultStorefrontModel` gate around the standardized Promo/Reviews/Footer block (lines 690, 703, 718), reusing the same shared section components already imported at lines 23-25.
- `StorefrontHeroBandContainer.jsx:267` — `<DefaultStorefrontHero>` re-wired to the new, expanded prop set; the old standalone "Location Map Snapshot" `<StoresMap>` section (previously right below the hero) is removed since the map is now part of `DefaultStorefrontHero` itself.
- `useStorefrontCatalogRouteProps.js`, `StorefrontCatalogRouteContainer.jsx`, `StorefrontApp.jsx` — thread `defaultStorefrontModel` from the hook down to `StorefrontClassicCatalog`.

---

## 2. Modification Name: Fix store name displacement when no phone number (no Call/Message buttons)

**Files modified:**
- `frontend/apps/store/src/modes/services/storefront/components/ServicesHero.jsx`
- `frontend/apps/store/src/modes/simple/storefront/components/SimpleHero.jsx`

**Modification:**
On mobile, the Call/Message action-button row above the store name had no explicit height. When a store had no phone number (`serviceHeroModel.actions?.canMessage`/`canCall` both false), that row rendered with zero children and collapsed to `0px` height instead of reserving its usual space, which shifted the store name upward/displaced it from its expected position. Fixed by giving that row an explicit `minHeight: 38` (matching the buttons' own height), so the row always reserves the same vertical space whether or not it has any buttons to show.

**Code lines:**
- `ServicesHero.jsx:378` — `<div style={{ display: 'flex', minHeight: 38, marginLeft: 118, ... }}>`.
- `SimpleHero.jsx:315` — same fix, identical `minHeight: 38` addition.

---

### Additional included changes (not part of the two items above, bundled in this same push)
- `frontend/apps/store/src/shared/model/storefrontAccountBranches.js` — the two `catch {}` blocks in `fetchStorefrontAccountBranches` now log the caught `error` via `console.warn` before returning `[]`, so an auth/CORS/cookie-scoping failure (this call is cookie-dependent and can fail differently across environments) is diagnosable from the browser console instead of looking identical to "no other stores exist."
- `frontend/apps/store/src/modes/services/storefront/components/StorefrontServicesCatalog.jsx`, `useStorefrontCatalogRouteProps.js`, `StorefrontCatalogRouteContainer.jsx` — thread a previously-missing `applySavedDeliveryLocation` prop through to the Services delivery-location panel.
