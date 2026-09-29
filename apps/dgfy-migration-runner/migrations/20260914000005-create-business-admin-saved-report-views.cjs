'use strict';

const tableExists = async (queryInterface, tableName) => {
  const tables = await queryInterface.showAllTables();
  return tables.some((entry) => String(entry).toLowerCase() === tableName.toLowerCase());
};

const addIndexIfMissing = async (queryInterface, tableName, fields, options) => {
  const indexes = await queryInterface.showIndex(tableName);
  if (!indexes.some((index) => index.name === options.name)) await queryInterface.addIndex(tableName, fields, options);
};

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!await tableExists(queryInterface, 'business_admin_saved_report_views')) {
      await queryInterface.createTable('business_admin_saved_report_views', {
        business_admin_saved_report_view_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        user_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'users', key: 'user_id' }, onDelete: 'CASCADE' },
        report_key: { type: Sequelize.STRING(60), allowNull: false, defaultValue: 'pos_operations' },
        name: { type: Sequelize.STRING(100), allowNull: false },
        filters: { type: Sequelize.JSON, allowNull: false },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
      });
    }
    await addIndexIfMissing(queryInterface, 'business_admin_saved_report_views', ['user_id', 'report_key', 'name'], { name: 'uq_business_admin_saved_report_view_name', unique: true });
    await addIndexIfMissing(queryInterface, 'business_admin_saved_report_views', ['user_id', 'report_key', 'updated_at'], { name: 'idx_business_admin_saved_report_view_user_updated' });
  },

  async down(queryInterface) {
    if (await tableExists(queryInterface, 'business_admin_saved_report_views')) await queryInterface.dropTable('business_admin_saved_report_views');
  }
};
