import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const BusinessAdminSavedReportView = sequelize.define('BusinessAdminSavedReportView', {
    business_admin_saved_report_view_id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    report_key: { type: DataTypes.STRING(60), allowNull: false, defaultValue: 'pos_operations' },
    name: { type: DataTypes.STRING(100), allowNull: false },
    filters: { type: DataTypes.JSON, allowNull: false, defaultValue: {} }
}, {
    tableName: 'business_admin_saved_report_views',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        { name: 'uq_business_admin_saved_report_view_name', unique: true, fields: ['user_id', 'report_key', 'name'] },
        { name: 'idx_business_admin_saved_report_view_user_updated', fields: ['user_id', 'report_key', 'updated_at'] }
    ]
});

export default BusinessAdminSavedReportView;
