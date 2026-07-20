import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const PosTerminalShift = sequelize.define('PosTerminalShift', {
    pos_terminal_shift_id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    business_date: {
        type: DataTypes.DATEONLY,
        allowNull: false
    },
    terminal_id: {
        type: DataTypes.STRING(100),
        allowNull: false
    },
    location_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    cashier_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    opening_float_amount: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: false,
        defaultValue: 0
    },
    opening_note: {
        type: DataTypes.STRING(255),
        allowNull: true
    },
    opened_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    },
    closing_cash_amount: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: true
    },
    expected_cash_amount: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: true
    },
    cash_variance_amount: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: true
    },
    closing_note: {
        type: DataTypes.STRING(255),
        allowNull: true
    },
    closed_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    closed_by: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    status: {
        type: DataTypes.ENUM('open', 'closed'),
        allowNull: false,
        defaultValue: 'open'
    }
}, {
    tableName: 'pos_terminal_shifts',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        { fields: ['business_date'] },
        { fields: ['terminal_id'] },
        { fields: ['location_id'] },
        { fields: ['cashier_id', 'status'] },
        { fields: ['terminal_id', 'status'] },
        { fields: ['terminal_id', 'location_id', 'status'] }
    ]
});

export default PosTerminalShift;
