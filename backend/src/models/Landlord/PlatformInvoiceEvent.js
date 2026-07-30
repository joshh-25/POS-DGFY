import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class PlatformInvoiceEvent extends Model { }
  PlatformInvoiceEvent.init({
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true }, invoice_id: { type: DataTypes.UUID, allowNull: false },
    event_type: { type: DataTypes.STRING(80), allowNull: false }, actor_admin_id: { type: DataTypes.UUID, allowNull: true },
    details: { type: DataTypes.JSON, allowNull: true }
  }, { sequelize, modelName: 'PlatformInvoiceEvent', tableName: 'platform_invoice_events', underscored: true, timestamps: true, updatedAt: false, indexes: [{ fields: ['invoice_id', 'created_at'], name: 'idx_platform_invoice_event_invoice' }] });
  return PlatformInvoiceEvent;
};
