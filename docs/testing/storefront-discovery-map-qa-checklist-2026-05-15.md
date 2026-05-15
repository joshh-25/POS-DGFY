---
status: reference
owner: frontend
last_reviewed: 2026-05-15
applies_to: storefront_discovery_map
---

# Storefront Discovery Map QA Checklist

Audit generated on: **2026-05-15 11:58:33 +08:00 (Asia/Manila)**

Scope: Differences between old vs current Storefront Discovery Map changes across frontend and backend.

| ID | Area | Layer | Old behavior | New behavior | Manual verification steps | Expected pass/fail result |
|---|---|---|---|---|---|---|
| 1 | Hero layout | Frontend | Basic hero with simpler composition | Search-first premium hero with cleaner spacing and larger rounded map | Open discovery landing page and inspect hero composition | **Pass:** hero shows centered “Discover Goods For You”, premium spacing, large rounded map. **Fail:** old cramped layout still appears |
| 2 | Search bar sizing and controls | Frontend | Taller/older search field and actions | Slimmer search bar with explicit `Search` and `Near Me` | Inspect search bar height and action buttons | **Pass:** search field and button are visibly slimmer, `Near Me` exists. **Fail:** old size/style remains |
| 3 | Hero collapse behavior | Frontend | Hero remained largely static during interaction | Hero compresses when search is focused/active | Focus search input and type query | **Pass:** hero heading area reduces/collapses on active search. **Fail:** no transition |
| 4 | Category chips behavior | Frontend | Chips mostly changed text/query presentation | Chips apply real category filtering | Click `Food` then `Laundry`, observe result changes | **Pass:** result set changes per selected chip. **Fail:** only text changes, results stay same |
| 5 | Expanded category row | Frontend | Limited chip set | Primary row + expandable “More” chips | Click `More` chip and inspect extra categories | **Pass:** extra category chips appear and can be selected. **Fail:** no expansion |
| 6 | Marker hover preview before search | Frontend | No reliable pre-search marker preview | Marker hover opens preview banner/card | On hero map (no search), hover markers | **Pass:** popup preview appears on hover. **Fail:** no popup appears |
| 7 | Overlapping marker visibility | Frontend | Some stores hidden when coordinates overlap | Coordinate spreading ensures all markers visible | Compare visible markers vs known store count | **Pass:** all expected stores are represented. **Fail:** some stores missing on map |
| 8 | Map camera style | Frontend | More angled pitch/bearing | Cleaner flatter top-down map | Visually inspect map camera | **Pass:** map is flatter (minimal pitch/bearing). **Fail:** steep angle remains |
| 9 | Business mode pin colors | Frontend | Mostly single green tone | Mode-based colors (F&B orange, services blue, MSME light green, etc.) | Inspect pins for mixed business modes | **Pass:** colors vary by mode and match design intent. **Fail:** mostly one color persists |
| 10 | Marker popup design | Frontend | Simpler popup | Compact premium card with image/status/rating/ETA | Open map popup from marker | **Pass:** popup shows rich compact card fields. **Fail:** old minimal popup persists |
| 11 | Discovery transition layout | Frontend | Less-structured post-search layout | Map-left + results-right split | Search any term (e.g., Pizza) | **Pass:** map shrinks and right panel appears. **Fail:** no split layout |
| 12 | Results panel toggle | Frontend | No explicit list panel show/hide behavior | List panel can be shown/hidden | Use panel toggle button | **Pass:** panel opens/closes correctly. **Fail:** toggle has no effect |
| 13 | List/Grid result views | Frontend | Older/default single representation | List default with grid toggle | Switch list/grid buttons | **Pass:** card layout changes between list and grid. **Fail:** no visual change |
| 14 | Sorting options | Frontend | Limited/less visible sorting | `Nearest`, `Popular`, `Top Rated`, `Open Now` sorting | Change sort selector | **Pass:** ordering changes per selected sort. **Fail:** order does not change |
| 15 | Filters in discovery panel | Frontend | Older filter UX | Lightweight filters (`Category`, `Distance`, `Status`) | Apply each filter and combine them | **Pass:** filtered result count/content updates correctly. **Fail:** filters do nothing |
| 16 | Radius-aware search | Frontend + Backend behavior | Less explicit radius behavior | Search + location now respects both constraints: searcher radius (100m) and each store's `delivery_radius_km` | Enable location, search nearby query, then compare two stores at similar category match where one is outside its configured delivery radius | **Pass:** store appears only if `nearest_distance_km <= 0.1` and also `<= delivery_radius_km` (when delivery radius is configured). **Fail:** a store outside either limit is still shown |
| 17 | Result card redesign | Frontend | Older compact card style | Redesigned card hierarchy with richer metadata and CTA | Inspect discovery cards after search | **Pass:** cards show category/status/rating/distance + action buttons with modern spacing. **Fail:** old cards remain |
| 18 | Featured Local Merchants visual refresh | Frontend | Older featured section layout | Premium carousel/card presentation | Scroll to Featured Local Merchants | **Pass:** refreshed card style and carousel controls visible. **Fail:** legacy section still shown |
| 19 | Featured cover/profile rendering + fallback | Frontend | Inconsistent image rendering when media missing | Proper cover/profile display with fallback handling | Test stores with and without branding images | **Pass:** cards render valid fallback when image missing. **Fail:** broken image or empty visual blocks |
| 20 | Heart icon removal in featured cards | Frontend | Heart/favorite icon present | Heart icon removed | Inspect featured merchant cards | **Pass:** no heart icon present. **Fail:** heart icon still appears |
| 21 | “Put Your Business on the Map” section | Frontend | Not present | Added CTA section below Featured Local Merchants | Scroll below featured section | **Pass:** section appears with CTA and business-oriented messaging. **Fail:** section missing |
| 22 | FAQ section | Frontend | Not present | Added expandable FAQ section | Scroll below business CTA and expand questions | **Pass:** FAQ cards expand/collapse with readable answers. **Fail:** FAQ missing or non-functional |
| 23 | Footer redesign | Frontend | Older footer structure | Premium blue footer with DGFY branding and grouped links (no vertical dividers) | Scroll to page bottom | **Pass:** footer matches new style and layout constraints. **Fail:** old footer appears |
| 24 | Horizontal page overflow | Frontend | Horizontal scrollbar appeared | Full-page horizontal overflow fixed | Check page on desktop width and smaller widths | **Pass:** no horizontal scrollbar on full page. **Fail:** horizontal scroll still present |
| 25 | Extra white space below footer | Frontend | Excess bottom white area visible | Footer ends cleanly with no extra white block | Scroll to page end | **Pass:** no extra white area under footer. **Fail:** extra blank strip remains |
| 26 | Header width alignment | Frontend | Header had constrained/full-width alignment issue | Header/nav spacing and full-width behavior corrected | Inspect top header area | **Pass:** nav aligns consistently with target layout. **Fail:** visible offset/gap mismatch remains |
| 27 | Storefront branding render on store details | Frontend | Profile/cover could fail in some states | Improved profile/cover handling in store views | Open specific store pages and inspect branding blocks | **Pass:** branding renders or fallback appears cleanly. **Fail:** broken/empty branding region |
| 28 | App mount wrapper for storefront | Frontend | Direct root render for app/toaster | `App` wrapper used to mount app + toaster | Trigger toast notification | **Pass:** toast still renders and storefront boots normally. **Fail:** missing toasts or broken mount |
| 29 | F&B/store visual token tuning | Frontend | Older accent/palette values | Updated accent/surface/border token values | Inspect F&B/store surfaces and action accents | **Pass:** updated palette applied consistently. **Fail:** legacy color scheme persists |
| 30 | Non-F&B menu derivation guard | Frontend | F&B model could leak into non-F&B contexts | Non-F&B now suppresses F&B menu derivations | Open non-F&B storefront mode | **Pass:** no stray F&B menu sections in non-F&B mode. **Fail:** F&B sections leak into non-F&B |
| 31 | Checkout quote gating | Frontend + Backend behavior | Quote gating stricter | Conditional quote requirement (`requireQuote`) | Attempt checkout in flows where quote should be optional | **Pass:** checkout not blocked when quote isn’t required. **Fail:** unnecessary quote-block persists |
| 32 | Availability inference from stock | Backend behavior surfaced in frontend | Availability relied more on explicit status | `current_stock > 0` can resolve to in-stock in one path | Test item with positive stock but ambiguous status | **Pass:** item appears available where expected. **Fail:** item wrongly unavailable |
| 33 | Store route cache isolation | Backend | Cache less store-slug-specific | Cache varies by `x-store-slug` for catalog/locations | Open Store A then Store B rapidly, compare data | **Pass:** no cross-store catalog/location bleed. **Fail:** stale data from another store appears |
| 34 | Discovery index visibility policy | Backend | Older visibility path | Uses storefront visibility resolution + override awareness | Hide/show storefront items via config and re-check discovery | **Pass:** only storefront-visible items appear. **Fail:** hidden items leak into discovery |
| 35 | Discovery sellability filter (price) | Backend | Less strict sellability gate | Discovery filters to explicit sale-priced sellable items | Check items without explicit sale price in discovery | **Pass:** unsellable/unpriced items excluded from discovery. **Fail:** such items still surfaced |
| 36 | Missing override-table resilience | Backend | Could fail when override table missing | Defensive fallback for missing storefront override table | Run against tenant missing override table | **Pass:** discovery still loads without crash. **Fail:** request errors/crashes |
| 37 | Login company lookup trigger model | Frontend | Lookup could auto-trigger on blur | Lookup only on explicit click/submit | On login page, type email and blur input without clicking identify | **Pass:** no lookup on blur; lookup runs only on explicit action. **Fail:** auto-lookup still triggers on blur |

## Notes

- This checklist is executable against the current worktree state as of the timestamp above.
- Frontend and backend checks are intentionally mixed because current storefront-related diffs include both layers.
