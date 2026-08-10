'use strict';

/**
 * Additive-only (issue #178 Phase 5 / mode-switch hardening): snapshots the
 * item's name and SKU on the transaction line at sale time. Today the column
 * `item_name` is computed in posUseCases.js's preparedLines but has no
 * matching column, so bulkCreate silently drops it and every read path
 * re-joins the live `items` table — renaming or deleting an item retro-
 * changes historical receipts. Money, quantity, VAT, and order_method are
 * already safely snapshotted; this closes the one gap.
 *
 * Nullable and backfill-free: existing rows keep resolving through the live
 * join (the fallback every reader already has), so this ships with zero
 * behavior change for historical data.
 */
module.exports = {
    async up(queryInterface, Sequelize) {
        const tableDefinition = await queryInterface.describeTable('pos_transaction_lines');

        if (!tableDefinition.item_name_snapshot) {
            await queryInterface.addColumn('pos_transaction_lines', 'item_name_snapshot', {
                type: Sequelize.STRING(255),
                allowNull: true
            });
        }

        if (!tableDefinition.sku_snapshot) {
            await queryInterface.addColumn('pos_transaction_lines', 'sku_snapshot', {
                type: Sequelize.STRING(100),
                allowNull: true
            });
        }
    },

    async down(queryInterface) {
        const tableDefinition = await queryInterface.describeTable('pos_transaction_lines');

        if (tableDefinition.item_name_snapshot) {
            await queryInterface.removeColumn('pos_transaction_lines', 'item_name_snapshot');
        }
        if (tableDefinition.sku_snapshot) {
            await queryInterface.removeColumn('pos_transaction_lines', 'sku_snapshot');
        }
    }
};
