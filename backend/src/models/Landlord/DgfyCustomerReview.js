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
            allowNull: false
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
        }
    }, {
        sequelize,
        modelName: 'DgfyCustomerReview',
        tableName: 'dgfy_customer_reviews',
        underscored: true,
        timestamps: true,
        indexes: [
            { fields: ['dgfy_account_id', 'tenant_id', 'item_id'], name: 'idx_dgfy_customer_reviews_account_item' },
            { fields: ['tenant_id', 'item_id', 'status'], name: 'idx_dgfy_customer_reviews_public' }
        ]
    });

    return DgfyCustomerReview;
};
