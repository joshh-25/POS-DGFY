'use strict';

// Epic #265, Phase 298: seeds the server-authoritative `image_client_conversion` rollout flag and
// its scope list. Modeled directly on
// 20260503000001-add-customer-access-mode-settings.cjs -- same idempotent
// INSERT ... ON DUPLICATE KEY UPDATE setting_key = setting_key seed, so a re-run never clobbers a
// value a platform admin has already changed.
const SETTINGS = Object.freeze([
  {
    key: 'image_client_conversion',
    value: 'off',
    dataType: 'string',
    description: 'Server-authoritative rollout flag for client-side (browser) catalog image conversion (off | opt_in | on). Platform-admin controlled -- see ADR 0017.'
  },
  {
    key: 'image_client_conversion_scopes',
    value: '[]',
    dataType: 'json',
    description: 'Scope tokens enabled while image_client_conversion is "opt_in" (pos_catalog_single, storefront_catalog_single, pos_catalog_bulk, storefront_catalog_bulk). Ignored unless image_client_conversion is "opt_in".'
  }
]);

const normalizeTableName = (table) => {
  if (!table) return '';
  if (typeof table === 'string') return table;
  return table.tableName || table.TABLE_NAME || '';
};

const tableExists = async (queryInterface, tableName) => {
  const tables = await queryInterface.showAllTables();
  return (tables || []).map(normalizeTableName).includes(tableName);
};

module.exports = {
  async up(queryInterface) {
    if (!(await tableExists(queryInterface, 'system_settings'))) return;

    for (const setting of SETTINGS) {
      await queryInterface.sequelize.query(
        `INSERT INTO system_settings (setting_key, setting_value, data_type, description, updated_at)
         VALUES (?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
           setting_key = setting_key`,
        {
          replacements: [
            setting.key,
            setting.value,
            setting.dataType,
            setting.description
          ]
        }
      );
    }
  },

  async down(queryInterface) {
    if (!(await tableExists(queryInterface, 'system_settings'))) return;

    await queryInterface.sequelize.query(
      `DELETE FROM system_settings
       WHERE setting_key IN (?, ?)`,
      {
        replacements: SETTINGS.map((setting) => setting.key)
      }
    );
  }
};
