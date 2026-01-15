export default {
    async up(queryInterface, Sequelize) {
        // Check if settings already exist
        const existingSettings = await queryInterface.sequelize.query(
            `SELECT setting_key FROM system_settings WHERE setting_key IN ('expiry_critical_days', 'expiry_warning_days')`,
            { type: Sequelize.QueryTypes.SELECT }
        );

        const existingKeys = existingSettings.map(s => s.setting_key);

        const settingsToInsert = [];

        if (!existingKeys.includes('expiry_critical_days')) {
            settingsToInsert.push({
                setting_key: 'expiry_critical_days',
                setting_value: '7',
                data_type: 'number',
                description: 'Days before expiry to trigger critical alerts (red)',
                updated_at: new Date()
            });
        }

        if (!existingKeys.includes('expiry_warning_days')) {
            settingsToInsert.push({
                setting_key: 'expiry_warning_days',
                setting_value: '30',
                data_type: 'number',
                description: 'Days before expiry to trigger warning alerts (amber)',
                updated_at: new Date()
            });
        }

        if (settingsToInsert.length > 0) {
            await queryInterface.bulkInsert('system_settings', settingsToInsert);
        }
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.bulkDelete('system_settings', {
            setting_key: ['expiry_critical_days', 'expiry_warning_days']
        });
    }
};
