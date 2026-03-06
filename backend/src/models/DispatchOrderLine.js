import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const DispatchOrderLine = sequelize.define('DispatchOrderLine', {
    line_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    do_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    item_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    qty_ordered: {
        type: DataTypes.DECIMAL(24, 12),
        allowNull: false
    },
    qty_dispatched: {
        type: DataTypes.DECIMAL(24, 12),
        allowNull: false,
        defaultValue: 0
    },
    qty_voided: {
        type: DataTypes.DECIMAL(24, 12),
        allowNull: false,
        defaultValue: 0,
        comment: 'Tracks quantity voided after dispatch for audit trail'
    },
    unit_of_measure: {
        type: DataTypes.STRING(50),
        allowNull: true
    },
    cost_per_unit: {
        type: DataTypes.DECIMAL(10, 4),
        allowNull: true,
        comment: 'Snapshot of cost at dispatch time for COGS tracking'
    },
    batch_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'Primary FIFO/FEFO batch consumed for this line'
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true
    }
}, {
    tableName: 'dispatch_order_lines',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        { fields: ['do_id'] },
        { fields: ['item_id'] },
        { fields: ['do_id', 'item_id'] }
    ]
});

export default DispatchOrderLine;
