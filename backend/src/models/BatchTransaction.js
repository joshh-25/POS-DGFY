import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const BatchTransaction = sequelize.define('BatchTransaction', {
  transaction_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  movement_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  batch_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  quantity_consumed: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false
  },
  remaining_after: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true
  },
  cost_per_unit: {
    type: DataTypes.DECIMAL(10, 4),
    allowNull: true
  }
}, {
  tableName: 'batch_transactions',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false
});

export default BatchTransaction;

