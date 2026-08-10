import { Op } from 'sequelize';
import dbStore from '../../../utils/dbStore.js';

const toPlain = (row) => (row && typeof row.toJSON === 'function' ? row.toJSON() : row);
const toPlainList = (rows) => (rows || []).map(toPlain);

const model = (name) => dbStore.get(name);

const includeRoomType = () => ([{ model: model('HospitalityRoomType'), as: 'roomType', required: false }]);
const includeReservationRooms = () => ([{
  model: model('HospitalityReservationRoom'),
  as: 'rooms',
  required: false,
  include: [
    { model: model('HospitalityRoomType'), as: 'roomType', required: false },
    { model: model('HospitalityRoom'), as: 'room', required: false }
  ]
}]);
const includeFolioLines = () => ([{ model: model('HospitalityFolioLine'), as: 'lines', required: false }]);
const BOOKABLE_ROOM_STATUSES = ['vacant_clean', 'vacant_dirty', 'occupied_clean', 'occupied_dirty', 'inspected'];
const ROOM_ASSIGNMENT_PRIORITY = ['vacant_clean', 'inspected', 'vacant_dirty', 'occupied_clean', 'occupied_dirty'];
const ACTIVE_RESERVATION_ROOM_STATUSES = ['reserved', 'assigned', 'checked_in'];
const ACTIVE_HOLD_STATUSES = ['active'];

export const calculateFolioTotals = (lines = []) => lines.reduce((acc, entry) => {
  const plain = toPlain(entry);
  const amount = Number(plain.total_amount || 0);
  if (['payment', 'deposit'].includes(plain.line_type)) acc.payments += amount;
  else if (plain.line_type === 'refund') acc.payments -= amount;
  else acc.charges += amount;
  acc.balance = acc.charges - acc.payments;
  return acc;
}, { charges: 0, payments: 0, balance: 0 });

export const mapHospitalityAuditAction = (action = '') => {
  const normalized = String(action || '').toLowerCase();
  if (normalized.startsWith('create')) return 'CREATE';
  if (normalized.startsWith('delete') || normalized.startsWith('void')) return 'DELETE';
  if (normalized.startsWith('view')) return 'VIEW';
  return 'UPDATE';
};

export const buildGeneralAuditLogPayload = (payload = {}) => ({
  user_id: payload.actor_user_id || null,
  entity_type: `hospitality:${String(payload.entity_type || 'event')}`.slice(0, 50),
  entity_id: payload.entity_id || null,
  action: mapHospitalityAuditAction(payload.action),
  changes: {
    hospitality_action: payload.action,
    before: payload.before_snapshot || null,
    after: payload.after_snapshot || null,
    metadata: payload.metadata || {}
  },
  ip_address: payload.metadata?.ip_address || null,
  user_agent: payload.metadata?.user_agent || null,
  timestamp: payload.occurred_at || new Date()
});

export const hospitalityRepository = {
  async transaction(callback) {
    const sequelize = model('HospitalityReservation').sequelize;
    return sequelize.transaction(callback);
  },

  async listRoomTypes({ activeOnly = false, limit = 200 } = {}) {
    const where = activeOnly ? { is_active: true } : {};
    return toPlainList(await model('HospitalityRoomType').findAll({
      where,
      order: [['name', 'ASC']],
      limit: Math.min(Number.parseInt(limit, 10) || 200, 500)
    }));
  },

  async createRoomType(payload) {
    return toPlain(await model('HospitalityRoomType').create(payload));
  },

  async listRooms({ status = null, roomTypeId = null, activeOnly = false, limit = 300 } = {}) {
    const where = {};
    if (status) where.status = status;
    if (roomTypeId) where.room_type_id = roomTypeId;
    if (activeOnly) where.is_active = true;
    return toPlainList(await model('HospitalityRoom').findAll({
      where,
      include: includeRoomType(),
      order: [['room_number', 'ASC']],
      limit: Math.min(Number.parseInt(limit, 10) || 300, 800)
    }));
  },

  async createRoom(payload) {
    return toPlain(await model('HospitalityRoom').create(payload));
  },

  async findRoomById(roomId, options = {}) {
    return toPlain(await model('HospitalityRoom').findByPk(roomId, {
      include: includeRoomType(),
      transaction: options.transaction,
      lock: options.transaction ? options.transaction.LOCK.UPDATE : undefined
    }));
  },

  async updateRoomStatus(roomId, payload, options = {}) {
    const row = await model('HospitalityRoom').findByPk(roomId, { transaction: options.transaction });
    if (!row) return null;
    await row.update(payload, { transaction: options.transaction });
    return toPlain(row);
  },

  async listGuests({ search = '', limit = 200 } = {}) {
    const where = {};
    const term = String(search || '').trim();
    if (term) {
      where[Op.or] = [
        { name: { [Op.like]: `%${term}%` } },
        { email: { [Op.like]: `%${term}%` } },
        { phone: { [Op.like]: `%${term}%` } }
      ];
    }
    return toPlainList(await model('HospitalityGuestProfile').findAll({
      where,
      order: [['updated_at', 'DESC']],
      limit: Math.min(Number.parseInt(limit, 10) || 200, 500)
    }));
  },

  async createGuest(payload) {
    return toPlain(await model('HospitalityGuestProfile').create(payload));
  },

  async listReservations({ status = null, from = null, to = null, limit = 200 } = {}) {
    const where = {};
    if (status) where.status = status;
    if (from || to) {
      where.check_in_date = {};
      if (from) where.check_in_date[Op.gte] = from;
      if (to) where.check_in_date[Op.lte] = to;
    }
    return toPlainList(await model('HospitalityReservation').findAll({
      where,
      include: includeReservationRooms(),
      order: [['check_in_date', 'ASC'], ['created_at', 'DESC']],
      limit: Math.min(Number.parseInt(limit, 10) || 200, 500)
    }));
  },

  async listStays({ status = null, room_id = null, reservation_id = null, limit = 200 } = {}) {
    const where = {};
    if (status) where.status = status;
    if (room_id) where.room_id = room_id;
    if (reservation_id) where.reservation_id = reservation_id;
    return toPlainList(await model('HospitalityStay').findAll({
      where,
      include: [
        { model: model('HospitalityReservation'), as: 'reservation', required: false },
        { model: model('HospitalityRoom'), as: 'room', required: false },
        { model: model('HospitalityGuestProfile'), as: 'guestProfile', required: false }
      ],
      order: [['created_at', 'DESC']],
      limit: Math.min(Number.parseInt(limit, 10) || 200, 500)
    }));
  },

  async findReservationById(reservationId, options = {}) {
    return toPlain(await model('HospitalityReservation').findByPk(reservationId, {
      include: includeReservationRooms(),
      transaction: options.transaction
    }));
  },

  async findReservationRoomById(reservationRoomId, options = {}) {
    return toPlain(await model('HospitalityReservationRoom').findByPk(reservationRoomId, {
      include: [
        { model: model('HospitalityRoomType'), as: 'roomType', required: false },
        { model: model('HospitalityRoom'), as: 'room', required: false }
      ],
      transaction: options.transaction,
      lock: options.transaction ? options.transaction.LOCK.UPDATE : undefined
    }));
  },

  async findReservationByIdempotencyKey(idempotencyKey, options = {}) {
    if (!idempotencyKey) return null;
    return toPlain(await model('HospitalityReservation').findOne({
      where: { idempotency_key: idempotencyKey },
      include: includeReservationRooms(),
      transaction: options.transaction
    }));
  },

  async findReservationByPublicReference(publicReference) {
    return toPlain(await model('HospitalityReservation').findOne({
      where: { public_reference: publicReference },
      include: includeReservationRooms()
    }));
  },

  async listReservationsByStoreCustomerId(storeCustomerId, options = {}) {
    if (!storeCustomerId) return [];
    return toPlainList(await model('HospitalityReservation').findAll({
      where: { store_customer_id: storeCustomerId },
      include: includeReservationRooms(),
      order: [['check_in_date', 'DESC'], ['created_at', 'DESC']],
      limit: Math.min(Number.parseInt(options.limit, 10) || 100, 300),
      transaction: options.transaction
    }));
  },

  async claimReservationForStoreCustomer({ publicReference, storeCustomerId, email }, options = {}) {
    if (!publicReference || !storeCustomerId) return null;
    const reservation = await model('HospitalityReservation').findOne({
      where: { public_reference: publicReference },
      transaction: options.transaction,
      lock: options.transaction ? options.transaction.LOCK.UPDATE : undefined
    });
    if (!reservation) return null;
    const plain = toPlain(reservation);
    const reservationEmail = String(plain.customer_email || '').trim().toLowerCase();
    const customerEmail = String(email || '').trim().toLowerCase();
    if (plain.store_customer_id && Number(plain.store_customer_id) !== Number(storeCustomerId)) {
      return { claim_error: 'already_claimed' };
    }
    if (reservationEmail && reservationEmail !== customerEmail) {
      return { claim_error: 'email_mismatch' };
    }
    await reservation.update({ store_customer_id: storeCustomerId }, { transaction: options.transaction });
    return this.findReservationByPublicReference(publicReference);
  },

  async createReservation(payload, roomRows = [], options = {}) {
    const reservation = await model('HospitalityReservation').create(payload, { transaction: options.transaction });
    const rows = roomRows.map((room) => ({
      ...room,
      reservation_id: reservation.reservation_id,
      check_in_date: room.check_in_date || payload.check_in_date,
      check_out_date: room.check_out_date || payload.check_out_date,
      rate_plan_id: room.rate_plan_id || payload.rate_plan_id || null
    }));
    if (rows.length > 0) {
      await model('HospitalityReservationRoom').bulkCreate(rows, { transaction: options.transaction });
    }
    return this.findReservationById(reservation.reservation_id, options);
  },

  async updateReservationStatus(reservationId, payload, options = {}) {
    const row = await model('HospitalityReservation').findByPk(reservationId, { transaction: options.transaction });
    if (!row) return null;
    await row.update(payload, { transaction: options.transaction });
    return this.findReservationById(reservationId, options);
  },

  async updateReservationDates(reservationId, payload, options = {}) {
    const row = await model('HospitalityReservation').findByPk(reservationId, { transaction: options.transaction });
    if (!row) return null;
    await row.update(payload, { transaction: options.transaction });
    await model('HospitalityReservationRoom').update({
      ...(payload.check_in_date ? { check_in_date: payload.check_in_date } : {}),
      ...(payload.check_out_date ? { check_out_date: payload.check_out_date } : {})
    }, { where: { reservation_id: reservationId }, transaction: options.transaction });
    return this.findReservationById(reservationId, options);
  },

  async countReservationRoomConflicts({ roomId, roomTypeId, checkInDate, checkOutDate, excludeReservationId = null }, options = {}) {
    const where = {
      status: { [Op.in]: ACTIVE_RESERVATION_ROOM_STATUSES },
      check_in_date: { [Op.lt]: checkOutDate },
      check_out_date: { [Op.gt]: checkInDate }
    };
    if (roomId) where.room_id = roomId;
    if (!roomId && roomTypeId) where.room_type_id = roomTypeId;
    if (excludeReservationId) where.reservation_id = { [Op.ne]: excludeReservationId };
    return model('HospitalityReservationRoom').count({ where, transaction: options.transaction });
  },

  async countRoomsByType(roomTypeId, options = {}) {
    return model('HospitalityRoom').count({
      where: { room_type_id: roomTypeId, is_active: true, status: { [Op.in]: BOOKABLE_ROOM_STATUSES } },
      transaction: options.transaction
    });
  },

  async getRoomTypeAvailability({ roomTypeId, checkInDate, checkOutDate, excludeHoldToken = null, excludeReservationId = null }, options = {}) {
    const Room = model('HospitalityRoom');
    const ReservationRoom = model('HospitalityReservationRoom');
    const BookingHold = model('HospitalityBookingHold');
    const rooms = await Room.findAll({
      where: { room_type_id: roomTypeId, is_active: true, status: { [Op.in]: BOOKABLE_ROOM_STATUSES } },
      attributes: ['room_id'],
      transaction: options.transaction,
      lock: options.transaction ? options.transaction.LOCK.UPDATE : undefined
    });
    const roomCount = rooms.length;
    const reservationWhere = {
      room_type_id: roomTypeId,
      status: { [Op.in]: ACTIVE_RESERVATION_ROOM_STATUSES },
      check_in_date: { [Op.lt]: checkOutDate },
      check_out_date: { [Op.gt]: checkInDate }
    };
    if (excludeReservationId) reservationWhere.reservation_id = { [Op.ne]: excludeReservationId };
    const bookedCount = await ReservationRoom.count({
      where: reservationWhere,
      transaction: options.transaction
    });
    const holdWhere = {
      room_type_id: roomTypeId,
      status: { [Op.in]: ACTIVE_HOLD_STATUSES },
      expires_at: { [Op.gt]: new Date() },
      check_in_date: { [Op.lt]: checkOutDate },
      check_out_date: { [Op.gt]: checkInDate }
    };
    if (excludeHoldToken) holdWhere.hold_token = { [Op.ne]: excludeHoldToken };
    const holds = await BookingHold.findAll({
      where: holdWhere,
      attributes: ['room_count'],
      transaction: options.transaction,
      lock: options.transaction ? options.transaction.LOCK.UPDATE : undefined
    });
    const heldCount = toPlainList(holds).reduce((sum, hold) => sum + Number(hold.room_count || 0), 0);
    return {
      room_count: roomCount,
      booked_count: bookedCount,
      held_count: heldCount,
      available_rooms: Math.max(0, roomCount - bookedCount - heldCount)
    };
  },

  async listAvailableRoomsForAssignment({ roomTypeId, checkInDate, checkOutDate, excludeReservationId = null }, options = {}) {
    const rooms = toPlainList(await model('HospitalityRoom').findAll({
      where: { room_type_id: roomTypeId, is_active: true, status: { [Op.in]: BOOKABLE_ROOM_STATUSES } },
      include: includeRoomType(),
      order: [['room_number', 'ASC']],
      transaction: options.transaction,
      lock: options.transaction ? options.transaction.LOCK.UPDATE : undefined
    }));
    if (rooms.length === 0) return [];
    const conflictWhere = {
      room_id: { [Op.in]: rooms.map((room) => room.room_id) },
      status: { [Op.in]: ACTIVE_RESERVATION_ROOM_STATUSES },
      check_in_date: { [Op.lt]: checkOutDate },
      check_out_date: { [Op.gt]: checkInDate }
    };
    if (excludeReservationId) conflictWhere.reservation_id = { [Op.ne]: excludeReservationId };
    const conflicts = toPlainList(await model('HospitalityReservationRoom').findAll({
      where: conflictWhere,
      attributes: ['room_id'],
      transaction: options.transaction
    }));
    const blockedRoomIds = new Set(conflicts.map((entry) => Number(entry.room_id)));
    return rooms
      .filter((room) => !blockedRoomIds.has(Number(room.room_id)))
      .sort((left, right) => {
        const leftPriority = ROOM_ASSIGNMENT_PRIORITY.indexOf(left.status);
        const rightPriority = ROOM_ASSIGNMENT_PRIORITY.indexOf(right.status);
        const normalizedLeft = leftPriority === -1 ? ROOM_ASSIGNMENT_PRIORITY.length : leftPriority;
        const normalizedRight = rightPriority === -1 ? ROOM_ASSIGNMENT_PRIORITY.length : rightPriority;
        if (normalizedLeft !== normalizedRight) return normalizedLeft - normalizedRight;
        return String(left.room_number || '').localeCompare(String(right.room_number || ''), undefined, { numeric: true });
      });
  },

  async createBookingHold(payload, options = {}) {
    return toPlain(await model('HospitalityBookingHold').create(payload, { transaction: options.transaction }));
  },

  async findActiveBookingHold(holdToken, options = {}) {
    if (!holdToken) return null;
    return toPlain(await model('HospitalityBookingHold').findOne({
      where: {
        hold_token: holdToken,
        status: 'active',
        expires_at: { [Op.gt]: new Date() }
      },
      transaction: options.transaction,
      lock: options.transaction ? options.transaction.LOCK.UPDATE : undefined
    }));
  },

  async consumeBookingHold(holdToken, options = {}) {
    if (!holdToken) return null;
    await model('HospitalityBookingHold').update(
      { status: 'consumed' },
      { where: { hold_token: holdToken }, transaction: options.transaction }
    );
  },

  async listRatePlans({ activeOnly = false } = {}) {
    return toPlainList(await model('HospitalityRatePlan').findAll({
      where: activeOnly ? { is_active: true } : {},
      order: [['name', 'ASC']]
    }));
  },

  async createRatePlan(payload) {
    return toPlain(await model('HospitalityRatePlan').create(payload));
  },

  async listFolios({ status = null, reservationId = null, limit = 200 } = {}) {
    const where = {};
    if (status) where.status = status;
    if (reservationId) where.reservation_id = reservationId;
    return toPlainList(await model('HospitalityFolio').findAll({
      where,
      include: includeFolioLines(),
      order: [['updated_at', 'DESC']],
      limit: Math.min(Number.parseInt(limit, 10) || 200, 500)
    }));
  },

  async createFolio(payload, options = {}) {
    return toPlain(await model('HospitalityFolio').create(payload, { transaction: options.transaction }));
  },

  async findFolioById(folioId, options = {}) {
    return toPlain(await model('HospitalityFolio').findByPk(folioId, {
      include: includeFolioLines(),
      transaction: options.transaction,
      lock: options.transaction ? options.transaction.LOCK.UPDATE : undefined
    }));
  },

  async addFolioLine(folioId, payload, options = {}) {
    const normalizedPayload = {
      ...payload,
      folio_id: folioId,
      unit_amount: payload.unit_amount ?? payload.unit_price ?? 0
    };
    delete normalizedPayload.unit_price;
    const line = await model('HospitalityFolioLine').create(normalizedPayload, { transaction: options.transaction });
    const lines = await model('HospitalityFolioLine').findAll({ where: { folio_id: folioId }, transaction: options.transaction });
    const totals = calculateFolioTotals(lines);
    await model('HospitalityFolio').update({
      total_charges: totals.charges,
      total_payments: totals.payments,
      balance: totals.balance
    }, { where: { folio_id: folioId }, transaction: options.transaction });
    return toPlain(line);
  },

  async listHousekeepingTasks({ status = null, limit = 200 } = {}) {
    const where = status ? { status } : {};
    return toPlainList(await model('HospitalityHousekeepingTask').findAll({
      where,
      include: [{ model: model('HospitalityRoom'), as: 'room', required: false }],
      order: [['due_at', 'ASC'], ['updated_at', 'DESC']],
      limit: Math.min(Number.parseInt(limit, 10) || 200, 500)
    }));
  },

  async createHousekeepingTask(payload, options = {}) {
    return toPlain(await model('HospitalityHousekeepingTask').create(payload, { transaction: options.transaction }));
  },

  async updateHousekeepingTask(taskId, payload, options = {}) {
    const row = await model('HospitalityHousekeepingTask').findByPk(taskId, { transaction: options.transaction });
    if (!row) return null;
    await row.update(payload, { transaction: options.transaction });
    return toPlain(row);
  },

  async listMaintenanceRequests({ status = null, limit = 200 } = {}) {
    const where = status ? { status } : {};
    return toPlainList(await model('HospitalityMaintenanceRequest').findAll({
      where,
      include: [
        { model: model('HospitalityRoom'), as: 'room', required: false },
        { model: model('HospitalityFacility'), as: 'facility', required: false }
      ],
      order: [['updated_at', 'DESC']],
      limit: Math.min(Number.parseInt(limit, 10) || 200, 500)
    }));
  },

  async createMaintenanceRequest(payload, options = {}) {
    return toPlain(await model('HospitalityMaintenanceRequest').create(payload, { transaction: options.transaction }));
  },

  async updateMaintenanceRequest(requestId, payload, options = {}) {
    const row = await model('HospitalityMaintenanceRequest').findByPk(requestId, { transaction: options.transaction });
    if (!row) return null;
    await row.update(payload, { transaction: options.transaction });
    return toPlain(row);
  },

  async listAmenities({ activeOnly = false, type = null } = {}) {
    const where = {};
    if (activeOnly) where.is_active = true;
    if (type) where.amenity_type = type;
    return toPlainList(await model('HospitalityAmenity').findAll({ where, order: [['amenity_type', 'ASC'], ['name', 'ASC']] }));
  },

  async createAmenity(payload) {
    return toPlain(await model('HospitalityAmenity').create(payload));
  },

  async listFacilities({ activeOnly = false } = {}) {
    return toPlainList(await model('HospitalityFacility').findAll({
      where: activeOnly ? { is_active: true } : {},
      order: [['name', 'ASC']]
    }));
  },

  async createFacility(payload) {
    return toPlain(await model('HospitalityFacility').create(payload));
  },

  async listPackages({ activeOnly = false } = {}) {
    return toPlainList(await model('HospitalityPackage').findAll({
      where: activeOnly ? { is_active: true } : {},
      order: [['name', 'ASC']]
    }));
  },

  async createPackage(payload) {
    return toPlain(await model('HospitalityPackage').create(payload));
  },

  async createRoomAmenity(payload, options = {}) {
    return toPlain(await model('HospitalityRoomAmenity').create(payload, { transaction: options.transaction }));
  },

  async createPropertyAmenity(payload, options = {}) {
    return toPlain(await model('HospitalityPropertyAmenity').create(payload, { transaction: options.transaction }));
  },

  async createFacilityBooking(payload, options = {}) {
    return toPlain(await model('HospitalityFacilityBooking').create(payload, { transaction: options.transaction }));
  },

  async countFacilityBookingConflicts({ facilityId, startAt, endAt }, options = {}) {
    return model('HospitalityFacilityBooking').count({
      where: {
        facility_id: facilityId,
        status: { [Op.in]: ['requested', 'confirmed'] },
        start_at: { [Op.lt]: endAt },
        end_at: { [Op.gt]: startAt }
      },
      transaction: options.transaction
    });
  },

  async createPackageItem(payload, options = {}) {
    return toPlain(await model('HospitalityPackageItem').create(payload, { transaction: options.transaction }));
  },

  async listGuestMessages({ reservation_id = null, guest_profile_id = null, limit = 100 } = {}) {
    const where = {};
    if (reservation_id) where.reservation_id = reservation_id;
    if (guest_profile_id) where.guest_profile_id = guest_profile_id;
    return toPlainList(await model('HospitalityGuestMessage').findAll({
      where,
      order: [['created_at', 'DESC']],
      limit: Math.min(Number.parseInt(limit, 10) || 100, 300)
    }));
  },

  async createGuestMessage(payload, options = {}) {
    return toPlain(await model('HospitalityGuestMessage').create(payload, { transaction: options.transaction }));
  },

  async createAuditEvent(payload, options = {}) {
    const event = await model('HospitalityAuditEvent').create(payload, { transaction: options.transaction });
    await model('AuditLog').create(buildGeneralAuditLogPayload(payload), { transaction: options.transaction });
    return toPlain(event);
  },

  async findStayByReservationRoom(reservationRoomId, options = {}) {
    return toPlain(await model('HospitalityStay').findOne({
      where: { reservation_room_id: reservationRoomId },
      transaction: options.transaction
    }));
  },

  async createStay(payload, options = {}) {
    return toPlain(await model('HospitalityStay').create(payload, { transaction: options.transaction }));
  },

  async updateStaysForReservation(reservationId, payload, options = {}) {
    await model('HospitalityStay').update(payload, {
      where: { reservation_id: reservationId },
      transaction: options.transaction
    });
  },

  async updateReservationRoomsForReservation(reservationId, payload, options = {}) {
    await model('HospitalityReservationRoom').update(payload, {
      where: { reservation_id: reservationId },
      transaction: options.transaction
    });
  },

  async updateReservationRoom(reservationRoomId, payload, options = {}) {
    const row = await model('HospitalityReservationRoom').findByPk(reservationRoomId, { transaction: options.transaction });
    if (!row) return null;
    await row.update(payload, { transaction: options.transaction });
    return toPlain(row);
  },

  async dashboardCounts(today) {
    const Reservation = model('HospitalityReservation');
    const Room = model('HospitalityRoom');
    const HousekeepingTask = model('HospitalityHousekeepingTask');
    const MaintenanceRequest = model('HospitalityMaintenanceRequest');
    const [arrivals, departures, inHouse, rooms, housekeepingOpen, maintenanceOpen, activeReservations, unassignedArrivals, outOfOrderRooms] = await Promise.all([
      Reservation.count({ where: { check_in_date: today, status: { [Op.in]: ['confirmed', 'checked_in', 'in_house'] } } }),
      Reservation.count({ where: { check_out_date: today, status: { [Op.in]: ['checked_in', 'in_house'] } } }),
      Reservation.count({ where: { status: { [Op.in]: ['checked_in', 'in_house'] } } }),
      Room.findAll({ attributes: ['status'] }),
      HousekeepingTask.count({ where: { status: { [Op.notIn]: ['inspected', 'blocked'] } } }),
      MaintenanceRequest.count({ where: { status: { [Op.notIn]: ['resolved', 'deferred'] } } }),
      Reservation.findAll({ where: { status: { [Op.in]: ['confirmed', 'checked_in', 'in_house'] } }, attributes: ['total_amount', 'room_count'] }),
      model('HospitalityReservationRoom').count({
        where: {
          room_id: null,
          check_in_date: today,
          status: { [Op.in]: ['reserved', 'assigned'] }
        }
      }),
      Room.count({ where: { status: 'out_of_order' } })
    ]);
    const roomRows = toPlainList(rooms);
    const activeRows = toPlainList(activeReservations);
    const roomCount = roomRows.length;
    const roomNights = activeRows.reduce((sum, reservation) => sum + Number(reservation.room_count || 1), 0);
    const revenue = activeRows.reduce((sum, reservation) => sum + Number(reservation.total_amount || 0), 0);
    const occupancyPercent = roomCount > 0 ? Number(((inHouse / roomCount) * 100).toFixed(2)) : 0;
    const adr = roomNights > 0 ? Number((revenue / roomNights).toFixed(4)) : 0;
    const revpar = roomCount > 0 ? Number((revenue / roomCount).toFixed(4)) : 0;
    return {
      arrivals,
      departures,
      in_house: inHouse,
      rooms_by_status: roomRows.reduce((acc, row) => ({ ...acc, [row.status]: (acc[row.status] || 0) + 1 }), {}),
      housekeeping_open: housekeepingOpen,
      maintenance_open: maintenanceOpen,
      room_count: roomCount,
      occupancy_percent: occupancyPercent,
      adr,
      revpar,
      unassigned_arrivals: unassignedArrivals,
      out_of_order_rooms: outOfOrderRooms
    };
  }
};
