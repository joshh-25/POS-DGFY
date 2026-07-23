# Discovery Search and Map Pins

This frontend-only change keeps DGFY discovery search sorted by nearest useful match while preserving the existing backend discovery API contract.

## What Changed

| Change | File |
| --- | --- |
| Remove the unreachable legacy map/results block guarded by `{false && hasDiscoverySearch}` | `frontend/apps/store/src/StorefrontApp.jsx` |
| Use the same fallback pin safety net for search results that browse results already use | `frontend/apps/store/src/StorefrontApp.jsx` |
| Add Fuse.js relevance scoring blended with distance for nearest-good-match ranking | `frontend/apps/store/src/discovery/model/discoverySearchRanking.js` |
| Wire that ranking into the live result sort (previously defined but unused) | `frontend/apps/store/src/discovery/model/discoveryStoreResultsModel.js`, `frontend/apps/store/src/discovery/hooks/useDiscoveryResultsData.js` |
| Cover the relevance and distance ranking contract with Vitest | `frontend/apps/store/src/__tests__/discoverySearchRanking.test.js`, `frontend/apps/store/src/__tests__/discoveryStoreResultsSort.test.js` |

## Ranking Contract

Discovery results remain distance-first when there is no search query. When a query exists, `sortDiscoveryResultStores` computes a Fuse.js relevance score per store (`0` for strongest match to `1` for no match) over `tenant_name`, `storefront_categories`, `matching_item_sample`, and `address_line`, then sorts by:

```js
rank = distance_km + relevanceScore * RELEVANCE_DISTANCE_PENALTY_KM
```

The current penalty is `2km`, so distance remains the dominant signal while nearby strong matches can outrank nearby weak matches. This only affects display order — which stores are eligible to appear at all is still decided server-side by `storefrontDiscoveryRepository.js` (see `publicSearchAliasPolicy.js` for the cuisine/category synonym expansion that decides matches, e.g. "seafood" also matching "shrimp"/"crab"/etc.). The frontend ranker does not re-expand synonyms itself — it only re-ranks the already-filtered result set by fuzzy textual relevance.

## Pin Fallback Contract

When search results exist, `searchedDiscoveryMapPins` uses `discoveryMapPins` if available, otherwise `fallbackDiscoveryMapPins`. This prevents the map from showing an empty-pin placeholder while the result list already has matching stores.

## Validation

Run:

```bash
npm --prefix frontend test -- --run apps/store/src/__tests__/discoverySearchRanking.test.js apps/store/src/__tests__/discoveryStoreResultsSort.test.js
npm --prefix frontend test -- --run apps/store/src/__tests__/discoveryHeaderAccount.integration.test.jsx apps/store/src/__tests__/profileLauncher.integration.test.jsx apps/store/src/__tests__/fnbStorefront.contract.test.js
npm --prefix frontend run build:store
```
