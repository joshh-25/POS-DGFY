import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
    class PushDiagnosticEnrollmentCode extends Model {}

    PushDiagnosticEnrollmentCode.init({
        id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
        code_hash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
        created_by_admin_id: { type: DataTypes.UUID, allowNull: false },
        expires_at: { type: DataTypes.DATE, allowNull: false },
        consumed_at: { type: DataTypes.DATE, allowNull: true },
        consumed_device_id: { type: DataTypes.UUID, allowNull: true }
    }, {
        sequelize,
        modelName: 'PushDiagnosticEnrollmentCode',
        tableName: 'push_diagnostic_enrollment_codes',
        underscored: true,
        timestamps: true,
        indexes: [
            { fields: ['expires_at', 'consumed_at'], name: 'idx_push_diagnostic_enrollment_codes_expiry' }
        ]
    });

    return PushDiagnosticEnrollmentCode;
};
