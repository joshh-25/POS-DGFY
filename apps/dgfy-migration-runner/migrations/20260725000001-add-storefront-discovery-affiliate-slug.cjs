'use strict';

const TABLE = 'storefront_discovery_index';
const COLUMN = 'affiliate_slug';
const INDEX_NAME = 'storefront_discovery_index_affiliate_slug_idx';

const hasTable = async (queryInterface) => {
  const tables = await queryInterface.showAllTables();
  return tables.includes(TABLE);
};

const hasColumn = async (queryInterface) => {
  if (!(await hasTable(queryInterface))) return false;
  const description = await queryInterface.describeTable(TABLE);
  return Object.prototype.hasOwnProperty.call(description, COLUMN);
};

const hasIndex = async (queryInterface) => {
  if (!(await hasTable(queryInterface))) return false;
  const indexes = await queryInterface.showIndex(TABLE);
  return (indexes || []).some((index) => index.name === INDEX_NAME);
};

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await hasColumn(queryInterface))) {
      await queryInterface.addColumn(TABLE, COLUMN, {
        type: Sequelize.STRING(120),
        allowNull: true,
        after: 'slug'
      });
    }
    if (!(await hasIndex(queryInterface))) {
      await queryInterface.addIndex(TABLE, [COLUMN], { name: INDEX_NAME });
    }
  },

  async down(queryInterface) {
    if (await hasIndex(queryInterface)) {
      await queryInterface.removeIndex(TABLE, INDEX_NAME);
    }
    if (await hasColumn(queryInterface)) {
      await queryInterface.removeColumn(TABLE, COLUMN);
    }
  }
};
