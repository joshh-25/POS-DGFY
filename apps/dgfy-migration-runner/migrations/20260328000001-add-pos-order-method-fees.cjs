'use strict';

const ORDER_METHOD_ENUM_VALUES = ['dine_in', 'takeout', 'delivery', 'online'];

const defaultOrderMethodFees = {
    dine_in: { enabled: false, amount: 0, label: 'Dine In Fee' },
    takeout: { enabled: false, amount: 0, label: 'Takeout Fee' },
    delivery: { enabled: false, amount: 0, label: 'Delivery Fee' },
    online: { enabled: false, amount: 0, label: 'Online Fee' }
};

module.exports = {
    async up(queryInterface, Sequelize) {
        const tableDefinition = await queryInterface.describeTable('pos_transactions');

        if (!tableDefinition.service_fee_amount) {
            await queryInterface.addColumn('pos_transactions', 'service_fee_amount', {
                type: Sequelize.DECIMAL(14, 4),
                allowNull: false,
                defaultValue: 0,
                comment: 'Order-method service fee amount applied at checkout (non-VAT fee)'
            });
        }

        if (!tableDefinition.service_fee_label_snapshot) {
            await queryInterface.addColumn('pos_transactions', 'service_fee_label_snapshot', {
                type: Sequelize.STRING(80),
                allowNull: true,
                comment: 'Immutable service fee label snapshot used at checkout time'
            });
        }

        if (!tableDefinition.service_fee_method_snapshot) {
            await queryInterface.addColumn('pos_transactions', 'service_fee_method_snapshot', {
                type: Sequelize.ENUM(...ORDER_METHOD_ENUM_VALUES),
                allowNull: true,
                comment: 'Order method associated with the service fee snapshot'
            });
        }

        if (!tableDefinition.service_fee_overridden) {
            await queryInterface.addColumn('pos_transactions', 'service_fee_overridden', {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: false,
                comment: 'True when cashier manually overrides configured service fee'
            });
        }

        const [existingRows] = await queryInterface.sequelize.query(
            "SELECT setting_key FROM system_settings WHERE setting_key = 'pos_order_method_fees'"
        );
        const exists = Array.isArray(existingRows) && existingRows.length > 0;
        if (!exists) {
            await queryInterface.bulkInsert('system_settings', [{
                setting_key: 'pos_order_method_fees',
                setting_value: JSON.stringify(defaultOrderMethodFees),
                data_type: 'json',
                description: 'POS order method fee matrix (enabled/amount/label per method)',
                updated_at: new Date()
            }]);
        }
    },

    async down(queryInterface) {
        const tableDefinition = await queryInterface.describeTable('pos_transactions');

        if (tableDefinition.service_fee_overridden) {
            await queryInterface.removeColumn('pos_transactions', 'service_fee_overridden');
        }
        if (tableDefinition.service_fee_method_snapshot) {
            await queryInterface.removeColumn('pos_transactions', 'service_fee_method_snapshot');
        }
        if (tableDefinition.service_fee_label_snapshot) {
            await queryInterface.removeColumn('pos_transactions', 'service_fee_label_snapshot');
        }
        if (tableDefinition.service_fee_amount) {
            await queryInterface.removeColumn('pos_transactions', 'service_fee_amount');
        }

        await queryInterface.bulkDelete('system_settings', {
            setting_key: 'pos_order_method_fees'
        });
    }
};

