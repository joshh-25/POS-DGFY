import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const PosFiscalPrintEvent = sequelize.define('PosFiscalPrintEvent', {
    pos_fiscal_print_event_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    pos_transaction_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    print_type: {
        type: DataTypes.ENUM('original', 'reprint'),
        allowNull: false
    },
    print_sequence: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    reason: {
        type: DataTypes.STRING(255),
        allowNull: true
    },
    fiscal_document_hash: {
        type: DataTypes.STRING(64),
        allowNull: true
    },
    actor_user_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    printed_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'pos_fiscal_print_events',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
        { fields: ['pos_transaction_id'] },
        { fields: ['print_type'] },
        { fields: ['printed_at'] }
    ]
});

export default PosFiscalPrintEvent;
