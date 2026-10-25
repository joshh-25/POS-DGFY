'use strict';

const normalizeTableNames = (tables) => tables.map((table) => (
  typeof table === 'object' ? table.tableName || table.name : table
));

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = normalizeTableNames(await queryInterface.showAllTables());
    if (tables.includes('platform_storefront_support_contacts')) return;

    await queryInterface.createTable('platform_storefront_support_contacts', {
      id: { type: Sequelize.INTEGER, primaryKey: true, allowNull: false },
      active_email: { type: Sequelize.STRING(254), allowNull: true },
      active_email_verified_at: { type: Sequelize.DATE, allowNull: true },
      monitoring_confirmed_at: { type: Sequelize.DATE, allowNull: true },
      monitoring_confirmed_by_admin_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'platform_admin_users', key: 'id' },
        onDelete: 'SET NULL'
      },
      pending_email: { type: Sequelize.STRING(254), allowNull: true },
      updated_by_admin_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'platform_admin_users', key: 'id' },
        onDelete: 'SET NULL'
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
    });

    await queryInterface.bulkInsert('platform_storefront_support_contacts', [{
      id: 1,
      active_email: 'support@dgfy.ph',
      active_email_verified_at: null,
      monitoring_confirmed_at: null,
      monitoring_confirmed_by_admin_id: null,
      pending_email: null,
      updated_by_admin_id: null,
      created_at: Sequelize.literal('CURRENT_TIMESTAMP'),
      updated_at: Sequelize.literal('CURRENT_TIMESTAMP')
    }]);
  },

  async down(queryInterface) {
    const tables = normalizeTableNames(await queryInterface.showAllTables());
    if (tables.includes('platform_storefront_support_contacts')) {
      await queryInterface.dropTable('platform_storefront_support_contacts');
    }
  }
};
