import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const SupplierItem = sequelize.define('SupplierItem', {
  supplier_item_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  supplier_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  item_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  moq: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true
  },
  price_per_unit: {
    type: DataTypes.DECIMAL(10, 4),
    allowNull: true
  },
  last_price_update: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  is_preferred: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: 'supplier_items',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  indexes: [
    {
      unique: true,
      fields: ['supplier_id', 'item_id']
    }
  ]
});

export default SupplierItem;

