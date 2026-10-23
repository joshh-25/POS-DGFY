'use strict';

const TABLE_NAME = 'external_redirect_sites';

const tableNameOf = (table) => (
  typeof table === 'string' ? table : table?.tableName || table?.TABLE_NAME || table?.name || ''
);

const tableExists = async (queryInterface) => {
  const tables = await queryInterface.showAllTables();
  return tables.some((table) => String(tableNameOf(table)).toLowerCase() === TABLE_NAME);
};

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await tableExists(queryInterface))) return;
    const columns = await queryInterface.describeTable(TABLE_NAME);
    if (columns.show_on_map) return;
    await queryInterface.addColumn(TABLE_NAME, 'show_on_map', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true
    });
  },

  async down(queryInterface) {
    if (!(await tableExists(queryInterface))) return;
    const columns = await queryInterface.describeTable(TABLE_NAME);
    if (columns.show_on_map) await queryInterface.removeColumn(TABLE_NAME, 'show_on_map');
  }
};
