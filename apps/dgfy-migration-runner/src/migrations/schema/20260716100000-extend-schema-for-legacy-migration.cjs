'use strict';

/**
 * Phase 12 Plan 02: additive target-schema extension unblocking Phase 13's
 * legacy `items`/`item_folders`/`stock_movements`/satellite-table mappers
 * (LDM-02, LDM-03, LDM-04).
 *
 * `meta.targetKind: 'business'` scopes this migration to `dgfy_business_*`
 * tenant targets only — omitting it silently defaults to 'core' and this
 * migration would never run against a tenant DB (12-RESEARCH.md Pitfall 2).
 * All operations are guarded with existence/describe checks so re-running
 * this migration against an already-migrated `dgfy_business_*` database is
 * a no-op, following the idempotent-helper shape copied verbatim from
 * 20260712100000-create-commerce-foundation.cjs.
 *
 * Three additive changes, one atomic migration file (12-RESEARCH.md A1 —
 * Claude's discretion, one combined file over three per-LDM files):
 *
 *   1. (LDM-02) `products` gains 6 typed columns ported from legacy
 *      `backend/src/models/Item.js` (sku_code, description,
 *      unit_of_measure, cost_per_unit, vat_type,
 *      senior_pwd_discount_eligible) plus one `attributes` JSON column —
 *      the satellite-folding container this phase only RESERVES (no
 *      mapper/resolution logic lands here; see
 *      docs/database/legacy-product-attributes-folding-design.md, D-02/D-03/
 *      D-04). `cost_per_unit` is DECIMAL(14,4) (D-06 — widens legacy's
 *      DECIMAL(10,4) to match the existing `base_price` convention).
 *      `idx_products_sku_code` is NON-unique (D-05 — legacy allows
 *      duplicate SKUs; do NOT add a unique constraint).
 *
 *   2. (LDM-03) new `product_embeddings` table, one row per product
 *      (`unique_product_embeddings_product` UNIQUE index on `product_id`,
 *      D-09 — matches legacy `item_embeddings`' strict 1:1 shape). `vector`
 *      is TEXT (JSON-stringified float array, matching legacy
 *      `ItemEmbedding.js`). `legacy_embedding_id` is an optional
 *      traceability pointer back to the legacy row (A2).
 *
 *   3. (LDM-04) `inventory_movements` gains a natural-key unique index
 *      `unique_inventory_movements_natural_key` on
 *      (business_id, reference_type, reference_id) — makes Phase 13's
 *      migrated-row apply retries idempotent (T-12-03). This is pure DDL:
 *      it does not trip the append-only BEFORE UPDATE/DELETE triggers, and
 *      existing organic Phase 8/9 rows have NULL reference_type/
 *      reference_id, which MySQL's unique index treats as distinct tuples
 *      (D-10) — so NO backfill of existing rows.
 *
 * `dgfyBusinessContract.js` is updated in THIS SAME COMMIT — the atomic
 * invariant this phase's RESEARCH flags as the single most important
 * cross-file relationship: a column/table/index absent from the contract
 * is never checked by `verify` (T-12-04).
 *
 * Zero backend/ writes: every backend/ file cited above is a read-only
 * pattern-porting source. `rejectedTables` in dgfyBusinessContract.js is
 * untouched (orthogonal target guard) and `sync({ alter: true })` is never
 * used anywhere in this file.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  meta: {
    destructive: false,
    targetKind: 'business',
    rollbackDescription:
      'Drops products legacy-migration columns (sku_code, description, unit_of_measure, ' +
      'cost_per_unit, vat_type, senior_pwd_discount_eligible, attributes) + idx_products_sku_code, ' +
      'drops the product_embeddings table, and removes the inventory_movements natural-key unique ' +
      'index — additive Phase 12 schema-extension only, no other tenant table is touched.',
    estimatedRisk: 'low'
  },

  async up(queryInterface, Sequelize) {
    const tableExists = async (tableName) => {
      const tables = await queryInterface.showAllTables();
      return (tables || []).some((entry) => {
        const value = typeof entry === 'string' ? entry : (entry?.tableName || entry?.table_name || String(entry));
        return String(value).toLowerCase() === String(tableName).toLowerCase();
      });
    };

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

    const timestampColumns = () => ({
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // --- LDM-02: products typed columns + attributes JSON -------------------
    const productsDescription = await queryInterface.describeTable('products');
    if (!productsDescription.sku_code) {
      await queryInterface.addColumn('products', 'sku_code', { type: Sequelize.STRING(50), allowNull: true });
    }
    if (!productsDescription.description) {
      await queryInterface.addColumn('products', 'description', { type: Sequelize.TEXT, allowNull: true });
    }
    if (!productsDescription.unit_of_measure) {
      await queryInterface.addColumn('products', 'unit_of_measure', { type: Sequelize.STRING(50), allowNull: true });
    }
    if (!productsDescription.cost_per_unit) {
      // D-06: DECIMAL(14,4) matches the existing base_price convention
      // (superset of legacy's narrower DECIMAL(10,4)).
      await queryInterface.addColumn('products', 'cost_per_unit', { type: Sequelize.DECIMAL(14, 4), allowNull: true });
    }
    if (!productsDescription.vat_type) {
      // D-07: reuses legacy items.vat_type enum verbatim.
      await queryInterface.addColumn('products', 'vat_type', {
        type: Sequelize.ENUM('vatable', 'vat_exempt', 'zero_rated'),
        allowNull: false,
        defaultValue: 'vatable'
      });
    }
    if (!productsDescription.senior_pwd_discount_eligible) {
      // D-08: direct port from legacy items.senior_pwd_discount_eligible.
      await queryInterface.addColumn('products', 'senior_pwd_discount_eligible', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      });
    }
    if (!productsDescription.attributes) {
      // D-03: satellite-fold container — this phase only reserves it, no
      // mapper logic here. See docs/database/legacy-product-attributes-
      // folding-design.md for the namespaced 1:1-vs-1:many shape.
      await queryInterface.addColumn('products', 'attributes', { type: Sequelize.JSON, allowNull: true });
    }
    // D-05: non-unique — legacy allows duplicate SKUs.
    await addIndexIfMissing('products', ['sku_code'], { name: 'idx_products_sku_code' });

    // --- LDM-03: product_embeddings (1:1 per product, D-09) -----------------
    if (!await tableExists('product_embeddings')) {
      await queryInterface.createTable('product_embeddings', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        // Opaque UUID pointing at dgfy_core.businesses.id — never a real FK
        // (cross-database).
        business_id: { type: Sequelize.CHAR(36), allowNull: false },
        product_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'products', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        // Legacy JSON-stringified float array shape (matches ItemEmbedding.js).
        vector: { type: Sequelize.TEXT, allowNull: false },
        // Traceability pointer back to legacy item_embeddings.embedding_id (A2).
        legacy_embedding_id: { type: Sequelize.INTEGER, allowNull: true },
        ...timestampColumns()
      });
    }
    // D-09: strict 1:1 — unique product_id.
    await addIndexIfMissing('product_embeddings', ['product_id'], {
      name: 'unique_product_embeddings_product',
      unique: true
    });

    // --- LDM-04: inventory_movements natural-key unique index (D-10) --------
    // Pure DDL — does not trip the append-only BEFORE UPDATE/DELETE triggers.
    // Existing organic rows have NULL reference_type/reference_id, which
    // MySQL's unique index treats as distinct tuples, so no backfill needed.
    await addIndexIfMissing('inventory_movements', ['business_id', 'reference_type', 'reference_id'], {
      name: 'unique_inventory_movements_natural_key',
      unique: true
    });
  },

  async down(queryInterface) {
    // Reverse dependency order: drop product_embeddings first (references
    // products), then remove products columns/indexes, then remove the
    // inventory_movements index. Each guarded/try-catch no-op per Pitfall 5
    // (down() is best-effort; up() is the real deliverable).
    try {
      if (await (async () => {
        try {
          const indexes = await queryInterface.showIndex('inventory_movements');
          return (indexes || []).some((index) => String(index.name).toLowerCase() === 'unique_inventory_movements_natural_key');
        } catch {
          return false;
        }
      })()) {
        await queryInterface.removeIndex('inventory_movements', 'unique_inventory_movements_natural_key');
      }
    } catch {
      // index may not exist — safe no-op
    }

    try {
      await queryInterface.dropTable('product_embeddings');
    } catch {
      // table may not exist — safe no-op
    }

    try {
      if (await (async () => {
        try {
          const indexes = await queryInterface.showIndex('products');
          return (indexes || []).some((index) => String(index.name).toLowerCase() === 'idx_products_sku_code');
        } catch {
          return false;
        }
      })()) {
        await queryInterface.removeIndex('products', 'idx_products_sku_code');
      }
    } catch {
      // index may not exist — safe no-op
    }

    const removableProductsColumns = [
      'attributes',
      'senior_pwd_discount_eligible',
      'vat_type',
      'cost_per_unit',
      'unit_of_measure',
      'description',
      'sku_code'
    ];
    for (const columnName of removableProductsColumns) {
      // eslint-disable-next-line no-await-in-loop
      try {
        // eslint-disable-next-line no-await-in-loop
        const productsDescription = await queryInterface.describeTable('products');
        if (productsDescription[columnName]) {
          // eslint-disable-next-line no-await-in-loop
          await queryInterface.removeColumn('products', columnName);
        }
      } catch {
        // table/column may not exist — safe no-op
      }
    }

    // MySQL inline enums drop with the column; DROP TYPE is a Postgres-ism.
    // Defensive cross-dialect no-op kept for parity with 20260712100000's
    // down() style (Pitfall 5 — do not over-engineer enum teardown).
    if (queryInterface.sequelize && queryInterface.sequelize.getDialect() === 'mysql') {
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_products_vat_type').catch(() => {});
    }
  }
};
