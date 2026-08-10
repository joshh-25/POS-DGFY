import { DataTypes } from 'sequelize';

export default (sequelize) => sequelize.define('TenantSettlementBatch', {
  settlement_batch_id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  batch_number: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  tenant_id: { type: DataTypes.UUID, allowNull: false },
  period_start: { type: DataTypes.DATE, allowNull: false },
  period_end: { type: DataTypes.DATE, allowNull: false },
  currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'PHP' },
  gross_centavos: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
  provider_fee_centavos: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
  dgfy_fee_centavos: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
  refund_centavos: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
  chargeback_centavos: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
  adjustment_centavos: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
  payout_centavos: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
  scheduled_payout_at: DataTypes.DATE,
  actual_payout_at: DataTypes.DATE,
  payout_destination_masked: DataTypes.STRING(160),
  status: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'draft' },
  prepared_by: { type: DataTypes.STRING(120), allowNull: false },
  approved_by: DataTypes.STRING(120),
  approved_at: DataTypes.DATE,
  approval_reason: DataTypes.STRING(500)
}, { tableName: 'tenant_settlement_batches', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });
