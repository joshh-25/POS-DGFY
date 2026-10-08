import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
    class OidcSigningKey extends Model { }

    OidcSigningKey.init({
        id: { type: DataTypes.STRING(36), primaryKey: true, allowNull: false },
        kid: { type: DataTypes.STRING(128), allowNull: false },
        status: { type: DataTypes.ENUM('active', 'retiring', 'revoked'), allowNull: false, defaultValue: 'retiring' },
        public_key_pem: { type: DataTypes.TEXT, allowNull: false },
        private_key_env_ref: { type: DataTypes.STRING(191), allowNull: false },
        activated_at: { type: DataTypes.DATE, allowNull: true },
        retired_at: { type: DataTypes.DATE, allowNull: true },
        revoked_at: { type: DataTypes.DATE, allowNull: true }
    }, {
        sequelize,
        modelName: 'OidcSigningKey',
        tableName: 'oidc_signing_keys',
        underscored: true,
        timestamps: true,
        indexes: [
            { unique: true, fields: ['kid'], name: 'uq_oidc_signing_keys_kid' },
            { fields: ['status', 'activated_at'], name: 'idx_oidc_signing_keys_status' }
        ]
    });

    return OidcSigningKey;
};
