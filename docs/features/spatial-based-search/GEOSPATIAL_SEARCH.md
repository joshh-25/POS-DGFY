---
status: authoritative
authority_level: authoritative
owner: engineering
last_reviewed: 2026-05-19
applies_to: geo_search
topic: geospatial_item_search
---

# Geospatial Item Search

"Find the nearest store selling item X" feature. Implemented using MySQL FULLTEXT + `ST_Distance_Sphere`, Redis caching, and a queue-backed inventory ingestion endpoint. Proposal: [`geospatial-search-proposal.md`](geospatial-search-proposal.md).

---

## Architecture Overview

```
User (lat, lng, query)
    │
    ▼
GET /api/v1/storefront/geo-search
    │
    ├─ Rate limit (geoSearchLimiter: 60 req/min prod)
    ├─ Cache-Control: public, max-age=20, swr=60
    ├─ Joi validation → req.validatedQuery
    │
    ▼
geoSearchHandlers.js → geoSearchUseCase.execute()
    │
    ├─ Redis cache hit? → return cached result (TTL 90s)
    │
    └─ Cache miss:
        ├─ FULLTEXT search on geo_items + geo_item_aliases → itemIds[]
        └─ ST_Distance_Sphere JOIN on storefront_discovery_index → stores[]
            │
            └─ Cache result → return

Tenant (POST /api/v1/store/inventory/push)
    │
    ├─ Rate limit (inventoryPushLimiter: 20 req/min prod)
    ├─ Joi validation → req.validatedBody
    │
    ▼
enqueueInventoryPush() → Redis LPUSH geo:inventory:queue
    │
    ▼
geoInventoryWorker (setInterval poll)
    ├─ resolveItemId(): alias → normalized_name → create new item + pending alias
    └─ upsertStoreItem(): INSERT … ON DUPLICATE KEY UPDATE on geo_store_items
```

---

## Data Model

All three tables live in the **landlord database** so a single query can join across all tenants.

### `geo_items`

Canonical product catalog shared across all tenants.

| Column           | Type                  | Notes                              |
|------------------|-----------------------|------------------------------------|
| `geo_item_id`    | BIGINT UNSIGNED PK    | Auto-increment                     |
| `name`           | VARCHAR(255) NOT NULL | Display name                       |
| `normalized_name`| VARCHAR(255) NOT NULL | Lowercase, trimmed, special chars stripped |
| `category`       | VARCHAR(100) NULL     | Optional grouping                  |
| `created_at`     | DATETIME              |                                    |
| `updated_at`     | DATETIME              |                                    |

Index: `FULLTEXT ft_geo_items_name (name, normalized_name)`

### `geo_store_items`

Cross-tenant join table linking a tenant's store location to a canonical item.

| Column         | Type                  | Notes                                      |
|----------------|-----------------------|--------------------------------------------|
| `id`           | BIGINT UNSIGNED PK    | Auto-increment                             |
| `tenant_id`    | INT NOT NULL          | FK → landlord tenants                      |
| `location_id`  | INT NULL              | NULL means "all locations for this tenant" |
| `item_id`      | BIGINT UNSIGNED       | FK → geo_items                             |
| `sku_code`     | VARCHAR(100) NULL     | Tenant-supplied SKU                        |
| `price`        | DECIMAL(10,2) NULL    |                                            |
| `quantity`     | INT NOT NULL DEFAULT 0|                                            |
| `in_stock`     | TINYINT(1) DEFAULT 1  |                                            |
| `last_updated_at` | DATETIME           |                                            |

Unique key: `(tenant_id, location_id, item_id)`

### `geo_item_aliases`

Alternate/misspelled names submitted by tenants, resolved to canonical items.

| Column              | Type                                         | Notes                           |
|---------------------|----------------------------------------------|---------------------------------|
| `alias_id`          | BIGINT UNSIGNED PK                           | Auto-increment                  |
| `item_id`           | BIGINT UNSIGNED NOT NULL                     | FK → geo_items                  |
| `alias_name`        | VARCHAR(255) NOT NULL                        |                                 |
| `moderation_status` | ENUM('approved','pending','rejected')        | Only `approved` aliases are used in search |
| `submitted_by_tenant_id` | INT NULL                             |                                 |
| `created_at`        | DATETIME                                     |                                 |
| `updated_at`        | DATETIME                                     |                                 |

Index: `FULLTEXT ft_geo_item_aliases_name (alias_name)`

---

## Search Query Flow

### Step 1 — Item resolution (FULLTEXT)

```sql
SELECT DISTINCT geo_item_id
FROM geo_items
WHERE MATCH(name, normalized_name) AGAINST(:query IN BOOLEAN MODE)

UNION

SELECT DISTINCT item_id
FROM geo_item_aliases
WHERE moderation_status = 'approved'
  AND MATCH(alias_name) AGAINST(:query IN BOOLEAN MODE)
```

If no `itemIds` are found, the function short-circuits and returns an empty result (avoids MySQL `IN ()` syntax error).

### Step 2 — Spatial store query

```sql
SELECT
  sdi.*,
  ST_Distance_Sphere(
    POINT(sdi.longitude, sdi.latitude),
    POINT(:userLng, :userLat)
  ) / 1000 AS distance_km,
  COUNT(DISTINCT gsi.item_id)  AS matched_item_count,
  GROUP_CONCAT(DISTINCT gi.name ORDER BY gi.name SEPARATOR ', ') AS matched_items
FROM storefront_discovery_index sdi
INNER JOIN geo_store_items gsi
  ON  gsi.tenant_id = sdi.tenant_id
  AND gsi.item_id IN (:itemIds)
  [AND gsi.in_stock = 1]      -- only when stock_filter = 'in_stock_only'
INNER JOIN geo_items gi
  ON gi.geo_item_id = gsi.item_id
WHERE sdi.is_visible = 1
  AND sdi.latitude  IS NOT NULL
  AND sdi.longitude IS NOT NULL
  AND ST_Distance_Sphere(
    POINT(sdi.longitude, sdi.latitude),
    POINT(:userLng, :userLat)
  ) / 1000 <= :radiusKm
GROUP BY sdi.storefront_discovery_index_id
HAVING matched_item_count > 0
ORDER BY distance_km ASC
LIMIT :limit OFFSET :offset
```

No `POINT` column is needed on `storefront_discovery_index`; `ST_Distance_Sphere` runs directly on the existing `latitude` / `longitude` DECIMAL columns.

### Caching

Cache key: `geo:search:{roundedLat}:{roundedLng}:r{radius}:{stockFilter}:{queryHash}`

- Coordinates snapped to 0.01° grid (~1.1 km cells) to prevent per-millimeter cache fragmentation.
- TTL: 90 seconds (override via `GEO_SEARCH_REDIS_CACHE_TTL_SECONDS`).

---

## Ingestion Flow

### Endpoint

```
POST /api/v1/store/inventory/push
```

Requires tenant context (`requireTenantContext` applied to the entire store router). Rate-limited to 20 req/min in production.

**Request body**

```json
{
  "location_id": 3,         // optional; null = all locations
  "items": [
    {
      "name":     "Whole Milk 1L",
      "sku_code": "WM-1L",
      "price":    65.00,
      "quantity": 48,
      "in_stock": true
    }
  ]
}
```

Max 500 items per payload. Returns `202 Accepted` immediately:

```json
{
  "success": true,
  "data": { "queued": 1 },
  "timestamp": "2026-05-19T00:00:00.000Z"
}
```

### Worker (`geoInventoryWorker.js`)

The worker polls `geo:inventory:queue` via Redis `RPOP` with adaptive intervals:

| State      | Poll interval |
|------------|---------------|
| Active (jobs found) | 500 ms  |
| Idle (queue empty)  | 5 000 ms |

For each dequeued item the worker runs `resolveItemId()`:

1. Check `geo_item_aliases` for an `approved` alias matching the normalized name.
2. Check `geo_items.normalized_name` for an exact match.
3. If neither matches: create a new `geo_items` row + a `pending` alias (queued for moderation).

Then `upsertStoreItem()` runs:

```sql
INSERT INTO geo_store_items
  (tenant_id, location_id, item_id, sku_code, price, quantity, in_stock, last_updated_at)
VALUES (...)
ON DUPLICATE KEY UPDATE
  sku_code = VALUES(sku_code),
  price    = VALUES(price),
  quantity = VALUES(quantity),
  in_stock = VALUES(in_stock),
  last_updated_at = VALUES(last_updated_at)
```

---

## File Map

```
backend/
  migrations/
    20260519000001-create-geo-search-tables.cjs    ← schema

  src/
    models/Landlord/
      GeoItem.js                                   ← Sequelize model
      GeoStoreItem.js
      GeoItemAlias.js
    models/index.js                                ← factories + associations wired

    modules/geoSearch/
      repositories/geoSearchRepository.js          ← FULLTEXT + ST_Distance SQL
      usecases/geoSearchUseCases.js                ← builder pattern
      controllers/geoSearchHandlers.js             ← sendUseCaseResult wrapper
      index.js                                     ← DI entry point

    workers/
      geoInventoryWorker.js                        ← Redis RPOP + alias resolution

    routes/
      geoSearch.js                                 ← GET /storefront/geo-search
      store.js                                     ← POST /store/inventory/push (added)

    validators/
      geoSearchValidator.js                        ← validateGeoSearchQuery + validateInventoryPush

    middleware/
      rateLimiter.js                               ← geoSearchLimiter + inventoryPushLimiter (added)

    server.js                                      ← mounted at /api/v1/storefront

frontend/
  src/services/
    geoSearchService.js                            ← searchNearbyStores()
```

---

## API Reference

### `GET /api/v1/storefront/geo-search`

Public, no authentication required.

| Parameter      | Type    | Required | Default               | Constraints      |
|----------------|---------|----------|-----------------------|------------------|
| `query`        | string  | yes      | —                     | 1–100 chars      |
| `latitude`     | number  | yes      | —                     | -90 to 90        |
| `longitude`    | number  | yes      | —                     | -180 to 180      |
| `radius`       | number  | no       | `5`                   | 0.1–50 km        |
| `stock_filter` | string  | no       | `include_out_of_stock`| `in_stock_only` \| `include_out_of_stock` |
| `page`         | integer | no       | `1`                   | min 1            |
| `limit`        | integer | no       | `20`                  | 1–50             |

**200 Response**

```json
{
  "success": true,
  "data": {
    "stores": [
      {
        "storefront_discovery_index_id": 12,
        "tenant_id": 4,
        "store_name": "Carlo's Sari-Sari",
        "latitude": 10.3156,
        "longitude": 123.8854,
        "distance_km": 0.84,
        "matched_item_count": 2,
        "matched_items": "Whole Milk 1L, Full Cream Milk 500ml"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "totalPages": 1
    }
  }
}
```

### `POST /api/v1/store/inventory/push`

Tenant-scoped (requires `x-company-token` header for tenant resolution).

| Field         | Type    | Required | Notes                              |
|---------------|---------|----------|------------------------------------|
| `location_id` | integer | no       | `null` = applies to all locations  |
| `items`       | array   | yes      | 1–500 items                        |
| `items[].name`| string  | yes      | Resolved to canonical via aliases  |
| `items[].sku_code` | string | no  |                                    |
| `items[].price`    | number | no  |                                    |
| `items[].quantity` | integer| no  | Default 0                          |
| `items[].in_stock` | boolean| no  | Default true                       |

---

## Rate Limits

| Limiter              | Window | Prod limit | Dev limit | Key             |
|----------------------|--------|------------|-----------|-----------------|
| `geoSearchLimiter`   | 60 s   | 60 req     | 240 req   | `ip:query`      |
| `inventoryPushLimiter` | 60 s | 20 req     | 120 req   | `tenant_id:ip`  |

Both are overridable via environment variables:

```
RATE_LIMIT_GEO_SEARCH_WINDOW_MS
RATE_LIMIT_GEO_SEARCH_MAX_REQUESTS
RATE_LIMIT_INVENTORY_PUSH_WINDOW_MS
RATE_LIMIT_INVENTORY_PUSH_MAX_REQUESTS
```

---

## Environment Variables

| Variable                            | Default | Description                              |
|-------------------------------------|---------|------------------------------------------|
| `GEO_SEARCH_REDIS_CACHE_TTL_SECONDS`| `90`    | Search result cache TTL                  |
| `RATE_LIMIT_GEO_SEARCH_WINDOW_MS`   | `60000` | Rate limit window for geo-search         |
| `RATE_LIMIT_GEO_SEARCH_MAX_REQUESTS`| `60`    | Max requests per window (prod)           |
| `RATE_LIMIT_INVENTORY_PUSH_WINDOW_MS`| `60000`| Rate limit window for inventory push     |
| `RATE_LIMIT_INVENTORY_PUSH_MAX_REQUESTS`| `20` | Max pushes per window (prod)             |

---

## Frontend Service

`frontend/src/services/geoSearchService.js` exports `searchNearbyStores({ query, latitude, longitude, radius, stockFilter, page, limit })`. Returns `{ stores, pagination }`.

---

## Key Design Decisions

**No POINT column on `storefront_discovery_index`** — `ST_Distance_Sphere` is called directly on the existing DECIMAL `latitude`/`longitude` columns. Adding a SPATIAL index on a table with nullable location columns and existing rows requires a NOT NULL constraint, which would break records for tenants that have not set a location. Calling the function on DECIMAL columns avoids this schema complication entirely.

**Redis LIST instead of BullMQ** — The codebase has no BullMQ dependency. A `LPUSH`/`RPOP` loop on a Redis LIST matches the existing cron/scheduler patterns and adds no new runtime dependencies.

**Alias moderation** — Newly auto-created aliases are inserted with `moderation_status = 'pending'` and are not used in search until approved. This prevents a tenant submitting an adversarial item name from poisoning results for all tenants.

**Empty `itemIds` guard** — If the FULLTEXT query returns no matches, the repository returns an empty result immediately without hitting the spatial query. MySQL does not accept `IN ()` with an empty list.

---

## Running the Migration

```bash
cd backend
npx sequelize-cli db:migrate --env production
```

Migration file: `backend/migrations/20260519000001-create-geo-search-tables.cjs`
