module.exports = {
    up: async (queryInterface) => {
        const [existingRows] = await queryInterface.sequelize.query(
            "SELECT setting_key FROM system_settings WHERE setting_key = 'pos_strict_compliance_enabled'"
        );
        const exists = Array.isArray(existingRows) && existingRows.length > 0;
        if (exists) return;

        await queryInterface.bulkInsert('system_settings', [{
            setting_key: 'pos_strict_compliance_enabled',
            setting_value: 'false',
            data_type: 'boolean',
            description: 'Enable strict POS compliance blocking for checkout/receipt access',
            updated_at: new Date()
        }]);
    },

    down: async (queryInterface) => {
        await queryInterface.bulkDelete('system_settings', {
            setting_key: 'pos_strict_compliance_enabled'
        });
    }
};

