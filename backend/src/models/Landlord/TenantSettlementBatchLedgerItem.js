import { DataTypes } from 'sequelize';

export default (sequelize) => sequelize.define('TenantSettlementBatchLedgerItem', {
  settlement_batch_ledger_item_id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true
  },
  settlement_batch_id: { type: DataTypes.BIGINT, allowNull: false },
  ledger_entry_id: { type: DataTypes.BIGINT, allowNull: false, unique: true },
  included_adjustment_centavos: { type: DataTypes.BIGINT, allowNull: false }
}, {
  tableName: 'tenant_settlement_batch_ledger_items',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false
});
