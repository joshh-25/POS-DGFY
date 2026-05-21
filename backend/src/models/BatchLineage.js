import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const BatchLineage = sequelize.define('BatchLineage', {
    lineage_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
    },
    parent_batch_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'fifo_batches',
            key: 'batch_id'
        },
        comment: 'Batch of produced product'
    },
    child_batch_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'fifo_batches',
            key: 'batch_id'
        },
        comment: 'Batch of consumed ingredient/sub-product'
    },
    quantity_consumed: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        comment: 'Quantity of child batch consumed'
    },
    jo_number: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: 'Job order that created this lineage'
    }
}, {
    tableName: 'batch_lineage',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false // No updated_at for lineage records
});

export default BatchLineage;
