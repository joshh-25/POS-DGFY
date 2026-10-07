'use strict';

const TABLE_NAME = 'dgfy_dglaundry_outbox';

const normalizeTableName = (table) => (typeof table === 'string' ? table : table?.tableName || table?.TABLE_NAME || '');

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    if ((tables || []).map(normalizeTableName).includes(TABLE_NAME)) return;
    await queryInterface.createTable(TABLE_NAME, {
      id: { type: Sequelize.STRING(36), primaryKey: true, allowNull: false },
      company_id: { type: Sequelize.STRING(160), allowNull: false },
      location_id: { type: Sequelize.STRING(160), allowNull: false },
      direction: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'outbound' },
      operation: { type: Sequelize.STRING(48), allowNull: false },
      idempotency_key: { type: Sequelize.STRING(200), allowNull: false },
      request_hash: { type: Sequelize.STRING(64), allowNull: false },
      payload: { type: Sequelize.JSON, allowNull: false },
      event_id: { type: Sequelize.STRING(200), allowNull: true },
      caller_idempotency_key: { type: Sequelize.STRING(160), allowNull: true },
      order_reference: { type: Sequelize.STRING(200), allowNull: true },
      group_reference: { type: Sequelize.STRING(200), allowNull: true },
      sequence_number: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      status: { type: Sequelize.ENUM('pending', 'leased', 'retry_wait', 'delivered', 'blocked', 'dead_letter', 'cancelled', 'reconciliation_needed'), allowNull: false, defaultValue: 'pending' },
      response: { type: Sequelize.JSON, allowNull: true },
      completion_type: { type: Sequelize.STRING(64), allowNull: true },
      completion_reference: { type: Sequelize.STRING(200), allowNull: true },
      completion_status: { type: Sequelize.ENUM('none', 'pending', 'processing', 'completed', 'failed'), allowNull: false, defaultValue: 'none' },
      completion_attempts: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      completion_next_attempt_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      completion_lease_token: { type: Sequelize.STRING(36), allowNull: true },
      completion_lease_expires_at: { type: Sequelize.DATE, allowNull: true },
      completion_failure: { type: Sequelize.STRING(1000), allowNull: true },
      attempts: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      max_attempts: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 8 },
      next_attempt_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      lease_token: { type: Sequelize.STRING(36), allowNull: true },
      lease_expires_at: { type: Sequelize.DATE, allowNull: true },
      operation_deadline: { type: Sequelize.DATE, allowNull: true },
      failure_code: { type: Sequelize.STRING(120), allowNull: true },
      failure_reason: { type: Sequelize.STRING(1000), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      delivered_at: { type: Sequelize.DATE, allowNull: true }
    });
    await queryInterface.addIndex(TABLE_NAME, ['operation', 'idempotency_key'], { unique: true, name: 'uq_dglaundry_outbox_operation_key' });
    await queryInterface.addIndex(TABLE_NAME, ['status', 'next_attempt_at', 'lease_expires_at'], { name: 'idx_dglaundry_outbox_claim' });
    await queryInterface.addIndex(TABLE_NAME, ['company_id', 'location_id', 'status', 'created_at'], { name: 'idx_dglaundry_outbox_scope' });
    await queryInterface.addIndex(TABLE_NAME, ['company_id', 'location_id', 'order_reference', 'sequence_number'], { unique: true, name: 'uq_dglaundry_outbox_order_sequence' });
  },

  async down(queryInterface) {
    const tables = await queryInterface.showAllTables();
    if ((tables || []).map(normalizeTableName).includes(TABLE_NAME)) await queryInterface.dropTable(TABLE_NAME);
  }
};
