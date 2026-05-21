import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';
import {
  BARCODE_PACKAGING_LEVELS,
  BARCODE_SCOPES,
  BARCODE_SOURCES,
  BARCODE_SYMBOLOGIES
} from '../modules/shared/utils/barcodePolicy.js';

const ItemBarcode = sequelize.define('ItemBarcode', {
  item_barcode_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  item_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'items',
      key: 'item_id'
    }
  },
  code: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  normalized_code: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  symbology: {
    type: DataTypes.ENUM(...BARCODE_SYMBOLOGIES),
    allowNull: false,
    defaultValue: 'unknown'
  },
  source: {
    type: DataTypes.ENUM(...BARCODE_SOURCES),
    allowNull: false,
    defaultValue: 'manufacturer'
  },
  scope: {
    type: DataTypes.ENUM(...BARCODE_SCOPES),
    allowNull: false,
    defaultValue: 'inventory'
  },
  packaging_level: {
    type: DataTypes.ENUM(...BARCODE_PACKAGING_LEVELS),
    allowNull: false,
    defaultValue: 'unit'
  },
  quantity_multiplier: {
    type: DataTypes.DECIMAL(12, 4),
    allowNull: false,
    defaultValue: 1
  },
  is_primary: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  metadata: {
    type: DataTypes.JSON,
    allowNull: true
  },
  created_by: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  updated_by: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  deactivated_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  deactivated_by: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  active_normalized_code: {
    type: DataTypes.STRING(255),
    allowNull: true
  }
}, {
  tableName: 'item_barcodes',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['item_id'] },
    { fields: ['normalized_code'] },
    { fields: ['scope'] },
    { fields: ['is_active'] },
    { fields: ['active_normalized_code'], unique: true }
  ]
});

export default ItemBarcode;
