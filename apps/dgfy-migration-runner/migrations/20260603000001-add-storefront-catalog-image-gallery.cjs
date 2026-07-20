'use strict';

const TABLE = 'storefront_catalog_overrides';
const COLUMN = 'storefront_image_gallery';

const hasTable = async (queryInterface) => {
  const tables = await queryInterface.showAllTables();
  return tables.includes(TABLE);
};

const hasColumn = async (queryInterface) => {
  if (!(await hasTable(queryInterface))) return false;
  const description = await queryInterface.describeTable(TABLE);
  return Object.prototype.hasOwnProperty.call(description, COLUMN);
};

module.exports = {
  async up(queryInterface, Sequelize) {
    if (await hasColumn(queryInterface)) return;
    await queryInterface.addColumn(TABLE, COLUMN, {
      type: Sequelize.JSON,
      allowNull: true,
      after: 'storefront_image_url'
    });
  },

  async down(queryInterface) {
    if (!(await hasColumn(queryInterface))) return;
    await queryInterface.removeColumn(TABLE, COLUMN);
  }
};
