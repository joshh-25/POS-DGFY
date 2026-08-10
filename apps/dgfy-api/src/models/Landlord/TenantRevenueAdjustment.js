import { DataTypes } from 'sequelize';

export default (sequelize) => sequelize.define('TenantRevenueAdjustment', {
  adjustment_id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.UUID, allowNull: false },
  revenue_transaction_id: DataTypes.BIGINT,
  amount_centavos: { type: DataTypes.BIGINT, allowNull: false },
  reason: { type: DataTypes.STRING(500), allowNull: false },
  status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'pending' },
  idempotency_key: { type: DataTypes.STRING(180), allowNull: false, unique: true },
  requested_by: { type: DataTypes.STRING(120), allowNull: false },
  approved_by: DataTypes.STRING(120),
  approval_reason: DataTypes.STRING(500),
  approved_at: DataTypes.DATE
}, { tableName: 'tenant_revenue_adjustments', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });
