'use strict';

const normalizeTableName = (table) => (typeof table === 'string' ? table : table?.tableName || table?.TABLE_NAME || '');

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = (await queryInterface.showAllTables()).map(normalizeTableName);
    if (!tables.includes('oidc_clients')) return;
    const description = await queryInterface.describeTable('oidc_clients');
    if (!description.allowed_origins) {
      await queryInterface.addColumn('oidc_clients', 'allowed_origins', { type: Sequelize.JSON, allowNull: true, defaultValue: null });
    }
  },

  async down(queryInterface) {
    const tables = (await queryInterface.showAllTables()).map(normalizeTableName);
    if (!tables.includes('oidc_clients')) return;
    const description = await queryInterface.describeTable('oidc_clients');
    if (description.allowed_origins) await queryInterface.removeColumn('oidc_clients', 'allowed_origins');
  }
};
