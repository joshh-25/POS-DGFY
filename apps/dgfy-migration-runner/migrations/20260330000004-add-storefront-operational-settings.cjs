'use strict';

const STORE_SETTINGS = [
    {
        setting_key: 'store_delivery_fee',
        setting_value: '0',
        data_type: 'number',
        description: 'Fixed delivery fee shown in tenant storefront checkout'
    },
    {
        setting_key: 'store_tenant_slug',
        setting_value: '',
        data_type: 'string',
        description: 'Public tenant slug used by the storefront URL'
    },
    {
        setting_key: 'store_is_visible',
        setting_value: 'false',
        data_type: 'boolean',
        description: 'Controls whether tenant appears in public discovery and public storefront profile reads'
    },
    {
        setting_key: 'pos_open_status',
        setting_value: 'true',
        data_type: 'boolean',
        description: 'Operational open/closed status used by store and POS surfaces'
    },
    {
        setting_key: 'pos_wait_time_minutes',
        setting_value: '15',
        data_type: 'number',
        description: 'Current wait time estimate surfaced to buyers'
    }
];

module.exports = {
    async up(queryInterface) {
        const settingKeys = STORE_SETTINGS.map((entry) => entry.setting_key);
        const [existingRows] = await queryInterface.sequelize.query(
            `SELECT setting_key FROM system_settings WHERE setting_key IN (${settingKeys.map(() => '?').join(',')})`,
            { replacements: settingKeys }
        );
        const existingKeys = new Set((existingRows || []).map((row) => row.setting_key));
        const now = new Date();

        const rowsToInsert = STORE_SETTINGS
            .filter((entry) => !existingKeys.has(entry.setting_key))
            .map((entry) => ({
                ...entry,
                updated_at: now
            }));

        if (rowsToInsert.length > 0) {
            await queryInterface.bulkInsert('system_settings', rowsToInsert);
        }
    },

    async down(queryInterface) {
        await queryInterface.bulkDelete('system_settings', {
            setting_key: STORE_SETTINGS.map((entry) => entry.setting_key)
        });
    }
};
