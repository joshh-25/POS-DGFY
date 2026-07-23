import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
    class DgfyAffiliatePayoutMethod extends Model { }

    DgfyAffiliatePayoutMethod.init({
        payout_method_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        dgfy_account_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        method_type: {
            type: DataTypes.ENUM('bank', 'gcash', 'maya'),
            allowNull: false
        },
        label: {
            type: DataTypes.STRING(100),
            allowNull: true
        },
        bank_name: {
            type: DataTypes.STRING(120),
            allowNull: true
        },
        account_name: {
            type: DataTypes.STRING(160),
            allowNull: true
        },
        account_number: {
            type: DataTypes.STRING(64),
            allowNull: true
        },
        mobile_number: {
            type: DataTypes.STRING(24),
            allowNull: true
        },
        is_default: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        // Forward-compatibility only - unused today, reserved for a future PayMongo
        // beneficiary/recipient token.
        provider_recipient_ref: {
            type: DataTypes.STRING(120),
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'DgfyAffiliatePayoutMethod',
        tableName: 'dgfy_affiliate_payout_methods',
        underscored: true,
        timestamps: true,
        indexes: [
            { fields: ['dgfy_account_id', 'is_default'], name: 'idx_dgfy_affiliate_payout_methods_account_default' }
        ]
    });

    return DgfyAffiliatePayoutMethod;
};
