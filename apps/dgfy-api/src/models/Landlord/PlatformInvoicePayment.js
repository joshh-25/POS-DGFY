import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class PlatformInvoicePayment extends Model { }
  PlatformInvoicePayment.init({
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    invoice_id: { type: DataTypes.UUID, allowNull: false },
    payment_type: { type: DataTypes.ENUM('cash', 'reversal', 'refund'), allowNull: false, defaultValue: 'cash' },
    tendered_centavos: { type: DataTypes.BIGINT, allowNull: false }, amount_applied_centavos: { type: DataTypes.BIGINT, allowNull: false }, change_due_centavos: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
    change_returned_confirmed_at: { type: DataTypes.DATE, allowNull: true }, recorded_by_admin_id: { type: DataTypes.UUID, allowNull: true }, internal_note: { type: DataTypes.STRING(500), allowNull: true }
  }, { sequelize, modelName: 'PlatformInvoicePayment', tableName: 'platform_invoice_payments', underscored: true, timestamps: true, indexes: [{ fields: ['invoice_id', 'created_at'], name: 'idx_platform_invoice_payment_invoice' }] });
  return PlatformInvoicePayment;
};
