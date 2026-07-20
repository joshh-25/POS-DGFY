import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const ReceiveToken = sequelize.define('ReceiveToken', {
    token_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    token_hash: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true,
        comment: 'SHA-256 hash of the actual token'
    },
    token_type: {
        type: DataTypes.ENUM('PO', 'JO'),
        allowNull: false
    },
    order_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'References purchase_orders.po_id or job_orders.jo_id based on token_type'
    },
    expires_at: {
        type: DataTypes.DATE,
        allowNull: false
    },
    used_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    used_by: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    created_by: {
        type: DataTypes.INTEGER,
        allowNull: false
    }
}, {
    tableName: 'receive_tokens',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false
});

export default ReceiveToken;
