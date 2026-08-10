import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const FnbCheckLine = sequelize.define('FnbCheckLine', {
  check_line_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  check_id: {
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
  course: {
    type: DataTypes.ENUM('appetizer', 'main', 'dessert', 'drink', 'other'),
    allowNull: false,
    defaultValue: 'main'
  },
  modifiers_snapshot: {
    type: DataTypes.JSON,
    allowNull: true
  },
  special_instructions: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  kitchen_station_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('pending', 'sent', 'preparing', 'ready', 'served', 'voided'),
    allowNull: false,
    defaultValue: 'pending'
  }
}, {
  tableName: 'fnb_check_lines',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['check_id'] },
    { fields: ['item_id'] },
    { fields: ['kitchen_station_id'] },
    { fields: ['status'] }
  ]
});

export default FnbCheckLine;
