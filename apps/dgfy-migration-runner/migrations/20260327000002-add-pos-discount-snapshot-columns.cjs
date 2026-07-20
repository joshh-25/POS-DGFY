'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        const tableDefinition = await queryInterface.describeTable('pos_transactions');

        if (!tableDefinition.discount_label_snapshot) {
            await queryInterface.addColumn('pos_transactions', 'discount_label_snapshot', {
                type: Sequelize.STRING(80),
                allowNull: true,
                comment: 'Immutable discount preset label snapshot used at checkout time'
            });
        }

        if (!tableDefinition.discount_rate_snapshot) {
            await queryInterface.addColumn('pos_transactions', 'discount_rate_snapshot', {
                type: Sequelize.DECIMAL(5, 4),
                allowNull: true,
                comment: 'Immutable discount percentage snapshot used at checkout time'
            });
        }
    },

    async down(queryInterface) {
        const tableDefinition = await queryInterface.describeTable('pos_transactions');

        if (tableDefinition.discount_rate_snapshot) {
            await queryInterface.removeColumn('pos_transactions', 'discount_rate_snapshot');
        }

        if (tableDefinition.discount_label_snapshot) {
            await queryInterface.removeColumn('pos_transactions', 'discount_label_snapshot');
        }
    }
};
