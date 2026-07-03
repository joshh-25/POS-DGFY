import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

export default sequelize.define('PosTransactionDiscount', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  transaction_id: { type: DataTypes.INTEGER, allowNull: false },
  discount_rule_id: DataTypes.INTEGER,
  discount_type: { type: DataTypes.STRING(40), allowNull: false },
  discount_method: { type: DataTypes.STRING(20), allowNull: false },
  discount_rate: DataTypes.DECIMAL(7, 4),
  discount_amount: { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
  vat_removed: { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
  vat_exempt_amount: { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
  customer_name: DataTypes.STRING(255),
  senior_pwd_id_number: DataTypes.STRING(100),
  employee_name: DataTypes.STRING(255),
  employee_id: DataTypes.STRING(100),
  manager_approval_id: DataTypes.INTEGER,
  manager_approved_at: DataTypes.DATE,
  self_approved: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  reason: DataTypes.STRING(500),
  calculation_version: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'pos-discount.v1' }
}, { tableName: 'pos_transaction_discounts', timestamps: true, createdAt: 'created_at', updatedAt: false });
