import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const PosESalesReport = sequelize.define('PosESalesReport', {
    pos_esales_report_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    report_month: {
        type: DataTypes.STRING(7),
        allowNull: false
    },
    status: {
        type: DataTypes.ENUM('generated', 'submitted', 'accepted', 'rejected'),
        allowNull: false,
        defaultValue: 'generated'
    },
    payload: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: {}
    },
    payload_hash: {
        type: DataTypes.STRING(64),
        allowNull: false
    },
    evidence_ref: {
        type: DataTypes.STRING(255),
        allowNull: true
    },
    generated_by: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    submitted_by: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    submitted_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    status_evidence_ref: {
        type: DataTypes.STRING(255),
        allowNull: true
    },
    status_note: {
        type: DataTypes.STRING(500),
        allowNull: true
    }
}, {
    tableName: 'pos_esales_reports',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        { unique: true, fields: ['report_month'] },
        { fields: ['status'] },
        { fields: ['payload_hash'] }
    ]
});

export default PosESalesReport;
