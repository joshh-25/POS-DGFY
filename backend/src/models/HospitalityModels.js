import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const timestamps = {
  createdAt: 'created_at',
  updatedAt: 'updated_at'
};

export const HospitalityRoomType = sequelize.define('HospitalityRoomType', {
  room_type_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  location_id: { type: DataTypes.INTEGER, allowNull: true },
  code: { type: DataTypes.STRING(40), allowNull: false },
  name: { type: DataTypes.STRING(160), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  base_occupancy: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  max_occupancy: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 2 },
  default_rate: { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
  currency: { type: DataTypes.STRING(8), allowNull: false, defaultValue: 'PHP' },
  amenities_snapshot: { type: DataTypes.JSON, allowNull: true },
  policies_snapshot: { type: DataTypes.JSON, allowNull: true },
  is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
}, { tableName: 'hospitality_room_types', timestamps: true, ...timestamps });

export const HospitalityRoom = sequelize.define('HospitalityRoom', {
  room_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  room_type_id: { type: DataTypes.INTEGER, allowNull: false },
  location_id: { type: DataTypes.INTEGER, allowNull: true },
  room_number: { type: DataTypes.STRING(40), allowNull: false },
  floor: { type: DataTypes.STRING(40), allowNull: true },
  building: { type: DataTypes.STRING(120), allowNull: true },
  status: { type: DataTypes.ENUM('vacant_clean', 'vacant_dirty', 'occupied_clean', 'occupied_dirty', 'inspected', 'out_of_order', 'out_of_service'), allowNull: false, defaultValue: 'vacant_dirty' },
  housekeeping_status: { type: DataTypes.ENUM('pending', 'in_progress', 'ready_for_inspection', 'inspected', 'blocked'), allowNull: false, defaultValue: 'pending' },
  is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  notes: { type: DataTypes.TEXT, allowNull: true }
}, { tableName: 'hospitality_rooms', timestamps: true, ...timestamps });

export const HospitalityRatePlan = sequelize.define('HospitalityRatePlan', {
  rate_plan_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  code: { type: DataTypes.STRING(40), allowNull: false },
  name: { type: DataTypes.STRING(160), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  cancellation_policy: { type: DataTypes.TEXT, allowNull: true },
  deposit_policy: { type: DataTypes.JSON, allowNull: true },
  is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
}, { tableName: 'hospitality_rate_plans', timestamps: true, ...timestamps });

export const HospitalityRateCalendar = sequelize.define('HospitalityRateCalendar', {
  rate_calendar_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  room_type_id: { type: DataTypes.INTEGER, allowNull: false },
  rate_plan_id: { type: DataTypes.INTEGER, allowNull: true },
  stay_date: { type: DataTypes.DATEONLY, allowNull: false },
  price: { type: DataTypes.DECIMAL(14, 4), allowNull: false },
  min_stay: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  max_stay: { type: DataTypes.INTEGER, allowNull: true },
  closed_to_arrival: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  closed_to_departure: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }
}, { tableName: 'hospitality_rate_calendar', timestamps: true, ...timestamps });

export const HospitalityGuestProfile = sequelize.define('HospitalityGuestProfile', {
  guest_profile_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  store_customer_id: { type: DataTypes.INTEGER, allowNull: true },
  name: { type: DataTypes.STRING(255), allowNull: false },
  email: { type: DataTypes.STRING(255), allowNull: true },
  phone: { type: DataTypes.STRING(50), allowNull: true },
  id_document_type: { type: DataTypes.STRING(80), allowNull: true },
  id_document_last4: { type: DataTypes.STRING(8), allowNull: true },
  preferences: { type: DataTypes.JSON, allowNull: true },
  vip_level: { type: DataTypes.STRING(80), allowNull: true },
  notes: { type: DataTypes.TEXT, allowNull: true }
}, { tableName: 'hospitality_guest_profiles', timestamps: true, ...timestamps });

export const HospitalityReservation = sequelize.define('HospitalityReservation', {
  reservation_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  public_reference: { type: DataTypes.STRING(40), allowNull: false, unique: true },
  guest_profile_id: { type: DataTypes.INTEGER, allowNull: true },
  store_customer_id: { type: DataTypes.INTEGER, allowNull: true },
  customer_name: { type: DataTypes.STRING(255), allowNull: false },
  customer_email: { type: DataTypes.STRING(255), allowNull: true },
  customer_phone: { type: DataTypes.STRING(50), allowNull: true },
  status: { type: DataTypes.ENUM('draft', 'confirmed', 'checked_in', 'in_house', 'checked_out', 'cancelled', 'no_show'), allowNull: false, defaultValue: 'confirmed' },
  source: { type: DataTypes.ENUM('storefront', 'pos', 'admin', 'ota', 'phone', 'walk_in'), allowNull: false, defaultValue: 'admin' },
  check_in_date: { type: DataTypes.DATEONLY, allowNull: false },
  check_out_date: { type: DataTypes.DATEONLY, allowNull: false },
  adults: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  children: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  room_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  rate_plan_id: { type: DataTypes.INTEGER, allowNull: true },
  total_amount: { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
  deposit_amount: { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
  payment_status: { type: DataTypes.ENUM('unpaid', 'deposit_paid', 'paid', 'refunded'), allowNull: false, defaultValue: 'unpaid' },
  idempotency_key: { type: DataTypes.STRING(120), allowNull: true },
  request_hash: { type: DataTypes.STRING(64), allowNull: true },
  external_source: { type: DataTypes.STRING(80), allowNull: true },
  external_reference: { type: DataTypes.STRING(120), allowNull: true },
  channel_metadata: { type: DataTypes.JSON, allowNull: true },
  special_requests: { type: DataTypes.TEXT, allowNull: true },
  policies_snapshot: { type: DataTypes.JSON, allowNull: true },
  add_ons_snapshot: { type: DataTypes.JSON, allowNull: true }
}, { tableName: 'hospitality_reservations', timestamps: true, ...timestamps });

export const HospitalityBookingHold = sequelize.define('HospitalityBookingHold', {
  booking_hold_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  hold_token: { type: DataTypes.STRING(80), allowNull: false, unique: true },
  room_type_id: { type: DataTypes.INTEGER, allowNull: false },
  check_in_date: { type: DataTypes.DATEONLY, allowNull: false },
  check_out_date: { type: DataTypes.DATEONLY, allowNull: false },
  room_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  status: { type: DataTypes.ENUM('active', 'consumed', 'expired', 'released'), allowNull: false, defaultValue: 'active' },
  expires_at: { type: DataTypes.DATE, allowNull: false },
  idempotency_key: { type: DataTypes.STRING(120), allowNull: true },
  request_hash: { type: DataTypes.STRING(64), allowNull: true },
  quote_snapshot: { type: DataTypes.JSON, allowNull: true }
}, { tableName: 'hospitality_booking_holds', timestamps: true, ...timestamps });

export const HospitalityReservationRoom = sequelize.define('HospitalityReservationRoom', {
  reservation_room_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  reservation_id: { type: DataTypes.INTEGER, allowNull: false },
  room_type_id: { type: DataTypes.INTEGER, allowNull: false },
  room_id: { type: DataTypes.INTEGER, allowNull: true },
  rate_plan_id: { type: DataTypes.INTEGER, allowNull: true },
  check_in_date: { type: DataTypes.DATEONLY, allowNull: false },
  check_out_date: { type: DataTypes.DATEONLY, allowNull: false },
  nightly_rate: { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
  guest_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  status: { type: DataTypes.ENUM('reserved', 'assigned', 'checked_in', 'checked_out', 'cancelled', 'no_show'), allowNull: false, defaultValue: 'reserved' }
}, { tableName: 'hospitality_reservation_rooms', timestamps: true, ...timestamps });

export const HospitalityStay = sequelize.define('HospitalityStay', {
  stay_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  reservation_id: { type: DataTypes.INTEGER, allowNull: false },
  reservation_room_id: { type: DataTypes.INTEGER, allowNull: true },
  room_id: { type: DataTypes.INTEGER, allowNull: true },
  guest_profile_id: { type: DataTypes.INTEGER, allowNull: true },
  status: { type: DataTypes.ENUM('pending', 'in_house', 'checked_out', 'cancelled'), allowNull: false, defaultValue: 'pending' },
  actual_check_in_at: { type: DataTypes.DATE, allowNull: true },
  actual_check_out_at: { type: DataTypes.DATE, allowNull: true },
  checked_in_by: { type: DataTypes.INTEGER, allowNull: true },
  checked_out_by: { type: DataTypes.INTEGER, allowNull: true }
}, { tableName: 'hospitality_stays', timestamps: true, ...timestamps });

export const HospitalityFolio = sequelize.define('HospitalityFolio', {
  folio_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  reservation_id: { type: DataTypes.INTEGER, allowNull: true },
  stay_id: { type: DataTypes.INTEGER, allowNull: true },
  guest_profile_id: { type: DataTypes.INTEGER, allowNull: true },
  status: { type: DataTypes.ENUM('open', 'settled', 'void'), allowNull: false, defaultValue: 'open' },
  balance: { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
  total_charges: { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
  total_payments: { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
  currency: { type: DataTypes.STRING(8), allowNull: false, defaultValue: 'PHP' }
}, { tableName: 'hospitality_folios', timestamps: true, ...timestamps });

export const HospitalityFolioLine = sequelize.define('HospitalityFolioLine', {
  folio_line_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  folio_id: { type: DataTypes.INTEGER, allowNull: false },
  line_type: { type: DataTypes.ENUM('room_charge', 'tax', 'fee', 'deposit', 'payment', 'refund', 'amenity', 'minibar', 'retail', 'room_service', 'adjustment'), allowNull: false },
  item_id: { type: DataTypes.INTEGER, allowNull: true },
  pos_transaction_id: { type: DataTypes.INTEGER, allowNull: true },
  description: { type: DataTypes.STRING(255), allowNull: false },
  quantity: { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 1 },
  unit_amount: { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
  total_amount: { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
  tax_amount: { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
  posted_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  posted_by: { type: DataTypes.INTEGER, allowNull: true },
  metadata: { type: DataTypes.JSON, allowNull: true }
}, { tableName: 'hospitality_folio_lines', timestamps: true, ...timestamps });

export const HospitalityHousekeepingTask = sequelize.define('HospitalityHousekeepingTask', {
  housekeeping_task_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  room_id: { type: DataTypes.INTEGER, allowNull: false },
  reservation_id: { type: DataTypes.INTEGER, allowNull: true },
  status: { type: DataTypes.ENUM('pending', 'in_progress', 'ready_for_inspection', 'inspected', 'blocked'), allowNull: false, defaultValue: 'pending' },
  priority: { type: DataTypes.ENUM('low', 'normal', 'high', 'urgent'), allowNull: false, defaultValue: 'normal' },
  assigned_user_id: { type: DataTypes.INTEGER, allowNull: true },
  due_at: { type: DataTypes.DATE, allowNull: true },
  completed_at: { type: DataTypes.DATE, allowNull: true },
  notes: { type: DataTypes.TEXT, allowNull: true }
}, { tableName: 'hospitality_housekeeping_tasks', timestamps: true, ...timestamps });

export const HospitalityMaintenanceRequest = sequelize.define('HospitalityMaintenanceRequest', {
  maintenance_request_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  room_id: { type: DataTypes.INTEGER, allowNull: true },
  facility_id: { type: DataTypes.INTEGER, allowNull: true },
  reported_by: { type: DataTypes.INTEGER, allowNull: true },
  assigned_user_id: { type: DataTypes.INTEGER, allowNull: true },
  priority: { type: DataTypes.ENUM('low', 'normal', 'high', 'urgent'), allowNull: false, defaultValue: 'normal' },
  status: { type: DataTypes.ENUM('reported', 'assigned', 'in_progress', 'resolved', 'deferred'), allowNull: false, defaultValue: 'reported' },
  issue_type: { type: DataTypes.STRING(120), allowNull: true },
  description: { type: DataTypes.TEXT, allowNull: false },
  resolved_at: { type: DataTypes.DATE, allowNull: true },
  out_of_order: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  metadata: { type: DataTypes.JSON, allowNull: true }
}, { tableName: 'hospitality_maintenance_requests', timestamps: true, ...timestamps });

export const HospitalityAmenity = sequelize.define('HospitalityAmenity', {
  amenity_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING(160), allowNull: false },
  amenity_type: { type: DataTypes.ENUM('property', 'room', 'paid_add_on', 'facility', 'accessibility', 'policy', 'local_area', 'transport', 'meal', 'package'), allowNull: false, defaultValue: 'property' },
  description: { type: DataTypes.TEXT, allowNull: true },
  price: { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
  is_paid: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  item_id: { type: DataTypes.INTEGER, allowNull: true },
  is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  metadata: { type: DataTypes.JSON, allowNull: true }
}, { tableName: 'hospitality_amenities', timestamps: true, ...timestamps });

export const HospitalityRoomAmenity = sequelize.define('HospitalityRoomAmenity', {
  room_amenity_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  room_type_id: { type: DataTypes.INTEGER, allowNull: true },
  room_id: { type: DataTypes.INTEGER, allowNull: true },
  amenity_id: { type: DataTypes.INTEGER, allowNull: false },
  included: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }
}, { tableName: 'hospitality_room_amenities', timestamps: true, ...timestamps });

export const HospitalityPropertyAmenity = sequelize.define('HospitalityPropertyAmenity', {
  property_amenity_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  amenity_id: { type: DataTypes.INTEGER, allowNull: false },
  location_id: { type: DataTypes.INTEGER, allowNull: true },
  included: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }
}, { tableName: 'hospitality_property_amenities', timestamps: true, ...timestamps });

export const HospitalityFacility = sequelize.define('HospitalityFacility', {
  facility_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  location_id: { type: DataTypes.INTEGER, allowNull: true },
  name: { type: DataTypes.STRING(160), allowNull: false },
  facility_type: { type: DataTypes.ENUM('meeting_room', 'pool', 'gym', 'spa', 'parking', 'shuttle', 'business_center', 'laundry', 'other'), allowNull: false, defaultValue: 'other' },
  capacity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  price: { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
  is_bookable: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  metadata: { type: DataTypes.JSON, allowNull: true }
}, { tableName: 'hospitality_facilities', timestamps: true, ...timestamps });

export const HospitalityFacilityBooking = sequelize.define('HospitalityFacilityBooking', {
  facility_booking_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  facility_id: { type: DataTypes.INTEGER, allowNull: false },
  guest_profile_id: { type: DataTypes.INTEGER, allowNull: true },
  reservation_id: { type: DataTypes.INTEGER, allowNull: true },
  start_at: { type: DataTypes.DATE, allowNull: false },
  end_at: { type: DataTypes.DATE, allowNull: false },
  status: { type: DataTypes.ENUM('requested', 'confirmed', 'completed', 'cancelled', 'no_show'), allowNull: false, defaultValue: 'confirmed' },
  party_size: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  total_amount: { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 0 }
}, { tableName: 'hospitality_facility_bookings', timestamps: true, ...timestamps });

export const HospitalityPackage = sequelize.define('HospitalityPackage', {
  package_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  code: { type: DataTypes.STRING(40), allowNull: false },
  name: { type: DataTypes.STRING(160), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  package_type: { type: DataTypes.ENUM('accommodation', 'amenity', 'meal', 'facility', 'promo'), allowNull: false, defaultValue: 'accommodation' },
  price_delta: { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
  is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
}, { tableName: 'hospitality_packages', timestamps: true, ...timestamps });

export const HospitalityPackageItem = sequelize.define('HospitalityPackageItem', {
  package_item_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  package_id: { type: DataTypes.INTEGER, allowNull: false },
  amenity_id: { type: DataTypes.INTEGER, allowNull: true },
  item_id: { type: DataTypes.INTEGER, allowNull: true },
  facility_id: { type: DataTypes.INTEGER, allowNull: true },
  quantity: { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 1 },
  pricing_mode: { type: DataTypes.ENUM('included', 'per_stay', 'per_night', 'per_guest'), allowNull: false, defaultValue: 'included' }
}, { tableName: 'hospitality_package_items', timestamps: true, ...timestamps });

export const HospitalityGuestMessage = sequelize.define('HospitalityGuestMessage', {
  guest_message_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  reservation_id: { type: DataTypes.INTEGER, allowNull: true },
  guest_profile_id: { type: DataTypes.INTEGER, allowNull: true },
  channel: { type: DataTypes.ENUM('email', 'sms', 'internal', 'storefront'), allowNull: false, defaultValue: 'internal' },
  subject: { type: DataTypes.STRING(255), allowNull: true },
  body: { type: DataTypes.TEXT, allowNull: false },
  status: { type: DataTypes.ENUM('draft', 'queued', 'sent', 'failed', 'skipped'), allowNull: false, defaultValue: 'draft' },
  scheduled_at: { type: DataTypes.DATE, allowNull: true },
  sent_at: { type: DataTypes.DATE, allowNull: true }
}, { tableName: 'hospitality_guest_messages', timestamps: true, ...timestamps });

export const HospitalityAuditEvent = sequelize.define('HospitalityAuditEvent', {
  hospitality_audit_event_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  entity_type: { type: DataTypes.STRING(80), allowNull: false },
  entity_id: { type: DataTypes.INTEGER, allowNull: true },
  action: { type: DataTypes.STRING(80), allowNull: false },
  actor_user_id: { type: DataTypes.INTEGER, allowNull: true },
  before_snapshot: { type: DataTypes.JSON, allowNull: true },
  after_snapshot: { type: DataTypes.JSON, allowNull: true },
  metadata: { type: DataTypes.JSON, allowNull: true },
  occurred_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
}, { tableName: 'hospitality_audit_events', timestamps: true, ...timestamps });
