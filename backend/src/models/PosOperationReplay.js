import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const PosOperationReplay = sequelize.define('PosOperationReplay', {
    pos_operation_replay_id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    operation_key: {
        type: DataTypes.STRING(80),
        allowNull: false
    },
    idempotency_key: {
        type: DataTypes.STRING(120),
        allowNull: false
    },
    request_hash: {
        type: DataTypes.STRING(64),
        allowNull: false
    },
    replay_status: {
        type: DataTypes.ENUM('processed', 'blocked'),
        allowNull: false,
        defaultValue: 'processed'
    },
    response_payload: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: {}
    },
    created_by: {
        type: DataTypes.INTEGER,
        allowNull: true
    }
}, {
    tableName: 'pos_operation_replays',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        {
            unique: true,
            fields: ['operation_key', 'idempotency_key']
        },
        { fields: ['created_at'] }
    ]
});

export default PosOperationReplay;
