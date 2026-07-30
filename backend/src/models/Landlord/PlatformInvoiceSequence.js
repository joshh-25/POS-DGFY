import { DataTypes, Model } from 'sequelize';
export default (sequelize) => {
  class PlatformInvoiceSequence extends Model { }
  PlatformInvoiceSequence.init({ mode: { type: DataTypes.ENUM('qa', 'live'), primaryKey: true }, next_value: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 1 } }, { sequelize, modelName: 'PlatformInvoiceSequence', tableName: 'platform_invoice_sequences', underscored: true, timestamps: true });
  return PlatformInvoiceSequence;
};
