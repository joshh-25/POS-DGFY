import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
    class StorefrontCustomDomainOperation extends Model {}

    StorefrontCustomDomainOperation.init({
        id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
        domain_id: { type: DataTypes.UUID, allowNull: false },
        tenant_id: { type: DataTypes.UUID, allowNull: false },
        operation_type: { type: DataTypes.STRING(24), allowNull: false },
        idempotency_key: { type: DataTypes.STRING(160), allowNull: false, unique: true },
        status: { type: DataTypes.STRING(24), allowNull: false, defaultValue: 'queued' },
        lease_owner: { type: DataTypes.STRING(120), allowNull: true },
        lease_expires_at: { type: DataTypes.DATE, allowNull: true },
        attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        max_attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 5 },
        next_attempt_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        request_payload: { type: DataTypes.JSON, allowNull: true },
        result_payload: { type: DataTypes.JSON, allowNull: true },
        error_code: { type: DataTypes.STRING(64), allowNull: true },
        error_message: { type: DataTypes.STRING(500), allowNull: true },
        completed_at: { type: DataTypes.DATE, allowNull: true }
    }, {
        sequelize,
        modelName: 'StorefrontCustomDomainOperation',
        tableName: 'storefront_custom_domain_operations',
        underscored: true,
        timestamps: true
    });

    return StorefrontCustomDomainOperation;
};
