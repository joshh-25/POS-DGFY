import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
    class DgfyReviewInvite extends Model { }

    DgfyReviewInvite.init({
        invite_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        tenant_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        activity_id: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        tracking_pin: {
            type: DataTypes.STRING(24),
            allowNull: false
        },
        target_type: {
            type: DataTypes.ENUM('product', 'service', 'hospitality_booking', 'fnb_order', 'fnb_item'),
            allowNull: false,
            defaultValue: 'fnb_item'
        },
        target_id: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        item_name: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        delivery_channel: {
            type: DataTypes.ENUM('tracking', 'order_success', 'qr', 'receipt'),
            allowNull: false,
            defaultValue: 'tracking'
        },
        token_hash: {
            type: DataTypes.STRING(128),
            allowNull: false
        },
        status: {
            type: DataTypes.ENUM('issued', 'opened', 'submitted', 'expired', 'revoked'),
            allowNull: false,
            defaultValue: 'issued'
        },
        opened_at: {
            type: DataTypes.DATE,
            allowNull: true
        },
        expires_at: {
            type: DataTypes.DATE,
            allowNull: false
        },
        submitted_review_id: {
            type: DataTypes.INTEGER,
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'DgfyReviewInvite',
        tableName: 'dgfy_review_invites',
        underscored: true,
        timestamps: true,
        indexes: [
            { fields: ['tenant_id', 'tracking_pin'], name: 'idx_dgfy_review_invites_tracking' },
            { fields: ['tenant_id', 'target_type', 'target_id', 'status'], name: 'idx_dgfy_review_invites_target' },
            { fields: ['token_hash'], unique: true, name: 'uq_dgfy_review_invites_token_hash' },
            { fields: ['activity_id', 'target_type', 'target_id'], name: 'idx_dgfy_review_invites_activity_target' }
        ]
    });

    return DgfyReviewInvite;
};
