import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class PlatformInvoice extends Model { }
  PlatformInvoice.init({
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    registration_application_id: { type: DataTypes.UUID, allowNull: false },
    original_registration_application_id: { type: DataTypes.UUID, allowNull: true, unique: true },
    parent_invoice_id: { type: DataTypes.UUID, allowNull: true }, invoice_kind: { type: DataTypes.ENUM('original', 'replacement'), allowNull: false, defaultValue: 'original' },
    mode: { type: DataTypes.ENUM('qa', 'live'), allowNull: false, defaultValue: 'qa' },
    invoice_number: { type: DataTypes.STRING(80), allowNull: true, unique: true },
    invoice_status: { type: DataTypes.ENUM('draft', 'issued', 'partially_credited', 'fully_credited', 'discarded'), allowNull: false, defaultValue: 'draft' },
    payment_status: { type: DataTypes.ENUM('unpaid', 'partial', 'paid', 'partially_refunded', 'refunded'), allowNull: false, defaultValue: 'unpaid' },
    currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'PHP' },
    gross_centavos: { type: DataTypes.BIGINT, allowNull: false }, vat_centavos: { type: DataTypes.BIGINT, allowNull: false }, vatable_sales_centavos: { type: DataTypes.BIGINT, allowNull: false },
    seller_snapshot: { type: DataTypes.JSON, allowNull: false }, buyer_snapshot: { type: DataTypes.JSON, allowNull: false }, service_snapshot: { type: DataTypes.JSON, allowNull: false }, recipient_email_snapshot: { type: DataTypes.STRING(255), allowNull: false },
    issued_at: { type: DataTypes.DATE, allowNull: true }
  }, { sequelize, modelName: 'PlatformInvoice', tableName: 'platform_invoices', underscored: true, timestamps: true, indexes: [{ fields: ['registration_application_id'], name: 'idx_platform_invoice_application' }, { fields: ['parent_invoice_id'], name: 'idx_platform_invoice_parent' }, { fields: ['mode', 'invoice_status'], name: 'idx_platform_invoice_mode_status' }] });
  return PlatformInvoice;
};
