import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

export default sequelize.define('PosTransactionDiscountBeneficiary', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  transaction_discount_id: { type: DataTypes.INTEGER, allowNull: false },
  category: { type: DataTypes.STRING(40), allowNull: false },
  customer_name: { type: DataTypes.STRING(255), allowNull: false },
  id_number: { type: DataTypes.STRING(120), allowNull: false }
}, { tableName: 'pos_transaction_discount_beneficiaries', timestamps: true, createdAt: 'created_at', updatedAt: false });
