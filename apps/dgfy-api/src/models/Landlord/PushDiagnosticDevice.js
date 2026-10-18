import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
    class PushDiagnosticDevice extends Model {}

    PushDiagnosticDevice.init({
        id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
        token: { type: DataTypes.STRING(255), allowNull: false },
        platform: { type: DataTypes.ENUM('ios', 'android'), allowNull: false },
        app: { type: DataTypes.STRING(80), allowNull: false },
        brand: { type: DataTypes.STRING(80), allowNull: false },
        label: { type: DataTypes.STRING(80), allowNull: true },
        enrolled_by_admin_id: { type: DataTypes.UUID, allowNull: false },
        last_seen_at: { type: DataTypes.DATE, allowNull: false },
        revoked_at: { type: DataTypes.DATE, allowNull: true },
        revoke_reason: { type: DataTypes.STRING(80), allowNull: true }
    }, {
        sequelize,
        modelName: 'PushDiagnosticDevice',
        tableName: 'push_diagnostic_devices',
        underscored: true,
        timestamps: true,
        indexes: [
            { fields: ['revoked_at', 'created_at'], name: 'idx_push_diagnostic_devices_state' }
        ]
    });

    return PushDiagnosticDevice;
};
