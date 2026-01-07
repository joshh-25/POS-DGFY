export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('item_cost_breakdown', {
      cost_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      item_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true,
        references: {
          model: 'items',
          key: 'item_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      labor_cost: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0
      },
      overhead_cost: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0
      },
      additional_packaging_cost: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0
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
    }).catch(err => {
      if (!err.original || err.original.code !== 'ER_TABLE_EXISTS_ERROR') {
        if (err.name === 'SequelizeDatabaseError' && err.message.includes('already exists')) return;
        throw err;
      }
    });

    try {
      await queryInterface.addIndex('item_cost_breakdown', ['item_id'], {
        name: 'idx_item_cost_breakdown_item_id'
      });
    } catch (err) {
      if (err.original && err.original.code === 'ER_DUP_KEYNAME') {
        console.log('Index idx_item_cost_breakdown_item_id already exists, skipping.');
      } else {
        console.log('Error adding index (likely exists):', err.message);
      }
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('item_cost_breakdown');
  }
};
