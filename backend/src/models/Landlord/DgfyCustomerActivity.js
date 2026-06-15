import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
    class DgfyCustomerActivity extends Model { }

    DgfyCustomerActivity.init({
        activity_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        dgfy_account_id: {
            type: DataTypes.UUID,
            allowNull: true
        },
        tenant_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        store_customer_id: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        activity_type: {
            type: DataTypes.ENUM('order', 'service_booking', 'hospitality_booking', 'fnb_order'),
            allowNull: false,
            defaultValue: 'order'
        },
        reference: {
            type: DataTypes.STRING(80),
            allowNull: false
        },
        store_slug: {
            type: DataTypes.STRING(160),
            allowNull: true
        },
        store_name: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        status: {
            type: DataTypes.STRING(60),
            allowNull: true
        },
        status_label: {
            type: DataTypes.STRING(120),
            allowNull: true
        },
        payment_status: {
            type: DataTypes.STRING(60),
            allowNull: true
        },
        total_amount: {
            type: DataTypes.DECIMAL(14, 4),
            allowNull: true
        },
        currency: {
            type: DataTypes.STRING(12),
            allowNull: false,
            defaultValue: 'PHP'
        },
        customer_email: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        customer_phone: {
            type: DataTypes.STRING(80),
            allowNull: true
        },
        display_snapshot: {
            type: DataTypes.JSON,
            allowNull: true
        },
        occurred_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        }
    }, {
        sequelize,
        modelName: 'DgfyCustomerActivity',
        tableName: 'dgfy_customer_activities',
        underscored: true,
        timestamps: true,
        indexes: [
            { fields: ['dgfy_account_id', 'occurred_at'], name: 'idx_dgfy_customer_activities_account_time' },
            { unique: true, fields: ['tenant_id', 'activity_type', 'reference'], name: 'unique_dgfy_customer_activity_reference' },
            { fields: ['customer_email'], name: 'idx_dgfy_customer_activities_email' },
            { fields: ['customer_phone'], name: 'idx_dgfy_customer_activities_phone' }
        ]
    });

    return DgfyCustomerActivity;
};
