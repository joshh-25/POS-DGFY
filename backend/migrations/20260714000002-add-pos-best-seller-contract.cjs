'use strict';

const SETTINGS_KEY = 'pos_best_seller_settings';
const SETTINGS_VALUE = JSON.stringify({ enabled: true, lookback_days: 30, top_limit: 3 });

const addColumnIfMissing = async (queryInterface, table, column, definition) => {
  const columns = await queryInterface.describeTable(table);
  if (!columns[column]) await queryInterface.addColumn(table, column, definition);
};

module.exports = {
  async up(queryInterface, Sequelize) {
    await addColumnIfMissing(queryInterface, 'pos_catalog_overrides', 'pos_best_seller_mode', {
      type: Sequelize.STRING(10),
      allowNull: false,
      defaultValue: 'auto',
      comment: 'POS best seller override: auto uses completed paid sales, force always tags, never suppresses the tag'
    });

    const [rows] = await queryInterface.sequelize.query(
      'SELECT setting_key FROM system_settings WHERE setting_key = :settingKey LIMIT 1',
      { replacements: { settingKey: SETTINGS_KEY } }
    );
    if (!Array.isArray(rows) || rows.length === 0) {
      await queryInterface.bulkInsert('system_settings', [{
        setting_key: SETTINGS_KEY,
        setting_value: SETTINGS_VALUE,
        data_type: 'json',
        description: 'POS auto best seller policy: top three completed paid item quantities over the previous 30 days',
        updated_at: new Date()
      }]);
    }
  },

  async down(queryInterface) {
    const columns = await queryInterface.describeTable('pos_catalog_overrides');
    if (columns.pos_best_seller_mode) {
      await queryInterface.removeColumn('pos_catalog_overrides', 'pos_best_seller_mode');
    }
    await queryInterface.bulkDelete('system_settings', { setting_key: SETTINGS_KEY });
  }
};
