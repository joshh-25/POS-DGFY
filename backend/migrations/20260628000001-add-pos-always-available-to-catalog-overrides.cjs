module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('pos_catalog_overrides');
    if (!table.pos_always_available) {
      await queryInterface.addColumn('pos_catalog_overrides', 'pos_always_available', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        after: 'pos_visible'
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('pos_catalog_overrides');
    if (table.pos_always_available) {
      await queryInterface.removeColumn('pos_catalog_overrides', 'pos_always_available');
    }
  }
};
