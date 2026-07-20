'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    // items is a real tenant-scoped table, but this column is intentionally
    // never registered in REQUIRED_TENANT_SCHEMA_COLUMNS -- this fixture
    // should FAIL.
    await queryInterface.addColumn('items', 'fixture_unregistered_column', {
      type: Sequelize.STRING(50), allowNull: true
    });
  }
};
