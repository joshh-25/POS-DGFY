import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const InventoryReservation = sequelize.define('InventoryReservation', {
  inventory_reservation_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  source_type: {
    type: DataTypes.ENUM('online_order'),
    allowNull: false
  },
  source_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  location_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('active', 'released', 'expired', 'converted'),
    allowNull: false,
    defaultValue: 'active'
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: false
  },
  released_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  release_reason: {
    type: DataTypes.STRING(80),
    allowNull: true
  },
  converted_at: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'inventory_reservations',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { unique: true, fields: ['source_type', 'source_id'] },
    { fields: ['location_id', 'status', 'expires_at'] },
    { fields: ['status', 'expires_at'] }
  ]
});

export default InventoryReservation;
