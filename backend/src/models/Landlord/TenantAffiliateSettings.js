import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
    class TenantAffiliateSettings extends Model { }

    TenantAffiliateSettings.init({
        tenant_id: {
            type: DataTypes.UUID,
            primaryKey: true
        },
        program_enabled: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        // System default: 5% (500 basis points).
        default_rate_bps: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 500
        },
        attribution_window_days: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 60
        },
        // Default PHP 200.00.
        min_cashout_centavos: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 20000
        },
        auto_approve_enrollment: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        }
    }, {
        sequelize,
        modelName: 'TenantAffiliateSettings',
        tableName: 'tenant_affiliate_settings',
        underscored: true,
        timestamps: true
    });

    return TenantAffiliateSettings;
};
