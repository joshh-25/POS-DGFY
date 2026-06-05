import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const PosFiscalEvent = sequelize.define('PosFiscalEvent', {
    pos_fiscal_event_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    pos_transaction_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    event_type: {
        type: DataTypes.ENUM(
            'checkout_issued',
            'print_original',
            'print_reprint',
            'void',
            'reversal',
            'x_reading',
            'z_reading',
            'esales_export',
            'terminal_registration',
            'governed_reset'
        ),
        allowNull: false
    },
    document_type: {
        type: DataTypes.STRING(40),
        allowNull: true
    },
    invoice_number: {
        type: DataTypes.STRING(50),
        allowNull: true
    },
    terminal_id: {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    event_sequence: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        unique: true
    },
    event_hash: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true
    },
    previous_event_hash: {
        type: DataTypes.STRING(64),
        allowNull: true
    },
    payload: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: {}
    },
    actor_user_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    occurred_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'pos_fiscal_events',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
        { fields: ['pos_transaction_id'] },
        { fields: ['event_type'] },
        { unique: true, fields: ['event_sequence'] },
        { fields: ['invoice_number'] },
        { fields: ['terminal_id'] },
        { fields: ['occurred_at'] }
    ]
});

export default PosFiscalEvent;
