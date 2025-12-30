import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const Item = sequelize.define('Item', {
  item_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  sku_code: {
    type: DataTypes.STRING(50),
    allowNull: true,
    unique: false
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  category: {
    type: DataTypes.ENUM('ingredient', 'product', 'packaging'),
    allowNull: true
  },
  product_folder: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  current_stock: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0,
    validate: {
      min: 0
    }
  },
  max_capacity: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true
  },
  min_threshold: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true
  },
  purchase_allowance: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true
  },
  unit_of_measure: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  cost_per_unit: {
    type: DataTypes.DECIMAL(10, 4),
    allowNull: true
  },
  fifo_enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  batch_size: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true
  },
  yield_percentage: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true
  },
  processing_loss: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true
  },
  production_notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  packaging_specs: {
    type: DataTypes.JSON,
    allowNull: true,
    get() {
      const rawValue = this.getDataValue('packaging_specs');
      if (!rawValue) return null;
      if (typeof rawValue === 'string') {
        try {
          return JSON.parse(rawValue);
        } catch (e) {
          return null;
        }
      }
      return rawValue;
    }
  },
  status: {
    type: DataTypes.ENUM('draft', 'active', 'inactive'),
    defaultValue: 'active'
  },
  wizard_metadata: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Stores wizard progress for draft products',
    get() {
      const rawValue = this.getDataValue('wizard_metadata');
      if (!rawValue) return null;
      if (typeof rawValue === 'string') {
        try {
          return JSON.parse(rawValue);
        } catch (e) {
          return null;
        }
      }
      return rawValue;
    }
  }

}, {
  tableName: 'items',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

export default Item;

