import { DataTypes } from 'sequelize';

export default (sequelize) => sequelize.define('TenantRevenueLedgerEntry', {
  ledger_entry_id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.UUID, allowNull: false },
  revenue_transaction_id: DataTypes.BIGINT,
  settlement_batch_id: DataTypes.BIGINT,
  payout_id: DataTypes.BIGINT,
  entry_type: { type: DataTypes.STRING(40), allowNull: false },
  debit_account: { type: DataTypes.STRING(80), allowNull: false },
  credit_account: { type: DataTypes.STRING(80), allowNull: false },
  amount_centavos: { type: DataTypes.BIGINT, allowNull: false },
  currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'PHP' },
  idempotency_key: { type: DataTypes.STRING(180), allowNull: false, unique: true },
  reverses_ledger_entry_id: DataTypes.BIGINT,
  reason: { type: DataTypes.STRING(500), allowNull: false },
  metadata: DataTypes.JSON,
  created_by: { type: DataTypes.STRING(120), allowNull: false },
  approved_by: DataTypes.STRING(120)
}, { tableName: 'tenant_revenue_ledger_entries', timestamps: true, createdAt: 'created_at', updatedAt: false });
