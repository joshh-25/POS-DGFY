import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
    class TenantDownpaymentSettings extends Model { }

    TenantDownpaymentSettings.init({
        tenant_id: {
            type: DataTypes.UUID,
            primaryKey: true
        },
        payment_mode: {
            type: DataTypes.ENUM('full_payment', 'downpayment_required', 'customer_choice'),
            allowNull: false,
            defaultValue: 'full_payment'
        },
        downpayment_type: {
            type: DataTypes.ENUM('percentage', 'fixed'),
            allowNull: true
        },
        downpayment_rate_bps: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        downpayment_fixed_centavos: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        min_downpayment_centavos: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        downpayment_refundable: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        },
        // NULL = inherit the business-wide capture-method allow-list from #816 (not yet built).
        allowed_capture_methods: {
            type: DataTypes.JSON,
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'TenantDownpaymentSettings',
        tableName: 'tenant_downpayment_settings',
        underscored: true,
        timestamps: true
    });

    return TenantDownpaymentSettings;
};
