import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const StockMovement = sequelize.define('StockMovement', {
  movement_id: {
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
  source_location_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  destination_location_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  movement_type: {
    type: DataTypes.ENUM('production_consumption', 'purchase_receipt', 'return', 'transfer', 'calculated_loss', 'adjustment', 'production_output', 'goods_issue'),
    allowNull: false
  },
  quantity: {
    type: DataTypes.DECIMAL(24, 12),
    allowNull: false
  },
  from_location: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  to_location: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  reference_id: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  reference_type: {
    type: DataTypes.ENUM('PO', 'JO', 'MANUAL', 'RETURN', 'DO', 'POS'),
    defaultValue: 'MANUAL'
  },
  user_responsible: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  loss_reason: {
    type: DataTypes.ENUM('waste', 'spoilage', 'damage', 'pilferage'),
    allowNull: true
  },
  weighted_average_cost: {
    type: DataTypes.DECIMAL(10, 4),
    allowNull: true
  },
  timestamp: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  batch_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Reference to the FIFO batch affected by this movement'
  },
  expiry_date: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    comment: 'Expiry date for manual stock additions'
  }
}, {
  tableName: 'stock_movements',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  indexes: [
    { fields: ['item_id'] },
    { fields: ['location_id'] },
    { fields: ['source_location_id'] },
    { fields: ['destination_location_id'] },
    { fields: ['movement_type'] },
    { fields: ['timestamp'] },
    { fields: ['item_id', 'movement_type', 'timestamp'] },
  ],
});

export default StockMovement;

