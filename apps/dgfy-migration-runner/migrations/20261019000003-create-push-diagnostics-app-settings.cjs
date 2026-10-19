'use strict';

const normalizeTableNames = (tables) => tables.map((table) => (
  typeof table === 'object' ? table.tableName || table.name : table
));

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = normalizeTableNames(await queryInterface.showAllTables());
    if (tables.includes('push_diagnostics_app_settings')) return;

    await queryInterface.createTable('push_diagnostics_app_settings', {
      app: { type: Sequelize.STRING(40), allowNull: false, primaryKey: true },
      enabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      updated_by_admin_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'platform_admin_users', key: 'id' },
        onDelete: 'SET NULL'
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
    });
  },

  async down(queryInterface) {
    const tables = normalizeTableNames(await queryInterface.showAllTables());
    if (tables.includes('push_diagnostics_app_settings')) {
      await queryInterface.dropTable('push_diagnostics_app_settings');
    }
  }
};
