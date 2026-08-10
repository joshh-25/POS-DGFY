import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const FnbModifierGroupLocationAvailability = sequelize.define('FnbModifierGroupLocationAvailability', {
  modifier_group_location_availability_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  modifier_group_id: { type: DataTypes.INTEGER, allowNull: false },
  location_id: { type: DataTypes.INTEGER, allowNull: false },
  is_available: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
}, {
  tableName: 'fnb_modifier_group_location_availability',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['modifier_group_id', 'location_id'], unique: true, name: 'uq_fnb_modifier_group_location' },
    { fields: ['location_id'] }
  ]
});

export default FnbModifierGroupLocationAvailability;
