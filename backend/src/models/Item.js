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
    type: DataTypes.ENUM('raw_material', 'packaging', 'product', 'supplies'),
    allowNull: false
  },
  product_type: {
    type: DataTypes.ENUM('work_in_progress', 'finished_goods'),
    allowNull: true,
    validate: {
      isValidProductType(value) {
        // Skip validation if status is draft (allows saving incomplete work)
        if (this.status === 'draft') return;

        // product_type is required when category is 'product'
        if (this.category === 'product' && !value) {
          throw new Error('product_type is required when category is "product"');
        }
        // product_type must be null/undefined for non-product categories
        if (this.category !== 'product' && value !== null && value !== undefined) {
          throw new Error('product_type must be null for non-product categories');
        }
      }
    }
  },
  product_folder: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  folder_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'item_folders',
      key: 'folder_id'
    }
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  current_stock: {
    type: DataTypes.DECIMAL(24, 12),
    defaultValue: 0,
    validate: {
      min: 0
    }
  },
  max_capacity: {
    type: DataTypes.DECIMAL(24, 12),
    allowNull: true
  },
  min_threshold: {
    type: DataTypes.DECIMAL(24, 12),
    allowNull: true
  },
  purchase_allowance: {
    type: DataTypes.DECIMAL(24, 12),
    allowNull: true
  },
  unit_of_measure: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  cost_per_unit: {
    type: DataTypes.DECIMAL(10, 4),
    allowNull: true,
    validate: {
      min: 0
    }
  },
  default_sale_price: {
    type: DataTypes.DECIMAL(10, 4),
    allowNull: true,
    validate: {
      min: 0
    },
    comment: 'Last-used sale price. Auto-updated from DO dispatches. Defaults to cost_per_unit on first use.'
  },
  vat_type: {
    type: DataTypes.ENUM('vatable', 'vat_exempt', 'zero_rated'),
    allowNull: false,
    defaultValue: 'vatable',
    comment: 'Default VAT classification used by POS and snapshotted at transaction-line level'
  },
  fifo_enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  shelf_life_days: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Shelf life in days for unopened items (optional - used for expiry tracking when fifo_enabled is true)'
  },
  opened_shelf_life_days: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Shelf life in days after opening'
  },
  batch_size: {
    type: DataTypes.DECIMAL(24, 12),
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
        } catch {
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
  nesting_level: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
    comment: '0=raw ingredient, 1-3=nested product levels'
  },
  max_child_depth: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0
  },
  is_leaf_node: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
    defaultValue: true
  },
  composition_hash: {
    type: DataTypes.STRING(64),
    allowNull: true
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
        } catch {
          return null;
        }
      }
      return rawValue;
    }
  },
  deleted_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'user_id'
    }
  },
  deleted_at: {
    type: DataTypes.DATE,
    allowNull: true
  }

}, {
  tableName: 'items',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['sku_code'] },
    { fields: ['category'] },
    { fields: ['folder_id'] },
    { fields: ['deleted_at'] },
    { fields: ['status'] },
  ]
});

export default Item;

