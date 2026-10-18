import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
    class PushDeviceToken extends Model {}

    PushDeviceToken.init({
        id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
        token: { type: DataTypes.STRING(255), allowNull: false },
        platform: { type: DataTypes.ENUM('ios', 'android'), allowNull: false },
        app: { type: DataTypes.STRING(80), allowNull: false },
        brand: { type: DataTypes.STRING(80), allowNull: false },
        dgfy_account_id: { type: DataTypes.UUID, allowNull: true },
        guest_tenant_id: { type: DataTypes.UUID, allowNull: true },
        guest_order_reference: { type: DataTypes.STRING(32), allowNull: true },
        guest_pos_transaction_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
        staff_tenant_id: { type: DataTypes.UUID, allowNull: true },
        staff_user_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
        last_seen_at: { type: DataTypes.DATE, allowNull: false },
        revoked_at: { type: DataTypes.DATE, allowNull: true },
        revoke_reason: { type: DataTypes.STRING(80), allowNull: true }
    }, {
        sequelize,
        modelName: 'PushDeviceToken',
        tableName: 'push_device_tokens',
        underscored: true,
        timestamps: true,
        indexes: [
            { fields: ['dgfy_account_id', 'revoked_at'], name: 'idx_push_device_tokens_account_active' },
            { fields: ['guest_tenant_id', 'guest_order_reference', 'revoked_at'], name: 'idx_push_device_tokens_guest_active' },
            { fields: ['staff_tenant_id', 'staff_user_id', 'revoked_at'], name: 'idx_push_device_tokens_staff_active' },
            { fields: ['created_at', 'revoked_at'], name: 'idx_push_device_tokens_retention' }
        ]
    });

    return PushDeviceToken;
};
