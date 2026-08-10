import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const StorefrontCatalogOverride = sequelize.define('StorefrontCatalogOverride', {
  storefront_catalog_override_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  item_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    references: {
      model: 'items',
      key: 'item_id'
    }
  },
  storefront_visible: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  storefront_image_path: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  storefront_image_url: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  storefront_image_gallery: {
    type: DataTypes.JSON,
    allowNull: true
  },
  image_fingerprint: {
    type: DataTypes.STRING(64),
    allowNull: true
  },
  optimization_version: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  processing_status: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  variant_metadata: {
    type: DataTypes.JSON,
    allowNull: true
  }
}, {
  tableName: 'storefront_catalog_overrides',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['item_id'], unique: true }
  ]
});

export default StorefrontCatalogOverride;
