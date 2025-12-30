export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('item_packaging', {
      packaging_id: {
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
      primary_packaging: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      secondary_packaging: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      packaging_material: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      net_weight: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      label_compliance: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
        defaultValue: false
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

    await queryInterface.addIndex('item_packaging', ['item_id'], {
      name: 'idx_item_packaging_item_id'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('item_packaging');
  }
};
