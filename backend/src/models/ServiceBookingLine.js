import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const ServiceBookingLine = sequelize.define('ServiceBookingLine', {
  booking_line_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  booking_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  line_type: {
    type: DataTypes.ENUM('service', 'part'),
    allowNull: false,
    defaultValue: 'service'
  },
  item_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  name_snapshot: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  quantity: {
    type: DataTypes.DECIMAL(24, 12),
    allowNull: false,
    defaultValue: 1
  },
  unit_price: {
    type: DataTypes.DECIMAL(14, 4),
    allowNull: false,
    defaultValue: 0
  },
  line_amount: {
    type: DataTypes.DECIMAL(14, 4),
    allowNull: false,
    defaultValue: 0
  },
  vat_type_snapshot: {
    type: DataTypes.ENUM('vatable', 'vat_exempt', 'zero_rated'),
    allowNull: false,
    defaultValue: 'vatable'
  },
  stock_effect_type: {
    type: DataTypes.ENUM('inventory_issue', 'stock_exempt'),
    allowNull: false,
    defaultValue: 'stock_exempt'
  },
  stock_exempt_reason: {
    type: DataTypes.STRING(80),
    allowNull: true
  },
  stock_movement_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  pos_transaction_line_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  }
}, {
  tableName: 'service_booking_lines',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['booking_id'] },
    { fields: ['item_id'] },
    { fields: ['line_type'] },
    { fields: ['pos_transaction_line_id'] }
  ]
});

export default ServiceBookingLine;
