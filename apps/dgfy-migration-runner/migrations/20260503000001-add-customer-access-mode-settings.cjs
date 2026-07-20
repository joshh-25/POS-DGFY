'use strict';

const SETTINGS = Object.freeze([
  {
    key: 'customer_access_mode',
    value: 'catalog',
    dataType: 'string',
    description: 'Requested storefront customer access mode (ghost | catalog | inquiry | transaction)'
  },
  {
    key: 'inventory_display_mode',
    value: 'availability',
    dataType: 'string',
    description: 'Customer-facing inventory display mode (hidden | availability | low_stock | exact_quantity)'
  },
  {
    key: 'inventory_low_stock_display_threshold',
    value: '5',
    dataType: 'number',
    description: 'Public low-stock display threshold for storefront inventory labels'
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
       WHERE setting_key IN (?, ?, ?)`,
      {
        replacements: SETTINGS.map((setting) => setting.key)
      }
    );
  }
};
