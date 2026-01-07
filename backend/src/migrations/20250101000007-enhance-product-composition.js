export default {
  async up(queryInterface, Sequelize) {
    // Add composition_type column to distinguish ingredients from packaging items

  }).catch(err => {
    if (!err.original || err.original.code !== 'ER_DUP_FIELDNAME') {
      throw err;
    }
  });

  // Add index for better query performance
  try {
    await queryInterface.addIndex('product_composition', ['composition_type'], {
      name: 'idx_product_composition_type'
    });
  } catch(err) {
    if (!err.original || err.original.code !== 'ER_DUP_KEYNAME') {
      throw err;
    }
  }
},

  async down(queryInterface, Sequelize) {
  // Remove the index first
  await queryInterface.removeIndex('product_composition', 'idx_product_composition_type');

  // Remove the column
  await queryInterface.removeColumn('product_composition', 'composition_type');
}
};
