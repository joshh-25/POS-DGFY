export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('items', 'packaging_specs', {
      type: Sequelize.JSON,
      allowNull: true,
      comment: 'Packaging specifications (height, width, thickness, material, design, contents) for packaging category items'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('items', 'packaging_specs');
  }
};

