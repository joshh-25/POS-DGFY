import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const FnbModifierOptionLocationAvailability = sequelize.define('FnbModifierOptionLocationAvailability', {
  modifier_option_location_availability_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  modifier_option_id: { type: DataTypes.INTEGER, allowNull: false },
  location_id: { type: DataTypes.INTEGER, allowNull: false },
  is_available: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  is_sold_out: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }
}, {
  tableName: 'fnb_modifier_option_location_availability',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['modifier_option_id', 'location_id'], unique: true, name: 'uq_fnb_modifier_option_location' },
    { fields: ['location_id'] }
  ]
});

export default FnbModifierOptionLocationAvailability;
