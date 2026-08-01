'use strict';

const TABLE = 'storefront_catalog_overrides';

const hasTable = async (queryInterface) => {
  const tables = await queryInterface.showAllTables();
  return tables.includes(TABLE);
};

const getColumns = async (queryInterface) => {
  if (!(await hasTable(queryInterface))) return {};
  return queryInterface.describeTable(TABLE);
};

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await hasTable(queryInterface))) return;
    const columns = await getColumns(queryInterface);

    if (!Object.prototype.hasOwnProperty.call(columns, 'image_fingerprint')) {
      await queryInterface.addColumn(TABLE, 'image_fingerprint', {
        type: Sequelize.STRING(64),
        allowNull: true,
        after: 'storefront_image_gallery'
      });
    }

    if (!Object.prototype.hasOwnProperty.call(columns, 'optimization_version')) {
      await queryInterface.addColumn(TABLE, 'optimization_version', {
        type: Sequelize.INTEGER,
        allowNull: true,
        after: 'image_fingerprint'
      });
    }

    if (!Object.prototype.hasOwnProperty.call(columns, 'processing_status')) {
      await queryInterface.addColumn(TABLE, 'processing_status', {
        type: Sequelize.STRING(20),
        allowNull: true,
        after: 'optimization_version'
      });
    }

    if (!Object.prototype.hasOwnProperty.call(columns, 'variant_metadata')) {
      await queryInterface.addColumn(TABLE, 'variant_metadata', {
        type: Sequelize.JSON,
        allowNull: true,
        after: 'processing_status'
      });
    }
  },

  async down(queryInterface) {
    if (!(await hasTable(queryInterface))) return;
    const columns = await getColumns(queryInterface);

    if (Object.prototype.hasOwnProperty.call(columns, 'variant_metadata')) {
      await queryInterface.removeColumn(TABLE, 'variant_metadata');
    }
    if (Object.prototype.hasOwnProperty.call(columns, 'processing_status')) {
      await queryInterface.removeColumn(TABLE, 'processing_status');
    }
    if (Object.prototype.hasOwnProperty.call(columns, 'optimization_version')) {
      await queryInterface.removeColumn(TABLE, 'optimization_version');
    }
    if (Object.prototype.hasOwnProperty.call(columns, 'image_fingerprint')) {
      await queryInterface.removeColumn(TABLE, 'image_fingerprint');
    }
  }
};
