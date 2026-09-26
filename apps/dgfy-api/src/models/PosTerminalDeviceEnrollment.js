import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * Tenant-local hardware/device enrollment for strict POS terminals.
 *
 * `active_terminal_key` and `active_device_key` are populated only while the
 * enrollment is active.  MySQL permits multiple NULL values in a unique
 * index, which gives us one active enrollment per terminal and one active
 * terminal per device while preserving the complete revoked/replaced history.
 */
const PosTerminalDeviceEnrollment = sequelize.define('PosTerminalDeviceEnrollment', {
  pos_terminal_device_enrollment_id: {
    type: DataTypes.INTEGER.UNSIGNED,
    autoIncrement: true,
    primaryKey: true
  },
  device_id: {
    type: DataTypes.STRING(160),
    allowNull: false
  },
  public_key: {
    type: DataTypes.TEXT('long'),
    allowNull: false
  },
  key_algorithm: {
    type: DataTypes.STRING(24),
    allowNull: false,
    defaultValue: 'ES256'
  },
  client_type: {
    type: DataTypes.STRING(40),
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
  status: {
    type: DataTypes.ENUM('active', 'revoked', 'replaced'),
    allowNull: false,
    defaultValue: 'active'
  },
  version: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    defaultValue: 1
  },
  enrolled_by: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true
  },
  enrolled_at: {
    type: DataTypes.DATE,
    allowNull: false
  },
  last_seen_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  revoked_by: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true
  },
  revoked_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  revoked_reason: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  replaced_by: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true
  },
  active_terminal_key: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  active_device_key: {
    type: DataTypes.STRING(160),
    allowNull: true
  },
  metadata: {
    type: DataTypes.TEXT('long'),
    allowNull: true
  }
}, {
  tableName: 'pos_terminal_device_enrollments',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { name: 'uq_pos_terminal_device_enrollments_active_terminal', unique: true, fields: ['active_terminal_key'] },
    { name: 'uq_pos_terminal_device_enrollments_active_device', unique: true, fields: ['active_device_key'] },
    { name: 'idx_pos_terminal_device_enrollments_device_status', fields: ['device_id', 'status'] },
    { name: 'idx_pos_terminal_device_enrollments_terminal_status', fields: ['terminal_id', 'status'] },
    { name: 'idx_pos_terminal_device_enrollments_location_status', fields: ['location_id', 'status'] }
  ]
});

export default PosTerminalDeviceEnrollment;
