'use strict';

/**
 * Phase 10 Plan 01: Enable geo-search and full-text search on
 * `storefront_discovery_index` (STF-01).
 *
 * `meta.targetKind: 'core'` — this migration only applies to `dgfy_core`
 * landlord database.
 *
 * The existing `storefront_discovery_index` table (Phase 02) stores location
 * and search metadata inside JSON columns:
 *   - location_snapshot: { latitude, longitude, ... } (geo coordinates)
 *   - search_snapshot: { text, ... } (searchable full-text content)
 *
 * This migration extracts those JSON values into MySQL GENERATED ALWAYS AS
 * ... STORED columns and adds spatial (btree on lat/lng) and FULLTEXT
 * indexes to enable efficient discovery queries:
 *   - latitude: DECIMAL(10,7) extracted from location_snapshot.latitude
 *   - longitude: DECIMAL(10,7) extracted from location_snapshot.longitude
 *   - search_text: TEXT extracted from search_snapshot.text
 *
 * Generated columns (STORED) are read-only computed columns materialized at
 * INSERT/UPDATE time — the query planner can use indexes on them exactly
 * like regular columns (STF-01 geographic + full-text search support).
 *
 * Idempotency (DBF-04): Each ADD guarded by a column-existence check;
 * re-running is a safe no-op if columns already exist. Index checks also
 * guard against double-add.
 *
 * MySQL version: MySQL 5.7+ supports GENERATED columns; 5.6 does not. If
 * a running instance rejects the generated-column expression, document the
 * JSON path used here so the discovery repository (10-03) can fall back to
 * reading location_snapshot directly (alternative: runtime JSON extraction).
 *
 * Zero backend/ writes: Migration runner only; no code under backend/ or
 * existing apps/dgfy-api modules are modified.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  meta: {
    destructive: false,
    targetKind: 'core',
    rollbackDescription:
      'Drops the geo-search generated columns and indexes from ' +
      'storefront_discovery_index (latitude, longitude, search_text generated ' +
      'columns, plus btree and FULLTEXT indexes). Table remains, pre-existing ' +
      'data untouched; just search/geo performance optimization removed.',
    estimatedRisk: 'low'
  },

  async up(queryInterface, Sequelize) {
    const hasIndex = async (tableName, indexName) => {
      try {
        const indexes = await queryInterface.showIndex(tableName);
        return (indexes || []).some((index) => String(index.name).toLowerCase() === String(indexName).toLowerCase());
      } catch {
        return false;
      }
    };

    const addIndexIfMissing = async (tableName, columns, options = {}) => {
      if (options.name && await hasIndex(tableName, options.name)) return;
      await queryInterface.addIndex(tableName, columns, options);
    };

    // Check if the table exists and describe its structure.
    let storefront_discovery_index_description;
    try {
      storefront_discovery_index_description = await queryInterface.describeTable('storefront_discovery_index');
    } catch {
      // Table does not exist yet — safe to skip this migration (Phase 02
      // must run first, but this is a guard in case).
      return;
    }

    // --- Add latitude generated column (extracted from location_snapshot) ----
    // JSON_EXTRACT(location_snapshot, '$.latitude') returns the numeric value
    // or NULL if missing; DECIMAL(10,7) matches standard lat/lng precision.
    if (!storefront_discovery_index_description.latitude) {
      await queryInterface.sequelize.query(`
        ALTER TABLE storefront_discovery_index
        ADD COLUMN latitude DECIMAL(10,7)
        GENERATED ALWAYS AS (JSON_EXTRACT(location_snapshot, '$.latitude')) STORED
      `);
    }

    // --- Add longitude generated column (extracted from location_snapshot) ---
    if (!storefront_discovery_index_description.longitude) {
      await queryInterface.sequelize.query(`
        ALTER TABLE storefront_discovery_index
        ADD COLUMN longitude DECIMAL(10,7)
        GENERATED ALWAYS AS (JSON_EXTRACT(location_snapshot, '$.longitude')) STORED
      `);
    }

    // --- Add search_text generated column (extracted from search_snapshot) ---
    // JSON_UNQUOTE() unwraps the quoted string value returned by JSON_EXTRACT.
    if (!storefront_discovery_index_description.search_text) {
      await queryInterface.sequelize.query(`
        ALTER TABLE storefront_discovery_index
        ADD COLUMN search_text TEXT
        GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(search_snapshot, '$.text'))) STORED
      `);
    }

    // Refresh table description to check for the newly-added columns.
    storefront_discovery_index_description = await queryInterface.describeTable('storefront_discovery_index');

    // --- Add btree spatial index on (latitude, longitude) ----
    // Enables efficient geographic proximity queries (e.g., "stores within
    // radius of (lat, lng)").
    await addIndexIfMissing('storefront_discovery_index', ['latitude', 'longitude'], {
      name: 'idx_storefront_discovery_geo_spatial',
      using: 'BTREE'
    });

    // --- Add FULLTEXT index on search_text ----
    // Enables MATCH() ... AGAINST() full-text search queries (STF-01).
    if (!await hasIndex('storefront_discovery_index', 'ftx_storefront_discovery_search_text')) {
      // FULLTEXT indexes require special syntax (type: 'FULLTEXT' not supported
      // in queryInterface.addIndex for all engines); use raw SQL.
      await queryInterface.sequelize.query(`
        ALTER TABLE storefront_discovery_index
        ADD FULLTEXT INDEX ftx_storefront_discovery_search_text (search_text)
      `);
    }
  },

  async down(queryInterface) {
    // Reverse: drop indexes, then drop generated columns.

    // Drop FULLTEXT index.
    try {
      await queryInterface.removeIndex('storefront_discovery_index', 'ftx_storefront_discovery_search_text');
    } catch {
      // index may not exist — safe no-op
    }

    // Drop btree spatial index.
    try {
      await queryInterface.removeIndex('storefront_discovery_index', 'idx_storefront_discovery_geo_spatial');
    } catch {
      // index may not exist — safe no-op
    }

    // Drop generated columns (they must exist to drop).
    try {
      const table_description = await queryInterface.describeTable('storefront_discovery_index');

      if (table_description.search_text) {
        await queryInterface.removeColumn('storefront_discovery_index', 'search_text');
      }
      if (table_description.longitude) {
        await queryInterface.removeColumn('storefront_discovery_index', 'longitude');
      }
      if (table_description.latitude) {
        await queryInterface.removeColumn('storefront_discovery_index', 'latitude');
      }
    } catch {
      // table may not exist — safe no-op
    }
  }
};
