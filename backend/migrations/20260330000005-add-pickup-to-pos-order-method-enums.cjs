'use strict';

const ORDER_METHOD_ENUM_VALUES = ['dine_in', 'takeout', 'pickup', 'delivery', 'online'];
const ORDER_METHOD_ENUM_VALUES_DOWN = ['dine_in', 'takeout', 'delivery', 'online'];

const buildDefaultOrderMethodFees = () => ({
    dine_in: { enabled: false, amount: 0, label: 'Dine In Fee' },
    takeout: { enabled: false, amount: 0, label: 'Takeout Fee' },
    pickup: { enabled: false, amount: 0, label: 'Pickup Fee' },
    delivery: { enabled: false, amount: 0, label: 'Delivery Fee' },
    online: { enabled: false, amount: 0, label: 'Online Fee' }
});

const safelyParseJson = (value) => {
    if (value == null) return null;
    if (typeof value === 'object') return value;
    if (typeof value !== 'string') return null;

    try {
        const first = JSON.parse(value);
        if (typeof first === 'string') {
            return JSON.parse(first);
        }
        return first;
    } catch {
        return null;
    }
};

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

        const [rows] = await queryInterface.sequelize.query(
            "SELECT setting_id, setting_value FROM system_settings WHERE setting_key = 'pos_order_method_fees' LIMIT 1"
        );

        if (Array.isArray(rows) && rows.length > 0) {
            const row = rows[0];
            const parsed = safelyParseJson(row.setting_value);
            const nextValue = buildDefaultOrderMethodFees();

            if (parsed && typeof parsed === 'object') {
                ORDER_METHOD_ENUM_VALUES.forEach((key) => {
                    const source = parsed[key];
                    if (!source || typeof source !== 'object') return;
                    const amount = Number(source.amount);
                    nextValue[key] = {
                        enabled: source.enabled === true || source.enabled === 'true' || source.enabled === 1 || source.enabled === '1',
                        amount: Number.isFinite(amount) ? Math.max(0, amount) : 0,
                        label: String(source.label || nextValue[key].label).trim() || nextValue[key].label
                    };
                });
            }

            await queryInterface.bulkUpdate(
                'system_settings',
                {
                    setting_value: JSON.stringify(nextValue),
                    data_type: 'json',
                    updated_at: new Date()
                },
                { setting_id: row.setting_id }
            );
        }
    },

    async down(queryInterface, Sequelize) {
        const tableDefinition = await queryInterface.describeTable('pos_transactions');

        await queryInterface.sequelize.query(
            "UPDATE pos_transactions SET order_method = 'takeout' WHERE order_method = 'pickup'"
        );
        await queryInterface.sequelize.query(
            "UPDATE pos_transactions SET service_fee_method_snapshot = 'takeout' WHERE service_fee_method_snapshot = 'pickup'"
        );

        if (tableDefinition.order_method) {
            await queryInterface.changeColumn('pos_transactions', 'order_method', {
                type: Sequelize.ENUM(...ORDER_METHOD_ENUM_VALUES_DOWN),
                allowNull: false,
                defaultValue: 'dine_in'
            });
        }

        if (tableDefinition.service_fee_method_snapshot) {
            await queryInterface.changeColumn('pos_transactions', 'service_fee_method_snapshot', {
                type: Sequelize.ENUM(...ORDER_METHOD_ENUM_VALUES_DOWN),
                allowNull: true,
                defaultValue: null
            });
        }

        const [rows] = await queryInterface.sequelize.query(
            "SELECT setting_id, setting_value FROM system_settings WHERE setting_key = 'pos_order_method_fees' LIMIT 1"
        );

        if (Array.isArray(rows) && rows.length > 0) {
            const row = rows[0];
            const parsed = safelyParseJson(row.setting_value);
            const nextValue = {
                dine_in: { enabled: false, amount: 0, label: 'Dine In Fee' },
                takeout: { enabled: false, amount: 0, label: 'Takeout Fee' },
                delivery: { enabled: false, amount: 0, label: 'Delivery Fee' },
                online: { enabled: false, amount: 0, label: 'Online Fee' }
            };

            if (parsed && typeof parsed === 'object') {
                ORDER_METHOD_ENUM_VALUES_DOWN.forEach((key) => {
                    const source = parsed[key];
                    if (!source || typeof source !== 'object') return;
                    const amount = Number(source.amount);
                    nextValue[key] = {
                        enabled: source.enabled === true || source.enabled === 'true' || source.enabled === 1 || source.enabled === '1',
                        amount: Number.isFinite(amount) ? Math.max(0, amount) : 0,
                        label: String(source.label || nextValue[key].label).trim() || nextValue[key].label
                    };
                });
            }

            await queryInterface.bulkUpdate(
                'system_settings',
                {
                    setting_value: JSON.stringify(nextValue),
                    data_type: 'json',
                    updated_at: new Date()
                },
                { setting_id: row.setting_id }
            );
        }
    }
};
