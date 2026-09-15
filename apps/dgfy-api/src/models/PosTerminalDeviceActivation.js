import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const PosTerminalDeviceActivation = sequelize.define('PosTerminalDeviceActivation', {
  pos_terminal_device_activation_id: {
    type: DataTypes.INTEGER.UNSIGNED,
    autoIncrement: true,
    primaryKey: true
  },
  activation_hash: {
    type: DataTypes.STRING(64),
    allowNull: false,
    unique: true
  },
  terminal_id: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  location_id: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false
  },
  issued_by: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false
  },
  issued_reason: {
    type: DataTypes.STRING(500),
    allowNull: false
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: false
  },
  consumed_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  consumed_by_device_id: {
    type: DataTypes.STRING(160),
    allowNull: true
  },
  metadata: {
    type: DataTypes.TEXT('long'),
    allowNull: true
  }
}, {
  tableName: 'pos_terminal_device_activations',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { name: 'uq_pos_terminal_device_activations_hash', unique: true, fields: ['activation_hash'] },
    { name: 'idx_pos_terminal_device_activations_terminal_expiry', fields: ['terminal_id', 'expires_at'] },
    { name: 'idx_pos_terminal_device_activations_consumed_at', fields: ['consumed_at'] }
  ]
});

export default PosTerminalDeviceActivation;
