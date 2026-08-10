import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const ItemPhysicalProperties = sequelize.define('ItemPhysicalProperties', {
  property_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  item_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true
  },
  texture: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  color: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  viscosity: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  ph_level: {
    type: DataTypes.DECIMAL(3, 2),
    allowNull: true,
    validate: {
      min: 0,
      max: 14
    }
  },
  water_activity: {
    type: DataTypes.DECIMAL(4, 3),
    allowNull: true,
    validate: {
      min: 0,
      max: 1
    }
  }
}, {
  tableName: 'item_physical_properties',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

export default ItemPhysicalProperties;
