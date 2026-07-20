# Geo Search Module

"Find the nearest store selling item X" — combines MySQL FULLTEXT item resolution with `ST_Distance_Sphere` spatial filtering across the landlord `storefront_discovery_index`.

Flow:

`routes/geoSearch.js -> controllers/geoSearchHandlers.js -> usecases/geoSearchUseCases.js -> repositories/geoSearchRepository.js`

## Files

| File | Responsibility |
|---|---|
| `index.js` | Instantiates `geoSearchUseCase` with injected repository (DI entry point) |
| `controllers/geoSearchHandlers.js` | Express handler; delegates to use case, responds via `sendUseCaseResult` |
| `usecases/geoSearchUseCases.js` | Builder-pattern use case; validates inputs, orchestrates repository calls |
| `repositories/geoSearchRepository.js` | Two-step SQL: FULLTEXT item lookup → spatial store query; Redis cache read/write |

## Query Strategy

1. **Item resolution** — `MATCH(name, normalized_name) AGAINST(query IN BOOLEAN MODE)` on `geo_items`, unioned with approved `geo_item_aliases`. Returns `itemIds[]`.
2. **Spatial filter** — `ST_Distance_Sphere(POINT(longitude, latitude), POINT(userLng, userLat)) / 1000 <= radiusKm` on `storefront_discovery_index`, joined to `geo_store_items` filtered by `itemIds`. Results ordered by `distance_km ASC`.

If step 1 returns no matches the function short-circuits and returns an empty result (avoids MySQL `IN ()` syntax error).

## Cache

Key: `geo:search:{roundedLat}:{roundedLng}:r{radius}:{stockFilter}:{queryHash}`

Coordinates are snapped to a 0.01° grid (~1.1 km cells). TTL defaults to 90 s (`GEO_SEARCH_REDIS_CACHE_TTL_SECONDS`).

## Related

- Route: `apps/dgfy-api/src/routes/geoSearch.js`
- Validator: `apps/dgfy-api/src/validators/geoSearchValidator.js`
- Worker: `apps/dgfy-api/src/workers/geoInventoryWorker.js`
- Models: `apps/dgfy-api/src/models/Landlord/GeoItem.js`, `GeoStoreItem.js`, `GeoItemAlias.js`
- Feature docs: `docs/features/spatial-based-search/GEOSPATIAL_SEARCH.md`
