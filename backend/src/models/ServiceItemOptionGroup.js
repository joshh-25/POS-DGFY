import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const ServiceItemOptionGroup = sequelize.define('ServiceItemOptionGroup', {
  item_group_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  service_item_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  option_group_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  tenant_id: {
    type: DataTypes.STRING(80),
    allowNull: true
  },
  display_order: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  }
}, {
  tableName: 'service_item_option_groups',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { name: 'unique_service_item_option_group', unique: true, fields: ['service_item_id', 'option_group_id'] }
  ]
});

export default ServiceItemOptionGroup;
