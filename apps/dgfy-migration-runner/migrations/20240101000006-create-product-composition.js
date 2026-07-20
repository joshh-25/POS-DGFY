export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('product_composition', {
      composition_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      product_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'items',
          key: 'item_id'
        },
        onDelete: 'CASCADE'
      },
      ingredient_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'items',
          key: 'item_id'
        },
        onDelete: 'RESTRICT'
      },
      quantity_required: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false
      },
      unit_of_measure: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addIndex('product_composition', ['product_id'], { name: 'idx_product_id' });
    await queryInterface.addIndex('product_composition', ['ingredient_id'], { name: 'idx_ingredient_id' });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('product_composition');
  }
};

