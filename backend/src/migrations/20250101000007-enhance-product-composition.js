export default {
  async up(queryInterface, Sequelize) {
    // Add composition_type column to distinguish ingredients from packaging items
    await queryInterface.addColumn('product_composition', 'composition_type', {
      type: Sequelize.ENUM('ingredient', 'packaging'),
      allowNull: false,
      defaultValue: 'ingredient',
      after: 'ingredient_id'
    });

    // Add index for better query performance
    await queryInterface.addIndex('product_composition', ['composition_type'], {
      name: 'idx_product_composition_type'
    });
  },

  async down(queryInterface, Sequelize) {
    // Remove the index first
    await queryInterface.removeIndex('product_composition', 'idx_product_composition_type');

    // Remove the column
    await queryInterface.removeColumn('product_composition', 'composition_type');
  }
};
