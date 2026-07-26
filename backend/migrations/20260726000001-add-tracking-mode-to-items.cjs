'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        const tableInfo = await queryInterface.describeTable('items');

        if (!tableInfo.tracking_mode) {
            await queryInterface.addColumn('items', 'tracking_mode', {
                type: Sequelize.STRING(20),
                allowNull: true,
                after: 'mode_item_preset',
                comment: 'Axis 4 availability/tracking mode (untracked|count_ledger|full_fifo|toggle|capacity|external_ims|recipe_derived). NULL means unset - resolveStockBearingDescriptor falls back to legacy fifo_enabled/pos_always_available/category derivation.'
            });
        }

        if (!tableInfo.tracking_toggle_available) {
            await queryInterface.addColumn('items', 'tracking_toggle_available', {
                type: Sequelize.BOOLEAN,
                allowNull: true,
                defaultValue: true,
                after: 'tracking_mode',
                comment: 'Operator-declared availability, only meaningful when tracking_mode=toggle'
            });
        }

        const indexes = await queryInterface.showIndex('items').catch(() => []);
        if (!indexes.some((index) => index.name === 'idx_items_tracking_mode')) {
            await queryInterface.addIndex('items', ['tracking_mode'], {
                name: 'idx_items_tracking_mode'
            });
        }

        // Narrow, idempotent backfill: an item already flagged pos_always_available
        // via its POS catalog override is exactly the untracked prototype this
        // column generalizes (see docs/features/INVENTORY_TRACKING_MODES.md).
        // Only rows with no tracking_mode yet are touched, and only rows that
        // already opted into the override - this does not change behavior for
        // any item, it makes the existing POS-only behavior also apply on the
        // Storefront (which never read pos_catalog_overrides).
        const overridesTableExists = await queryInterface.describeTable('pos_catalog_overrides').catch(() => null);
        if (overridesTableExists) {
            await queryInterface.sequelize.query(`
                UPDATE items i
                INNER JOIN pos_catalog_overrides o ON o.item_id = i.item_id
                SET i.tracking_mode = 'untracked'
                WHERE o.pos_always_available = 1 AND i.tracking_mode IS NULL
            `);
        }
    },

    async down(queryInterface) {
        const indexes = await queryInterface.showIndex('items').catch(() => []);
        if (indexes.some((index) => index.name === 'idx_items_tracking_mode')) {
            await queryInterface.removeIndex('items', 'idx_items_tracking_mode');
        }

        const tableInfo = await queryInterface.describeTable('items');
        if (tableInfo.tracking_toggle_available) {
            await queryInterface.removeColumn('items', 'tracking_toggle_available');
        }
        if (tableInfo.tracking_mode) {
            await queryInterface.removeColumn('items', 'tracking_mode');
        }
    }
};
