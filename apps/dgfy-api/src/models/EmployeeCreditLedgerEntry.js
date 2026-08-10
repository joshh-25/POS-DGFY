import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const EmployeeCreditLedgerEntry = sequelize.define('EmployeeCreditLedgerEntry', {
  ledger_entry_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  account_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  pos_transaction_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  entry_type: {
    type: DataTypes.ENUM('grant', 'debit', 'charge', 'repayment', 'reversal', 'adjustment', 'expiration'),
    allowNull: false
  },
  amount: {
    type: DataTypes.DECIMAL(14, 4),
    allowNull: false
  },
  balance_before: {
    type: DataTypes.DECIMAL(14, 4),
    allowNull: false
  },
  balance_after: {
    type: DataTypes.DECIMAL(14, 4),
    allowNull: false
  },
  actor_user_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  shift_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  terminal_id: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  location_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  authorization_reference: {
    type: DataTypes.STRING(80),
    allowNull: true
  },
  idempotency_key: {
    type: DataTypes.STRING(160),
    allowNull: false,
    unique: true
  },
  reason: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  metadata: {
    type: DataTypes.JSON,
    allowNull: true
  }
}, {
  tableName: 'employee_credit_ledger_entries',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false
});

export default EmployeeCreditLedgerEntry;
