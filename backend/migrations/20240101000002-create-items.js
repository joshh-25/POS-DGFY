export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('items', {
      item_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      sku_code: {
        type: Sequelize.STRING(50),
        unique: true,
        allowNull: false
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      category: {
        type: Sequelize.ENUM('ingredient', 'product', 'packaging'),
        allowNull: false
      },
      product_folder: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      current_stock: {
        type: Sequelize.DECIMAL(12, 2),
        defaultValue: 0
      },
      max_capacity: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false
      },
      min_threshold: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: true
      },
      purchase_allowance: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: true
      },
      unit_of_measure: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      cost_per_unit: {
        type: Sequelize.DECIMAL(10, 4),
        allowNull: true
      },
      fifo_enabled: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      batch_size: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: true
      },
      yield_percentage: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: true
      },
      processing_loss: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: true
      },
      production_notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
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

    await queryInterface.addIndex('items', ['sku_code'], { name: 'idx_sku_code' });
    await queryInterface.addIndex('items', ['category'], { name: 'idx_category' });
    await queryInterface.addIndex('items', ['name'], { name: 'idx_name' });
    await queryInterface.addIndex('items', ['current_stock'], { name: 'idx_current_stock' });
    await queryInterface.addIndex('items', ['category', 'current_stock'], { name: 'idx_category_stock' });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('items');
  }
};

