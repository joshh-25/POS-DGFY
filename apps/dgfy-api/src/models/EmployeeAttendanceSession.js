import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const EmployeeAttendanceSession = sequelize.define('EmployeeAttendanceSession', {
  employee_attendance_session_id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  employee_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  location_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  duty_type: {
    type: DataTypes.ENUM('regular', 'relief'),
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
  closed_by: {
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
  tableName: 'employee_attendance_sessions',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { name: 'idx_employee_attendance_sessions_employee_started', fields: ['employee_id', 'started_at'] },
    { name: 'idx_employee_attendance_sessions_user_started', fields: ['user_id', 'started_at'] },
    { name: 'idx_employee_attendance_sessions_location_status_started', fields: ['location_id', 'status', 'started_at'] },
    { name: 'idx_employee_attendance_sessions_duty_started', fields: ['duty_type', 'started_at'] },
    { name: 'uq_employee_attendance_sessions_user_start_idempotency', unique: true, fields: ['user_id', 'start_idempotency_key'] },
    { name: 'uq_employee_attendance_sessions_user_end_idempotency', unique: true, fields: ['user_id', 'end_idempotency_key'] }
  ]
});

export default EmployeeAttendanceSession;
