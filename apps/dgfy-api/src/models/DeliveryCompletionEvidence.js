import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const DeliveryCompletionEvidence = sequelize.define('DeliveryCompletionEvidence', {
    delivery_completion_evidence_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    delivery_job_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true
    },
    signature_file_path: {
        type: DataTypes.STRING(800),
        allowNull: true
    },
    signature_mime_type: {
        type: DataTypes.STRING(120),
        allowNull: true
    },
    signature_file_size_bytes: {
        type: DataTypes.BIGINT,
        allowNull: true
    },
    signature_sha256: {
        type: DataTypes.CHAR(64),
        allowNull: true
    },
    attached_by: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    attached_at: {
        type: DataTypes.DATE,
        allowNull: false
    }
}, {
    tableName: 'delivery_completion_evidence',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        { fields: ['delivery_job_id'], unique: true }
    ]
});

export default DeliveryCompletionEvidence;
