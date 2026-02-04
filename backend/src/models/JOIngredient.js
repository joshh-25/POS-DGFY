import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const JOIngredient = sequelize.define('JOIngredient', {
  jo_ingredient_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  jo_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  item_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  quantity_required: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false
  },
  unit_of_measure: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Recipe UOM used for quantity_required'
  },
  quantity_consumed: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true
  },
  stock_before: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true
  },
  stock_after: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true
  },
  batch_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Reference to the FIFO batch that was consumed'
  }
}, {
  tableName: 'jo_ingredients',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false
});

export default JOIngredient;

