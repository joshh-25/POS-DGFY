/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface) {
        const tableInfo = await queryInterface.describeTable('system_settings').catch(() => null);
        if (!tableInfo) return;

        await queryInterface.sequelize.query('DROP TRIGGER IF EXISTS trg_system_settings_storefront_asset_bi');
        await queryInterface.sequelize.query('DROP TRIGGER IF EXISTS trg_system_settings_storefront_asset_bu');

        await queryInterface.sequelize.query(`
            CREATE TRIGGER trg_system_settings_storefront_asset_bi
            BEFORE INSERT ON system_settings
            FOR EACH ROW
            BEGIN
                IF NEW.setting_key IN ('storefront_cover_image_url', 'storefront_profile_image_url')
                   AND COALESCE(NEW.setting_value, '') <> ''
                   AND COALESCE(NEW.setting_value, '') NOT REGEXP '^/uploads/storefront-assets/[A-Za-z0-9/_.-]+$' THEN
                    SIGNAL SQLSTATE '45000'
                    SET MESSAGE_TEXT = 'Invalid storefront asset URL value';
                END IF;

                IF NEW.setting_key IN ('storefront_cover_image_path', 'storefront_profile_image_path')
                   AND COALESCE(NEW.setting_value, '') <> ''
                   AND COALESCE(NEW.setting_value, '') NOT REGEXP '^storefront-assets/[A-Za-z0-9/_.-]+$' THEN
                    SIGNAL SQLSTATE '45000'
                    SET MESSAGE_TEXT = 'Invalid storefront asset path value';
                END IF;
            END
        `);

        await queryInterface.sequelize.query(`
            CREATE TRIGGER trg_system_settings_storefront_asset_bu
            BEFORE UPDATE ON system_settings
            FOR EACH ROW
            BEGIN
                IF NEW.setting_key IN ('storefront_cover_image_url', 'storefront_profile_image_url')
                   AND COALESCE(NEW.setting_value, '') <> ''
                   AND COALESCE(NEW.setting_value, '') NOT REGEXP '^/uploads/storefront-assets/[A-Za-z0-9/_.-]+$' THEN
                    SIGNAL SQLSTATE '45000'
                    SET MESSAGE_TEXT = 'Invalid storefront asset URL value';
                END IF;

                IF NEW.setting_key IN ('storefront_cover_image_path', 'storefront_profile_image_path')
                   AND COALESCE(NEW.setting_value, '') <> ''
                   AND COALESCE(NEW.setting_value, '') NOT REGEXP '^storefront-assets/[A-Za-z0-9/_.-]+$' THEN
                    SIGNAL SQLSTATE '45000'
                    SET MESSAGE_TEXT = 'Invalid storefront asset path value';
                END IF;
            END
        `);
    },

    async down(queryInterface) {
        const tableInfo = await queryInterface.describeTable('system_settings').catch(() => null);
        if (!tableInfo) return;

        await queryInterface.sequelize.query('DROP TRIGGER IF EXISTS trg_system_settings_storefront_asset_bi');
        await queryInterface.sequelize.query('DROP TRIGGER IF EXISTS trg_system_settings_storefront_asset_bu');
    }
};

