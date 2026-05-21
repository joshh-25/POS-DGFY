export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('bulk_discounts', {
      discount_id: {
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
      min_quantity: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false
      },
      discount_percent: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false
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

    await queryInterface.addIndex('bulk_discounts', ['supplier_id'], { name: 'idx_supplier_id' });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('bulk_discounts');
  }
};

