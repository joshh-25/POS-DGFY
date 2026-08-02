import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const ServiceOption = sequelize.define('ServiceOption', {
  option_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  group_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  tenant_id: {
    type: DataTypes.STRING(80),
    allowNull: true
  },
  name: {
    type: DataTypes.STRING(160),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  price_adjustment_centavos: {
    type: DataTypes.BIGINT,
    allowNull: false,
    defaultValue: 0
  },
  duration_adjustment_minutes: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  linked_physical_item_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  display_order: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    allowNull: false,
    defaultValue: 'active'
  }
}, {
  tableName: 'service_options',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { name: 'idx_service_options_group_status', fields: ['group_id', 'status'] },
    { name: 'idx_service_options_linked_item', fields: ['linked_physical_item_id'] }
  ]
});

export default ServiceOption;
