import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class PartnerAttachment extends Model {}
  PartnerAttachment.init({
    id: { type: DataTypes.STRING(36), primaryKey: true, allowNull: false },
    app_id: { type: DataTypes.STRING(36), allowNull: false },
    client_id: { type: DataTypes.STRING(191), allowNull: false },
    tenant_id: { type: DataTypes.STRING(36), allowNull: false },
    location_ids: { type: DataTypes.JSON, allowNull: false },
    scopes: { type: DataTypes.JSON, allowNull: false },
    location_authority: { type: DataTypes.JSON, allowNull: false },
    entitlements: { type: DataTypes.JSON, allowNull: false },
    status: { type: DataTypes.ENUM('active', 'suspended', 'disconnected', 'revoked'), allowNull: false },
    consented_by_user_id: { type: DataTypes.STRING(36), allowNull: true },
    consented_at: { type: DataTypes.DATE, allowNull: true },
    disconnected_at: { type: DataTypes.DATE, allowNull: true }
  }, { sequelize, modelName: 'PartnerAttachment', tableName: 'partner_attachments', underscored: true, timestamps: true });
  return PartnerAttachment;
};
