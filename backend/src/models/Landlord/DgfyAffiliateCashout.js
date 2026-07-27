import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
    class DgfyAffiliateCashout extends Model { }

    DgfyAffiliateCashout.init({
        cashout_id: {
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
        payout_method_id: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        payout_snapshot: {
            type: DataTypes.JSON,
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
            type: DataTypes.ENUM('requested', 'approved', 'paid', 'rejected', 'cancelled'),
            allowNull: false,
            defaultValue: 'requested'
        },
        requested_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        },
        approved_at: {
            type: DataTypes.DATE,
            allowNull: true
        },
        paid_at: {
            type: DataTypes.DATE,
            allowNull: true
        },
        rejected_at: {
            type: DataTypes.DATE,
            allowNull: true
        },
        // Tenant staff user who approved (tenant-DB User - value link only, no FK).
        approved_by_user_id: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        external_payment_ref: {
            type: DataTypes.STRING(160),
            allowNull: true
        },
        rejection_reason: {
            type: DataTypes.STRING(500),
            allowNull: true
        },
        // Forward-compatibility only - NULL today, would become 'paymongo' once automated
        // disbursement drives this same approved -> paid transition.
        disbursement_provider: {
            type: DataTypes.STRING(40),
            allowNull: true
        },
        disbursement_payload: {
            type: DataTypes.JSON,
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'DgfyAffiliateCashout',
        tableName: 'dgfy_affiliate_cashouts',
        underscored: true,
        timestamps: true,
        indexes: [
            { fields: ['tenant_id', 'status'], name: 'idx_dgfy_affiliate_cashouts_tenant_status' },
            { fields: ['dgfy_account_id', 'status'], name: 'idx_dgfy_affiliate_cashouts_account_status' },
            { fields: ['enrollment_id', 'status'], name: 'idx_dgfy_affiliate_cashouts_enrollment_status' }
        ]
    });

    return DgfyAffiliateCashout;
};
