import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class PartnerClientCredential extends Model {}
  PartnerClientCredential.init({
    id: { type: DataTypes.STRING(36), primaryKey: true, allowNull: false },
    client_id: { type: DataTypes.STRING(191), allowNull: false },
    version: { type: DataTypes.INTEGER, allowNull: false },
    kind: { type: DataTypes.ENUM('secret_hash', 'public_key'), allowNull: false },
    secret_hash: { type: DataTypes.STRING(255), allowNull: true },
    public_key_pem: { type: DataTypes.TEXT, allowNull: true },
    key_id: { type: DataTypes.STRING(128), allowNull: true },
    status: { type: DataTypes.ENUM('active', 'overlap', 'retired', 'revoked'), allowNull: false },
    activated_at: { type: DataTypes.DATE, allowNull: true },
    overlap_expires_at: { type: DataTypes.DATE, allowNull: true },
    revoked_at: { type: DataTypes.DATE, allowNull: true },
    created_by_admin_id: { type: DataTypes.STRING(36), allowNull: true }
  }, { sequelize, modelName: 'PartnerClientCredential', tableName: 'partner_client_credentials', underscored: true, timestamps: true });
  return PartnerClientCredential;
};
