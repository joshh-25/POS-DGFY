import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const ServiceOptionGroup = sequelize.define('ServiceOptionGroup', {
  group_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
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
  group_type: {
    type: DataTypes.ENUM('variation', 'addon'),
    allowNull: false,
    defaultValue: 'addon'
  },
  selection_type: {
    type: DataTypes.ENUM('single', 'multi'),
    allowNull: false,
    defaultValue: 'single'
  },
  min_selections: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  max_selections: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1
  },
  is_required: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
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
  tableName: 'service_option_groups',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { name: 'idx_service_option_groups_status', fields: ['status'] }
  ]
});

export default ServiceOptionGroup;
