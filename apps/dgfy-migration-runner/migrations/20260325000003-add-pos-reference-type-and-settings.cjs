module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.changeColumn('stock_movements', 'reference_type', {
            type: Sequelize.ENUM('PO', 'JO', 'MANUAL', 'RETURN', 'DO', 'POS'),
            defaultValue: 'MANUAL'
        });

        const posSettings = [
            {
                setting_key: 'pos_business_name',
                setting_value: '',
                data_type: 'string',
                description: 'POS receipt business name'
            },
            {
                setting_key: 'pos_tin_branch',
                setting_value: '',
                data_type: 'string',
                description: 'POS VAT TIN and branch code'
            },
            {
                setting_key: 'pos_address',
                setting_value: '',
                data_type: 'string',
                description: 'POS receipt business address'
            },
            {
                setting_key: 'pos_ptu_number',
                setting_value: '',
                data_type: 'string',
                description: 'Permit to Use (PTU) number'
            },
            {
                setting_key: 'pos_min_number',
                setting_value: '',
                data_type: 'string',
                description: 'Machine Identification Number (MIN)'
            },
            {
                setting_key: 'pos_accreditation_number',
                setting_value: '',
                data_type: 'string',
                description: 'BIR accreditation number'
            },
            {
                setting_key: 'pos_receipt_footer_message',
                setting_value: '',
                data_type: 'string',
                description: 'Receipt footer message'
            }
        ];

        const [existingRows] = await queryInterface.sequelize.query(
            "SELECT setting_key FROM system_settings WHERE setting_key IN ('pos_business_name','pos_tin_branch','pos_address','pos_ptu_number','pos_min_number','pos_accreditation_number','pos_receipt_footer_message')"
        );
        const existingKeys = new Set((existingRows || []).map((row) => row.setting_key));
        const now = new Date();

        const rowsToInsert = posSettings
            .filter((setting) => !existingKeys.has(setting.setting_key))
            .map((setting) => ({
                ...setting,
                updated_at: now
            }));

        if (rowsToInsert.length > 0) {
            await queryInterface.bulkInsert('system_settings', rowsToInsert);
        }
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.bulkDelete('system_settings', {
            setting_key: [
                'pos_business_name',
                'pos_tin_branch',
                'pos_address',
                'pos_ptu_number',
                'pos_min_number',
                'pos_accreditation_number',
                'pos_receipt_footer_message'
            ]
        });

        await queryInterface.sequelize.query(
            "UPDATE stock_movements SET reference_type = 'MANUAL' WHERE reference_type = 'POS'"
        );

        await queryInterface.changeColumn('stock_movements', 'reference_type', {
            type: Sequelize.ENUM('PO', 'JO', 'MANUAL', 'RETURN', 'DO'),
            defaultValue: 'MANUAL'
        });
    }
};

