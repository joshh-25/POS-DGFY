import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
    class PushDiagnosticsAppSetting extends Model {}

    PushDiagnosticsAppSetting.init({
        app: { type: DataTypes.STRING(40), allowNull: false, primaryKey: true },
        enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        updated_by_admin_id: {
            type: DataTypes.UUID,
            allowNull: true,
            references: { model: 'platform_admin_users', key: 'id' },
            onDelete: 'SET NULL'
        }
    }, {
        sequelize,
        modelName: 'PushDiagnosticsAppSetting',
        tableName: 'push_diagnostics_app_settings',
        underscored: true,
        timestamps: true
    });

    return PushDiagnosticsAppSetting;
};
