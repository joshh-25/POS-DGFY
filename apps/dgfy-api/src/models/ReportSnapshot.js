import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const ReportSnapshot = sequelize.define('ReportSnapshot', {
    snapshot_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    report_type: {
        type: DataTypes.ENUM('expiry', 'stock_aging', 'production', 'po_analysis', 'executive_summary'),
        allowNull: false
    },
    report_name: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: 'Optional custom name for the snapshot'
    },
    snapshot_data: {
        type: DataTypes.JSON,
        allowNull: false,
        comment: 'Full report data at time of snapshot'
    },
    summary_metrics: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: 'Key metrics for quick preview'
    },
    date_range_start: {
        type: DataTypes.DATEONLY,
        allowNull: true
    },
    date_range_end: {
        type: DataTypes.DATEONLY,
        allowNull: true
    },
    created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
            model: 'users',
            key: 'user_id'
        }
    }
}, {
    tableName: 'report_snapshots',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false
});

export default ReportSnapshot;
