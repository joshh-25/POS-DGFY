'use strict';

const tableExists = async (queryInterface, tableName) => (await queryInterface.showAllTables())
  .some((entry) => String(entry).toLowerCase() === tableName.toLowerCase());

const indexExists = async (queryInterface, tableName, indexName) => {
  const indexes = await queryInterface.showIndex(tableName);
  return indexes.some((index) => index.name === indexName);
};

const addIndexIfMissing = async (queryInterface, tableName, fields, options) => {
  if (!await indexExists(queryInterface, tableName, options.name)) await queryInterface.addIndex(tableName, fields, options);
};

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!await tableExists(queryInterface, 'business_admin_approval_requests')) {
      await queryInterface.createTable('business_admin_approval_requests', {
        business_admin_approval_request_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        action_type: { type: Sequelize.ENUM('pos_refund', 'force_close_shift'), allowNull: false },
        entity_type: { type: Sequelize.STRING(60), allowNull: false },
        entity_id: { type: Sequelize.INTEGER, allowNull: false },
        payload: { type: Sequelize.JSON, allowNull: false },
        payload_hash: { type: Sequelize.STRING(64), allowNull: false },
        status: { type: Sequelize.ENUM('pending', 'approved', 'rejected', 'executed', 'expired', 'cancelled'), allowNull: false, defaultValue: 'pending' },
        reason: { type: Sequelize.STRING(500), allowNull: false },
        idempotency_key: { type: Sequelize.STRING(120), allowNull: false },
        requested_by: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'users', key: 'user_id' }, onDelete: 'RESTRICT' },
        approved_by: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'users', key: 'user_id' }, onDelete: 'SET NULL' },
        rejected_by: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'users', key: 'user_id' }, onDelete: 'SET NULL' },
        approval_note: { type: Sequelize.STRING(500), allowNull: true },
        expires_at: { type: Sequelize.DATE, allowNull: true },
        approved_at: { type: Sequelize.DATE, allowNull: true },
        rejected_at: { type: Sequelize.DATE, allowNull: true },
        executed_at: { type: Sequelize.DATE, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
      });
    }
    await addIndexIfMissing(queryInterface, 'business_admin_approval_requests', ['action_type', 'idempotency_key'], { name: 'uq_business_admin_approval_action_idempotency', unique: true });
    await addIndexIfMissing(queryInterface, 'business_admin_approval_requests', ['status', 'created_at'], { name: 'idx_business_admin_approval_status_created' });
    await addIndexIfMissing(queryInterface, 'business_admin_approval_requests', ['entity_type', 'entity_id', 'created_at'], { name: 'idx_business_admin_approval_entity_created' });
    await addIndexIfMissing(queryInterface, 'business_admin_approval_requests', ['requested_by', 'created_at'], { name: 'idx_business_admin_approval_requested_created' });
  },

  async down(queryInterface) {
    if (await tableExists(queryInterface, 'business_admin_approval_requests')) await queryInterface.dropTable('business_admin_approval_requests');
  }
};
