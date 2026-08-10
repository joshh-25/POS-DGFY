export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('item_allergens', {
      allergen_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      item_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'items',
          key: 'item_id'
        },
        onDelete: 'CASCADE'
      },
      allergen_name: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      is_cross_contamination: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addIndex('item_allergens', ['item_id'], { name: 'idx_item_id' });
    await queryInterface.addIndex('item_allergens', ['item_id', 'allergen_name'], {
      name: 'unique_allergen',
      unique: true
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('item_allergens');
  }
};

