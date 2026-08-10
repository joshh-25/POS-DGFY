import { DataTypes } from 'sequelize';

export default (sequelize) => sequelize.define('TenantRevenueFeePolicy', {
  policy_id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.UUID, allowNull: false },
  version: { type: DataTypes.INTEGER, allowNull: false },
  dgfy_rate_bps: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 100 },
  settlement_cycle_days: { type: DataTypes.ENUM('15', '30'), allowNull: false, defaultValue: '15' },
  settlement_status: { type: DataTypes.ENUM('active', 'suspended', 'on_hold'), allowNull: false, defaultValue: 'on_hold' },
  minimum_payout_centavos: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
  currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'PHP' },
  provider_fee_payer: { type: DataTypes.ENUM('tenant', 'dgfy', 'shared'), allowNull: false, defaultValue: 'tenant' },
  shared_fee_tenant_bps: { type: DataTypes.INTEGER, allowNull: true },
  fallback_fee_policy: { type: DataTypes.JSON, allowNull: true },
  payout_destination_encrypted: { type: DataTypes.TEXT, allowNull: true },
  payout_destination_masked: { type: DataTypes.STRING(160), allowNull: true },
  automatic_payout_enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  large_payout_threshold_centavos: { type: DataTypes.BIGINT, allowNull: true },
  effective_at: { type: DataTypes.DATE, allowNull: false },
  ends_at: { type: DataTypes.DATE, allowNull: true },
  reason: { type: DataTypes.STRING(500), allowNull: false },
  created_by: { type: DataTypes.STRING(120), allowNull: false }
}, { tableName: 'tenant_revenue_fee_policies', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });
