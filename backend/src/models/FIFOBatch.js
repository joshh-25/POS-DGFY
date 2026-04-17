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
  location_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  quantity: {
    type: DataTypes.DECIMAL(24, 12),
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
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  quantity_consumed: {
    type: DataTypes.DECIMAL(24, 12),
    defaultValue: 0
  }
}, {
  tableName: 'fifo_batches',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['item_id'] },
    { fields: ['location_id'] },
    { fields: ['item_id', 'location_id'] }
  ],
  hooks: {
    beforeSave: (batch) => {
      // Validate expiry_date - reject dates before year 2000 (catches Excel epoch dates)
      if (batch.expiry_date) {
        const expiryDate = new Date(batch.expiry_date);
        if (isNaN(expiryDate.getTime()) || expiryDate.getFullYear() < 2000) {
          console.warn(`[FIFOBatch] Invalid expiry_date detected: ${batch.expiry_date}, setting to NULL`);
          batch.expiry_date = null;
        }
      }
    }
  }
});

export default FIFOBatch;

