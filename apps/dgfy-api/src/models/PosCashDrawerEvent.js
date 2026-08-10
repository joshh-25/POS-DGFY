import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const PosCashDrawerEvent = sequelize.define('PosCashDrawerEvent', {
    pos_cash_drawer_event_id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    pos_terminal_shift_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    event_type: {
        type: DataTypes.ENUM('cash_in', 'cash_out', 'opening_adjustment', 'closing_adjustment'),
        allowNull: false
    },
    amount: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: false
    },
    reason: {
        type: DataTypes.STRING(255),
        allowNull: false
    },
    recorded_by: {
        type: DataTypes.INTEGER,
        allowNull: false
    }
}, {
    tableName: 'pos_cash_drawer_events',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        { fields: ['pos_terminal_shift_id'] },
        { fields: ['event_type'] },
        { fields: ['recorded_by'] }
    ]
});

export default PosCashDrawerEvent;
