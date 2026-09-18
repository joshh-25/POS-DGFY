import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const StaffRole = sequelize.define('StaffRole', {
  staff_role_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING(120), allowNull: false, unique: true },
  capabilities: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  created_by: { type: DataTypes.INTEGER, allowNull: true },
  updated_by: { type: DataTypes.INTEGER, allowNull: true }
}, {
  tableName: 'staff_roles',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [{ unique: true, fields: ['name'] }, { fields: ['is_active'] }]
});

export default StaffRole;
