import { DataTypes } from 'sequelize';

export default (sequelize) => sequelize.define('TenantPayout', {
  payout_id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  public_reference: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  settlement_batch_id: { type: DataTypes.BIGINT, allowNull: false },
  tenant_id: { type: DataTypes.UUID, allowNull: false },
  amount_centavos: { type: DataTypes.BIGINT, allowNull: false },
  currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'PHP' },
  method: { type: DataTypes.STRING(40), allowNull: false },
  provider_reference: DataTypes.STRING(160),
  destination_masked: { type: DataTypes.STRING(160), allowNull: false },
  proof_reference: DataTypes.STRING(500),
  status: { type: DataTypes.STRING(40), allowNull: false },
  idempotency_key: { type: DataTypes.STRING(180), allowNull: false, unique: true },
  initiated_by: { type: DataTypes.STRING(120), allowNull: false },
  approved_by: { type: DataTypes.STRING(120), allowNull: false },
  confirmed_by: DataTypes.STRING(120),
  failure_reason: DataTypes.STRING(500),
  confirmed_at: DataTypes.DATE
}, { tableName: 'tenant_payouts', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });
