import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class PlatformInvoiceArtifact extends Model { }
  PlatformInvoiceArtifact.init({
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    invoice_id: { type: DataTypes.UUID, allowNull: false }, artifact_type: { type: DataTypes.ENUM('issued_pdf'), allowNull: false },
    storage_key: { type: DataTypes.STRING(500), allowNull: false, unique: true }, filename: { type: DataTypes.STRING(255), allowNull: false },
    content_type: { type: DataTypes.STRING(100), allowNull: false, defaultValue: 'application/pdf' }, size_bytes: { type: DataTypes.INTEGER, allowNull: false },
    sha256: { type: DataTypes.STRING(64), allowNull: false }, created_by_admin_id: { type: DataTypes.UUID, allowNull: true }
  }, { sequelize, modelName: 'PlatformInvoiceArtifact', tableName: 'platform_invoice_artifacts', underscored: true, timestamps: true, indexes: [{ unique: true, fields: ['invoice_id', 'artifact_type'], name: 'unique_platform_invoice_artifact_type' }] });
  return PlatformInvoiceArtifact;
};
