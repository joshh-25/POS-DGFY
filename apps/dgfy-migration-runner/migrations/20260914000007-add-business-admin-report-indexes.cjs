'use strict';

const indexExists = async (queryInterface, tableName, indexName) => {
  const indexes = await queryInterface.showIndex(tableName);
  return indexes.some((index) => index.name === indexName);
};

const addIndexIfMissing = async (queryInterface, tableName, fields, name) => {
  if (!await indexExists(queryInterface, tableName, name)) await queryInterface.addIndex(tableName, fields, { name });
};

module.exports = {
  async up(queryInterface) {
    await addIndexIfMissing(queryInterface, 'pos_transactions', ['status', 'created_at'], 'idx_pos_transactions_report_status_created_at');
    await addIndexIfMissing(queryInterface, 'pos_transactions', ['location_id', 'status', 'created_at'], 'idx_pos_transactions_report_location_status_created_at');
    await addIndexIfMissing(queryInterface, 'pos_transaction_adjustments', ['pos_transaction_id', 'status', 'adjustment_type', 'created_at'], 'idx_pos_transaction_adjustments_business_admin_report');
  },

  async down(queryInterface) {
    for (const [tableName, indexName] of [
      ['pos_transaction_adjustments', 'idx_pos_transaction_adjustments_business_admin_report'],
      ['pos_transactions', 'idx_pos_transactions_report_location_status_created_at'],
      ['pos_transactions', 'idx_pos_transactions_report_status_created_at']
    ]) {
      const indexes = await queryInterface.showIndex(tableName);
      if (indexes.some((index) => index.name === indexName)) await queryInterface.removeIndex(tableName, indexName);
    }
  }
};
