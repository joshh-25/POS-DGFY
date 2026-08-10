import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
    class StorefrontCustomDomainAuditLog extends Model {}

    StorefrontCustomDomainAuditLog.init({
        id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
        domain_id: { type: DataTypes.UUID, allowNull: false },
        tenant_id: { type: DataTypes.UUID, allowNull: false },
        action: { type: DataTypes.STRING(32), allowNull: false },
        actor_username: { type: DataTypes.STRING(120), allowNull: false },
        reason: { type: DataTypes.STRING(500), allowNull: false },
        request_id: { type: DataTypes.STRING(100), allowNull: true },
        before_snapshot: { type: DataTypes.JSON, allowNull: true },
        after_snapshot: { type: DataTypes.JSON, allowNull: true },
        metadata: { type: DataTypes.JSON, allowNull: true }
    }, {
        sequelize,
        modelName: 'StorefrontCustomDomainAuditLog',
        tableName: 'storefront_custom_domain_audit_logs',
        underscored: true,
        timestamps: true
    });

    return StorefrontCustomDomainAuditLog;
};
