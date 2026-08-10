import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const FnbDiningArea = sequelize.define('FnbDiningArea', {
  dining_area_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(120),
    allowNull: false
  },
  service_type: {
    type: DataTypes.ENUM('dine_in', 'outdoor', 'bar', 'private_room'),
    allowNull: false,
    defaultValue: 'dine_in'
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  sort_order: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  }
}, {
  tableName: 'fnb_dining_areas',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['is_active'] },
    { fields: ['sort_order'] }
  ]
});

export default FnbDiningArea;
