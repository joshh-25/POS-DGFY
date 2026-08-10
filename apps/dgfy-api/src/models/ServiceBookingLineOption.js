import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const ServiceBookingLineOption = sequelize.define('ServiceBookingLineOption', {
  line_option_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  booking_line_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  option_group_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  option_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  group_name_snapshot: {
    type: DataTypes.STRING(160),
    allowNull: false
  },
  option_name_snapshot: {
    type: DataTypes.STRING(160),
    allowNull: false
  },
  group_type_snapshot: {
    type: DataTypes.STRING(40),
    allowNull: false,
    defaultValue: 'addon'
  },
  price_adjustment_snapshot_centavos: {
    type: DataTypes.BIGINT,
    allowNull: false,
    defaultValue: 0
  },
  duration_adjustment_snapshot_minutes: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  tax_snapshot: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  linked_physical_item_id_snapshot: {
    type: DataTypes.INTEGER,
    allowNull: true
  }
}, {
  tableName: 'service_booking_line_options',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  indexes: [
    { name: 'idx_svc_booking_line_opts_line', fields: ['booking_line_id'] }
  ]
});

export default ServiceBookingLineOption;
