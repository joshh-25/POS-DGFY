import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
    class DgfyCustomerNotification extends Model { }

    DgfyCustomerNotification.init({
        notification_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        dgfy_account_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        tenant_id: {
            type: DataTypes.UUID,
            allowNull: true
        },
        activity_id: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        reference: {
            type: DataTypes.STRING(80),
            allowNull: true
        },
        event_key: {
            type: DataTypes.STRING(180),
            allowNull: true,
            unique: true
        },
        type: {
            type: DataTypes.STRING(80),
            allowNull: false,
            defaultValue: 'order_status'
        },
        title: {
            type: DataTypes.STRING(160),
            allowNull: false
        },
        body: {
            type: DataTypes.STRING(500),
            allowNull: true
        },
        status: {
            type: DataTypes.STRING(60),
            allowNull: true
        },
        read_at: {
            type: DataTypes.DATE,
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'DgfyCustomerNotification',
        tableName: 'dgfy_customer_notifications',
        underscored: true,
        timestamps: true,
        indexes: [
            { fields: ['dgfy_account_id', 'created_at'], name: 'idx_dgfy_customer_notifications_account_time' },
            { fields: ['dgfy_account_id', 'read_at'], name: 'idx_dgfy_customer_notifications_account_read' },
            { fields: ['reference'], name: 'idx_dgfy_customer_notifications_reference' },
            { unique: true, fields: ['event_key'], name: 'unique_dgfy_customer_notification_event' }
        ]
    });

    return DgfyCustomerNotification;
};
