'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    // pos_catalog_overrides.pos_always_available is a real, already-registered
    // entry in REQUIRED_TENANT_SCHEMA_COLUMNS -- this fixture should PASS.
    await queryInterface.addColumn('pos_catalog_overrides', 'pos_always_available', {
      type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false
    });
  }
};
