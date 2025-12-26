import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const BulkDiscount = sequelize.define('BulkDiscount', {
  discount_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  supplier_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  min_quantity: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false
  },
  discount_percent: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false
  }
}, {
  tableName: 'bulk_discounts',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

export default BulkDiscount;

