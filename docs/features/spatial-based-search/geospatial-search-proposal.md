# Proposal: In-House Geospatial Item Search Using MySQL Native Functions

**Prepared for:** [Superior's Name]
**Prepared by:** [Your Name]
**Date:** May 18, 2026
**Status:** Draft for review

---

## Executive Summary

This document proposes building our new "find the nearest store selling item X" feature using MySQL's native spatial and full-text search capabilities, layered with Redis caching and our existing Node.js stack. The approach requires no new external services, no additional licensing costs, and no changes to our database platform. It leverages capabilities already present in MySQL 8.0 that are mature, well-documented, and used in production by comparable systems.

The recommendation is to proceed with MySQL-native implementation rather than adopting a dedicated search platform such as Elasticsearch or migrating to PostgreSQL with PostGIS. The reasoning, tradeoffs, and scaling path are detailed below.

---

## Problem Statement

Users need to search for a specific item (for example, "milk" or "Xiaomi Mi Band 7") and receive a list of nearby stores that currently sell it, ranked by distance from the user's current location. Stores push their inventory to our system on an ongoing basis, with required freshness measured in hours and a stretch goal of minutes.

The query is a hybrid: it combines a **text search** ("which items match the user's query?") with a **spatial search** ("which stores are near the user?"), and must return results ranked by physical distance.

---

## Why MySQL-Native Is the Right Choice

### 1. The capability already exists in our stack

MySQL 8.0 ships with two features that together cover the entire query pattern:

- **Spatial data types and R-tree indexing.** The `POINT` data type, combined with `SPATIAL INDEX` on InnoDB tables, allows efficient nearest-neighbor queries using `ST_Distance_Sphere` for accurate spherical distance calculations.
- **Full-text indexing.** The `FULLTEXT` index type on InnoDB, queried via `MATCH ... AGAINST`, supports keyword search, boolean operators, and relevance ranking out of the box.

Both features are battle-tested, require no plugins, and impose no per-query licensing cost.

### 2. Alternatives were considered and ruled out

| Option                       | Why not                                                        |
| ---------------------------- | -------------------------------------------------------------- |
| PostgreSQL + PostGIS         | Requires migrating off MySQL — not feasible for this project.  |
| Elasticsearch                | Licensing and operational cost not approved.                   |
| Third-party search-as-a-service | Conflicts with our in-house / compliance requirement.       |

MySQL-native is the only option that satisfies all three constraints: stay on MySQL, no new external services, no new licensing.

### 3. The performance ceiling is high enough

A properly indexed MySQL query of this shape — full-text match on items, spatial filter on stores, distance-based ordering — returns in single-digit milliseconds at moderate data volumes and remains acceptable into the tens of millions of rows on a single instance. When we eventually outgrow a single instance, the scaling path (read replicas, then partitioning) is well-understood and does not require rearchitecting.

---

## Proposed Architecture

### Data model

Four tables form the core of the feature:

- **`stores`** — one row per store, with a `POINT SRID 4326 NOT NULL` column for location and a `SPATIAL INDEX` on that column.
- **`items`** — a canonical catalog of items. Carries a `FULLTEXT` index on the searchable name fields.
- **`store_items`** — the join table linking stores to the items they sell, with `price`, `quantity`, `in_stock`, and `last_updated_at`. Composite primary key on `(store_id, item_id)`.
- **`item_aliases`** — alternate names, common misspellings, and store-submitted variants mapped to canonical items. Also `FULLTEXT`-indexed. Critical for handling the variations in how stores label the same product.

### Query flow

A single user search executes as follows:

1. The API receives `{ query, latitude, longitude, radius }`.
2. Redis is checked for a cached result keyed on the normalized query and a geohash of the user's location.
3. On cache miss, MySQL runs one query that joins `items` to `store_items` to `stores`, filtering by `MATCH(name) AGAINST(?)` on items and `ST_Distance_Sphere(location, ?)` within radius on stores, ordered by distance, limited to the top N.
4. The result is cached in Redis with a short TTL (60–120 seconds) and returned to the user.

The R-tree spatial index prefilters stores by bounding box; the FULLTEXT index prefilters items by keyword. Exact distance is computed only on the intersection, which is typically small.

### Ingestion flow

Stores push inventory updates to a dedicated endpoint. Rather than writing synchronously to the main tables:

1. The endpoint validates the payload and authenticates the store.
2. The payload is placed on a BullMQ queue running on our existing Redis infrastructure.
3. A worker pool drains the queue, resolves store-submitted item names to canonical items (using `item_aliases`), and performs upserts into `store_items`.

This isolates inventory traffic spikes from the read path, gives us retry semantics for free, and lets us scale ingestion workers independently of the API tier.

### Caching strategy

Given the freshness requirement is "hours, minutes is nice to have," a short Redis TTL with natural expiry is appropriate. We do not need aggressive cache invalidation on every inventory push. This keeps the system simple and avoids the well-known pitfalls of distributed cache invalidation.

---

## Scaling Plan

We are designing for "small now, large later." The principle is to make decisions that **enable** scale without **prematurely paying for** scale.

### Built in from day one

- Spatial and full-text indexes on every column that needs them.
- Composite indexes matched to actual query patterns.
- BIGINT primary keys.
- Clear service boundary for the search/inventory module, even if deployed alongside the main application.
- Append-only event log for inventory changes, to support debugging and future analytics.
- Structured logging with request IDs.

### Triggered by metrics, not speculation

| Signal                                                        | Response                                              |
| ------------------------------------------------------------- | ----------------------------------------------------- |
| `store_items` exceeds tens of millions of rows; write contention rises | Add a MySQL read replica; route search reads to it.   |
| Hot geographic regions cause repeated cache misses            | Materialize "popular items by region" tables.         |
| Search **quality** (not speed) becomes the user-facing pain   | Revisit Elasticsearch with concrete data in hand.     |
| Single MySQL instance cannot keep up on writes                | Partition `store_items` by `store_id`.                |

Each of these has a clear trigger and a clear next step. None of them needs to be solved on day one.

---

## Risks and Mitigations

| Risk                                                              | Mitigation                                                                                       |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| MySQL FULLTEXT does not handle typos as gracefully as Elasticsearch | The `item_aliases` table absorbs the most common misspellings and store-side naming variants.   |
| Inconsistent product naming across stores                          | Canonical item resolution during ingestion; alias auto-creation with optional moderation flag.  |
| Inventory data going stale                                        | Track `last_updated_at` per row; expose freshness in API responses; alert on stale stores.      |
| Write spikes from many stores pushing simultaneously              | Queue-backed ingestion absorbs spikes; workers scale horizontally.                              |
| MySQL SRID axis-order pitfalls                                     | Enforce SRID 4326 with `(latitude, longitude)` ordering in a shared helper; cover with tests.   |
| Spatial query performance degrades at very large scale            | Documented scaling triggers above; read replicas and partitioning are proven paths.             |

---

## Estimated Effort

A minimum viable version of the feature — schema, ingestion endpoint with queueing, worker, search endpoint with Redis caching — is achievable in approximately one focused engineering week, followed by a second week for hardening, observability, and integration testing. The alias resolution pipeline and event log can be added incrementally without disrupting the rest of the system.

---

## Recommendation

Proceed with the MySQL-native approach as described. It satisfies every stated constraint — same database, no new external services, in-house operation — while providing a clear, metric-driven path to scale as the dataset grows. The features required are present in our existing MySQL 8.0 deployment today, and the operational surface area is no larger than what the team already maintains.

Should search quality, rather than throughput, eventually become the limiting factor for users, we will have concrete data to support a future conversation about a dedicated search platform. Until that signal appears, the proposed approach is the most pragmatic option available to us.

---

## Open Questions for Discussion

- Confirmation of MySQL version in production (assumed 8.0+).
- Authentication mechanism for store-side push endpoints — reuse existing machine-to-machine pattern, or new approach?
- Target latency for the search endpoint (p50 / p95)?
- Expected peak ingestion rate from stores at launch and at 12 months?
- Ownership of the canonical item catalog — who curates it, who can edit aliases?
