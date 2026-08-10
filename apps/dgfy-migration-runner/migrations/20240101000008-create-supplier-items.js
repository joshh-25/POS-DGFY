export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('supplier_items', {
      supplier_item_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      supplier_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'suppliers',
          key: 'supplier_id'
        },
        onDelete: 'CASCADE'
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
      moq: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: true
      },
      price_per_unit: {
        type: Sequelize.DECIMAL(10, 4),
        allowNull: true
      },
      last_price_update: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
      },
      is_preferred: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addIndex('supplier_items', ['supplier_id'], { name: 'idx_supplier_id' });
    await queryInterface.addIndex('supplier_items', ['item_id'], { name: 'idx_item_id' });
    await queryInterface.addIndex('supplier_items', ['supplier_id', 'item_id'], {
      name: 'unique_supplier_item',
      unique: true
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('supplier_items');
  }
};

