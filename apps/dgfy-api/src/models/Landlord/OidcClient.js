import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class OidcClient extends Model {}
  OidcClient.init({
    id: { type: DataTypes.STRING(36), primaryKey: true, allowNull: false },
    app_id: { type: DataTypes.STRING(36), allowNull: false },
    client_id: { type: DataTypes.STRING(191), allowNull: false, unique: true },
    client_type: { type: DataTypes.ENUM('browser', 'machine', 'service'), allowNull: false },
    environment: { type: DataTypes.STRING(64), allowNull: false },
    status: { type: DataTypes.ENUM('pending', 'active', 'suspended', 'revoked'), allowNull: false, defaultValue: 'pending' },
    auth_method: { type: DataTypes.ENUM('client_secret_basic', 'private_key_jwt'), allowNull: false },
    secret_hash: { type: DataTypes.STRING(255), allowNull: true },
    public_key_pem: { type: DataTypes.TEXT, allowNull: true },
    key_id: { type: DataTypes.STRING(128), allowNull: true },
    audience: { type: DataTypes.STRING(255), allowNull: false },
    redirect_uris: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
    post_logout_redirect_uris: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
    allowed_origins: { type: DataTypes.JSON, allowNull: true, defaultValue: null },
    allowed_scopes: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
    context_adapter: { type: DataTypes.STRING(96), allowNull: true },
    secret_rotated_at: { type: DataTypes.DATE, allowNull: true }
  }, { sequelize, modelName: 'OidcClient', tableName: 'oidc_clients', underscored: true, timestamps: true });
  return OidcClient;
};
