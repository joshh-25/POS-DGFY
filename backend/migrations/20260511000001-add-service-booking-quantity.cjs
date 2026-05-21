'use strict';

const TABLE_NAME = 'service_bookings';

const normalizeTableName = (table) => {
  if (!table) return '';
  if (typeof table === 'string') return table;
  return table.tableName || table.TABLE_NAME || '';
};

const tableExists = async (queryInterface, tableName) => {
  const tables = await queryInterface.showAllTables();
  return (tables || []).map(normalizeTableName).includes(tableName);
};

const columnExists = async (queryInterface, tableName, columnName) => {
  try {
    const table = await queryInterface.describeTable(tableName);
    return Boolean(table && table[columnName]);
  } catch {
    return false;
  }
};

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await tableExists(queryInterface, TABLE_NAME))) return;
    if (!(await columnExists(queryInterface, TABLE_NAME, 'quantity'))) {
      await queryInterface.addColumn(TABLE_NAME, 'quantity', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
        after: 'customer_phone'
      });
    }
    if (!(await columnExists(queryInterface, TABLE_NAME, 'idempotency_key'))) {
      await queryInterface.addColumn(TABLE_NAME, 'idempotency_key', {
        type: Sequelize.STRING(120),
        allowNull: true,
        after: 'source'
      });
    }
    if (!(await columnExists(queryInterface, TABLE_NAME, 'request_hash'))) {
      await queryInterface.addColumn(TABLE_NAME, 'request_hash', {
        type: Sequelize.STRING(64),
        allowNull: true,
        after: 'idempotency_key'
      });
    }
    await queryInterface.addIndex(TABLE_NAME, ['idempotency_key'], {
      name: 'idx_service_bookings_idempotency'
    }).catch(() => {});
  },

  async down(queryInterface) {
    if (!(await tableExists(queryInterface, TABLE_NAME))) return;
    await queryInterface.removeIndex(TABLE_NAME, 'idx_service_bookings_idempotency').catch(() => {});
    if (await columnExists(queryInterface, TABLE_NAME, 'request_hash')) {
      await queryInterface.removeColumn(TABLE_NAME, 'request_hash');
    }
    if (await columnExists(queryInterface, TABLE_NAME, 'idempotency_key')) {
      await queryInterface.removeColumn(TABLE_NAME, 'idempotency_key');
    }
    if (await columnExists(queryInterface, TABLE_NAME, 'quantity')) {
      await queryInterface.removeColumn(TABLE_NAME, 'quantity');
    }
  }
};
