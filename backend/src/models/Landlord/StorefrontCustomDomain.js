import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
    class StorefrontCustomDomain extends Model {}

    StorefrontCustomDomain.init({
        id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
        tenant_id: { type: DataTypes.UUID, allowNull: false },
        hostname: { type: DataTypes.STRING(253), allowNull: false, unique: true },
        role: { type: DataTypes.STRING(24), allowNull: false, defaultValue: 'canonical' },
        canonical_tenant_id: { type: DataTypes.UUID, allowNull: true, unique: true },
        canonical_domain_id: { type: DataTypes.UUID, allowNull: true },
        status: { type: DataTypes.STRING(24), allowNull: false, defaultValue: 'pending_dns' },
        verification_token_hash: { type: DataTypes.STRING(64), allowNull: false },
        verification_token_hint: { type: DataTypes.STRING(16), allowNull: false },
        dns_observation: { type: DataTypes.JSON, allowNull: true },
        dns_error: { type: DataTypes.STRING(500), allowNull: true },
        verified_at: { type: DataTypes.DATE, allowNull: true },
        activated_at: { type: DataTypes.DATE, allowNull: true },
        eligibility_grace_ends_at: { type: DataTypes.DATE, allowNull: true },
        last_dns_checked_at: { type: DataTypes.DATE, allowNull: true },
        last_health_checked_at: { type: DataTypes.DATE, allowNull: true },
        tls_expires_at: { type: DataTypes.DATE, allowNull: true },
        failure_code: { type: DataTypes.STRING(64), allowNull: true },
        failure_message: { type: DataTypes.STRING(500), allowNull: true },
        suspended_at: { type: DataTypes.DATE, allowNull: true },
        removed_at: { type: DataTypes.DATE, allowNull: true },
        provisioning_reference: { type: DataTypes.STRING(255), allowNull: true },
        version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        created_by: { type: DataTypes.STRING(120), allowNull: false },
        updated_by: { type: DataTypes.STRING(120), allowNull: false }
    }, {
        sequelize,
        modelName: 'StorefrontCustomDomain',
        tableName: 'storefront_custom_domains',
        underscored: true,
        timestamps: true
    });

    return StorefrontCustomDomain;
};
