/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface) {
        const tableInfo = await queryInterface.describeTable('system_settings').catch(() => null);
        if (!tableInfo) return;

        await queryInterface.sequelize.query(`
            UPDATE system_settings
            SET setting_value = ''
            WHERE setting_key IN ('storefront_cover_image_url', 'storefront_profile_image_url')
              AND COALESCE(setting_value, '') <> ''
              AND COALESCE(setting_value, '') NOT REGEXP '^/uploads/storefront-assets/[A-Za-z0-9/_.-]+$'
        `);

        await queryInterface.sequelize.query(`
            UPDATE system_settings
            SET setting_value = ''
            WHERE setting_key IN ('storefront_cover_image_path', 'storefront_profile_image_path')
              AND COALESCE(setting_value, '') <> ''
              AND COALESCE(setting_value, '') NOT REGEXP '^storefront-assets/[A-Za-z0-9/_.-]+$'
        `);

        const addConstraintIfMissing = async (constraintName, expression) => {
            const [rows] = await queryInterface.sequelize.query(`
                SELECT 1
                FROM information_schema.table_constraints
                WHERE constraint_schema = DATABASE()
                  AND table_name = 'system_settings'
                  AND constraint_name = :constraintName
                LIMIT 1
            `, {
                replacements: { constraintName }
            });
            if (Array.isArray(rows) && rows.length > 0) return;

            await queryInterface.sequelize.query(`
                ALTER TABLE system_settings
                ADD CONSTRAINT ${constraintName}
                CHECK (${expression})
            `);
        };

        await addConstraintIfMissing(
            'chk_sys_settings_storefront_cover_url',
            `(setting_key <> 'storefront_cover_image_url'
              OR setting_value IS NULL
              OR setting_value = ''
              OR setting_value REGEXP '^/uploads/storefront-assets/[A-Za-z0-9/_.-]+$')`
        );
        await addConstraintIfMissing(
            'chk_sys_settings_storefront_profile_url',
            `(setting_key <> 'storefront_profile_image_url'
              OR setting_value IS NULL
              OR setting_value = ''
              OR setting_value REGEXP '^/uploads/storefront-assets/[A-Za-z0-9/_.-]+$')`
        );
        await addConstraintIfMissing(
            'chk_sys_settings_storefront_cover_path',
            `(setting_key <> 'storefront_cover_image_path'
              OR setting_value IS NULL
              OR setting_value = ''
              OR setting_value REGEXP '^storefront-assets/[A-Za-z0-9/_.-]+$')`
        );
        await addConstraintIfMissing(
            'chk_sys_settings_storefront_profile_path',
            `(setting_key <> 'storefront_profile_image_path'
              OR setting_value IS NULL
              OR setting_value = ''
              OR setting_value REGEXP '^storefront-assets/[A-Za-z0-9/_.-]+$')`
        );
    },

    async down(queryInterface) {
        const tableInfo = await queryInterface.describeTable('system_settings').catch(() => null);
        if (!tableInfo) return;

        const dropConstraintIfExists = async (constraintName) => {
            const [rows] = await queryInterface.sequelize.query(`
                SELECT 1
                FROM information_schema.table_constraints
                WHERE constraint_schema = DATABASE()
                  AND table_name = 'system_settings'
                  AND constraint_name = :constraintName
                LIMIT 1
            `, {
                replacements: { constraintName }
            });
            if (!Array.isArray(rows) || rows.length === 0) return;

            await queryInterface.sequelize.query(`
                ALTER TABLE system_settings
                DROP CHECK ${constraintName}
            `);
        };

        await dropConstraintIfExists('chk_sys_settings_storefront_profile_path');
        await dropConstraintIfExists('chk_sys_settings_storefront_cover_path');
        await dropConstraintIfExists('chk_sys_settings_storefront_profile_url');
        await dropConstraintIfExists('chk_sys_settings_storefront_cover_url');
    }
};
