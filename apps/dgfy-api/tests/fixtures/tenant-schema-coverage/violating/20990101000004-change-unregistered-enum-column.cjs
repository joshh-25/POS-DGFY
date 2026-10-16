'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    // items is a real tenant-scoped table, but this column (and the enum
    // value it's imagined to widen) is intentionally never registered in
    // REQUIRED_TENANT_SCHEMA_COLUMNS or REQUIRED_TENANT_SCHEMA_ENUM_CONTRACTS --
    // this fixture should FAIL. Mirrors the exact #2335/PR #2322 bug class:
    // a changeColumn() ENUM widening that reaches only the landlord DB
    // unless the tenant-schema registry also carries an entry for it.
    await queryInterface.changeColumn('items', 'fixture_unregistered_enum_column', {
      type: Sequelize.ENUM('a', 'b'), allowNull: true
    });
  }
};
