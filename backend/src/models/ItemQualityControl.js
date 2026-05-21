import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const ItemQualityControl = sequelize.define('ItemQualityControl', {
  qc_id: {
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
  test_frequency: {
    type: DataTypes.ENUM('every_batch', 'daily', 'weekly', 'bi_weekly', 'monthly', 'quarterly'),
    allowNull: true
  },
  sampling_plan: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  acceptance_criteria: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  corrective_actions: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'item_quality_control',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

export default ItemQualityControl;
