import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

export default sequelize.define('PosTransactionDiscountLine', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  transaction_discount_id: { type: DataTypes.INTEGER, allowNull: false },
  beneficiary_id: { type: DataTypes.INTEGER, allowNull: true },
  transaction_line_id: { type: DataTypes.INTEGER, allowNull: false },
  item_id: { type: DataTypes.INTEGER, allowNull: false },
  eligible_quantity: { type: DataTypes.DECIMAL(24, 12), allowNull: false, defaultValue: 0 },
  gross_eligible_amount: { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
  vat_removed: { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
  vat_exempt_amount: { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
  discount_amount: { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
  final_line_amount: { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
  eligibility_override_reason: DataTypes.STRING(500)
}, { tableName: 'pos_transaction_discount_lines', timestamps: true, createdAt: 'created_at', updatedAt: false });
