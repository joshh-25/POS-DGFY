'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    // stock_movements.reference_type is a real, already-registered entry in
    // REQUIRED_TENANT_SCHEMA_ENUM_CONTRACTS (added for #2335) -- this fixture
    // should PASS.
    await queryInterface.changeColumn('stock_movements', 'reference_type', {
      type: Sequelize.ENUM('PO', 'JO', 'MANUAL', 'RETURN', 'DO', 'POS', 'POS_PARKED_SALE'),
      defaultValue: 'MANUAL'
    });
  }
};
