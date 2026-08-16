import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

// Phase 88 of #482, authorized by ADR 0064 decision 4. Closes the no-timestamps gap named in
// ADR 0064's Context: status transitions on ServiceBooking persist no history today. This table
// is additive alongside ServiceBooking.status, which stays the cheap current-state column read -
// nothing writes to this table until Phase 89.
const ServiceBookingStatusEvent = sequelize.define('ServiceBookingStatusEvent', {
  status_event_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  booking_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  from_status: {
    // Nullable: the first event, recorded at booking creation, has no prior status.
    type: DataTypes.ENUM(
      'requested', 'confirmed', 'checked_in', 'in_service', 'completed', 'cancelled', 'no_show',
      'for_pickup', 'pickup_completed', 'out_for_return', 'ready_for_collection'
    ),
    allowNull: true
  },
  to_status: {
    type: DataTypes.ENUM(
      'requested', 'confirmed', 'checked_in', 'in_service', 'completed', 'cancelled', 'no_show',
      'for_pickup', 'pickup_completed', 'out_for_return', 'ready_for_collection'
    ),
    allowNull: false
  },
  handoff_leg_id: {
    // Set only when a transition is driven by a specific leg completing (e.g. pickup_completed);
    // most transitions (e.g. requested -> confirmed) are not leg-specific.
    type: DataTypes.INTEGER,
    allowNull: true
  },
  actor_type: {
    type: DataTypes.ENUM('customer', 'staff', 'system'),
    allowNull: false,
    defaultValue: 'system'
  },
  actor_user_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  source: {
    type: DataTypes.ENUM('storefront', 'pos', 'admin', 'system'),
    allowNull: false,
    defaultValue: 'system'
  },
  reason: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  occurred_at: {
    type: DataTypes.DATE,
    allowNull: false
  }
}, {
  tableName: 'service_booking_status_events',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['booking_id', 'occurred_at'] },
    { fields: ['handoff_leg_id'] },
    { fields: ['actor_user_id'] }
  ]
});

export default ServiceBookingStatusEvent;
