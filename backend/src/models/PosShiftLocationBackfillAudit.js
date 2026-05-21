import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const PosShiftLocationBackfillAudit = sequelize.define('PosShiftLocationBackfillAudit', {
    pos_shift_location_backfill_audit_id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    shift_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    previous_location_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    resolved_location_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    resolution_source: {
        type: DataTypes.STRING(64),
        allowNull: false
    },
    resolution_reason: {
        type: DataTypes.STRING(128),
        allowNull: false
    },
    migration_tag: {
        type: DataTypes.STRING(96),
        allowNull: false
    },
    created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'pos_shift_location_backfill_audit',
    timestamps: false,
    indexes: [
        { fields: ['shift_id'] },
        { fields: ['migration_tag'] },
        { fields: ['resolution_source'] }
    ]
});

export default PosShiftLocationBackfillAudit;
