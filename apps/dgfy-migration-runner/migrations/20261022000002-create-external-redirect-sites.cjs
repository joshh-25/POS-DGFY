'use strict';

const DISCOVERY_TABLE = 'storefront_discovery_index';
const SITE_TABLE = 'external_redirect_sites';

const tableNames = (tables) => tables.map((table) => (
  typeof table === 'object' ? table.tableName || table.name : table
));

module.exports = {
  async up(queryInterface, Sequelize) {
    const discoveryColumns = await queryInterface.describeTable(DISCOVERY_TABLE);
    if (!discoveryColumns.external_record_origin) {
      await queryInterface.addColumn(DISCOVERY_TABLE, 'external_record_origin', {
        type: Sequelize.STRING(24),
        allowNull: true
      });
    }

    const tables = tableNames(await queryInterface.showAllTables());
    if (tables.includes(SITE_TABLE)) return;
    await queryInterface.createTable(SITE_TABLE, {
      site_key: { type: Sequelize.STRING(60), allowNull: false, primaryKey: true },
      url_template: { type: Sequelize.STRING(1000), allowNull: false },
      allowed_hostname: { type: Sequelize.STRING(253), allowNull: false },
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
    const tables = tableNames(await queryInterface.showAllTables());
    if (tables.includes(SITE_TABLE)) await queryInterface.dropTable(SITE_TABLE);
    const discoveryColumns = await queryInterface.describeTable(DISCOVERY_TABLE);
    if (discoveryColumns.external_record_origin) {
      await queryInterface.removeColumn(DISCOVERY_TABLE, 'external_record_origin');
    }
  }
};
