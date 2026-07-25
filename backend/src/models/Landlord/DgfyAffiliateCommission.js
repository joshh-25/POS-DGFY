import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
    class DgfyAffiliateCommission extends Model { }

    DgfyAffiliateCommission.init({
        commission_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        enrollment_id: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        tenant_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        dgfy_account_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        pos_transaction_id: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        order_reference: {
            type: DataTypes.STRING(24),
            allowNull: false
        },
        commissionable_base_centavos: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        rate_bps_snapshot: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        amount_centavos: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        currency: {
            type: DataTypes.STRING(3),
            allowNull: false,
            defaultValue: 'PHP'
        },
        status: {
            type: DataTypes.ENUM('pending', 'earned', 'reversed', 'paid'),
            allowNull: false,
            defaultValue: 'pending'
        },
        reason: {
            type: DataTypes.STRING(120),
            allowNull: true
        },
        cashout_id: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        earned_at: {
            type: DataTypes.DATE,
            allowNull: true
        },
        reversed_at: {
            type: DataTypes.DATE,
            allowNull: true
        },
        paid_at: {
            type: DataTypes.DATE,
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'DgfyAffiliateCommission',
        tableName: 'dgfy_affiliate_commissions',
        underscored: true,
        timestamps: true,
        indexes: [
            { unique: true, fields: ['tenant_id', 'order_reference'], name: 'unique_dgfy_affiliate_commissions_tenant_order_reference' },
            { fields: ['dgfy_account_id', 'status'], name: 'idx_dgfy_affiliate_commissions_account_status' },
            { fields: ['enrollment_id', 'status'], name: 'idx_dgfy_affiliate_commissions_enrollment_status' },
            { fields: ['cashout_id'], name: 'idx_dgfy_affiliate_commissions_cashout' }
        ]
    });

    return DgfyAffiliateCommission;
};
