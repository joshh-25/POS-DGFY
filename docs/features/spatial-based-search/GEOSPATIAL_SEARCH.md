---
status: authoritative
authority_level: authoritative
owner: engineering
last_reviewed: 2026-05-21
applies_to: geo_search
topic: geospatial_item_search
---

# Geospatial Item Search

"Find the nearest store selling item X" is implemented with MySQL FULLTEXT item resolution, `ST_Distance_Sphere` storefront ranking, Redis-backed caching, and a Redis LIST ingestion queue. The original proposal remains in [`geospatial-search-proposal.md`](geospatial-search-proposal.md); this document is the current implementation contract.

---

## Architecture Overview

```text
User (lat, lng, query)
    |
    v
GET /api/v1/storefront/geo-search
    |
    |-- geoSearchLimiter
    |-- Cache-Control: public, max-age=20, stale-while-revalidate=60
    |-- Joi validation -> req.validatedQuery
    |
    v
geoSearchHandlers.js -> geoSearchUseCase()
    |
    |-- Redis cache hit -> return cached result
    |
    `-- Cache miss
        |-- FULLTEXT search on geo_items + approved geo_item_aliases -> itemIds[]
        `-- ST_Distance_Sphere join on storefront_discovery_index -> stores[]

Tenant (POST /api/v1/store/inventory/push)
    |
    |-- requireTenantContext
    |-- inventoryPushLimiter
    |-- Joi validation -> req.validatedBody
    |
    v
enqueueInventoryPush() -> Redis LPUSH geo:inventory:queue
    |
    v
geoInventoryWorker
    |-- starts after backend server startup
    |-- stops during backend shutdown
    |-- RPOP polling with adaptive idle delay
    |-- resolveItemId(): approved alias -> normalized item -> create item + pending alias
    `-- upsertStoreItem(): INSERT ... ON DUPLICATE KEY UPDATE geo_store_items
```

The public Storefront discovery page currently uses `/api/v1/storefront/discovery` as the visible-result authority, including coordinate-aware ranking parameters when customer coordinates are available. The dedicated `/api/v1/storefront/geo-search` API remains available as a geospatial service endpoint, but the Storefront web client does not use it as a visible no-match authority. This avoids transient empty search states when geo-search indexing lags behind the Storefront discovery index.

---

## Data Model

All geo-search tables live in the landlord database so a single query can rank stores across tenants.

### `geo_items`

| Column | Type | Notes |
|---|---|---|
| `geo_item_id` | BIGINT UNSIGNED PK | Auto-increment |
| `name` | VARCHAR(255) NOT NULL | Display name |
| `normalized_name` | VARCHAR(255) NOT NULL | Lowercase, trimmed, normalized lookup value |
| `category` | VARCHAR(100) NULL | Optional grouping |
| `created_at` | DATETIME | |
| `updated_at` | DATETIME | |

Index: `FULLTEXT ft_geo_items_name (name, normalized_name)`.

### `geo_store_items`

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | Auto-increment |
| `tenant_id` | UUID NOT NULL | Tenant identifier used by discovery joins |
| `location_id` | BIGINT UNSIGNED NULL | `NULL` means all locations for the tenant |
| `item_id` | BIGINT UNSIGNED NOT NULL | FK to `geo_items` |
| `sku_code` | VARCHAR(100) NULL | Tenant-supplied SKU retained from inventory push |
| `price` | DECIMAL(12,2) NULL | Selling price snapshot |
| `quantity` | INT NOT NULL DEFAULT 0 | Quantity snapshot |
| `in_stock` | TINYINT(1) DEFAULT 1 | Search stock flag |
| `last_updated_at` | DATETIME | Last inventory snapshot time |

Unique key: `(tenant_id, location_id, item_id)`.

### `geo_item_aliases`

| Column | Type | Notes |
|---|---|---|
| `alias_id` | BIGINT UNSIGNED PK | Auto-increment |
| `item_id` | BIGINT UNSIGNED NOT NULL | FK to `geo_items` |
| `alias_name` | VARCHAR(255) NOT NULL | Submitted alias text |
| `moderation_status` | ENUM('approved','pending','rejected') | Only approved aliases are searched |
| `tenant_id` | UUID NULL | Tenant that submitted the alias |
| `created_at` | DATETIME | |
| `updated_at` | DATETIME | |

Index: `FULLTEXT ft_geo_item_aliases_name (alias_name)`.

---

## Search Flow

### Item Resolution

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

If no `itemIds` are found, the repository returns an empty result before building the spatial query. This avoids MySQL `IN ()` syntax errors and keeps misses cheap.

### Spatial Ranking

```sql
SELECT
  sdi.*,
  ST_Distance_Sphere(
    POINT(sdi.longitude, sdi.latitude),
    POINT(:userLng, :userLat)
  ) / 1000 AS distance_km,
  COUNT(DISTINCT gsi.item_id) AS matched_item_count,
  SUM(CASE WHEN gsi.in_stock = 1 THEN 1 ELSE 0 END) AS in_stock_match_count,
  GROUP_CONCAT(DISTINCT gi.name ORDER BY gi.name SEPARATOR ', ') AS matched_item_names
FROM storefront_discovery_index sdi
INNER JOIN geo_store_items gsi
  ON gsi.tenant_id = sdi.tenant_id
 AND gsi.item_id IN (:itemIds)
 AND (gsi.location_id IS NULL OR gsi.location_id = sdi.location_id)
INNER JOIN geo_items gi
  ON gi.geo_item_id = gsi.item_id
WHERE sdi.is_visible = 1
  AND sdi.latitude IS NOT NULL
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

No `POINT` column is required on `storefront_discovery_index`. The current implementation computes distance from existing decimal `latitude` and `longitude` columns.

### Caching

Cache key: `geo:search:{roundedLat}:{roundedLng}:r{radius}:{stockFilter}:{queryHash}`.

- Coordinates are rounded to a 0.01 degree grid to avoid cache fragmentation.
- TTL defaults to 90 seconds through `GEO_SEARCH_REDIS_CACHE_TTL_SECONDS`.
- `GEO_SEARCH_REDIS_CACHE_ENABLED=false` disables result caching.
- If Redis is unavailable, search still queries MySQL directly; inventory pushes cannot be queued until Redis is restored.

---

## Ingestion Flow

### Endpoint

```http
POST /api/v1/store/inventory/push
```

The endpoint is tenant scoped through `requireTenantContext`, rate-limited, validates a maximum of 500 item rows, enqueues work in Redis, and returns `202 Accepted`.

```json
{
  "location_id": 3,
  "items": [
    {
      "name": "Whole Milk 1L",
      "sku_code": "WM-1L",
      "price": 65.0,
      "quantity": 48,
      "in_stock": true
    }
  ]
}
```

```json
{
  "success": true,
  "data": { "queued": 1 },
  "timestamp": "2026-05-19T00:00:00.000Z"
}
```

### Worker

`backend/src/workers/geoInventoryWorker.js` starts from `backend/src/server.js` after the backend is listening and stops during graceful shutdown. It polls `geo:inventory:queue` with a 500 ms active interval and 5 second idle interval.

For each pushed row, the worker:

1. Resolves the item from an approved alias.
2. Falls back to exact `geo_items.normalized_name`.
3. Creates a new canonical item and pending alias when no match exists.
4. Upserts `geo_store_items` with `tenant_id`, `location_id`, `item_id`, `sku_code`, `price`, `quantity`, `in_stock`, and `last_updated_at`.

---

## API Reference

### `GET /api/v1/storefront/geo-search`

Public, no authentication required.

| Parameter | Type | Required | Default | Constraints |
|---|---|---|---|---|
| `query` | string | yes | - | 1-100 chars |
| `latitude` | number | yes | - | -90 to 90 |
| `longitude` | number | yes | - | -180 to 180 |
| `radius` | number | no | `5` | 0.1-50 km |
| `stock_filter` | string | no | `include_out_of_stock` | `in_stock_only` or `include_out_of_stock` |
| `page` | integer | no | `1` | min 1 |
| `limit` | integer | no | `20` | 1-50 |

Representative response:

```json
{
  "success": true,
  "data": {
    "stores": [
      {
        "storefront_discovery_index_id": 12,
        "tenant_id": "tenant-uuid",
        "slug": "carlos-store",
        "tenant_name": "Carlo's Store",
        "tenant_company_token": "CARLO",
        "latitude": 10.3156,
        "longitude": 123.8854,
        "location_id": 3,
        "location_name": "Downtown",
        "address_line": "Cebu City",
        "storefront_open": true,
        "workflow_mode": "retail",
        "delivery_radius_km": 5,
        "estimated_wait_minutes": 30,
        "supports_delivery": true,
        "supports_pickup": true,
        "supports_dine_in": false,
        "store_delivery_fee": 50,
        "catalog_count": 24,
        "storefront_profile_image_url": null,
        "storefront_cover_image_url": null,
        "storefront_review_summary": null,
        "active_location_snapshot": null,
        "distance_km": 0.84,
        "matched_item_count": 2,
        "in_stock_match_count": 2,
        "matched_item_names": "Whole Milk 1L, Full Cream Milk 500ml"
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

Tenant-scoped and requires tenant resolution, usually through `x-company-token`.

| Field | Type | Required | Notes |
|---|---|---|---|
| `location_id` | integer | no | `null` applies to all tenant locations |
| `items` | array | yes | 1-500 items |
| `items[].name` | string | yes | Resolved to canonical item/alias |
| `items[].sku_code` | string | no | Persisted to `geo_store_items.sku_code` |
| `items[].price` | number | no | Selling price snapshot |
| `items[].quantity` | integer | no | Defaults to 0 |
| `items[].in_stock` | boolean | no | Defaults to true |

---

## Rate Limits

| Limiter | Window | Prod limit | Dev limit | Key |
|---|---:|---:|---:|---|
| `geoSearchLimiter` | 60 s | 60 req | 240 req | `ip:query` |
| `inventoryPushLimiter` | 60 s | 20 req | 120 req | `tenant_id:ip` |

Both are overridable through:

```text
RATE_LIMIT_GEO_SEARCH_WINDOW_MS
RATE_LIMIT_GEO_SEARCH_MAX_REQUESTS
RATE_LIMIT_INVENTORY_PUSH_WINDOW_MS
RATE_LIMIT_INVENTORY_PUSH_MAX_REQUESTS
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `GEO_SEARCH_REDIS_CACHE_ENABLED` | `true` | Enables Redis result caching for geo-search |
| `GEO_SEARCH_REDIS_CACHE_TTL_SECONDS` | `90` | Search result cache TTL |
| `RATE_LIMIT_GEO_SEARCH_WINDOW_MS` | `60000` | Geo-search rate-limit window |
| `RATE_LIMIT_GEO_SEARCH_MAX_REQUESTS` | `60` | Production geo-search request limit |
| `RATE_LIMIT_INVENTORY_PUSH_WINDOW_MS` | `60000` | Inventory push rate-limit window |
| `RATE_LIMIT_INVENTORY_PUSH_MAX_REQUESTS` | `20` | Production inventory push limit |

---

## File Map

```text
backend/
  migrations/
    20260519000001-create-geo-search-tables.cjs
    20260519000002-add-sku-code-to-geo-store-items.cjs
  src/
    models/Landlord/
      GeoItem.js
      GeoStoreItem.js
      GeoItemAlias.js
    modules/geoSearch/
      repositories/geoSearchRepository.js
      usecases/geoSearchUseCases.js
      controllers/geoSearchHandlers.js
      index.js
    routes/
      geoSearch.js
      store.js
    validators/
      geoSearchValidator.js
    workers/
      geoInventoryWorker.js
    server.js
frontend/
  src/services/geoSearchService.js
  apps/store/src/StorefrontApp.jsx
  apps/store/src/__tests__/geoSearchIntegration.contract.test.js
```

---

## Key Design Decisions

**Decimal coordinates instead of a spatial column**: `ST_Distance_Sphere` runs against existing nullable `latitude` and `longitude` values on `storefront_discovery_index`, avoiding a disruptive NOT NULL/SPATIAL-index migration.

**Redis LIST instead of BullMQ**: the app already depends on Redis and does not carry BullMQ. A small `LPUSH`/`RPOP` loop matches existing lightweight background-worker patterns.

**Alias moderation**: auto-created aliases start as `pending`, so tenant-submitted item names do not immediately affect global search matching until moderated.

**Storefront visible search authority**: location-aware search still enriches discovery through coordinates and ranking, but the customer-facing Storefront web client keeps visible result state on `/api/v1/storefront/discovery`. The dedicated geo-search endpoint can continue to serve API consumers or future accelerators, but it must not produce a transient no-match state ahead of discovery results.

---

## Running the Migrations

```bash
cd backend
npx sequelize-cli db:migrate --env production
```

Migration files:

- `backend/migrations/20260519000001-create-geo-search-tables.cjs`
- `backend/migrations/20260519000002-add-sku-code-to-geo-store-items.cjs`
