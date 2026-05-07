'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        const tableInfo = await queryInterface.describeTable('items');
        if (!tableInfo.mode_item_preset) {
            await queryInterface.addColumn('items', 'mode_item_preset', {
                type: Sequelize.STRING(64),
                allowNull: true,
                after: 'product_type',
                comment: 'Corrected workflow-mode item preset key used to preserve mode-native item subtype semantics'
            });
        }

        const indexes = await queryInterface.showIndex('items').catch(() => []);
        if (!indexes.some((index) => index.name === 'idx_items_mode_item_preset')) {
            await queryInterface.addIndex('items', ['mode_item_preset'], {
                name: 'idx_items_mode_item_preset'
            });
        }
    },

    async down(queryInterface) {
        const indexes = await queryInterface.showIndex('items').catch(() => []);
        if (indexes.some((index) => index.name === 'idx_items_mode_item_preset')) {
            await queryInterface.removeIndex('items', 'idx_items_mode_item_preset');
        }

        const tableInfo = await queryInterface.describeTable('items');
        if (tableInfo.mode_item_preset) {
            await queryInterface.removeColumn('items', 'mode_item_preset');
        }
    }
};
