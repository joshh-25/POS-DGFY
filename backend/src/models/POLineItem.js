import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const POLineItem = sequelize.define('POLineItem', {
  line_item_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  po_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  item_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  quantity_ordered: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false
  },
  quantity_received: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0
  },
  unit_price: {
    type: DataTypes.DECIMAL(10, 4),
    allowNull: false
  },
  total_price: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true
  },
  quality_check_status: {
    type: DataTypes.ENUM('pending', 'passed', 'failed'),
    defaultValue: 'pending'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  expiry_date: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    comment: 'Optional expiry date override when receiving'
  }
}, {
  tableName: 'po_line_items',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

export default POLineItem;

