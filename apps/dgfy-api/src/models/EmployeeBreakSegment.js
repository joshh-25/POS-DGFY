import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const EmployeeBreakSegment = sequelize.define('EmployeeBreakSegment', {
  employee_break_segment_id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  employee_attendance_session_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('open', 'closed'),
    allowNull: false,
    defaultValue: 'open'
  },
  started_at: {
    type: DataTypes.DATE,
    allowNull: false
  },
  ended_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  ended_by: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  start_idempotency_key: {
    type: DataTypes.STRING(120),
    allowNull: true
  },
  end_idempotency_key: {
    type: DataTypes.STRING(120),
    allowNull: true
  }
}, {
  tableName: 'employee_break_segments',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { name: 'idx_employee_break_segments_attendance_started', fields: ['employee_attendance_session_id', 'started_at'] },
    { name: 'idx_employee_break_segments_status_started', fields: ['status', 'started_at'] },
    { name: 'uq_employee_break_segments_session_start_idempotency', unique: true, fields: ['employee_attendance_session_id', 'start_idempotency_key'] },
    { name: 'uq_employee_break_segments_session_end_idempotency', unique: true, fields: ['employee_attendance_session_id', 'end_idempotency_key'] }
  ]
});

export default EmployeeBreakSegment;
