import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const PosTerminalOperatorSession = sequelize.define('PosTerminalOperatorSession', {
  pos_terminal_operator_session_id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  pos_terminal_shift_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  terminal_id: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  location_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  employee_attendance_session_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('active', 'ended'),
    allowNull: false,
    defaultValue: 'active'
  },
  started_at: {
    type: DataTypes.DATE,
    allowNull: false
  },
  ended_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  ended_reason: {
    type: DataTypes.STRING(80),
    allowNull: true
  },
  authority_token_hash: {
    type: DataTypes.STRING(64),
    allowNull: true
  },
  authority_expires_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  revoked_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  revoked_reason: {
    type: DataTypes.STRING(80),
    allowNull: true
  },
  idempotency_key: {
    type: DataTypes.STRING(120),
    allowNull: true
  },
  protected_operation_key: {
    type: DataTypes.STRING(120),
    allowNull: true
  },
  protected_operation_type: {
    type: DataTypes.STRING(120),
    allowNull: true
  },
  protected_operation_started_at: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'pos_terminal_operator_sessions',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { name: 'idx_pos_terminal_operator_sessions_shift_started', fields: ['pos_terminal_shift_id', 'started_at'] },
    { name: 'idx_pos_terminal_operator_sessions_terminal_started', fields: ['terminal_id', 'started_at'] },
    { name: 'idx_pos_terminal_operator_sessions_location_started', fields: ['location_id', 'started_at'] },
    { name: 'idx_pos_terminal_operator_sessions_user_started', fields: ['user_id', 'started_at'] },
    { name: 'idx_pos_terminal_operator_sessions_status_started', fields: ['status', 'started_at'] },
    { name: 'idx_pos_terminal_operator_sessions_authority_token_hash', fields: ['authority_token_hash'] },
    { name: 'idx_pos_terminal_operator_sessions_protected_operation', fields: ['pos_terminal_shift_id', 'protected_operation_started_at'] },
    { name: 'uq_pos_terminal_operator_sessions_shift_idempotency', unique: true, fields: ['pos_terminal_shift_id', 'idempotency_key'] }
  ]
});

export default PosTerminalOperatorSession;
