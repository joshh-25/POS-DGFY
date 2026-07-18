# Stack Research

**Domain:** DGFY v2.1 Legacy Data Migration — `item_embeddings` vector-data migration and `pos_transactions` → `availments` sales-history migration (both inside `apps/dgfy-migration-runner`)
**Researched:** 2026-07-14
**Confidence:** HIGH — the vector-storage engine claim is corroborated against two independent official MySQL reference-manual pages (8.0 and 9.0/9.7) plus the MySQL release-model documentation; the "no new library needed" claim is corroborated by reading this exact monorepo's already-shipped legacy embedding code and the already-shipped Phase 9/10 `availments` schema and migrations.

> This document supersedes the previous milestone's `STACK.md` (v2.0 Commerce Domain — PayMongo/fiscal/shift/ledger stack, researched 2026-07-12, archived in git history) for anything in scope here. That document's `joi`, PayMongo-client, and ledger-immutability-trigger guidance remains valid and unchanged — it is simply out of scope for this document, which covers only the two NEW v2.1 capabilities: embeddings migration and sales-history migration. The even earlier database-first-refactor `STACK.md` (migration-runner/Umzug/Sequelize-CLI, superseded 2026-07-10) also remains valid and unchanged.

## Executive framing

**Both new features need zero new libraries and zero engine changes.** This milestone is pure schema-extension-plus-mapper-function work on top of infrastructure that already exists and is already proven:

1. **`item_embeddings` migration:** MySQL 8.0 (the engine pinned in `infrastructure/docker/docker-compose.yml:36`) has **no native `VECTOR` column type** — that type was introduced in MySQL 9.0 and does not exist in 8.0 or in 8.4 (the LTS successor to 8.0). This project is explicitly MySQL-only with no vector DB in the stack, and upgrading the database engine is out of scope for a migration-focused milestone (see "What NOT to Use"). The good news: **the legacy codebase already implements, and already proves at production scale, exactly the JSON-blob-plus-app-side-cosine-search pattern this migration needs** — `backend/src/services/embeddingService.js` stores OpenAI `text-embedding-3-small` vectors (1536 floats, ~23KB as JSON) as a stringified array in a `TEXT`/`TEXT('long')` column and computes cosine similarity in JS over an in-memory per-tenant cache. The only change worth making when porting this pattern into the new `dgfy_business_*` schema is swapping `TEXT` for MySQL's native `JSON` column type (see below) — everything else about the pattern carries over unchanged.
2. **`pos_transactions` → `availments` migration:** the target table, mapper contract, and additive-migration idiom this needs are all already proven in this exact codebase — `apps/dgfy-migration-runner/src/migrations/schema/20260714103000-add-availment-source-reference.cjs` is the working template for "add one nullable provenance/idempotency column to `availments` via a guarded, idempotent, re-run-safe migration." Adding `source_system` is the same shape of change. No new library is needed to move `DECIMAL` money fields, `ENUM`-to-`ENUM` status mapping, or timestamp fields between two MySQL tables via Sequelize — this is exactly the class of work `apps/dgfy-migration-runner/src/data/mappings.js`'s pure-function mapper pattern already handles for six other entity types.

## Recommended Stack

### Core Technologies (unchanged — no engine or driver changes needed)

| Technology | Version (pinned in this repo) | Purpose | Why no change |
|------------|---------|---------|-----------------|
| MySQL | `8.0` (`infrastructure/docker/docker-compose.yml:36`) | Database engine, both legacy `sku_*` source and new `dgfy_business_*` target | Confirmed against the official MySQL 8.0 and 9.0/9.7 reference manuals: the native `VECTOR` type does not exist in MySQL 8.0's data-types chapter and was introduced in MySQL 9.0. MySQL 9.x is Oracle's "Innovation" release track — supported only until the next quarterly release, not the LTS track (MySQL 8.4 is the LTS successor to 8.0, and 8.4 *also* has no `VECTOR` type). Chasing native vector support would mean adopting a quarterly-upgrade-cadence engine track solely for this milestone's embeddings feature — disproportionate to the actual requirement (a few hundred product vectors per tenant, in-memory cosine search already proven to work at that scale in `backend/src/services/embeddingService.js`). |
| Sequelize | `^6.37.8` (`apps/dgfy-migration-runner/package.json`) | ORM + migration execution (via Umzug) | `JSON` and `TEXT` column types, additive `addColumn`/`createTable`, and `upsert` are all first-class Sequelize 6.37 features already used throughout `apps/dgfy-migration-runner/src/migrations/schema/`; nothing about either new feature needs Sequelize 7 or a version bump. |
| mysql2 | `^3.6.5` (`apps/dgfy-migration-runner/package.json`) | MySQL driver | Native `JSON` column read/write and large `TEXT`/`LONGTEXT` payloads (an OpenAI 1536-dim vector serializes to ~23KB, well inside `mysql2`'s and MySQL's default `max_allowed_packet`) are both already supported by this pinned driver version; no bump needed. |
| Umzug | `^3.8.3` (`apps/dgfy-migration-runner/package.json`) | Schema migration runner | The new `availments.source_system` column and the new embeddings-storage table both fit the exact same `meta.destructive/targetKind/rollbackDescription` + idempotent `describeTable`/`tableExists` guard pattern already used by every migration in `apps/dgfy-migration-runner/src/migrations/schema/`, most directly `20260714103000-add-availment-source-reference.cjs`. |

### Supporting Libraries — new additions

**None.** Both features are schema-extension-plus-mapper work, not new-capability work:

| Would-be library | Verdict | Why not needed |
|---|---|---|
| `openai` SDK (already a `backend` dependency, `^6.17.0`) | Not needed in `apps/dgfy-migration-runner` | This milestone **migrates already-computed vectors**, it does not regenerate them. Legacy `item_embeddings.vector` rows are `JSON.stringify()`'d float arrays already sitting in MySQL; the mapper just needs to `JSON.parse()` the legacy value and re-serialize it into the new table's payload — a pure data transform, zero API calls, fully consistent with `mappings.js`'s "zero imports, no network access" hard contract (see file header). If a business's catalog changes post-migration and needs re-embedding, that is `syncItemEmbedding`'s job (ported later, in the app layer, not the migration runner) — explicitly out of scope here. |
| A vector database (Pinecone, Weaviate, pgvector, MySQL HeatWave Vector Store) | Not needed | Contradicts the project's explicit MySQL-only constraint and would add a second infrastructure dependency to a one-shot migration container whose entire contract is "connect to MySQL, transform rows, write to MySQL" (`apps/dgfy-migration-runner`'s own architecture guardrail enforces DB connections only via `src/config/db.js` factories — a vector DB client would be a new, ungoverned connection type). |
| `mysql2`/Sequelize version bump for `VECTOR` support | Not needed | Driver support is moot — the *server* doesn't have the type at MySQL 8.0. |

### Schema decisions (not libraries, but load-bearing for this milestone)

| Decision | Recommendation | Rationale |
|---|---|---|
| Embeddings storage column type | MySQL native `JSON` (Sequelize `DataTypes.JSON`), not `TEXT`/`TEXT('long')` | The legacy `item_embeddings` migration used `TEXT('long')` (see `backend/migrations/20260130000001-create-item-embedding.cjs`) — likely for driver-compatibility caution at the time it was written. The new `dgfy_business_*` schema already standardizes on native `JSON` for structured-but-flexible payloads (`inventory_movements.before_snapshot`/`after_snapshot`, `availments.sc_pwd_metadata`, `pos_transactions.fnb_metadata` in the legacy schema being ported). `JSON` gets MySQL's server-side "reject malformed JSON on write" validation for free, which `TEXT` does not — a small, free correctness upgrade with no downside at this data size (~23KB per vector, far under any practical `JSON` document limit). |
| Embeddings target table shape | New table, not a JSON column bolted onto `products` | Mirrors the legacy 1:1 `items` ↔ `item_embeddings` split (separate table, `item_id` unique FK) rather than the `products.attributes` catch-all JSON column the milestone already decided on for category-specific fields. A ~23KB blob per product does not belong inside the same JSON column that's meant to hold small typed attribute overrides — keeping it a separate table (e.g. `product_embeddings`, FK to `products.id`, `UNIQUE` on `(business_id, product_id)`) keeps `products` row-scan-cheap and matches the mapper pattern's existing `related_targets` mechanism (a mapper for `items`→`products` can emit a `related_targets` entry for the embedding row exactly the way `mapLegacyTenantToBusiness` emits a `business_database_registry` related target today). |
| `source_system` column type on `availments` | `VARCHAR`/Sequelize `STRING(32)` with app-level allow-list validation, not `ENUM` | `mappings.js`'s existing reason-code taxonomy (`MAPPING_REASON_CODES`) already validates categorical values in application code rather than at the DB layer for exactly this reason: a `STRING` column never needs a schema migration to accept a new value (e.g. a future non-POS sales channel), whereas a MySQL `ENUM` does. Compare the codebase's own precedent split — `pos_transactions.order_source`/`payment_type` use `ENUM` (small, genuinely closed sets, unlikely to grow), while `pos_transactions.payment_provider` uses free-text `STRING(40)` (an open, evolving set of external integrations) — `source_system` (`legacy_pos`, and eventually whatever new-DGFY-POS or storefront values emerge) is the second kind of field, not the first. |
| `availments.source_system` migration idiom | Additive, guarded, idempotent `addColumn` migration | Directly copy the shape of `apps/dgfy-migration-runner/src/migrations/schema/20260714103000-add-availment-source-reference.cjs`: `describeTable('availments')` existence check before `addColumn`, `meta.destructive: false`, `meta.targetKind: 'business'`, and a `down()` that safely no-ops if the column is already absent. This is the same file that added `source_reference` (a *different*, cross-DB-idempotency-guard field — do not conflate the two; `source_reference` is nullable/unique and only ever set by the storefront-order finalize seam, `source_system` is a provenance label set by every migrated-and-new row alike). |
| Idempotent retry for embeddings mapper | `UNIQUE` index on `(business_id, product_id)` in the new embeddings table + upsert-shaped `insert`/`update` mapper operation | Matches `mappings.js`'s existing `operation: 'insert' \| 'update' \| 'skip' \| 'conflict'` contract and the checkpoint/re-run guarantees already required by this milestone's constraints ("Idempotency: Schema and data migration scripts need dry-run, checkpoint/re-run behavior"). Mirrors the legacy `ItemEmbedding.upsert({ item_id, vector })`'s own unique-`item_id` guarantee. |

### Development Tools

No changes. `jest` (already the migration-runner's test runner, 308 tests passing per Phase 6 completion note in `.planning/PROJECT.md`) already covers the pure-function mapper testing pattern this milestone needs — new mapper functions for `item_embeddings` and `pos_transactions` slot into the same test suite shape as the six existing mappers in `mappings.js`.

## Installation

```bash
# No new npm installs required for either feature.
# Both are schema-migration + pure-function-mapper work using dependencies
# already present in apps/dgfy-migration-runner/package.json:
#   commander ^15.0.0, dotenv ^16.6.1, mysql2 ^3.6.5, sequelize ^6.37.8, umzug ^3.8.3
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|--------------------------|
| MySQL `JSON` column + app-side cosine similarity (existing proven pattern) | MySQL 9.0+ native `VECTOR` type + `VECTOR_DISTANCE()` | Only if the project later commits to MySQL's Innovation-release track platform-wide (quarterly upgrades) *and* per-tenant catalog sizes grow large enough (many thousands of products) that in-memory brute-force cosine search becomes a real latency problem. Neither condition holds today — the existing legacy implementation already handles this in-memory, per-tenant, with a 5-minute cache, at current catalog scale. This is a platform-wide engine decision, not a migration-runner decision, and is explicitly out of scope for this milestone. |
| MySQL `JSON` column + app-side cosine similarity | External vector DB (Pinecone, Weaviate, pgvector-on-Postgres, MySQL HeatWave Vector Store) | Only if semantic search needs to scale far beyond what a single MySQL instance can serve in-process — not a documented requirement here, and would violate the project's explicit "MySQL exclusively, no vector DB in the stack" framing plus the migration-runner's single-DB-connection architecture guardrail. |
| New dedicated embeddings table (`product_embeddings`, FK to `products.id`) | Folding the vector into `products.attributes` JSON | `attributes` is meant for small, category-specific typed overrides (per the milestone's own framing: "everything else category-specific"). A ~23KB vector blob is a different access pattern (bulk-loaded once per search, never displayed in a product-detail UI) and doesn't belong in the same column as UI-facing attribute data. |
| `source_system` as `VARCHAR(32)` + app-level allow-list | `source_system` as MySQL `ENUM('legacy_pos', ...)` | Only if the project were certain the provenance set would never grow — it already anticipates a future non-legacy DGFY POS and (per Phase 10) a Storefront order path, both of which would need new `ENUM` values requiring a fresh migration if `ENUM` were chosen. |
| Copy legacy vectors as-is (pure data transform) | Re-generate all embeddings via OpenAI during migration | Only if legacy vectors are found to be stale/incompatible with a different embedding model than `text-embedding-3-small` — not indicated anywhere in the current codebase, and re-embedding during migration would violate `mappings.js`'s "zero imports, no network access" pure-function contract and introduce OpenAI API cost/rate-limit risk into a one-shot migration run. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|--------------|
| MySQL 9.0+ upgrade solely to get native `VECTOR` | MySQL 9.x is Oracle's Innovation release track (supported only until the next quarterly release, not LTS); this project's engine is pinned at MySQL 8.0 and even 8.0's LTS successor, 8.4, has no `VECTOR` type. Upgrading the platform's database engine is an infrastructure-wide decision explicitly out of scope for a legacy-data-migration milestone, and disproportionate to the actual embeddings-migration requirement. | The existing JSON-blob + app-side cosine-similarity pattern, already proven in `backend/src/services/embeddingService.js` at this project's actual data scale. |
| A separate vector database/service | Adds a second infrastructure dependency and a new, architecture-guardrail-violating DB connection type to a one-shot migration container whose whole contract is MySQL-in, MySQL-out. Directly contradicts the "MySQL exclusively, no vector DB" framing of the research question. | MySQL `JSON` column in the target `dgfy_business_*` schema, same engine as everything else this milestone touches. |
| `openai` SDK inside `apps/dgfy-migration-runner` | Migration-runner mappers have a hard "zero imports, no network access" contract (`mappings.js` file header); calling OpenAI during a data migration would break that contract, add external-API failure modes to an idempotent/checkpointed migration run, and isn't needed since legacy vectors are already computed. | Pure `JSON.parse`/re-serialize of the already-computed legacy vector value, exactly like every other mapper in `mappings.js` transforms already-computed legacy field values. |
| `ENUM` for `availments.source_system` | Every new provenance value (a new DGFY-native POS, a new storefront/online channel, a future integration) would require its own schema migration to widen the `ENUM`, unlike the codebase's own existing free-text precedent (`pos_transactions.payment_provider STRING(40)`) for open-ended categorical fields. | `VARCHAR(32)`/Sequelize `STRING(32)` with app-level validation, matching `mappings.js`'s existing reason-code validation pattern. |
| Folding the embedding vector into `products.attributes` JSON | Conflates a large (~23KB), UI-irrelevant, bulk-access-pattern payload with small, category-specific, UI-facing attribute overrides that `attributes` was scoped for. | A dedicated embeddings table, FK'd to `products.id`, mirroring the legacy `items`/`item_embeddings` 1:1 split. |

## Stack Patterns by Variant

**If a future milestone needs real ANN (approximate nearest neighbor) search at much larger per-tenant catalog scale:**
- Revisit MySQL 9.0+ / `VECTOR` + `VECTOR_DISTANCE()`, or an external vector DB, as a platform-wide infrastructure decision — not something to bolt onto this migration-runner-scoped milestone.
- Until then, in-memory cosine similarity over a per-tenant `JSON`-column result set (the pattern already proven in `embeddingService.js`) is sufficient and requires zero new infrastructure.

**If the embeddings migration needs to skip businesses whose legacy `item_embeddings` row is missing/malformed:**
- Follow the existing `skipResult`/`classifyMappingConflict` finding pattern in `mappings.js` (new `reason_code`, e.g. `MISSING_EMBEDDING_VECTOR` or `INVALID_EMBEDDING_JSON`) rather than silently dropping the row or throwing — consistent with every other mapper's "never silently dropped" contract.

## Version Compatibility

| Package/Engine | Compatible With | Notes |
|-----------------|-------------------|-------|
| MySQL `8.0` (docker-compose pin) | Sequelize `^6.37.8`, mysql2 `^3.6.5` | Both already used for native `JSON` columns elsewhere in `dgfy_business_*` (e.g. `inventory_movements.before_snapshot`) — no compatibility gap for a new `JSON` embeddings column. |
| MySQL `8.0` | Native `VECTOR` type | **Not compatible.** Confirmed absent from the MySQL 8.0 reference manual's data-types chapter; introduced in MySQL 9.0 (Innovation track) and also absent from 8.4 (the 8.x LTS successor). |
| Sequelize `DataTypes.JSON` | MySQL `JSON` column, `~23KB` payload (1536-float OpenAI vector, JSON-stringified) | No size concern — MySQL `JSON` documents are bounded by `max_allowed_packet` (multi-MB+ by default), several orders of magnitude larger than a single embedding payload. |

## Sources

- `infrastructure/docker/docker-compose.yml:36` — confirms MySQL `8.0` is the pinned engine image for this project (repo evidence, HIGH confidence — direct file read).
- `backend/src/services/embeddingService.js`, `backend/src/models/ItemEmbedding.js`, `backend/migrations/20260130000001-create-item-embedding.cjs` — confirms the already-proven JSON-blob + app-side cosine-similarity pattern this migration should port (repo evidence, HIGH confidence — direct file read).
- `apps/dgfy-migration-runner/src/data/mappings.js` — confirms the pure-function mapper contract, checkpoint/idempotent-retry expectations, and existing categorical-validation-in-app-code precedent (`MAPPING_REASON_CODES`) that both new mappers must follow (repo evidence, HIGH confidence — direct file read).
- `apps/dgfy-migration-runner/src/migrations/schema/20260714103000-add-availment-source-reference.cjs`, `apps/dgfy-api/src/models/Tenant/Availment.js` — confirms the existing `availments` schema, the additive-migration idiom to copy for `source_system`, and the distinct existing `source_reference` field this feature must not be confused with (repo evidence, HIGH confidence — direct file read).
- `backend/src/models/PosTransaction.js` — confirms legacy `pos_transactions` field shapes (money as `DECIMAL`, `payment_provider` as free-text `STRING(40)` vs. `order_source`/`payment_type` as closed `ENUM`s) informing the `source_system` type recommendation (repo evidence, HIGH confidence — direct file read).
- `apps/dgfy-migration-runner/src/migrations/schema/20260712100000-create-commerce-foundation.cjs` — confirms current `products`/`product_folders`/`inventory_movements` schema and existing `JSON` column precedent (`before_snapshot`/`after_snapshot`) (repo evidence, HIGH confidence — direct file read).
- [MySQL 9.7 Reference Manual — 13.3.5 The VECTOR Type](https://dev.mysql.com/doc/refman/9.7/en/vector.html) — confirms `VECTOR(N)` syntax, defaults (2048 entries default, 16383 max, 4-byte float entries), and that the type first appears starting at the MySQL 9.0 manual (cross-checked against the 8.0 manual below; verified via direct WebFetch of the official page, not a summarized secondary source).
- [MySQL 8.0 Reference Manual — Chapter 13, Data Types](https://dev.mysql.com/doc/refman/8.0/en/data-types.html) — confirms the MySQL 8.0 data-types chapter has no `VECTOR` entry (Numeric, Date/Time, String, Spatial, JSON only), directly corroborating the 9.0-introduction claim from an independent official page (verified via direct WebFetch).
- [MySQL 8.4 Reference Manual — 1.3 MySQL Releases: Innovation and LTS](https://dev.mysql.com/doc/refman/8.4/en/mysql-releases.html) and [MySQL blog — Introducing MySQL Innovation and Long-Term Support (LTS) versions](https://dev.mysql.com/blog-archive/introducing-mysql-innovation-and-long-term-support-lts-versions/) — confirms MySQL 8.4 is the LTS successor to 8.0 (in-place upgrade path, 5+3 year support window) while MySQL 9.x is the Innovation track (quarterly cadence, supported only until the next release) — informs the "don't chase 9.0 for this milestone" recommendation.

---
*Stack research for: DGFY v2.1 Legacy Data Migration (item_embeddings + pos_transactions→availments)*
*Researched: 2026-07-14*
