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
        { fields: ['z_counter_value'] },
        { fields: ['generated_at'] }
    ]
});

export default PosZReadingSnapshot;
