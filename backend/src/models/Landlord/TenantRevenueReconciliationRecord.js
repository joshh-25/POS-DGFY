import { DataTypes } from 'sequelize';

export default (sequelize) => sequelize.define('TenantRevenueReconciliationRecord', {
  reconciliation_id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.UUID, allowNull: false },
  revenue_transaction_id: DataTypes.BIGINT,
  exception_type: { type: DataTypes.STRING(80), allowNull: false },
  severity: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'blocking' },
  expected_value: DataTypes.JSON,
  actual_value: DataTypes.JSON,
  status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'open' },
  resolution_reason: DataTypes.STRING(500),
  detected_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  resolved_at: DataTypes.DATE,
  resolved_by: DataTypes.STRING(120)
}, { tableName: 'tenant_revenue_reconciliation_records', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });
