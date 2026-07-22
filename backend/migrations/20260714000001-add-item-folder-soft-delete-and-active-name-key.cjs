'use strict';

const TABLE_NAME = 'item_folders';
const ACTIVE_NAME_KEY = 'active_name_key';
const ACTIVE_NAME_INDEX = 'uq_item_folders_active_name';

const quoteIdentifier = (value) => `\`${String(value).replace(/`/g, '``')}\``;

const getRows = async (queryInterface, sql) => {
  const result = await queryInterface.sequelize.query(sql);
  return Array.isArray(result?.[0]) ? result[0] : result;
};

const tableExists = async (queryInterface) => {
  const tables = await queryInterface.showAllTables();
  return tables.some((entry) => String(entry?.tableName || entry?.table_name || entry).toLowerCase() === TABLE_NAME);
};

const removeLegacyNameUniqueIndexes = async (queryInterface) => {
  const rows = await getRows(queryInterface, `SHOW INDEX FROM ${quoteIdentifier(TABLE_NAME)}`);
  const indexes = new Map();

  rows.forEach((row) => {
    const name = String(row.Key_name || '');
    if (!name || name === 'PRIMARY' || Number(row.Non_unique) !== 0) return;
    indexes.set(name, [...(indexes.get(name) || []), String(row.Column_name || '')]);
  });

  for (const [name, columns] of indexes) {
    if (columns.length === 1 && columns[0] === 'name') {
      await queryInterface.removeIndex(TABLE_NAME, name);
    }
  }
};

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!await tableExists(queryInterface)) return;
    const table = await queryInterface.describeTable(TABLE_NAME);
    if (!table.deleted_at) {
      await queryInterface.addColumn(TABLE_NAME, 'deleted_at', { type: Sequelize.DATE, allowNull: true });
    }
    if (!table.deleted_by) {
      await queryInterface.addColumn(TABLE_NAME, 'deleted_by', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'user_id' },
        onDelete: 'SET NULL'
      });
    }

    await removeLegacyNameUniqueIndexes(queryInterface);

    const refreshedTable = await queryInterface.describeTable(TABLE_NAME);
    if (!refreshedTable[ACTIVE_NAME_KEY]) {
      await queryInterface.sequelize.query(
        `ALTER TABLE ${quoteIdentifier(TABLE_NAME)} ADD COLUMN ${quoteIdentifier(ACTIVE_NAME_KEY)} VARCHAR(100) GENERATED ALWAYS AS (CASE WHEN ${quoteIdentifier('is_active')} = 1 AND ${quoteIdentifier('deleted_at')} IS NULL THEN LOWER(TRIM(${quoteIdentifier('name')})) ELSE NULL END) STORED`
      );
    }

    const indexes = await getRows(queryInterface, `SHOW INDEX FROM ${quoteIdentifier(TABLE_NAME)}`);
    if (!indexes.some((row) => String(row.Key_name) === ACTIVE_NAME_INDEX)) {
      await queryInterface.addIndex(TABLE_NAME, [ACTIVE_NAME_KEY], { name: ACTIVE_NAME_INDEX, unique: true });
    }
  },

  async down(queryInterface) {
    if (!await tableExists(queryInterface)) return;
    const table = await queryInterface.describeTable(TABLE_NAME);
    if (table[ACTIVE_NAME_KEY]) {
      await queryInterface.removeIndex(TABLE_NAME, ACTIVE_NAME_INDEX).catch(() => {});
      await queryInterface.removeColumn(TABLE_NAME, ACTIVE_NAME_KEY);
    }
    if (table.deleted_by) await queryInterface.removeColumn(TABLE_NAME, 'deleted_by');
    if (table.deleted_at) await queryInterface.removeColumn(TABLE_NAME, 'deleted_at');
  }
};
