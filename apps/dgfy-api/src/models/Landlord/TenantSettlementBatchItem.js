import { DataTypes } from 'sequelize';

export default (sequelize) => sequelize.define('TenantSettlementBatchItem', {
  settlement_batch_item_id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  settlement_batch_id: { type: DataTypes.BIGINT, allowNull: false },
  revenue_transaction_id: { type: DataTypes.BIGINT, allowNull: false, unique: true },
  included_payable_centavos: { type: DataTypes.BIGINT, allowNull: false }
}, { tableName: 'tenant_settlement_batch_items', timestamps: true, createdAt: 'created_at', updatedAt: false });
