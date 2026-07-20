'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        const tableDefinition = await queryInterface.describeTable('pos_transactions');
        if (!tableDefinition.discount_rate_snapshot) {
            return;
        }

        await queryInterface.changeColumn('pos_transactions', 'discount_rate_snapshot', {
            type: Sequelize.DECIMAL(7, 4),
            allowNull: true,
            comment: 'Immutable discount percentage snapshot used at checkout time'
        });
    },

    async down(queryInterface, Sequelize) {
        const tableDefinition = await queryInterface.describeTable('pos_transactions');
        if (!tableDefinition.discount_rate_snapshot) {
            return;
        }

        await queryInterface.changeColumn('pos_transactions', 'discount_rate_snapshot', {
            type: Sequelize.DECIMAL(5, 4),
            allowNull: true,
            comment: 'Immutable discount percentage snapshot used at checkout time'
        });
    }
};
