'use strict';

/**
 * Persist the approved item-only discount beside each POS transaction line.
 * Nullable keeps historical transactions readable without a backfill.
 */
module.exports = {
    async up(queryInterface, Sequelize) {
        const tableDefinition = await queryInterface.describeTable('pos_transaction_lines');
        if (!tableDefinition.item_discount_snapshot) {
            await queryInterface.addColumn('pos_transaction_lines', 'item_discount_snapshot', {
                type: Sequelize.JSON,
                allowNull: true
            });
        }
    },

    async down(queryInterface) {
        const tableDefinition = await queryInterface.describeTable('pos_transaction_lines');
        if (tableDefinition.item_discount_snapshot) {
            const [rows] = await queryInterface.sequelize.query(
                'SELECT COUNT(*) AS count FROM `pos_transaction_lines` WHERE `item_discount_snapshot` IS NOT NULL'
            );
            if (Number(rows?.[0]?.count || 0) > 0) {
                throw new Error(
                    'Refusing to remove item_discount_snapshot because live discount evidence exists; restore a backup and use an approved data-retention rollback plan.'
                );
            }
            await queryInterface.removeColumn('pos_transaction_lines', 'item_discount_snapshot');
        }
    }
};
