'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const exists = await queryInterface.describeTable('contact_inquiry_provider_configs').catch(() => null);
    if (exists) return;

    await queryInterface.createTable('contact_inquiry_provider_configs', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      provider_key: { type: Sequelize.STRING(32), allowNull: false, unique: true },
      encrypted_api_key: { type: Sequelize.TEXT, allowNull: false },
      updated_by_admin_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'platform_admin_users', key: 'id' },
        onDelete: 'SET NULL'
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('contact_inquiry_provider_configs').catch(() => {});
  }
};
