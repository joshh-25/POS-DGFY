
import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
    class WebhookLog extends Model { }

    WebhookLog.init({
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        webhook_id: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true
        },
        event_type: {
            type: DataTypes.STRING,
            allowNull: false
        },
        resource_id: {
            type: DataTypes.STRING,
            allowNull: true
        },
        status: {
            type: DataTypes.ENUM('processed', 'failed', 'pending'),
            defaultValue: 'pending'
        },
        error_message: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        processed_at: {
            type: DataTypes.DATE,
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'WebhookLog',
        tableName: 'webhook_logs',
        underscored: true,
        timestamps: true
    });

    return WebhookLog;
};
