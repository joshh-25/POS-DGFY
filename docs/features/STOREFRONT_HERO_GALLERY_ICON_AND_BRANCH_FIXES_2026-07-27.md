# Storefront Hero Gallery, Map Icon, and Branch Fixes (2026-07-27)

Commit: `db3009a5` "Storefront Layout and Functionalities"
Branch: `layout/storefront_desktop`

---

## 1. Modification Name: Storefront gallery not rendering images properly

**Files modified:**
- `frontend/apps/store/src/app/runtime/normalizeStorefrontPageModel.js`
- `frontend/apps/store/src/modes/fnb/storefront/model/buildFnbHeroViewModel.js`

**Modification:**
Gallery image URLs from `galleryPreview`/`galleryFull` were not being resolved through the app's asset origin before being handed to `<img src>`, which could produce broken/relative image paths depending on where the storefront was served from. `buildFnbHeroViewModel.js` now maps every gallery URL (both the capped preview list and the full list) through `withAssetOrigin()` before they reach any gallery component.

**Code lines:**
- `buildFnbHeroViewModel.js:6` — import `withAssetOrigin` from `storefrontRuntime.js`.
- `buildFnbHeroViewModel.js:27` — `galleryImages` now maps every URL through `withAssetOrigin(url)`.
- `buildFnbHeroViewModel.js:39-40` — `galleryImagesFull` (used by the fullscreen lightbox) is resolved the same way.
- `normalizeStorefrontPageModel.js:406-408` — `galleryPreview` (capped to 4), `galleryTotalCount` (true unsliced count), and `galleryFull` (all image URLs) are all sourced here upstream.

---

## 2. Modification Name: Gallery display rules — desktop 4-image cap with "+N" expand, mobile merged into About Us

**Files modified:**
- `frontend/apps/store/src/modes/fnb/storefront/components/FnbHeroDesktopAboutGallery.jsx`
- `frontend/apps/store/src/modes/fnb/storefront/components/FnbHeroGalleryLightbox.jsx` (new file)
- `frontend/apps/store/src/modes/fnb/storefront/components/FnbHeroMobileInfoCards.jsx`
- `frontend/apps/store/src/modes/fnb/storefront/model/buildFnbHeroViewModel.js`
- `frontend/apps/store/src/app/runtime/normalizeStorefrontPageModel.js`

**Modification:**
Desktop: the gallery grid shows up to 4 image tiles; if the store has more than 4 gallery images, the last visible tile gets a "+N" overlay (`N` = total images beyond the 4 shown) and tapping any tile opens a fullscreen lightbox (new `FnbHeroGalleryLightbox` component) that can page through every uploaded image, not just the 4-tile preview.

Mobile: previously there was a separate, dedicated "Gallery" scroll card showing a 2x2 grid of images — this was the bug ("appears in the gallery instead"). That separate card is removed. The gallery preview is now merged directly into the About Us/store-details card: its thumbnail slot shows the first gallery image with a "+N" overlay (`N` = total gallery images minus the one shown), and tapping it opens the same fullscreen lightbox used on desktop, starting at index 0.

**Code lines:**
- `FnbHeroDesktopAboutGallery.jsx:23` — `openGalleryLightbox` handler.
- `FnbHeroDesktopAboutGallery.jsx:62-63` — `galleryImages.slice(0, 4)` cap and `showOverflowOverlay` (true only on the last visible tile, when `galleryOverflowCount > 0`).
- `FnbHeroDesktopAboutGallery.jsx:96` — renders `<FnbHeroGalleryLightbox>`.
- `FnbHeroMobileInfoCards.jsx:47-48` — `totalGalleryImageCount`/`storeDetailGalleryOverlayCount` (total minus the 1 thumbnail shown).
- `FnbHeroMobileInfoCards.jsx:113,118,131` — thumbnail button, overlay condition, and "+N" label merged into the store-details card.
- `FnbHeroMobileInfoCards.jsx:278` — renders `<FnbHeroGalleryLightbox>`; the old standalone "Gallery" mobile card block was deleted entirely.
- `buildFnbHeroViewModel.js:31-40` — `galleryTotalCount`/`galleryOverflowCount`/`galleryImagesFull` derivation.
- `normalizeStorefrontPageModel.js:406-408` — source fields (`galleryPreview`, `galleryTotalCount`, `galleryFull`).

---

## 3. Modification Name: Storefront Location map icon parity with DGFY Discovery Map

**Files modified:**
- `frontend/apps/store/src/modes/fnb/storefront/model/buildFnbHeroViewModel.js`
- `frontend/apps/store/src/shared/hooks/useStorefrontCatalog.js` (Services and Simple mode hero models)

**Modification:**
The storefront's own "Contact & Location" map (`mapStores`) is built from `/api/v1/store/locations` records, which don't carry the tenant's business type. Because the shared marker-icon lookup used by `StoresMap` keys off `workflow_mode`/`business_mode`, every storefront location pin was falling back to the default/generic icon instead of the same business-type icon shown on the DGFY Discovery Map. Fixed by copying `workflow_mode`/`business_mode` from `selectedStore` onto every location record passed into `mapStores`, for all three storefront modes (F&B, Services, Simple).

**Code lines:**
- `buildFnbHeroViewModel.js:94,101-102` — `mapStores` mapping now includes `workflow_mode`/`business_mode` from `selectedStore`.
- `useStorefrontCatalog.js:98-99` — Services-mode `mapStores` mapping, same fix.
- `useStorefrontCatalog.js:286-287` — Simple-mode `mapStores` mapping, same fix.

---

## 4. Modification Name: Clicking a branch now reliably centers the map on its location pin

**Files modified:**
- `frontend/apps/store/src/discovery/components/StoresMap.jsx`
- `frontend/apps/store/src/modes/fnb/storefront/components/FnbHeroDesktopContactLocation.jsx`
- `frontend/apps/store/src/modes/services/storefront/components/ServicesHeroDesktopContactLocation.jsx`
- `frontend/apps/store/src/modes/simple/storefront/components/SimpleHeroContactLocation.jsx`
- `frontend/apps/store/src/modes/fnb/storefront/components/FnbHeroMobileInfoCards.jsx`

**Modification:**
Selecting a branch (location) already fed `selectedLocationId` into the map's `selectedKey`/camera-centering logic, but the resulting pin often didn't land in the visible center of the map. Two root causes were fixed in `StoresMap.jsx`:
1. The pin's symbol layer anchors each icon at its bottom tip, so centering the camera on the raw coordinate left the visible round badge floating above center. A `STORE_MARKER_SINGLE_PIN_CENTER_OFFSET` is now applied to the `flyTo` camera target to compensate.
2. The map is often mounted while the surrounding hero (cover/profile images, web fonts) is still reflowing, so MapLibre could be centering against stale container dimensions. `scheduleMapResize()` (staggered `requestAnimationFrame` + timers + a `ResizeObserver` on the container) forces the map to `resize()` and recompute centering once the container's real size settles.

The three desktop Contact & Location components and the mobile info card now also pass an explicit `height` prop to `StoresMap` so the resize logic has a reliable target size to reconcile against. The default attribution control (which expanded into a large text box at these small embed sizes) was also disabled.

**Code lines:**
- `StoresMap.jsx:36` — `STORE_MARKER_SINGLE_PIN_CENTER_OFFSET = [0, 30]`.
- `StoresMap.jsx:80` — `scheduleMapResize` (RAF + staggered timers).
- `StoresMap.jsx:125` — `attributionControl: false` on map init.
- `StoresMap.jsx:138,151,165` — `scheduleMapResize()` called on style-ready and mount/cleanup.
- `StoresMap.jsx:169-173` — `ResizeObserver` on the map container re-triggers `scheduleMapResize`.
- `StoresMap.jsx:547` — single-pin `flyTo` now passes `offset: STORE_MARKER_SINGLE_PIN_CENTER_OFFSET`.
- `FnbHeroDesktopContactLocation.jsx`, `ServicesHeroDesktopContactLocation.jsx`, `SimpleHeroContactLocation.jsx` — each adds `height={156}` to their `<StoresMap>` usage.
- `FnbHeroMobileInfoCards.jsx` — adds `height={110}` to its `<StoresMap>` usage.

---

## 5. Modification Name: "Other Stores" account switcher only appears with 2+ branches

**Files modified:**
- `frontend/apps/store/src/shared/components/storefront/hero/StorefrontAccountBranchSwitcher.jsx` (new file)
- `frontend/apps/store/src/shared/hooks/useStorefrontAccountBranches.js` (new file)
- `frontend/apps/store/src/shared/model/storefrontAccountBranches.js` (new file)
- `frontend/apps/store/src/shared/components/storefront/hero/StorefrontHeaderNav.jsx`
- `frontend/apps/store/src/modes/fnb/storefront/components/FnbHero.jsx`
- `frontend/apps/store/src/StorefrontApp.jsx`
- `frontend/apps/store/src/app/hooks/useStorefrontHeroBandProps.js`
- `frontend/apps/store/src/app/pages/StorefrontHeroBandContainer.jsx`

**Modification:**
New feature (distinct from the pre-existing per-location branch selector): a signed-in DGFY account holder who owns more than one storefront in the same business industry/type gets an "Other Stores" switcher in the header, letting them jump directly to their other store's storefront. `useStorefrontAccountBranches` fetches the account's other owned tenants (matched against the public discovery index for `slug`/`workflow_mode`, since the account-companies listing doesn't carry those) and only for authenticated visitors. The switcher component itself hides entirely unless at least 2 total branches (candidates) are available, and `FnbHero` only renders it at all when `hasMultipleAccountBranches` is true.

**Code lines:**
- `StorefrontAccountBranchSwitcher.jsx:20` — `if (!Array.isArray(branches) || branches.length < 2) return null;`
- `useStorefrontAccountBranches.js:61` — `hasMultipleAccountBranches: branches.length > 1`.
- `FnbHero.jsx:13-14` — imports the new switcher and hook.
- `FnbHero.jsx:54` — `useStorefrontAccountBranches({ isStorefrontAccountAuthenticated, selectedStore })`.
- `FnbHero.jsx:163-164` — `accountStoreSwitcher={hasMultipleAccountBranches ? <StorefrontAccountBranchSwitcher ... /> : null}`.
- `StorefrontHeaderNav.jsx` — new `accountStoreSwitcher` prop rendered in both the desktop header row and the mobile drawer, alongside (not replacing) the existing `branchSelector` slot.
- `StorefrontApp.jsx`, `useStorefrontHeroBandProps.js`, `StorefrontHeroBandContainer.jsx` — thread the new `goStore` navigation callback down to `FnbHero` for the switcher's `onSelectStore`.
