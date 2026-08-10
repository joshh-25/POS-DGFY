import crypto from 'crypto';

const ok = (data) => ({ success: true, data });
const fail = (code, message, details = null) => ({
  success: false,
  error: { code, message, details }
});

const todayDate = () => new Date().toISOString().slice(0, 10);
const parsePositiveInt = (value, fallback = 1) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};
const money = (value) => Number(Number(value || 0).toFixed(4));
const publicRef = () => `HSP-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
const HOLD_MINUTES = 15;
const FOLIO_BALANCE_TOLERANCE = 0.0001;

const stableJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};
const requestHash = (payload = {}) => crypto.createHash('sha256').update(stableJson({
  room_type_id: payload.room_type_id,
  room_id: payload.room_id || null,
  rooms: payload.rooms || null,
  check_in_date: payload.check_in_date,
  check_out_date: payload.check_out_date,
  adults: payload.adults || 1,
  children: payload.children || 0,
  room_count: payload.room_count || 1,
  total_amount: payload.total_amount ?? null,
  add_ons_snapshot: payload.add_ons_snapshot || null,
  packages: payload.packages || null,
  add_ons: payload.add_ons || null
})).digest('hex');

const validateStayWindow = ({ check_in_date, check_out_date }) => {
  if (!check_in_date || !check_out_date) {
    return fail('HOSPITALITY_STAY_DATES_REQUIRED', 'check_in_date and check_out_date are required.');
  }
  if (String(check_out_date) <= String(check_in_date)) {
    return fail('HOSPITALITY_INVALID_STAY_WINDOW', 'check_out_date must be after check_in_date.');
  }
  return null;
};

const sanitizeRoomRows = (payload = {}) => {
  const rows = Array.isArray(payload.rooms) ? payload.rooms : [];
  if (rows.length > 0) {
    return rows.map((room) => ({
      room_type_id: room.room_type_id || payload.room_type_id,
      room_id: room.room_id || null,
      rate_plan_id: room.rate_plan_id || payload.rate_plan_id || null,
      check_in_date: room.check_in_date || payload.check_in_date,
      check_out_date: room.check_out_date || payload.check_out_date,
      nightly_rate: money(room.nightly_rate ?? payload.nightly_rate ?? payload.default_rate),
      guest_count: parsePositiveInt(room.guest_count ?? payload.adults, 1),
      status: room.room_id ? 'assigned' : 'reserved'
    }));
  }
  const roomCount = payload.room_id ? 1 : parsePositiveInt(payload.room_count, 1);
  return Array.from({ length: roomCount }, () => ({
      room_type_id: payload.room_type_id,
      room_id: payload.room_id || null,
      rate_plan_id: payload.rate_plan_id || null,
      check_in_date: payload.check_in_date,
      check_out_date: payload.check_out_date,
      nightly_rate: money(payload.nightly_rate ?? payload.default_rate),
      guest_count: parsePositiveInt(payload.adults, 1),
      status: payload.room_id ? 'assigned' : 'reserved'
    }));
};

const calculateNights = (checkIn, checkOut) => {
  const start = new Date(`${checkIn}T00:00:00.000Z`);
  const end = new Date(`${checkOut}T00:00:00.000Z`);
  return Math.max(1, Math.round((end - start) / 86400000));
};

const normalizeFolioPayload = (payload = {}) => {
  const quantity = Number(payload.quantity || 1);
  const unitAmount = money(payload.unit_amount ?? payload.unit_price ?? payload.unit_amount);
  const taxAmount = money(payload.tax_amount);
  const totalAmount = payload.total_amount != null
    ? money(payload.total_amount)
    : money(quantity * unitAmount + taxAmount);
  return {
    ...payload,
    quantity,
    unit_amount: unitAmount,
    tax_amount: taxAmount,
    total_amount: totalAmount
  };
};

const publicReservationSummary = (reservation = {}) => ({
  public_reference: reservation.public_reference,
  status: reservation.status,
  source: reservation.source,
  check_in_date: reservation.check_in_date,
  check_out_date: reservation.check_out_date,
  adults: reservation.adults,
  children: reservation.children,
  room_count: reservation.room_count,
  rooms: (reservation.rooms || []).map((room) => ({
    room_type_id: room.room_type_id,
    room_type_name: room.roomType?.name || null,
    check_in_date: room.check_in_date,
    check_out_date: room.check_out_date,
    nightly_rate: money(room.nightly_rate),
    guest_count: room.guest_count,
    status: room.status
  })),
  total_amount: money(reservation.total_amount),
  deposit_amount: money(reservation.deposit_amount),
  deposit_due_amount: money(reservation.payment_status === 'unpaid' ? reservation.deposit_amount : 0),
  payment_status: reservation.payment_status,
  payment_collection: 'property_collects',
  payment_due_at: 'property'
});

const assignAvailableRooms = async ({
  hospitalityRepository,
  roomRows = [],
  transaction,
  excludeReservationId = null
}) => {
  const unassignedByType = new Map();
  for (const row of roomRows) {
    if (row.room_id) continue;
    const key = String(row.room_type_id);
    if (!unassignedByType.has(key)) unassignedByType.set(key, []);
    unassignedByType.get(key).push(row);
  }
  for (const rows of unassignedByType.values()) {
    const firstRow = rows[0];
    const availableRooms = await hospitalityRepository.listAvailableRoomsForAssignment({
      roomTypeId: firstRow.room_type_id,
      checkInDate: firstRow.check_in_date,
      checkOutDate: firstRow.check_out_date,
      excludeReservationId
    }, { transaction });
    if (availableRooms.length < rows.length) {
      return fail('HOSPITALITY_AUTO_ASSIGN_UNAVAILABLE', 'No assignable room is available for the selected room type and stay window.', {
        room_type_id: firstRow.room_type_id,
        requested_rooms: rows.length,
        available_rooms: availableRooms.length
      });
    }
    rows.forEach((row, index) => {
      row.room_id = availableRooms[index].room_id;
      row.status = 'assigned';
    });
  }
  return ok(roomRows);
};

const summarizeReservationRooms = (rooms = []) => rooms.map((room) => ({
  reservation_room_id: room.reservation_room_id,
  room_type_id: room.room_type_id,
  room_id: room.room_id || null,
  status: room.status,
  check_in_date: room.check_in_date,
  check_out_date: room.check_out_date
}));

const summarizeOpenFolioBalances = (folios = []) => folios
  .filter((folio) => folio.status === 'open' && Math.abs(Number(folio.balance || 0)) > FOLIO_BALANCE_TOLERANCE)
  .map((folio) => ({
    folio_id: folio.folio_id,
    balance: money(folio.balance),
    total_charges: money(folio.total_charges),
    total_payments: money(folio.total_payments)
  }));

export const buildHospitalityUseCases = ({ hospitalityRepository }) => ({
  async dashboard() {
    return ok(await hospitalityRepository.dashboardCounts(todayDate()));
  },

  async listRoomTypes({ query = {} } = {}) {
    return ok(await hospitalityRepository.listRoomTypes(query));
  },

  async createRoomType({ payload = {} } = {}) {
    if (!payload.code || !payload.name) return fail('HOSPITALITY_ROOM_TYPE_REQUIRED', 'Room type code and name are required.');
    return ok(await hospitalityRepository.createRoomType(payload));
  },

  async listRooms({ query = {} } = {}) {
    return ok(await hospitalityRepository.listRooms(query));
  },

  async createRoom({ payload = {} } = {}) {
    if (!payload.room_type_id || !payload.room_number) return fail('HOSPITALITY_ROOM_REQUIRED', 'room_type_id and room_number are required.');
    return ok(await hospitalityRepository.createRoom(payload));
  },

  async updateRoomStatus({ roomId, payload = {} } = {}) {
    const room = await hospitalityRepository.updateRoomStatus(roomId, payload);
    return room ? ok(room) : fail('HOSPITALITY_ROOM_NOT_FOUND', 'Room was not found.');
  },

  async listGuests({ query = {} } = {}) {
    return ok(await hospitalityRepository.listGuests(query));
  },

  async createGuest({ payload = {} } = {}) {
    if (!payload.name) return fail('HOSPITALITY_GUEST_REQUIRED', 'Guest name is required.');
    return ok(await hospitalityRepository.createGuest(payload));
  },

  async listReservations({ query = {} } = {}) {
    return ok(await hospitalityRepository.listReservations(query));
  },

  async listStays({ query = {} } = {}) {
    return ok(await hospitalityRepository.listStays(query));
  },

  async createReservation({ payload = {}, source = 'admin', auditContext = {} } = {}) {
    const dateFailure = validateStayWindow(payload);
    if (dateFailure) return dateFailure;
    if (!payload.customer_name) return fail('HOSPITALITY_CUSTOMER_REQUIRED', 'customer_name is required.');
    if (!payload.room_type_id && !Array.isArray(payload.rooms)) {
      return fail('HOSPITALITY_ROOM_TYPE_REQUIRED', 'At least one room_type_id is required.');
    }

    const currentHash = requestHash(payload);
    return hospitalityRepository.transaction(async (transaction) => {
      if (payload.idempotency_key) {
        const existing = await hospitalityRepository.findReservationByIdempotencyKey(payload.idempotency_key, { transaction });
        if (existing) {
          if (existing.request_hash && existing.request_hash !== currentHash) {
            return fail('HOSPITALITY_IDEMPOTENCY_CONFLICT', 'This idempotency key was already used for a different booking request.');
          }
          return ok(existing);
        }
      }

      if (payload.hold_token) {
        const hold = await hospitalityRepository.findActiveBookingHold(payload.hold_token, { transaction });
        if (!hold) return fail('HOSPITALITY_HOLD_INVALID', 'Booking hold is invalid or expired.');
        if (Number(hold.room_type_id) !== Number(payload.room_type_id)
          || String(hold.check_in_date) !== String(payload.check_in_date)
          || String(hold.check_out_date) !== String(payload.check_out_date)) {
          return fail('HOSPITALITY_HOLD_MISMATCH', 'Booking hold does not match the requested stay.');
        }
      } else if (source === 'storefront') {
        return fail('HOSPITALITY_HOLD_REQUIRED', 'A valid booking hold is required before confirming a direct booking.');
      }

      const roomRows = sanitizeRoomRows(payload);
      for (const row of roomRows) {
        if (!row.room_type_id) return fail('HOSPITALITY_ROOM_TYPE_REQUIRED', 'Every reservation room requires room_type_id.');
        if (row.room_id) {
          const conflicts = await hospitalityRepository.countReservationRoomConflicts({
            roomId: row.room_id,
            checkInDate: row.check_in_date,
            checkOutDate: row.check_out_date
          }, { transaction });
          if (conflicts > 0) {
            return fail('HOSPITALITY_ROOM_CONFLICT', 'Selected room is not available for the requested stay window.', { room_id: row.room_id });
          }
        }
      }

      if (payload.auto_assign_rooms === true) {
        const assignment = await assignAvailableRooms({ hospitalityRepository, roomRows, transaction });
        if (!assignment.success) return assignment;
      }

      const capacityByType = new Map();
      for (const row of roomRows) {
        const key = String(row.room_type_id);
        if (!capacityByType.has(key)) capacityByType.set(key, { room_type_id: row.room_type_id, requested: 0 });
        capacityByType.get(key).requested += 1;
      }
      for (const entry of capacityByType.values()) {
        const availability = await hospitalityRepository.getRoomTypeAvailability({
          roomTypeId: entry.room_type_id,
          checkInDate: payload.check_in_date,
          checkOutDate: payload.check_out_date,
          excludeHoldToken: payload.hold_token || null
        }, { transaction });
        if (entry.requested > availability.available_rooms) {
          return fail('HOSPITALITY_ROOM_TYPE_UNAVAILABLE', 'Requested room quantity exceeds available rooms for the stay window.', {
            room_type_id: entry.room_type_id,
            requested_rooms: entry.requested,
            available_rooms: availability.available_rooms
          });
        }
      }

      const nights = calculateNights(payload.check_in_date, payload.check_out_date);
      const total = payload.total_amount != null
        ? money(payload.total_amount)
        : money(roomRows.reduce((sum, row) => sum + Number(row.nightly_rate || 0) * nights, 0));

      const reservation = await hospitalityRepository.createReservation({
        public_reference: payload.public_reference || publicRef(),
        guest_profile_id: payload.guest_profile_id || null,
        store_customer_id: payload.store_customer_id || auditContext.store_customer_id || null,
        customer_name: payload.customer_name,
        customer_email: payload.customer_email || null,
        customer_phone: payload.customer_phone || null,
        status: payload.status || 'confirmed',
        source,
        check_in_date: payload.check_in_date,
        check_out_date: payload.check_out_date,
        adults: parsePositiveInt(payload.adults, 1),
        children: Math.max(0, Number.parseInt(payload.children, 10) || 0),
        room_count: roomRows.length,
        rate_plan_id: payload.rate_plan_id || null,
        total_amount: total,
        deposit_amount: money(payload.deposit_amount),
        payment_status: payload.payment_status || 'unpaid',
        idempotency_key: payload.idempotency_key || null,
        request_hash: payload.request_hash || currentHash,
        external_source: payload.external_source || null,
        external_reference: payload.external_reference || null,
        channel_metadata: payload.channel_metadata || null,
        special_requests: payload.special_requests || null,
        policies_snapshot: payload.policies_snapshot || null,
        add_ons_snapshot: payload.add_ons_snapshot || null
      }, roomRows, { transaction });
      if (payload.hold_token) await hospitalityRepository.consumeBookingHold(payload.hold_token, { transaction });
      await hospitalityRepository.createAuditEvent({
        entity_type: 'reservation',
        entity_id: reservation.reservation_id,
        action: 'create',
        actor_user_id: auditContext.actor_user_id || null,
        after_snapshot: { status: reservation.status, public_reference: reservation.public_reference },
        metadata: { ...auditContext, source }
      }, { transaction });
      return ok(reservation);
    });
  },

  async updateReservationStatus({ reservationId, payload = {}, auditContext = {} } = {}) {
    const nextStatus = payload.status;
    if (!nextStatus) return fail('HOSPITALITY_RESERVATION_STATUS_REQUIRED', 'status is required.');

    return hospitalityRepository.transaction(async (transaction) => {
      const before = await hospitalityRepository.findReservationById(reservationId, { transaction });
      if (!before) return fail('HOSPITALITY_RESERVATION_NOT_FOUND', 'Reservation was not found.');

      const now = new Date();
      const nextCheckInDate = payload.check_in_date || before.check_in_date;
      const nextCheckOutDate = payload.check_out_date || before.check_out_date;
      if (payload.check_in_date || payload.check_out_date) {
        const dateFailure = validateStayWindow({ check_in_date: nextCheckInDate, check_out_date: nextCheckOutDate });
        if (dateFailure) return dateFailure;
        const unassignedByType = new Map();
        for (const roomRow of before.rooms || []) {
          if (!roomRow.room_id) {
            const key = String(roomRow.room_type_id);
            if (!unassignedByType.has(key)) unassignedByType.set(key, { room_type_id: roomRow.room_type_id, requested: 0 });
            unassignedByType.get(key).requested += 1;
            continue;
          }
          const conflicts = await hospitalityRepository.countReservationRoomConflicts({
            roomId: roomRow.room_id,
            checkInDate: nextCheckInDate,
            checkOutDate: nextCheckOutDate,
            excludeReservationId: reservationId
          }, { transaction });
          if (conflicts > 0) {
            return fail('HOSPITALITY_STAY_EXTENSION_CONFLICT', 'Updated stay dates conflict with existing room or room-type capacity.', {
              reservation_room_id: roomRow.reservation_room_id,
              room_id: roomRow.room_id || null,
              room_type_id: roomRow.room_type_id
            });
          }
        }
        for (const entry of unassignedByType.values()) {
          const availability = await hospitalityRepository.getRoomTypeAvailability({
            roomTypeId: entry.room_type_id,
            checkInDate: nextCheckInDate,
            checkOutDate: nextCheckOutDate,
            excludeReservationId: reservationId
          }, { transaction });
          if (entry.requested > availability.available_rooms) {
            return fail('HOSPITALITY_STAY_EXTENSION_CONFLICT', 'Updated stay dates conflict with room-type capacity.', {
              room_type_id: entry.room_type_id,
              requested_rooms: entry.requested,
              available_rooms: availability.available_rooms
            });
          }
        }
        await hospitalityRepository.updateReservationDates(reservationId, {
          check_in_date: nextCheckInDate,
          check_out_date: nextCheckOutDate
        }, { transaction });
      }

      if (['checked_in', 'in_house'].includes(nextStatus)) {
        const latestBeforeCheckIn = await hospitalityRepository.findReservationById(reservationId, { transaction });
        const assignableRows = (latestBeforeCheckIn.rooms || []).map((room) => ({ ...room }));
        const assignment = await assignAvailableRooms({
          hospitalityRepository,
          roomRows: assignableRows,
          transaction,
          excludeReservationId: reservationId
        });
        if (!assignment.success) {
          return fail('HOSPITALITY_CHECK_IN_ROOM_ASSIGNMENT_REQUIRED', 'Check-in requires an assigned physical room for every reserved room.', assignment.error.details);
        }
        for (const row of assignableRows) {
          if (!row.reservation_room_id || !row.room_id) continue;
          const original = (before.rooms || []).find((entry) => Number(entry.reservation_room_id) === Number(row.reservation_room_id));
          if (!original?.room_id || Number(original.room_id) !== Number(row.room_id)) {
            await hospitalityRepository.updateReservationRoom(row.reservation_room_id, { room_id: row.room_id, status: 'assigned' }, { transaction });
          }
        }
      }

      if (nextStatus === 'checked_out' && payload.override_open_balance !== true) {
        const openBalances = summarizeOpenFolioBalances(await hospitalityRepository.listFolios({ reservationId, limit: 50 }));
        if (openBalances.length > 0) {
          return fail('HOSPITALITY_FOLIO_BALANCE_DUE', 'Checkout is blocked while open folios have a remaining balance.', { folios: openBalances });
        }
      }

      const reservationPayload = { ...payload };
      delete reservationPayload.override_open_balance;
      const reservation = await hospitalityRepository.updateReservationStatus(reservationId, reservationPayload, { transaction });
      const rooms = reservation.rooms || [];

      if (['checked_in', 'in_house'].includes(nextStatus)) {
        await hospitalityRepository.updateReservationRoomsForReservation(reservationId, { status: 'checked_in' }, { transaction });
        for (const roomRow of rooms) {
          const existingStay = await hospitalityRepository.findStayByReservationRoom(roomRow.reservation_room_id, { transaction });
          if (!existingStay) {
            await hospitalityRepository.createStay({
              reservation_id: reservationId,
              reservation_room_id: roomRow.reservation_room_id,
              room_id: roomRow.room_id || null,
              guest_profile_id: reservation.guest_profile_id || null,
              status: 'in_house',
              actual_check_in_at: now
            }, { transaction });
          }
          if (roomRow.room_id) {
            await hospitalityRepository.updateRoomStatus(roomRow.room_id, { status: 'occupied_dirty', housekeeping_status: 'pending' }, { transaction });
          }
        }
      }

      if (nextStatus === 'checked_out') {
        await hospitalityRepository.updateReservationRoomsForReservation(reservationId, { status: 'checked_out' }, { transaction });
        await hospitalityRepository.updateStaysForReservation(reservationId, { status: 'checked_out', actual_check_out_at: now }, { transaction });
        for (const roomRow of rooms) {
          if (roomRow.room_id) {
            await hospitalityRepository.updateRoomStatus(roomRow.room_id, { status: 'vacant_dirty', housekeeping_status: 'pending' }, { transaction });
            await hospitalityRepository.createHousekeepingTask({
              room_id: roomRow.room_id,
              reservation_id: reservationId,
              task_type: 'turnover',
              status: 'pending',
              priority: 'normal',
              due_at: now,
              notes: 'Auto-created after guest check-out.'
            }, { transaction });
          }
        }
      }

      if (['cancelled', 'no_show'].includes(nextStatus)) {
        await hospitalityRepository.updateReservationRoomsForReservation(reservationId, { status: nextStatus }, { transaction });
        await hospitalityRepository.updateStaysForReservation(reservationId, { status: 'cancelled' }, { transaction });
      }

      const after = await hospitalityRepository.findReservationById(reservationId, { transaction });
      await hospitalityRepository.createAuditEvent({
        entity_type: 'reservation',
        entity_id: Number(reservationId),
        action: `status:${before.status}->${nextStatus}`,
        actor_user_id: auditContext.actor_user_id || null,
        before_snapshot: {
          status: before.status,
          check_in_date: before.check_in_date,
          check_out_date: before.check_out_date,
          rooms: summarizeReservationRooms(before.rooms)
        },
        after_snapshot: {
          status: nextStatus,
          check_in_date: after?.check_in_date,
          check_out_date: after?.check_out_date,
          rooms: summarizeReservationRooms(after?.rooms)
        },
        metadata: auditContext
      }, { transaction });
      return ok(after);
    });
  },

  async updateReservationRoomAssignment({ reservationId, reservationRoomId, payload = {}, auditContext = {} } = {}) {
    if (!payload.room_id) return fail('HOSPITALITY_ROOM_ASSIGNMENT_REQUIRED', 'room_id is required.');
    return hospitalityRepository.transaction(async (transaction) => {
      const reservation = await hospitalityRepository.findReservationById(reservationId, { transaction });
      if (!reservation) return fail('HOSPITALITY_RESERVATION_NOT_FOUND', 'Reservation was not found.');
      const reservationRoom = await hospitalityRepository.findReservationRoomById(reservationRoomId, { transaction });
      if (!reservationRoom || Number(reservationRoom.reservation_id) !== Number(reservationId)) {
        return fail('HOSPITALITY_RESERVATION_ROOM_NOT_FOUND', 'Reservation room was not found for this reservation.');
      }
      const room = await hospitalityRepository.findRoomById(payload.room_id, { transaction });
      if (!room) return fail('HOSPITALITY_ROOM_NOT_FOUND', 'Room was not found.');
      if (Number(room.room_type_id) !== Number(reservationRoom.room_type_id)) {
        return fail('HOSPITALITY_ROOM_TYPE_MISMATCH', 'Selected room does not match the reservation room type.', {
          expected_room_type_id: reservationRoom.room_type_id,
          selected_room_type_id: room.room_type_id
        });
      }
      const conflicts = await hospitalityRepository.countReservationRoomConflicts({
        roomId: payload.room_id,
        checkInDate: reservationRoom.check_in_date,
        checkOutDate: reservationRoom.check_out_date,
        excludeReservationId: reservationId
      }, { transaction });
      if (conflicts > 0) {
        return fail('HOSPITALITY_ROOM_CONFLICT', 'Selected room is not available for the reservation stay window.', { room_id: payload.room_id });
      }
      const updated = await hospitalityRepository.updateReservationRoom(reservationRoomId, {
        room_id: payload.room_id,
        status: 'assigned'
      }, { transaction });
      await hospitalityRepository.createAuditEvent({
        entity_type: 'reservation_room',
        entity_id: Number(reservationRoomId),
        action: 'room_move',
        actor_user_id: auditContext.actor_user_id || null,
        before_snapshot: {
          reservation_id: Number(reservationId),
          room_id: reservationRoom.room_id || null,
          status: reservationRoom.status
        },
        after_snapshot: {
          reservation_id: Number(reservationId),
          room_id: updated.room_id,
          status: updated.status
        },
        metadata: auditContext
      }, { transaction });
      return ok(await hospitalityRepository.findReservationById(reservationId, { transaction }));
    });
  },

  async availability({ query = {} } = {}) {
    const dateFailure = validateStayWindow(query);
    if (dateFailure) return dateFailure;
    const roomTypes = await hospitalityRepository.listRoomTypes({ activeOnly: true, limit: 500 });
    const availability = [];
    for (const roomType of roomTypes) {
      const capacity = await hospitalityRepository.getRoomTypeAvailability({
        roomTypeId: roomType.room_type_id,
        checkInDate: query.check_in_date,
        checkOutDate: query.check_out_date
      });
      const availableRooms = capacity.available_rooms;
      if (availableRooms > 0) {
        availability.push({
          room_type_id: roomType.room_type_id,
          code: roomType.code,
          name: roomType.name,
          description: roomType.description,
          max_occupancy: roomType.max_occupancy,
          available_rooms: availableRooms,
          starting_rate: roomType.default_rate,
          currency: roomType.currency,
          amenities: roomType.amenities_snapshot || []
        });
      }
    }
    return ok({ check_in_date: query.check_in_date, check_out_date: query.check_out_date, room_types: availability });
  },

  async quote({ payload = {} } = {}) {
    const dateFailure = validateStayWindow(payload);
    if (dateFailure) return dateFailure;
    if (!payload.room_type_id) return fail('HOSPITALITY_ROOM_TYPE_REQUIRED', 'room_type_id is required.');

    const roomTypes = await hospitalityRepository.listRoomTypes({ activeOnly: true, limit: 500 });
    const roomType = roomTypes.find((entry) => Number(entry.room_type_id) === Number(payload.room_type_id));
    if (!roomType) return fail('HOSPITALITY_ROOM_TYPE_NOT_FOUND', 'Room type was not found.');

    const capacity = await hospitalityRepository.getRoomTypeAvailability({
      roomTypeId: roomType.room_type_id,
      checkInDate: payload.check_in_date,
      checkOutDate: payload.check_out_date
    });
    const availableRooms = capacity.available_rooms;
    if (availableRooms <= 0) return fail('HOSPITALITY_ROOM_TYPE_UNAVAILABLE', 'Selected room type is unavailable for the requested stay window.');

    const nights = calculateNights(payload.check_in_date, payload.check_out_date);
    const roomCountRequested = parsePositiveInt(payload.room_count, 1);
    if (roomCountRequested > availableRooms) {
      return fail('HOSPITALITY_ROOM_TYPE_UNAVAILABLE', 'Requested room quantity exceeds available rooms for the stay window.', {
        requested_rooms: roomCountRequested,
        available_rooms: availableRooms
      });
    }
    const nightlyRate = money(payload.nightly_rate ?? roomType.default_rate);
    const roomSubtotal = money(nightlyRate * nights * roomCountRequested);
    const addOnSubtotal = money((payload.add_ons || []).reduce((sum, entry) => sum + Number(entry.price || 0) * parsePositiveInt(entry.quantity, 1), 0));
    const packageSubtotal = money((payload.packages || []).reduce((sum, entry) => sum + Number(entry.price_delta || entry.price || 0) * parsePositiveInt(entry.quantity, 1), 0));
    const total = money(roomSubtotal + addOnSubtotal + packageSubtotal);

    return ok({
      check_in_date: payload.check_in_date,
      check_out_date: payload.check_out_date,
      nights,
      room_type: {
        room_type_id: roomType.room_type_id,
        code: roomType.code,
        name: roomType.name,
        max_occupancy: roomType.max_occupancy,
        available_rooms: availableRooms
      },
      pricing: {
        currency: roomType.currency,
        room_subtotal: roomSubtotal,
        add_on_subtotal: addOnSubtotal,
        package_subtotal: packageSubtotal,
        total,
        deposit_due: 0,
        payment_collection: 'property_collects',
        payment_due_at: 'property'
      },
      lines: [
        { line_type: 'room_charge', description: `${roomType.name} x ${nights} night(s)`, quantity: roomCountRequested, unit_price: nightlyRate, amount: roomSubtotal },
        ...((payload.add_ons || []).map((entry) => ({ line_type: 'amenity', description: entry.name || 'Add-on', quantity: parsePositiveInt(entry.quantity, 1), unit_price: money(entry.price), amount: money(Number(entry.price || 0) * parsePositiveInt(entry.quantity, 1)) }))),
        ...((payload.packages || []).map((entry) => ({ line_type: 'fee', description: entry.name || 'Package', quantity: parsePositiveInt(entry.quantity, 1), unit_price: money(entry.price_delta || entry.price), amount: money(Number(entry.price_delta || entry.price || 0) * parsePositiveInt(entry.quantity, 1)) })))
      ]
    });
  },

  async bookingHold({ payload = {} } = {}) {
    const quoteResult = await this.quote({ payload });
    if (!quoteResult.success) return quoteResult;
    return hospitalityRepository.transaction(async (transaction) => {
      const requestedRooms = parsePositiveInt(payload.room_count, 1);
      const capacity = await hospitalityRepository.getRoomTypeAvailability({
        roomTypeId: payload.room_type_id,
        checkInDate: payload.check_in_date,
        checkOutDate: payload.check_out_date
      }, { transaction });
      if (requestedRooms > capacity.available_rooms) {
        return fail('HOSPITALITY_ROOM_TYPE_UNAVAILABLE', 'Requested room quantity exceeds available rooms for the stay window.', {
          requested_rooms: requestedRooms,
          available_rooms: capacity.available_rooms
        });
      }
      const token = `HOLD-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
      const expiresAt = new Date(Date.now() + HOLD_MINUTES * 60 * 1000);
      const hold = await hospitalityRepository.createBookingHold({
        hold_token: token,
        room_type_id: payload.room_type_id,
        check_in_date: payload.check_in_date,
        check_out_date: payload.check_out_date,
        room_count: requestedRooms,
        status: 'active',
        expires_at: expiresAt,
        idempotency_key: payload.idempotency_key || null,
        request_hash: requestHash(payload),
        quote_snapshot: quoteResult.data
      }, { transaction });
      return ok({
        hold_token: hold.hold_token,
        expires_at: hold.expires_at,
        quote: quoteResult.data
      });
    });
  },

  async listRatePlans({ query = {} } = {}) {
    return ok(await hospitalityRepository.listRatePlans(query));
  },

  async createRatePlan({ payload = {} } = {}) {
    if (!payload.code || !payload.name) return fail('HOSPITALITY_RATE_PLAN_REQUIRED', 'Rate plan code and name are required.');
    return ok(await hospitalityRepository.createRatePlan(payload));
  },

  async listFolios({ query = {} } = {}) {
    return ok(await hospitalityRepository.listFolios(query));
  },

  async createFolio({ payload = {} } = {}) {
    return ok(await hospitalityRepository.createFolio(payload));
  },

  async addFolioLine({ folioId, payload = {}, auditContext = {} } = {}) {
    if (!payload.line_type || !payload.description) return fail('HOSPITALITY_FOLIO_LINE_REQUIRED', 'line_type and description are required.');
    return hospitalityRepository.transaction(async (transaction) => {
      const folio = await hospitalityRepository.findFolioById(folioId, { transaction });
      if (!folio) return fail('HOSPITALITY_FOLIO_NOT_FOUND', 'Folio was not found.');
      if (folio.status !== 'open') return fail('HOSPITALITY_FOLIO_CLOSED', 'Only open folios can receive new lines.');
      const line = await hospitalityRepository.addFolioLine(folioId, normalizeFolioPayload(payload), { transaction });
      await hospitalityRepository.createAuditEvent({
        entity_type: 'folio',
        entity_id: Number(folioId),
        action: `line:${payload.line_type}`,
        actor_user_id: auditContext.actor_user_id || null,
        after_snapshot: { line_type: payload.line_type, total_amount: line.total_amount },
        metadata: auditContext
      }, { transaction });
      return ok(line);
    });
  },

  async listHousekeepingTasks({ query = {} } = {}) {
    return ok(await hospitalityRepository.listHousekeepingTasks(query));
  },

  async createHousekeepingTask({ payload = {} } = {}) {
    if (!payload.room_id) return fail('HOSPITALITY_HOUSEKEEPING_ROOM_REQUIRED', 'room_id is required.');
    return ok(await hospitalityRepository.createHousekeepingTask(payload));
  },

  async updateHousekeepingTask({ taskId, payload = {} } = {}) {
    const task = await hospitalityRepository.updateHousekeepingTask(taskId, payload);
    return task ? ok(task) : fail('HOSPITALITY_HOUSEKEEPING_TASK_NOT_FOUND', 'Housekeeping task was not found.');
  },

  async listMaintenanceRequests({ query = {} } = {}) {
    return ok(await hospitalityRepository.listMaintenanceRequests(query));
  },

  async createMaintenanceRequest({ payload = {}, auditContext = {} } = {}) {
    if (!payload.description) return fail('HOSPITALITY_MAINTENANCE_DESCRIPTION_REQUIRED', 'description is required.');
    return hospitalityRepository.transaction(async (transaction) => {
      let requestPayload = { ...payload };
      if (requestPayload.room_id && requestPayload.out_of_order) {
        const room = await hospitalityRepository.findRoomById(requestPayload.room_id, { transaction });
        requestPayload.metadata = {
          ...(requestPayload.metadata || {}),
          previous_room_status: room?.status || 'vacant_dirty',
          previous_housekeeping_status: room?.housekeeping_status || 'pending'
        };
      }
      const request = await hospitalityRepository.createMaintenanceRequest(requestPayload, { transaction });
      if (request.room_id && request.out_of_order) {
        await hospitalityRepository.updateRoomStatus(request.room_id, { status: 'out_of_order', housekeeping_status: 'blocked' }, { transaction });
      }
      await hospitalityRepository.createAuditEvent({
        entity_type: 'maintenance_request',
        entity_id: request.maintenance_request_id,
        action: 'create',
        actor_user_id: auditContext.actor_user_id || null,
        after_snapshot: { status: request.status, out_of_order: request.out_of_order, room_id: request.room_id },
        metadata: auditContext
      }, { transaction });
      return ok(request);
    });
  },

  async updateMaintenanceRequest({ requestId, payload = {}, auditContext = {} } = {}) {
    return hospitalityRepository.transaction(async (transaction) => {
      const before = (await hospitalityRepository.listMaintenanceRequests({ limit: 500 }))
        .find((entry) => Number(entry.maintenance_request_id) === Number(requestId));
      const request = await hospitalityRepository.updateMaintenanceRequest(requestId, payload, { transaction });
      if (!request) return fail('HOSPITALITY_MAINTENANCE_REQUEST_NOT_FOUND', 'Maintenance request was not found.');
      if (request.room_id && request.out_of_order && ['resolved', 'deferred'].includes(request.status)) {
        await hospitalityRepository.updateRoomStatus(request.room_id, {
          status: request.metadata?.previous_room_status || 'vacant_dirty',
          housekeeping_status: request.metadata?.previous_housekeeping_status || 'pending'
        }, { transaction });
      }
      await hospitalityRepository.createAuditEvent({
        entity_type: 'maintenance_request',
        entity_id: Number(requestId),
        action: 'update',
        actor_user_id: auditContext.actor_user_id || null,
        before_snapshot: before ? { status: before.status, out_of_order: before.out_of_order } : null,
        after_snapshot: { status: request.status, out_of_order: request.out_of_order },
        metadata: auditContext
      }, { transaction });
      return ok(request);
    });
  },

  async listAmenities({ query = {} } = {}) {
    return ok(await hospitalityRepository.listAmenities(query));
  },

  async createAmenity({ payload = {} } = {}) {
    if (!payload.name) return fail('HOSPITALITY_AMENITY_REQUIRED', 'Amenity name is required.');
    return ok(await hospitalityRepository.createAmenity(payload));
  },

  async listFacilities({ query = {} } = {}) {
    return ok(await hospitalityRepository.listFacilities(query));
  },

  async createFacility({ payload = {} } = {}) {
    if (!payload.name) return fail('HOSPITALITY_FACILITY_REQUIRED', 'Facility name is required.');
    return ok(await hospitalityRepository.createFacility(payload));
  },

  async listPackages({ query = {} } = {}) {
    return ok(await hospitalityRepository.listPackages(query));
  },

  async createPackage({ payload = {} } = {}) {
    if (!payload.code || !payload.name) return fail('HOSPITALITY_PACKAGE_REQUIRED', 'Package code and name are required.');
    return ok(await hospitalityRepository.createPackage(payload));
  },

  async createRoomAmenity({ payload = {} } = {}) {
    if (!payload.amenity_id || (!payload.room_type_id && !payload.room_id)) {
      return fail('HOSPITALITY_ROOM_AMENITY_REQUIRED', 'amenity_id and either room_type_id or room_id are required.');
    }
    return ok(await hospitalityRepository.createRoomAmenity(payload));
  },

  async createPropertyAmenity({ payload = {} } = {}) {
    if (!payload.amenity_id) return fail('HOSPITALITY_PROPERTY_AMENITY_REQUIRED', 'amenity_id is required.');
    return ok(await hospitalityRepository.createPropertyAmenity(payload));
  },

  async createFacilityBooking({ payload = {} } = {}) {
    if (!payload.facility_id || !payload.start_at || !payload.end_at) {
      return fail('HOSPITALITY_FACILITY_BOOKING_REQUIRED', 'facility_id, start_at, and end_at are required.');
    }
    if (String(payload.end_at) <= String(payload.start_at)) {
      return fail('HOSPITALITY_INVALID_FACILITY_WINDOW', 'end_at must be after start_at.');
    }
    const conflicts = await hospitalityRepository.countFacilityBookingConflicts({
      facilityId: payload.facility_id,
      startAt: payload.start_at,
      endAt: payload.end_at
    });
    if (conflicts > 0) {
      return fail('HOSPITALITY_FACILITY_UNAVAILABLE', 'Facility is unavailable for the selected time window.');
    }
    return ok(await hospitalityRepository.createFacilityBooking(payload));
  },

  async createPackageItem({ payload = {} } = {}) {
    if (!payload.package_id || (!payload.amenity_id && !payload.item_id && !payload.facility_id)) {
      return fail('HOSPITALITY_PACKAGE_ITEM_REQUIRED', 'package_id and an amenity, item, or facility reference are required.');
    }
    return ok(await hospitalityRepository.createPackageItem(payload));
  },

  async listGuestMessages({ query = {} } = {}) {
    return ok(await hospitalityRepository.listGuestMessages(query));
  },

  async createGuestMessage({ payload = {} } = {}) {
    if (!payload.body) return fail('HOSPITALITY_GUEST_MESSAGE_REQUIRED', 'Message body is required.');
    return ok(await hospitalityRepository.createGuestMessage(payload));
  },

  async publicReservationLookup({ publicReference } = {}) {
    const reservation = await hospitalityRepository.findReservationByPublicReference(publicReference);
    if (!reservation) return fail('HOSPITALITY_PUBLIC_RESERVATION_NOT_FOUND', 'Reservation was not found.');
    return ok(publicReservationSummary(reservation));
  },

  async listPublicReservationsForCustomer({ storeCustomer } = {}) {
    if (!storeCustomer?.customer_id) return fail('HOSPITALITY_STORE_CUSTOMER_REQUIRED', 'Store customer authentication is required.');
    const reservations = await hospitalityRepository.listReservationsByStoreCustomerId(storeCustomer.customer_id);
    return ok({ reservations: reservations.map(publicReservationSummary) });
  },

  async claimPublicReservation({ publicReference, storeCustomer } = {}) {
    if (!storeCustomer?.customer_id) return fail('HOSPITALITY_STORE_CUSTOMER_REQUIRED', 'Store customer authentication is required.');
    return hospitalityRepository.transaction(async (transaction) => {
      const reservation = await hospitalityRepository.claimReservationForStoreCustomer({
        publicReference,
        storeCustomerId: storeCustomer.customer_id,
        email: storeCustomer.email
      }, { transaction });
      if (!reservation) return fail('HOSPITALITY_PUBLIC_RESERVATION_NOT_FOUND', 'Reservation was not found.');
      if (reservation.claim_error === 'email_mismatch') {
        return fail('HOSPITALITY_CLAIM_EMAIL_MISMATCH', 'This booking reference does not match the signed-in customer email.');
      }
      if (reservation.claim_error === 'already_claimed') {
        return fail('HOSPITALITY_BOOKING_ALREADY_CLAIMED', 'This booking is already linked to a different customer account.');
      }
      await hospitalityRepository.createAuditEvent({
        entity_type: 'reservation',
        entity_id: reservation.reservation_id,
        action: 'claim_store_customer',
        actor_user_id: null,
        after_snapshot: { public_reference: reservation.public_reference, store_customer_id: storeCustomer.customer_id },
        metadata: { actor_type: 'store_customer', store_customer_id: storeCustomer.customer_id }
      }, { transaction });
      return ok(publicReservationSummary(reservation));
    });
  },

  async reports({ query = {} } = {}) {
    return ok({
      scope: query.scope || 'today',
      metrics: await hospitalityRepository.dashboardCounts(todayDate())
    });
  }
});
