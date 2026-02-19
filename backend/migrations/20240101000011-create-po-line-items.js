export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('po_line_items', {
      line_item_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      po_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'purchase_orders',
          key: 'po_id'
        },
        onDelete: 'CASCADE'
      },
      item_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'items',
          key: 'item_id'
        }
      },
      quantity_ordered: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false
      },
      quantity_received: {
        type: Sequelize.DECIMAL(12, 2),
        defaultValue: 0
      },
      unit_price: {
        type: Sequelize.DECIMAL(10, 4),
        allowNull: false
      },
      total_price: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: true
      },
      quality_check_status: {
        type: Sequelize.ENUM('pending', 'passed', 'failed'),
        defaultValue: 'pending'
      },
      notes: {
        type: Sequelize.TEXT,
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

    await queryInterface.addIndex('po_line_items', ['po_id'], { name: 'idx_po_id' });
    await queryInterface.addIndex('po_line_items', ['item_id'], { name: 'idx_item_id' });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('po_line_items');
  }
};

