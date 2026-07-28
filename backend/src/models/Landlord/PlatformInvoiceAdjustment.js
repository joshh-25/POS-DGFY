import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class PlatformInvoiceAdjustment extends Model { }
  PlatformInvoiceAdjustment.init({
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    invoice_id: { type: DataTypes.UUID, allowNull: false }, adjustment_type: { type: DataTypes.ENUM('full_credit'), allowNull: false },
    reason: { type: DataTypes.STRING(500), allowNull: false }, amount_centavos: { type: DataTypes.BIGINT, allowNull: false },
    confirmed_at: { type: DataTypes.DATE, allowNull: false }, created_by_admin_id: { type: DataTypes.UUID, allowNull: true }
  }, { sequelize, modelName: 'PlatformInvoiceAdjustment', tableName: 'platform_invoice_adjustments', underscored: true, timestamps: true, indexes: [{ fields: ['invoice_id', 'created_at'], name: 'idx_platform_invoice_adjustment_invoice' }] });
  return PlatformInvoiceAdjustment;
};
