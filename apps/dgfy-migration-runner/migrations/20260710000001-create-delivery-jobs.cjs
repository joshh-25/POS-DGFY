'use strict';

const tableExists = async (queryInterface, tableName) => {
  const tables = await queryInterface.showAllTables();
  return tables.some((entry) => String(entry?.tableName || entry?.table_name || entry).toLowerCase() === tableName);
};

module.exports = {
  async up(queryInterface, Sequelize) {
    if (await tableExists(queryInterface, 'delivery_jobs')) return;
    await queryInterface.createTable('delivery_jobs', {
      delivery_job_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      pos_transaction_id: { type: Sequelize.INTEGER, allowNull: false, unique: true, references: { model: 'pos_transactions', key: 'pos_transaction_id' }, onDelete: 'CASCADE' },
      location_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'tenant_locations', key: 'location_id' }, onDelete: 'SET NULL' },
      provider: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'manual' },
      provider_delivery_id: { type: Sequelize.STRING(120), allowNull: true, unique: true },
      status: { type: Sequelize.ENUM('pending_dispatch', 'assigned', 'picked_up', 'delivered', 'failed', 'cancelled'), allowNull: false, defaultValue: 'pending_dispatch' },
      tracking_url: { type: Sequelize.STRING(1000), allowNull: true },
      pickup_ready_at: { type: Sequelize.DATE, allowNull: true },
      picked_up_at: { type: Sequelize.DATE, allowNull: true },
      delivered_at: { type: Sequelize.DATE, allowNull: true },
      failure_reason: { type: Sequelize.STRING(500), allowNull: true },
      provider_payload: { type: Sequelize.JSON, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
    });
    await queryInterface.addIndex('delivery_jobs', ['location_id', 'status'], { name: 'idx_delivery_jobs_location_status' });
    await queryInterface.addIndex('delivery_jobs', ['provider', 'provider_delivery_id'], { name: 'idx_delivery_jobs_provider_reference' });
  },
  async down(queryInterface) {
    if (await tableExists(queryInterface, 'delivery_jobs')) await queryInterface.dropTable('delivery_jobs');
  }
};
