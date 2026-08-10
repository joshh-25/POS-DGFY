import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const EmployeeCreditAccount = sequelize.define('EmployeeCreditAccount', {
  account_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    unique: true
  },
  employee_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    unique: true
  },
  account_code: {
    type: DataTypes.STRING(40),
    allowNull: false,
    unique: true
  },
  is_eligible: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  balance: {
    type: DataTypes.DECIMAL(14, 4),
    allowNull: false,
    defaultValue: 0
  },
  outstanding_balance: {
    type: DataTypes.DECIMAL(14, 4),
    allowNull: false,
    defaultValue: 0
  },
  credit_limit: {
    type: DataTypes.DECIMAL(14, 4),
    allowNull: true
  },
  authorization_pin_hash: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  version: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  }
}, {
  tableName: 'employee_credit_accounts',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

export default EmployeeCreditAccount;
