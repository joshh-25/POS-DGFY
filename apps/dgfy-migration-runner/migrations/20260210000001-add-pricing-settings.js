
export default {
    async up(queryInterface, Sequelize) {
        const settingsData = [
            {
                setting_key: 'premium_plan_price',
                setting_value: '29.99',
                data_type: 'number',
                description: 'Monthly price for Premium plan (USD)',
                updated_at: new Date()
            },
            {
                setting_key: 'standard_plan_price',
                setting_value: '0.00',
                data_type: 'number',
                description: 'Monthly price for Standard plan (USD)',
                updated_at: new Date()
            },
            {
                setting_key: 'paypal_product_id',
                setting_value: '',
                data_type: 'string',
                description: 'PayPal Product ID for SKU Inventory Manager',
                updated_at: new Date()
            }
        ];

        // Check existing
        const existing = await queryInterface.sequelize.query(
            `SELECT setting_key FROM system_settings WHERE setting_key IN ('premium_plan_price', 'standard_plan_price', 'paypal_product_id')`
        );
        const existingKeys = (existing[0] || []).map(s => s.setting_key);

        const toInsert = settingsData.filter(s => !existingKeys.includes(s.setting_key));

        if (toInsert.length > 0) {
            await queryInterface.bulkInsert('system_settings', toInsert);
        }
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.sequelize.query(
            `DELETE FROM system_settings WHERE setting_key IN ('premium_plan_price', 'standard_plan_price', 'paypal_product_id')`
        );
    }
};
