import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const ServiceProviderAssignment = sequelize.define('ServiceProviderAssignment', {
  assignment_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  item_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  resource_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  location_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  }
}, {
  tableName: 'service_provider_assignments',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['item_id'] },
    { fields: ['user_id'] },
    { fields: ['resource_id'] },
    { fields: ['location_id'] },
    { fields: ['is_active'] }
  ]
});

export default ServiceProviderAssignment;
