'use strict';

const TABLE = 'commerce_payment_refunds';
const COLUMN = 'retry_of_refund_id';
const INDEX = 'idx_commerce_payment_refunds_retry_of';
const CONSTRAINT = 'fk_commerce_payment_refunds_retry_of';

const tableExists = async (queryInterface, tableName) => {
  const tables = await queryInterface.showAllTables();
  return (tables || []).some((entry) => {
    const name = typeof entry === 'string' ? entry : entry?.tableName || entry?.table_name;
    return String(name || '').toLowerCase() === tableName.toLowerCase();
  });
};

const describeTable = async (queryInterface, tableName) => {
  if (!await tableExists(queryInterface, tableName)) return null;
  return queryInterface.describeTable(tableName).catch(() => null);
};

const hasIndex = async (queryInterface, tableName, indexName) => {
  const indexes = await queryInterface.showIndex(tableName);
  return (indexes || []).some((index) => String(index?.name || '') === indexName);
};

const hasConstraint = async (queryInterface, tableName, constraintName) => {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT CONSTRAINT_NAME
       FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND CONSTRAINT_NAME = ?
      LIMIT 1`,
    { replacements: [tableName, constraintName] }
  );
  return Array.isArray(rows) && rows.length > 0;
};

module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await describeTable(queryInterface, TABLE);
    if (!columns) return;

    if (!columns[COLUMN]) {
      await queryInterface.addColumn(TABLE, COLUMN, {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Public refund attempt this retry continues; refund history remains append-only.'
      });
    }

    if (!await hasIndex(queryInterface, TABLE, INDEX)) {
      await queryInterface.addIndex(TABLE, [COLUMN], { name: INDEX });
    }

    if (!await hasConstraint(queryInterface, TABLE, CONSTRAINT)) {
      await queryInterface.addConstraint(TABLE, {
        fields: [COLUMN],
        type: 'foreign key',
        name: CONSTRAINT,
        references: { table: TABLE, field: 'refund_id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE'
      });
    }
  },

  async down(queryInterface) {
    const columns = await describeTable(queryInterface, TABLE);
    if (!columns) return;

    if (await hasConstraint(queryInterface, TABLE, CONSTRAINT)) {
      await queryInterface.removeConstraint(TABLE, CONSTRAINT);
    }
    if (await hasIndex(queryInterface, TABLE, INDEX)) {
      await queryInterface.removeIndex(TABLE, INDEX);
    }
    if (columns[COLUMN]) {
      await queryInterface.removeColumn(TABLE, COLUMN);
    }
  }
};
