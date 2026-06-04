import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
    class DgfyCustomerReview extends Model { }

    DgfyCustomerReview.init({
        review_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        dgfy_account_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        activity_id: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        tenant_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        item_id: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        target_type: {
            type: DataTypes.ENUM('product', 'service', 'hospitality_booking', 'fnb_order', 'fnb_item'),
            allowNull: false,
            defaultValue: 'product'
        },
        target_id: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        rating: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        comment: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        status: {
            type: DataTypes.ENUM('pending', 'approved', 'rejected'),
            allowNull: false,
            defaultValue: 'pending'
        },
        submitted_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        },
        reviewed_at: {
            type: DataTypes.DATE,
            allowNull: true
        },
        reviewed_by_admin_id: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        review_note: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        anonymous: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        }
    }, {
        sequelize,
        modelName: 'DgfyCustomerReview',
        tableName: 'dgfy_customer_reviews',
        underscored: true,
        timestamps: true,
        indexes: [
            { fields: ['dgfy_account_id', 'tenant_id', 'item_id'], name: 'idx_dgfy_customer_reviews_account_item' },
            { fields: ['tenant_id', 'item_id', 'status'], name: 'idx_dgfy_customer_reviews_public' },
            { fields: ['dgfy_account_id', 'activity_id', 'target_type', 'target_id'], name: 'idx_dgfy_customer_reviews_account_target' },
            { fields: ['tenant_id', 'target_type', 'target_id', 'status'], name: 'idx_dgfy_customer_reviews_public_target' }
        ]
    });

    return DgfyCustomerReview;
};
