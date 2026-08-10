import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
    class DgfyAffiliateAttribution extends Model { }

    DgfyAffiliateAttribution.init({
        attribution_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        tenant_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        enrollment_id: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        channel: {
            type: DataTypes.ENUM('in_store', 'qr', 'link'),
            allowNull: false,
            defaultValue: 'in_store'
        },
        store_slug: {
            type: DataTypes.STRING(160),
            allowNull: true
        },
        visitor_fingerprint: {
            type: DataTypes.STRING(128),
            allowNull: true
        },
        dgfy_account_id: {
            type: DataTypes.UUID,
            allowNull: true
        },
        pos_transaction_id: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        occurred_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        }
    }, {
        sequelize,
        modelName: 'DgfyAffiliateAttribution',
        tableName: 'dgfy_affiliate_attributions',
        underscored: true,
        timestamps: true,
        indexes: [
            { fields: ['tenant_id', 'enrollment_id', 'occurred_at'], name: 'idx_dgfy_affiliate_attributions_tenant_enrollment_time' },
            { fields: ['tenant_id', 'occurred_at'], name: 'idx_dgfy_affiliate_attributions_tenant_time' }
        ]
    });

    return DgfyAffiliateAttribution;
};
