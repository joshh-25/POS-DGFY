# Retail/MSME UI Refinements — 2026-08-05

Net changes across prompts 14–23 of this session, deduplicated (some files were touched and reverted mid-session; only the surviving net diff is documented/pushed).

## Files modified (net changes, deduplicated)

| File | Touched in prompt(s) | What changed |
| --- | --- | --- |
| `frontend/apps/store/src/app/pages/StorefrontCartDrawerShellContainer.jsx` | 14, 15 | `isStorefrontV2` gate removed (14), then reverted and the entire `StorefrontFollowFloatingAction` render/import/props removed (15) |
| `frontend/apps/store/src/app/hooks/useStorefrontCartDrawerShellProps.js` | 14, 15 | Same pattern: prop removed (14), reverted, then `isStorefrontV2`/`followState`/`handleFollowAction` removed for good (15) |
| `frontend/apps/store/src/StorefrontApp.jsx` | 14, 15 | Same pattern at the `useStorefrontCartDrawerShellProps({...})` call site |
| `frontend/apps/store/src/shared/components/storefront/StorefrontFollowFloatingAction.jsx` | 15 | **Deleted** — no longer referenced anywhere |
| `frontend/apps/store/src/modes/fnb/storefront/components/FnbProductCard.jsx` | 18, 19 | Card/button radius set to 10 (18), then reverted back to 20:28 / 12:18 (19) — **net zero diff, not pushed** |
| `frontend/apps/store/src/modes/retail/storefront/components/RetailProductCard.jsx` | 18 | Card/button radius set to 10 (kept, not reverted) |
| `frontend/apps/store/src/app/runtime/modePresentationRegistry.js` | 20 | `primaryActionLabel` for msme and retail both changed to `'Browse Products'` |
| `frontend/apps/store/src/__tests__/modePresentationRegistry.test.js` | 20 | Retail's `primaryActionLabel` assertion updated to match |
| `frontend/apps/store/src/app/runtime/normalizeStorefrontPageModel.js` | 21 | `formatRatingLabel` changed from private to exported |
| `frontend/apps/store/src/shared/hooks/useStorefrontCatalog.js` | 21 | Imports `formatRatingLabel`; MSME's `ratingLabel` now uses it instead of `formatRatingSummary` |
| `frontend/apps/store/src/modes/simple/storefront/components/SimpleHero.jsx` | 21, 22, 23 | Meta row rebuilt as `desktopHeroMetaItems`/`mobileHeroMetaItems` arrays (21); `fontWeight` 600→400 (21); desktop title switched from bare `<h1>` to `SharedStorefrontHeroNameCluster` (22); location item switched from `simpleHeroModel.locationLabel` to `selectedBranchLabel` (23) |

## Additional changes bundled in this push (not covered by the prompt table above)

- **`frontend/apps/store/src/app/pages/StorefrontCatalogRouteContainer.jsx`** — MSME's raw item list (`rawItemsToRender`) now sources from `filteredFnbViewModel.menuItems` instead of `filteredCatalog` when `isSimpleMode`. **Why:** MSME's rebuilt product card (part of the earlier MSME parity port) reads `item.descriptionPreview`, a field only populated by `getFoodBeverageStorefrontViewModel`'s per-item enrichment — the raw `filteredCatalog` list doesn't have it, so MSME cards were falling back to a generic "Item available in this storefront." description. MSME must consume the same enriched list F&B/Retail already use.
- **`frontend/apps/store/src/shared/components/storefront/DefaultProductCartFab.jsx`** — position changed from `right/bottom: 16/24` (mobile/desktop) to `20/36` and `10/18`. **Why:** matches F&B's/MSME's cart FAB position exactly (`SimpleCartFloatingButton.jsx` was fixed to these same values in an earlier pass) — Retail's FAB had drifted from that shared reference point.

## Why these changes overall

- **Follow-floating-action removal**: `StorefrontFollowFloatingAction` was a standalone floating "Follow" button gated behind an `isStorefrontV2` flag that no longer applies to this UI direction; it duplicated follow functionality already available elsewhere in the hero (see `SharedStorefrontHeroNameCluster`'s `followEnabled`/`followState`/`handleFollowAction` props, used by prompt 22's `SimpleHero.jsx` change). Removing it simplifies the cart-drawer shell's prop surface.
- **Retail card radius (10)**: a deliberate visual differentiation from F&B's softer 20/28px radius, kept intentionally sharper for Retail after the F&B experiment (10) was reverted.
- **`primaryActionLabel: 'Browse Products'`**: unifies the copy MSME and Retail show on their primary catalog CTA, replacing mode-specific wording (`'Start Ordering'` / `'Add to Cart'`) that no longer matched the actual button behavior (browsing into the catalog, not an immediate cart action).
- **`formatRatingLabel` export + MSME reuse**: MSME's hero was using a different formatter (`formatRatingSummary`) than F&B/Retail for the same rating display, producing inconsistent formatting; exporting and reusing the shared formatter fixes that drift.
- **MSME hero meta row + name cluster**: brings MSME's hero header to the same structure F&B/Retail use — a filtered, pipe-separated meta row that only renders items that actually have data (rating/followers/mode/location), instead of a fixed 3-item row with hardcoded separators; and a shared name+follow-button cluster instead of a bare heading, so the follow action is available in MSME's hero exactly like the other modes.
