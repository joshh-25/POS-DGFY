import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const FnbCheck = sequelize.define('FnbCheck', {
  check_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  table_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  dining_area_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  server_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  guest_count: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1
  },
  order_method: {
    type: DataTypes.ENUM('dine_in', 'takeout', 'pickup', 'delivery'),
    allowNull: false,
    defaultValue: 'dine_in'
  },
  status: {
    type: DataTypes.ENUM('open', 'sent_to_kitchen', 'partially_paid', 'paid', 'voided', 'transferred'),
    allowNull: false,
    defaultValue: 'open'
  },
  opened_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  closed_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  pos_transaction_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'fnb_checks',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['table_id'] },
    { fields: ['dining_area_id'] },
    { fields: ['server_id'] },
    { fields: ['status'] },
    { fields: ['pos_transaction_id'] }
  ]
});

export default FnbCheck;
