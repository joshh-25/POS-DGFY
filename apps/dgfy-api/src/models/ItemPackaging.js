import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const ItemPackaging = sequelize.define('ItemPackaging', {
  packaging_id: {
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
  primary_packaging: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  secondary_packaging: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  packaging_material: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  net_weight: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  label_compliance: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
    defaultValue: false
  }
}, {
  tableName: 'item_packaging',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

export default ItemPackaging;
