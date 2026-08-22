import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const InventoryReservationLine = sequelize.define('InventoryReservationLine', {
  inventory_reservation_line_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  inventory_reservation_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  item_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  quantity: {
    type: DataTypes.DECIMAL(24, 12),
    allowNull: false
  },
  effect_type: {
    type: DataTypes.ENUM('line_item', 'recipe_ingredient', 'modifier'),
    allowNull: false
  },
  source_line_reference: {
    type: DataTypes.STRING(120),
    allowNull: false
  },
  metadata: {
    type: DataTypes.JSON,
    allowNull: true
  }
}, {
  tableName: 'inventory_reservation_lines',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['inventory_reservation_id'] },
    { fields: ['item_id'] },
    { fields: ['item_id', 'created_at'] }
  ]
});

export default InventoryReservationLine;
