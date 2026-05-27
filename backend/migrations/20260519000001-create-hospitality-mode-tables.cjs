'use strict';

const TABLES = [
  'hospitality_audit_events',
  'hospitality_guest_messages',
  'hospitality_package_items',
  'hospitality_packages',
  'hospitality_facility_bookings',
  'hospitality_maintenance_requests',
  'hospitality_facilities',
  'hospitality_property_amenities',
  'hospitality_room_amenities',
  'hospitality_amenities',
  'hospitality_housekeeping_tasks',
  'hospitality_folio_lines',
  'hospitality_folios',
  'hospitality_stays',
  'hospitality_reservation_rooms',
  'hospitality_booking_holds',
  'hospitality_reservations',
  'hospitality_guest_profiles',
  'hospitality_rate_calendar',
  'hospitality_rate_plans',
  'hospitality_rooms',
  'hospitality_room_types'
];

const normalizeTableName = (table) => {
  if (!table) return '';
  if (typeof table === 'string') return table;
  return table.tableName || table.TABLE_NAME || '';
};

const tableExists = async (queryInterface, tableName) => {
  const tables = await queryInterface.showAllTables();
  return (tables || []).map(normalizeTableName).includes(tableName);
};

const createTableSafe = async (queryInterface, tableName, definition) => {
  if (await tableExists(queryInterface, tableName)) return;
  await queryInterface.createTable(tableName, definition);
};

const addIndexSafe = async (queryInterface, tableName, fields, options = {}) => {
  if (!(await tableExists(queryInterface, tableName))) return;
  const indexes = await queryInterface.showIndex(tableName).catch(() => []);
  if (options.name && indexes.some((index) => index.name === options.name)) return;
  await queryInterface.addIndex(tableName, fields, options);
};

const timestamps = (Sequelize) => ({
  created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
  updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
});

module.exports = {
  async up(queryInterface, Sequelize) {
    await createTableSafe(queryInterface, 'hospitality_room_types', {
      room_type_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      location_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'tenant_locations', key: 'location_id' }, onDelete: 'SET NULL' },
      code: { type: Sequelize.STRING(40), allowNull: false },
      name: { type: Sequelize.STRING(160), allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: true },
      base_occupancy: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      max_occupancy: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 2 },
      default_rate: { type: Sequelize.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
      currency: { type: Sequelize.STRING(8), allowNull: false, defaultValue: 'PHP' },
      amenities_snapshot: { type: Sequelize.JSON, allowNull: true },
      policies_snapshot: { type: Sequelize.JSON, allowNull: true },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      ...timestamps(Sequelize)
    });

    await createTableSafe(queryInterface, 'hospitality_rooms', {
      room_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      room_type_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'hospitality_room_types', key: 'room_type_id' }, onDelete: 'RESTRICT' },
      location_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'tenant_locations', key: 'location_id' }, onDelete: 'SET NULL' },
      room_number: { type: Sequelize.STRING(40), allowNull: false },
      floor: { type: Sequelize.STRING(40), allowNull: true },
      building: { type: Sequelize.STRING(120), allowNull: true },
      status: { type: Sequelize.ENUM('vacant_clean', 'vacant_dirty', 'occupied_clean', 'occupied_dirty', 'inspected', 'out_of_order', 'out_of_service'), allowNull: false, defaultValue: 'vacant_dirty' },
      housekeeping_status: { type: Sequelize.ENUM('pending', 'in_progress', 'ready_for_inspection', 'inspected', 'blocked'), allowNull: false, defaultValue: 'pending' },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      notes: { type: Sequelize.TEXT, allowNull: true },
      ...timestamps(Sequelize)
    });

    await createTableSafe(queryInterface, 'hospitality_rate_plans', {
      rate_plan_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      code: { type: Sequelize.STRING(40), allowNull: false },
      name: { type: Sequelize.STRING(160), allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: true },
      cancellation_policy: { type: Sequelize.TEXT, allowNull: true },
      deposit_policy: { type: Sequelize.JSON, allowNull: true },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      ...timestamps(Sequelize)
    });

    await createTableSafe(queryInterface, 'hospitality_rate_calendar', {
      rate_calendar_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      room_type_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'hospitality_room_types', key: 'room_type_id' }, onDelete: 'CASCADE' },
      rate_plan_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'hospitality_rate_plans', key: 'rate_plan_id' }, onDelete: 'SET NULL' },
      stay_date: { type: Sequelize.DATEONLY, allowNull: false },
      price: { type: Sequelize.DECIMAL(14, 4), allowNull: false },
      min_stay: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      max_stay: { type: Sequelize.INTEGER, allowNull: true },
      closed_to_arrival: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      closed_to_departure: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      ...timestamps(Sequelize)
    });

    await createTableSafe(queryInterface, 'hospitality_guest_profiles', {
      guest_profile_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      store_customer_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'store_customers', key: 'customer_id' }, onDelete: 'SET NULL' },
      name: { type: Sequelize.STRING(255), allowNull: false },
      email: { type: Sequelize.STRING(255), allowNull: true },
      phone: { type: Sequelize.STRING(50), allowNull: true },
      id_document_type: { type: Sequelize.STRING(80), allowNull: true },
      id_document_last4: { type: Sequelize.STRING(8), allowNull: true },
      preferences: { type: Sequelize.JSON, allowNull: true },
      vip_level: { type: Sequelize.STRING(80), allowNull: true },
      notes: { type: Sequelize.TEXT, allowNull: true },
      ...timestamps(Sequelize)
    });

    await createTableSafe(queryInterface, 'hospitality_reservations', {
      reservation_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      public_reference: { type: Sequelize.STRING(40), allowNull: false, unique: true },
      guest_profile_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'hospitality_guest_profiles', key: 'guest_profile_id' }, onDelete: 'SET NULL' },
      store_customer_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'store_customers', key: 'customer_id' }, onDelete: 'SET NULL' },
      customer_name: { type: Sequelize.STRING(255), allowNull: false },
      customer_email: { type: Sequelize.STRING(255), allowNull: true },
      customer_phone: { type: Sequelize.STRING(50), allowNull: true },
      status: { type: Sequelize.ENUM('draft', 'confirmed', 'checked_in', 'in_house', 'checked_out', 'cancelled', 'no_show'), allowNull: false, defaultValue: 'confirmed' },
      source: { type: Sequelize.ENUM('storefront', 'pos', 'admin', 'ota', 'phone', 'walk_in'), allowNull: false, defaultValue: 'admin' },
      check_in_date: { type: Sequelize.DATEONLY, allowNull: false },
      check_out_date: { type: Sequelize.DATEONLY, allowNull: false },
      adults: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      children: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      room_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      rate_plan_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'hospitality_rate_plans', key: 'rate_plan_id' }, onDelete: 'SET NULL' },
      total_amount: { type: Sequelize.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
      deposit_amount: { type: Sequelize.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
      payment_status: { type: Sequelize.ENUM('unpaid', 'deposit_paid', 'paid', 'refunded'), allowNull: false, defaultValue: 'unpaid' },
      idempotency_key: { type: Sequelize.STRING(120), allowNull: true },
      request_hash: { type: Sequelize.STRING(64), allowNull: true },
      external_source: { type: Sequelize.STRING(80), allowNull: true },
      external_reference: { type: Sequelize.STRING(120), allowNull: true },
      channel_metadata: { type: Sequelize.JSON, allowNull: true },
      special_requests: { type: Sequelize.TEXT, allowNull: true },
      policies_snapshot: { type: Sequelize.JSON, allowNull: true },
      add_ons_snapshot: { type: Sequelize.JSON, allowNull: true },
      ...timestamps(Sequelize)
    });

    await createTableSafe(queryInterface, 'hospitality_reservation_rooms', {
      reservation_room_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      reservation_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'hospitality_reservations', key: 'reservation_id' }, onDelete: 'CASCADE' },
      room_type_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'hospitality_room_types', key: 'room_type_id' }, onDelete: 'RESTRICT' },
      room_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'hospitality_rooms', key: 'room_id' }, onDelete: 'SET NULL' },
      rate_plan_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'hospitality_rate_plans', key: 'rate_plan_id' }, onDelete: 'SET NULL' },
      check_in_date: { type: Sequelize.DATEONLY, allowNull: false },
      check_out_date: { type: Sequelize.DATEONLY, allowNull: false },
      nightly_rate: { type: Sequelize.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
      guest_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      status: { type: Sequelize.ENUM('reserved', 'assigned', 'checked_in', 'checked_out', 'cancelled', 'no_show'), allowNull: false, defaultValue: 'reserved' },
      ...timestamps(Sequelize)
    });

    await createTableSafe(queryInterface, 'hospitality_booking_holds', {
      booking_hold_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      hold_token: { type: Sequelize.STRING(80), allowNull: false, unique: true },
      room_type_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'hospitality_room_types', key: 'room_type_id' }, onDelete: 'CASCADE' },
      check_in_date: { type: Sequelize.DATEONLY, allowNull: false },
      check_out_date: { type: Sequelize.DATEONLY, allowNull: false },
      room_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      status: { type: Sequelize.ENUM('active', 'consumed', 'expired', 'released'), allowNull: false, defaultValue: 'active' },
      expires_at: { type: Sequelize.DATE, allowNull: false },
      idempotency_key: { type: Sequelize.STRING(120), allowNull: true },
      request_hash: { type: Sequelize.STRING(64), allowNull: true },
      quote_snapshot: { type: Sequelize.JSON, allowNull: true },
      ...timestamps(Sequelize)
    });

    await createTableSafe(queryInterface, 'hospitality_stays', {
      stay_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      reservation_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'hospitality_reservations', key: 'reservation_id' }, onDelete: 'CASCADE' },
      reservation_room_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'hospitality_reservation_rooms', key: 'reservation_room_id' }, onDelete: 'SET NULL' },
      room_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'hospitality_rooms', key: 'room_id' }, onDelete: 'SET NULL' },
      guest_profile_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'hospitality_guest_profiles', key: 'guest_profile_id' }, onDelete: 'SET NULL' },
      status: { type: Sequelize.ENUM('pending', 'in_house', 'checked_out', 'cancelled'), allowNull: false, defaultValue: 'pending' },
      actual_check_in_at: { type: Sequelize.DATE, allowNull: true },
      actual_check_out_at: { type: Sequelize.DATE, allowNull: true },
      checked_in_by: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'users', key: 'user_id' }, onDelete: 'SET NULL' },
      checked_out_by: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'users', key: 'user_id' }, onDelete: 'SET NULL' },
      ...timestamps(Sequelize)
    });

    await createTableSafe(queryInterface, 'hospitality_folios', {
      folio_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      reservation_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'hospitality_reservations', key: 'reservation_id' }, onDelete: 'SET NULL' },
      stay_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'hospitality_stays', key: 'stay_id' }, onDelete: 'SET NULL' },
      guest_profile_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'hospitality_guest_profiles', key: 'guest_profile_id' }, onDelete: 'SET NULL' },
      status: { type: Sequelize.ENUM('open', 'settled', 'void'), allowNull: false, defaultValue: 'open' },
      balance: { type: Sequelize.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
      total_charges: { type: Sequelize.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
      total_payments: { type: Sequelize.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
      currency: { type: Sequelize.STRING(8), allowNull: false, defaultValue: 'PHP' },
      ...timestamps(Sequelize)
    });

    await createTableSafe(queryInterface, 'hospitality_folio_lines', {
      folio_line_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      folio_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'hospitality_folios', key: 'folio_id' }, onDelete: 'CASCADE' },
      line_type: { type: Sequelize.ENUM('room_charge', 'tax', 'fee', 'deposit', 'payment', 'refund', 'amenity', 'minibar', 'retail', 'room_service', 'adjustment'), allowNull: false },
      item_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'items', key: 'item_id' }, onDelete: 'SET NULL' },
      pos_transaction_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'pos_transactions', key: 'pos_transaction_id' }, onDelete: 'SET NULL' },
      description: { type: Sequelize.STRING(255), allowNull: false },
      quantity: { type: Sequelize.DECIMAL(14, 4), allowNull: false, defaultValue: 1 },
      unit_amount: { type: Sequelize.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
      total_amount: { type: Sequelize.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
      tax_amount: { type: Sequelize.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
      posted_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      posted_by: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'users', key: 'user_id' }, onDelete: 'SET NULL' },
      metadata: { type: Sequelize.JSON, allowNull: true },
      ...timestamps(Sequelize)
    });

    await createTableSafe(queryInterface, 'hospitality_housekeeping_tasks', {
      housekeeping_task_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      room_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'hospitality_rooms', key: 'room_id' }, onDelete: 'CASCADE' },
      reservation_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'hospitality_reservations', key: 'reservation_id' }, onDelete: 'SET NULL' },
      status: { type: Sequelize.ENUM('pending', 'in_progress', 'ready_for_inspection', 'inspected', 'blocked'), allowNull: false, defaultValue: 'pending' },
      priority: { type: Sequelize.ENUM('low', 'normal', 'high', 'urgent'), allowNull: false, defaultValue: 'normal' },
      assigned_user_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'users', key: 'user_id' }, onDelete: 'SET NULL' },
      due_at: { type: Sequelize.DATE, allowNull: true },
      completed_at: { type: Sequelize.DATE, allowNull: true },
      notes: { type: Sequelize.TEXT, allowNull: true },
      ...timestamps(Sequelize)
    });

    await createTableSafe(queryInterface, 'hospitality_amenities', {
      amenity_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      name: { type: Sequelize.STRING(160), allowNull: false },
      amenity_type: { type: Sequelize.ENUM('property', 'room', 'paid_add_on', 'facility', 'accessibility', 'policy', 'local_area', 'transport', 'meal', 'package'), allowNull: false, defaultValue: 'property' },
      description: { type: Sequelize.TEXT, allowNull: true },
      price: { type: Sequelize.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
      is_paid: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      item_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'items', key: 'item_id' }, onDelete: 'SET NULL' },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      metadata: { type: Sequelize.JSON, allowNull: true },
      ...timestamps(Sequelize)
    });

    await createTableSafe(queryInterface, 'hospitality_facilities', {
      facility_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      location_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'tenant_locations', key: 'location_id' }, onDelete: 'SET NULL' },
      name: { type: Sequelize.STRING(160), allowNull: false },
      facility_type: { type: Sequelize.ENUM('meeting_room', 'pool', 'gym', 'spa', 'parking', 'shuttle', 'business_center', 'laundry', 'other'), allowNull: false, defaultValue: 'other' },
      capacity: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      price: { type: Sequelize.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
      is_bookable: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      metadata: { type: Sequelize.JSON, allowNull: true },
      ...timestamps(Sequelize)
    });

    await createTableSafe(queryInterface, 'hospitality_maintenance_requests', {
      maintenance_request_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      room_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'hospitality_rooms', key: 'room_id' }, onDelete: 'SET NULL' },
      facility_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'hospitality_facilities', key: 'facility_id' }, onDelete: 'SET NULL' },
      reported_by: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'users', key: 'user_id' }, onDelete: 'SET NULL' },
      assigned_user_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'users', key: 'user_id' }, onDelete: 'SET NULL' },
      priority: { type: Sequelize.ENUM('low', 'normal', 'high', 'urgent'), allowNull: false, defaultValue: 'normal' },
      status: { type: Sequelize.ENUM('reported', 'assigned', 'in_progress', 'resolved', 'deferred'), allowNull: false, defaultValue: 'reported' },
      issue_type: { type: Sequelize.STRING(120), allowNull: true },
      description: { type: Sequelize.TEXT, allowNull: false },
      resolved_at: { type: Sequelize.DATE, allowNull: true },
      out_of_order: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      metadata: { type: Sequelize.JSON, allowNull: true },
      ...timestamps(Sequelize)
    });

    await createTableSafe(queryInterface, 'hospitality_room_amenities', {
      room_amenity_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      room_type_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'hospitality_room_types', key: 'room_type_id' }, onDelete: 'CASCADE' },
      room_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'hospitality_rooms', key: 'room_id' }, onDelete: 'CASCADE' },
      amenity_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'hospitality_amenities', key: 'amenity_id' }, onDelete: 'CASCADE' },
      included: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      sort_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      ...timestamps(Sequelize)
    });

    await createTableSafe(queryInterface, 'hospitality_property_amenities', {
      property_amenity_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      amenity_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'hospitality_amenities', key: 'amenity_id' }, onDelete: 'CASCADE' },
      location_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'tenant_locations', key: 'location_id' }, onDelete: 'SET NULL' },
      included: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      sort_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      ...timestamps(Sequelize)
    });

    await createTableSafe(queryInterface, 'hospitality_facility_bookings', {
      facility_booking_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      facility_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'hospitality_facilities', key: 'facility_id' }, onDelete: 'CASCADE' },
      guest_profile_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'hospitality_guest_profiles', key: 'guest_profile_id' }, onDelete: 'SET NULL' },
      reservation_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'hospitality_reservations', key: 'reservation_id' }, onDelete: 'SET NULL' },
      start_at: { type: Sequelize.DATE, allowNull: false },
      end_at: { type: Sequelize.DATE, allowNull: false },
      status: { type: Sequelize.ENUM('requested', 'confirmed', 'completed', 'cancelled', 'no_show'), allowNull: false, defaultValue: 'confirmed' },
      party_size: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      total_amount: { type: Sequelize.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
      ...timestamps(Sequelize)
    });

    await createTableSafe(queryInterface, 'hospitality_packages', {
      package_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      code: { type: Sequelize.STRING(40), allowNull: false },
      name: { type: Sequelize.STRING(160), allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: true },
      package_type: { type: Sequelize.ENUM('accommodation', 'amenity', 'meal', 'facility', 'promo'), allowNull: false, defaultValue: 'accommodation' },
      price_delta: { type: Sequelize.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      ...timestamps(Sequelize)
    });

    await createTableSafe(queryInterface, 'hospitality_package_items', {
      package_item_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      package_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'hospitality_packages', key: 'package_id' }, onDelete: 'CASCADE' },
      amenity_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'hospitality_amenities', key: 'amenity_id' }, onDelete: 'SET NULL' },
      item_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'items', key: 'item_id' }, onDelete: 'SET NULL' },
      facility_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'hospitality_facilities', key: 'facility_id' }, onDelete: 'SET NULL' },
      quantity: { type: Sequelize.DECIMAL(14, 4), allowNull: false, defaultValue: 1 },
      pricing_mode: { type: Sequelize.ENUM('included', 'per_stay', 'per_night', 'per_guest'), allowNull: false, defaultValue: 'included' },
      ...timestamps(Sequelize)
    });

    await createTableSafe(queryInterface, 'hospitality_guest_messages', {
      guest_message_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      reservation_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'hospitality_reservations', key: 'reservation_id' }, onDelete: 'SET NULL' },
      guest_profile_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'hospitality_guest_profiles', key: 'guest_profile_id' }, onDelete: 'SET NULL' },
      channel: { type: Sequelize.ENUM('email', 'sms', 'internal', 'storefront'), allowNull: false, defaultValue: 'internal' },
      subject: { type: Sequelize.STRING(255), allowNull: true },
      body: { type: Sequelize.TEXT, allowNull: false },
      status: { type: Sequelize.ENUM('draft', 'queued', 'sent', 'failed', 'skipped'), allowNull: false, defaultValue: 'draft' },
      scheduled_at: { type: Sequelize.DATE, allowNull: true },
      sent_at: { type: Sequelize.DATE, allowNull: true },
      ...timestamps(Sequelize)
    });

    await createTableSafe(queryInterface, 'hospitality_audit_events', {
      hospitality_audit_event_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      entity_type: { type: Sequelize.STRING(80), allowNull: false },
      entity_id: { type: Sequelize.INTEGER, allowNull: true },
      action: { type: Sequelize.STRING(80), allowNull: false },
      actor_user_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'users', key: 'user_id' }, onDelete: 'SET NULL' },
      before_snapshot: { type: Sequelize.JSON, allowNull: true },
      after_snapshot: { type: Sequelize.JSON, allowNull: true },
      metadata: { type: Sequelize.JSON, allowNull: true },
      occurred_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      ...timestamps(Sequelize)
    });

    const indexes = [
      ['hospitality_room_types', ['location_id', 'code'], 'uq_hospitality_room_types_location_code', true],
      ['hospitality_rooms', ['location_id', 'room_number'], 'uq_hospitality_rooms_location_room_number', true],
      ['hospitality_rate_plans', ['code'], 'uq_hospitality_rate_plans_code', true],
      ['hospitality_rooms', ['room_type_id'], 'idx_hospitality_rooms_room_type'],
      ['hospitality_rate_calendar', ['room_type_id', 'stay_date'], 'idx_hospitality_rates_room_type_date'],
      ['hospitality_reservations', ['public_reference'], 'uq_hospitality_reservations_public_reference', true],
      ['hospitality_reservations', ['idempotency_key'], 'uq_hospitality_reservations_idempotency_key', true],
      ['hospitality_reservations', ['status', 'check_in_date'], 'idx_hospitality_reservations_status_checkin'],
      ['hospitality_reservations', ['store_customer_id', 'check_in_date'], 'idx_hospitality_reservations_store_customer'],
      ['hospitality_reservations', ['external_source', 'external_reference'], 'idx_hospitality_reservations_external_reference'],
      ['hospitality_reservation_rooms', ['room_id', 'check_in_date', 'check_out_date'], 'idx_hospitality_reservation_rooms_occupancy'],
      ['hospitality_booking_holds', ['hold_token'], 'uq_hospitality_booking_holds_token', true],
      ['hospitality_booking_holds', ['room_type_id', 'check_in_date', 'check_out_date', 'status'], 'idx_hospitality_booking_holds_availability'],
      ['hospitality_folio_lines', ['folio_id'], 'idx_hospitality_folio_lines_folio'],
      ['hospitality_housekeeping_tasks', ['room_id', 'status'], 'idx_hospitality_housekeeping_room_status'],
      ['hospitality_maintenance_requests', ['room_id', 'status'], 'idx_hospitality_maintenance_room_status'],
      ['hospitality_facility_bookings', ['facility_id', 'start_at', 'end_at'], 'idx_hospitality_facility_bookings_window'],
      ['hospitality_audit_events', ['entity_type', 'entity_id', 'occurred_at'], 'idx_hospitality_audit_entity']
    ];

    for (const [table, fields, name, unique = false] of indexes) {
      await addIndexSafe(queryInterface, table, fields, { name, unique });
    }
  },

  async down(queryInterface) {
    for (const table of TABLES) {
      if (await tableExists(queryInterface, table)) {
        await queryInterface.dropTable(table);
      }
    }
  }
};
