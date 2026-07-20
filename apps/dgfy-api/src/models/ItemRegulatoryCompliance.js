import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const ItemRegulatoryCompliance = sequelize.define('ItemRegulatoryCompliance', {
  compliance_id: {
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
  fda_approved: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
    defaultValue: false
  },
  gmp_compliant: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
    defaultValue: false
  },
  haccp_plan: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
    defaultValue: false
  },
  organic_certified: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
    defaultValue: false
  },
  kosher_certified: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
    defaultValue: false
  },
  halal_certified: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
    defaultValue: false
  }
}, {
  tableName: 'item_regulatory_compliance',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

export default ItemRegulatoryCompliance;
