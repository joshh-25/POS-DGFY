'use strict';

const TABLE = 'commerce_payment_refunds';

const tableExists = async (queryInterface, tableName) => {
  const tables = await queryInterface.showAllTables();
  return tables.some((table) => {
    const name = typeof table === 'object' ? table.tableName : table;
    return String(name || '').toLowerCase() === tableName.toLowerCase();
  });
};

const hasColumn = async (queryInterface, tableName, columnName) => {
  if (!await tableExists(queryInterface, tableName)) return false;
  const description = await queryInterface.describeTable(tableName);
  return Boolean(description[columnName]);
};

const addIndexIfMissing = async (queryInterface, tableName, fields, options) => {
  const indexes = await queryInterface.showIndex(tableName).catch(() => []);
  if (indexes.some((index) => index.name === options.name)) return;
  await queryInterface.addIndex(tableName, fields, options);
};

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!await tableExists(queryInterface, TABLE)) return;

    if (!await hasColumn(queryInterface, TABLE, 'retry_count')) {
      await queryInterface.addColumn(TABLE, 'retry_count', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      });
    }
    if (!await hasColumn(queryInterface, TABLE, 'last_attempt_at')) {
      await queryInterface.addColumn(TABLE, 'last_attempt_at', {
        type: Sequelize.DATE,
        allowNull: true
      });
    }
    if (!await hasColumn(queryInterface, TABLE, 'next_retry_at')) {
      await queryInterface.addColumn(TABLE, 'next_retry_at', {
        type: Sequelize.DATE,
        allowNull: true
      });
    }

    await addIndexIfMissing(queryInterface, TABLE, ['status', 'next_retry_at'], {
      name: 'idx_commerce_payment_refunds_retry_queue'
    });
  },

  async down(queryInterface) {
    if (!await tableExists(queryInterface, TABLE)) return;

    await queryInterface.removeIndex(TABLE, 'idx_commerce_payment_refunds_retry_queue').catch(() => null);
    if (await hasColumn(queryInterface, TABLE, 'next_retry_at')) {
      await queryInterface.removeColumn(TABLE, 'next_retry_at');
    }
    if (await hasColumn(queryInterface, TABLE, 'last_attempt_at')) {
      await queryInterface.removeColumn(TABLE, 'last_attempt_at');
    }
    if (await hasColumn(queryInterface, TABLE, 'retry_count')) {
      await queryInterface.removeColumn(TABLE, 'retry_count');
    }
  }
};
