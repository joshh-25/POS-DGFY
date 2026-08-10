import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const FnbDiningTable = sequelize.define('FnbDiningTable', {
  table_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  dining_area_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  table_number: {
    type: DataTypes.STRING(40),
    allowNull: false
  },
  label: {
    type: DataTypes.STRING(120),
    allowNull: true
  },
  seat_count: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 2
  },
  status: {
    type: DataTypes.ENUM('available', 'seated', 'held', 'out_of_service'),
    allowNull: false,
    defaultValue: 'available'
  },
  qr_slug: {
    type: DataTypes.STRING(120),
    allowNull: true
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  }
}, {
  tableName: 'fnb_dining_tables',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['dining_area_id'] },
    { fields: ['status'] },
    { fields: ['qr_slug'], unique: true }
  ]
});

export default FnbDiningTable;
