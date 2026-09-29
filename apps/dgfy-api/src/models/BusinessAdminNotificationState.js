import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const BusinessAdminNotificationState = sequelize.define('BusinessAdminNotificationState', {
    business_admin_notification_state_id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    business_admin_alert_snapshot_id: { type: DataTypes.INTEGER, allowNull: false },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    read_at: { type: DataTypes.DATE, allowNull: true },
    dismissed_at: { type: DataTypes.DATE, allowNull: true }
}, {
    tableName: 'business_admin_notification_states', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at',
    indexes: [
        { name: 'uq_business_admin_notification_state_alert_user', unique: true, fields: ['business_admin_alert_snapshot_id', 'user_id'] },
        { name: 'idx_business_admin_notification_state_user_unread', fields: ['user_id', 'read_at', 'dismissed_at'] }
    ]
});

export default BusinessAdminNotificationState;
