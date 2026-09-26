import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const PosTerminalDeviceChallenge = sequelize.define('PosTerminalDeviceChallenge', {
  pos_terminal_device_challenge_id: {
    type: DataTypes.INTEGER.UNSIGNED,
    autoIncrement: true,
    primaryKey: true
  },
  challenge_hash: {
    type: DataTypes.STRING(64),
    allowNull: false,
    unique: true
  },
  device_id: {
    type: DataTypes.STRING(160),
    allowNull: false
  },
  terminal_id: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  location_id: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false
  },
  purpose: {
    type: DataTypes.STRING(40),
    allowNull: false
  },
  request_path: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  request_method: {
    type: DataTypes.STRING(12),
    allowNull: false,
    defaultValue: 'POST'
  },
  session_id: {
    type: DataTypes.STRING(128),
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
  consumed_request_id: {
    type: DataTypes.STRING(120),
    allowNull: true
  }
}, {
  tableName: 'pos_terminal_device_challenges',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { name: 'uq_pos_terminal_device_challenges_hash', unique: true, fields: ['challenge_hash'] },
    { name: 'idx_pos_terminal_device_challenges_device_expiry', fields: ['device_id', 'expires_at'] },
    { name: 'idx_pos_terminal_device_challenges_terminal_expiry', fields: ['terminal_id', 'expires_at'] },
    { name: 'idx_pos_terminal_device_challenges_consumed_at', fields: ['consumed_at'] }
  ]
});

export default PosTerminalDeviceChallenge;
