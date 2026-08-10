'use strict';

const ORDER_METHOD_ENUM_VALUES = [
    'dine_in',
    'takeout',
    'pickup',
    'delivery',
    'online',
    'appointment',
    'walk_in'
];
const ORDER_METHOD_ENUM_VALUES_DOWN = ORDER_METHOD_ENUM_VALUES.filter((value) => value !== 'walk_in');

module.exports = {
    async up(queryInterface, Sequelize) {
        const tableDefinition = await queryInterface.describeTable('pos_transactions');

        if (tableDefinition.order_method) {
            await queryInterface.changeColumn('pos_transactions', 'order_method', {
                type: Sequelize.ENUM(...ORDER_METHOD_ENUM_VALUES),
                allowNull: false,
                defaultValue: 'dine_in'
            });
        }

        if (tableDefinition.service_fee_method_snapshot) {
            await queryInterface.changeColumn('pos_transactions', 'service_fee_method_snapshot', {
                type: Sequelize.ENUM(...ORDER_METHOD_ENUM_VALUES),
                allowNull: true,
                defaultValue: null
            });
        }
    },

    async down(queryInterface, Sequelize) {
        const tableDefinition = await queryInterface.describeTable('pos_transactions');

        if (tableDefinition.order_method) {
            await queryInterface.sequelize.query(
                "UPDATE pos_transactions SET order_method = 'appointment' WHERE order_method = 'walk_in'"
            );
            await queryInterface.changeColumn('pos_transactions', 'order_method', {
                type: Sequelize.ENUM(...ORDER_METHOD_ENUM_VALUES_DOWN),
                allowNull: false,
                defaultValue: 'dine_in'
            });
        }

        if (tableDefinition.service_fee_method_snapshot) {
            await queryInterface.sequelize.query(
                "UPDATE pos_transactions SET service_fee_method_snapshot = 'appointment' WHERE service_fee_method_snapshot = 'walk_in'"
            );
            await queryInterface.changeColumn('pos_transactions', 'service_fee_method_snapshot', {
                type: Sequelize.ENUM(...ORDER_METHOD_ENUM_VALUES_DOWN),
                allowNull: true,
                defaultValue: null
            });
        }
    }
};
