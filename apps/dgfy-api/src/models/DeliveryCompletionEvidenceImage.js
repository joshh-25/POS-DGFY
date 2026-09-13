import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const DeliveryCompletionEvidenceImage = sequelize.define('DeliveryCompletionEvidenceImage', {
    delivery_completion_evidence_image_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    delivery_completion_evidence_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    file_path: {
        type: DataTypes.STRING(800),
        allowNull: false
    },
    mime_type: {
        type: DataTypes.STRING(120),
        allowNull: false
    },
    file_size_bytes: {
        type: DataTypes.BIGINT,
        allowNull: false
    },
    sha256: {
        type: DataTypes.CHAR(64),
        allowNull: false
    },
    sort_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    }
}, {
    tableName: 'delivery_completion_evidence_images',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        { fields: ['delivery_completion_evidence_id'] }
    ]
});

export default DeliveryCompletionEvidenceImage;
