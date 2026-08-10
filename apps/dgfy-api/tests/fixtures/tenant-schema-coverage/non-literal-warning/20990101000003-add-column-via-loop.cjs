'use strict';
const COLUMNS_TO_ADD = [
  { table: 'items', column: 'fixture_loop_driven_column' }
];
module.exports = {
  async up(queryInterface, Sequelize) {
    for (const { table, column } of COLUMNS_TO_ADD) {
      // Variable-driven call -- the static regex check can't resolve this,
      // so it must be surfaced as a warning, never silently skipped.
      await queryInterface.addColumn(table, column, { type: Sequelize.STRING(50), allowNull: true });
    }
  }
};
