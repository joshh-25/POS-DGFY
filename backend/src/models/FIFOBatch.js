import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const FIFOBatch = sequelize.define('FIFOBatch', {
  batch_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  item_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  quantity: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false
  },
  cost_per_unit: {
    type: DataTypes.DECIMAL(10, 4),
    allowNull: true
  },
  received_date: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  expiry_date: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  po_number: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  quantity_consumed: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0
  }
}, {
  tableName: 'fifo_batches',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

export default FIFOBatch;

