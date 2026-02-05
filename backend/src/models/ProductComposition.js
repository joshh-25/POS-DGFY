import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const ProductComposition = sequelize.define('ProductComposition', {
  composition_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  product_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  ingredient_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  composition_type: {
    type: DataTypes.ENUM('ingredient', 'packaging'),
    allowNull: false,
    defaultValue: 'ingredient'
  },
  quantity_required: {
    type: DataTypes.DECIMAL(24, 12),
    allowNull: false
  },
  unit_of_measure: {
    type: DataTypes.STRING(50),
    allowNull: true
  }
}, {
  tableName: 'product_composition',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

export default ProductComposition;

