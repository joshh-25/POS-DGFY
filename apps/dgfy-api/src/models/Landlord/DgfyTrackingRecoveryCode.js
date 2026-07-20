import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
    class DgfyTrackingRecoveryCode extends Model { }

    DgfyTrackingRecoveryCode.init({
        recovery_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        lookup_hash: {
            type: DataTypes.STRING(80),
            allowNull: false
        },
        delivery_email: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        code_hash: {
            type: DataTypes.STRING(128),
            allowNull: false
        },
        attempts: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        max_attempts: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 5
        },
        expires_at: {
            type: DataTypes.DATE,
            allowNull: false
        },
        consumed_at: {
            type: DataTypes.DATE,
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'DgfyTrackingRecoveryCode',
        tableName: 'dgfy_tracking_recovery_codes',
        underscored: true,
        timestamps: true,
        indexes: [
            { fields: ['lookup_hash', 'consumed_at', 'expires_at'], name: 'idx_dgfy_tracking_recovery_lookup' }
        ]
    });

    return DgfyTrackingRecoveryCode;
};
