import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const UserLocationGrant = sequelize.define('UserLocationGrant', {
  user_location_grant_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  location_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  created_by: {
    type: DataTypes.INTEGER,
    allowNull: true
  }
}, {
  tableName: 'user_location_grants',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  indexes: [
    { unique: true, fields: ['user_id', 'location_id'] },
    { fields: ['user_id'] },
    { fields: ['location_id'] }
  ]
});

export default UserLocationGrant;
