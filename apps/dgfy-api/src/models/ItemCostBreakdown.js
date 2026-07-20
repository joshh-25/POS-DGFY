import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const ItemCostBreakdown = sequelize.define('ItemCostBreakdown', {
  cost_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  item_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true
  },
  labor_cost: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    defaultValue: 0
  },
  overhead_cost: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    defaultValue: 0
  },
  additional_packaging_cost: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    defaultValue: 0
  }
}, {
  tableName: 'item_cost_breakdown',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

export default ItemCostBreakdown;
