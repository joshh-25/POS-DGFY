import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

export default sequelize.define('PosDiscountRule', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING(100), allowNull: false },
  type: { type: DataTypes.ENUM('senior', 'pwd', 'employee', 'promo', 'manual'), allowNull: false },
  method: { type: DataTypes.ENUM('percentage', 'fixed'), allowNull: false, defaultValue: 'percentage' },
  rate: DataTypes.DECIMAL(7, 4),
  fixed_amount: DataTypes.DECIMAL(14, 4),
  is_vat_exempt: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  requires_customer_id: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  requires_employee_id: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  requires_manager_approval: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  max_discount_amount: DataTypes.DECIMAL(14, 4),
  is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
}, { tableName: 'pos_discount_rules', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });
