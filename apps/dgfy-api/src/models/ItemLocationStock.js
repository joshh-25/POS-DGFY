import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const ItemLocationStock = sequelize.define('ItemLocationStock', {
  item_location_stock_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  item_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  location_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  quantity_on_hand: {
    type: DataTypes.DECIMAL(24, 12),
    allowNull: false,
    defaultValue: 0
  },
  updated_by: {
    type: DataTypes.INTEGER,
    allowNull: true
  }
}, {
  tableName: 'item_location_stocks',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { unique: true, fields: ['item_id', 'location_id'] },
    { fields: ['item_id'] },
    { fields: ['location_id'] }
  ]
});

export default ItemLocationStock;
