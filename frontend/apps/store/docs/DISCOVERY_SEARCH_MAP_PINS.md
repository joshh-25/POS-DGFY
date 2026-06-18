# Discovery Search and Map Pins

This frontend-only change keeps DGFY discovery search sorted by nearest useful match while preserving the existing backend discovery API contract.

## What Changed

| Change | File |
| --- | --- |
| Remove the unreachable legacy map/results block guarded by `{false && hasDiscoverySearch}` | `frontend/apps/store/src/StorefrontApp.jsx` |
| Use the same fallback pin safety net for search results that browse results already use | `frontend/apps/store/src/StorefrontApp.jsx` |
| Add Fuse.js relevance scoring blended with distance for nearest-good-match ranking | `frontend/apps/store/src/discoverySearchRanking.js` |
| Cover the relevance and distance ranking contract with Vitest | `frontend/apps/store/src/__tests__/discoverySearchRanking.test.js` |

## Ranking Contract

Discovery results remain distance-first when there is no search query. When a query exists, each store receives a Fuse.js relevance score from `0` for strongest match to `1` for no match. The final rank is:

```js
rank = distance_km + relevanceScore * RELEVANCE_DISTANCE_PENALTY_KM
```

The current penalty is `2km`, so distance remains the dominant signal while nearby strong matches can outrank nearby weak matches.

## Pin Fallback Contract

When search results exist, `searchedDiscoveryMapPins` uses `discoveryMapPins` if available, otherwise `fallbackDiscoveryMapPins`. This prevents the map from showing an empty-pin placeholder while the result list already has matching stores.

## Validation

Run:

```bash
npm --prefix frontend test -- --run apps/store/src/__tests__/discoverySearchRanking.test.js
npm --prefix frontend test -- --run apps/store/src/__tests__/discoveryHeaderAccount.integration.test.jsx apps/store/src/__tests__/profileLauncher.integration.test.jsx apps/store/src/__tests__/fnbStorefront.contract.test.js
npm --prefix frontend run build:store
```
