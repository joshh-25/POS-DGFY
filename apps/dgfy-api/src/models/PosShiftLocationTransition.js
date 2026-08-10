import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const PosShiftLocationTransition = sequelize.define('PosShiftLocationTransition', {
    pos_shift_location_transition_id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    from_shift_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    to_shift_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    terminal_id: {
        type: DataTypes.STRING(100),
        allowNull: false
    },
    from_location_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    to_location_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    reason: {
        type: DataTypes.STRING(255),
        allowNull: false
    },
    actor_user_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    idempotency_key: {
        type: DataTypes.STRING(120),
        allowNull: true
    },
    switched_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'pos_shift_location_transitions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        { fields: ['from_shift_id'] },
        { fields: ['to_shift_id'] },
        { fields: ['terminal_id'] },
        { fields: ['actor_user_id'] },
        { fields: ['to_location_id'] },
        { unique: true, fields: ['idempotency_key'] }
    ]
});

export default PosShiftLocationTransition;
