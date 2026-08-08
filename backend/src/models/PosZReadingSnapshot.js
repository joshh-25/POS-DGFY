import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const PosZReadingSnapshot = sequelize.define('PosZReadingSnapshot', {
    pos_z_reading_snapshot_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    business_date: {
        type: DataTypes.DATEONLY,
        allowNull: false
    },
    location_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    reading_identifier: {
        type: DataTypes.STRING(80),
        allowNull: false,
        unique: true
    },
    z_counter_value: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false
    },
    reset_counter_value: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false
    },
    lifetime_grand_total_cents: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false
    },
    summary: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: {}
    },
    closed_by_user_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    closed_from_terminal_id: {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    day_close_pin_confirmed_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    generated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'pos_z_reading_snapshots',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
        { fields: ['business_date'] },
        {
            unique: true,
            fields: ['business_date', 'location_id'],
            name: 'uq_pos_z_reading_snapshots_business_date_location'
        },
        { fields: ['closed_by_user_id'] },
        { fields: ['z_counter_value'] },
        { fields: ['generated_at'] }
    ]
});

export default PosZReadingSnapshot;
