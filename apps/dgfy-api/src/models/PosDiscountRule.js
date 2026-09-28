import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

export default sequelize.define('PosDiscountRule', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  discount_key: { type: DataTypes.STRING(80), allowNull: false },
  name: { type: DataTypes.STRING(100), allowNull: false },
  type: { type: DataTypes.ENUM('senior', 'pwd', 'employee', 'promo', 'manual', 'custom'), allowNull: false },
  method: { type: DataTypes.ENUM('percentage', 'fixed'), allowNull: false, defaultValue: 'percentage' },
  rate: DataTypes.DECIMAL(7, 4),
  fixed_amount: DataTypes.DECIMAL(14, 4),
  description: { type: DataTypes.STRING(500), allowNull: true },
  is_vat_exempt: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  requires_customer_id: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  requires_employee_id: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  requires_manager_approval: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  max_discount_amount: DataTypes.DECIMAL(14, 4),
  is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  is_approved: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  configuration_source: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'governed' },
  configuration_version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 }
}, {
  tableName: 'pos_discount_rules',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { name: 'uq_pos_discount_rules_discount_key', unique: true, fields: ['discount_key'] },
    { name: 'idx_pos_discount_rules_type_active', fields: ['type', 'is_active'] },
    { name: 'idx_pos_discount_rules_enabled_approved', fields: ['is_active', 'is_approved'] }
  ]
});
