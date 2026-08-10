import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const ItemNutrition = sequelize.define('ItemNutrition', {
  nutrition_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  item_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true
  },
  serving_size: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  calories: {
    type: DataTypes.DECIMAL(8, 2),
    allowNull: true
  },
  total_fat: {
    type: DataTypes.DECIMAL(8, 2),
    allowNull: true
  },
  saturated_fat: {
    type: DataTypes.DECIMAL(8, 2),
    allowNull: true
  },
  cholesterol: {
    type: DataTypes.DECIMAL(8, 2),
    allowNull: true
  },
  sodium: {
    type: DataTypes.DECIMAL(8, 2),
    allowNull: true
  },
  total_carbohydrates: {
    type: DataTypes.DECIMAL(8, 2),
    allowNull: true
  },
  dietary_fiber: {
    type: DataTypes.DECIMAL(8, 2),
    allowNull: true
  },
  sugars: {
    type: DataTypes.DECIMAL(8, 2),
    allowNull: true
  },
  protein: {
    type: DataTypes.DECIMAL(8, 2),
    allowNull: true
  }
}, {
  tableName: 'item_nutrition',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

export default ItemNutrition;

