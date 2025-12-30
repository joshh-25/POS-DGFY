export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('item_physical_properties', {
      property_id: {
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
      texture: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      color: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      viscosity: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      ph_level: {
        type: Sequelize.DECIMAL(3, 2),
        allowNull: true
      },
      water_activity: {
        type: Sequelize.DECIMAL(4, 3),
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

    await queryInterface.addIndex('item_physical_properties', ['item_id'], {
      name: 'idx_item_physical_properties_item_id'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('item_physical_properties');
  }
};
