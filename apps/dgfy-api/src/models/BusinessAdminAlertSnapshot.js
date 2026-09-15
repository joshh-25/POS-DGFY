import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const BusinessAdminAlertSnapshot = sequelize.define('BusinessAdminAlertSnapshot', {
    business_admin_alert_snapshot_id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    alert_key: { type: DataTypes.STRING(128), allowNull: false, unique: true },
    alert_type: { type: DataTypes.STRING(80), allowNull: false },
    severity: { type: DataTypes.STRING(20), allowNull: false },
    message: { type: DataTypes.STRING(500), allowNull: false },
    source_domain: { type: DataTypes.STRING(80), allowNull: false, defaultValue: 'operations' },
    source_entity_type: { type: DataTypes.STRING(80), allowNull: true },
    source_entity_id: { type: DataTypes.STRING(120), allowNull: true },
    branch_id: { type: DataTypes.INTEGER, allowNull: true },
    target_route: { type: DataTypes.STRING(500), allowNull: true },
    payload: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
    status: { type: DataTypes.ENUM('open', 'resolved'), allowNull: false, defaultValue: 'open' },
    acknowledged_at: { type: DataTypes.DATE, allowNull: true },
    acknowledged_by: { type: DataTypes.INTEGER, allowNull: true },
    acknowledgement_note: { type: DataTypes.STRING(500), allowNull: true },
    first_detected_at: { type: DataTypes.DATE, allowNull: false },
    last_seen_at: { type: DataTypes.DATE, allowNull: false },
    resolved_at: { type: DataTypes.DATE, allowNull: true }
}, {
    tableName: 'business_admin_alert_snapshots', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at',
    indexes: [
        { name: 'idx_business_admin_alert_status_seen', fields: ['status', 'severity', 'last_seen_at'] },
        { name: 'idx_business_admin_alert_type_status', fields: ['alert_type', 'status'] },
        { name: 'idx_business_admin_alert_branch_status_seen', fields: ['branch_id', 'status', 'last_seen_at'] }
    ]
});

export default BusinessAdminAlertSnapshot;
