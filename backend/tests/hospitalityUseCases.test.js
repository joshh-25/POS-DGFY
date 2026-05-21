import { jest } from '@jest/globals';
import { buildHospitalityUseCases } from '../src/modules/hospitality/usecases/hospitalityUseCases.js';

const buildRepository = (overrides = {}) => ({
  transaction: jest.fn(async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } })),
  listRoomTypes: jest.fn().mockResolvedValue([
    {
      room_type_id: 1,
      code: 'DLX',
      name: 'Deluxe King',
      description: 'King room',
      max_occupancy: 2,
      default_rate: 4200,
      currency: 'PHP',
      amenities_snapshot: ['wifi', 'breakfast']
    }
  ]),
  countRoomsByType: jest.fn().mockResolvedValue(2),
  getRoomTypeAvailability: jest.fn().mockResolvedValue({
    room_count: 2,
    booked_count: 0,
    held_count: 0,
    available_rooms: 2
  }),
  listAvailableRoomsForAssignment: jest.fn().mockResolvedValue([
    { room_id: 101, room_number: '101', status: 'vacant_clean' },
    { room_id: 102, room_number: '102', status: 'inspected' }
  ]),
  countReservationRoomConflicts: jest.fn().mockResolvedValue(0),
  findReservationByIdempotencyKey: jest.fn().mockResolvedValue(null),
  findActiveBookingHold: jest.fn().mockResolvedValue({
    hold_token: 'HOLD-123',
    room_type_id: 1,
    check_in_date: '2026-06-01',
    check_out_date: '2026-06-03',
    room_count: 1
  }),
  consumeBookingHold: jest.fn().mockResolvedValue(null),
  createBookingHold: jest.fn().mockImplementation(async (payload) => payload),
  createAuditEvent: jest.fn().mockResolvedValue({}),
  updateReservationStatus: jest.fn().mockImplementation(async (reservationId, payload) => ({
    reservation_id: reservationId,
    ...payload,
    rooms: []
  })),
  updateReservationDates: jest.fn().mockImplementation(async (reservationId, payload) => ({
    reservation_id: reservationId,
    status: 'confirmed',
    ...payload,
    rooms: []
  })),
  findReservationById: jest.fn().mockResolvedValue({
    reservation_id: 99,
    status: 'confirmed',
    rooms: []
  }),
  findReservationRoomById: jest.fn().mockResolvedValue({
    reservation_room_id: 10,
    reservation_id: 99,
    room_type_id: 1,
    room_id: null,
    check_in_date: '2026-06-01',
    check_out_date: '2026-06-03',
    status: 'reserved'
  }),
  updateReservationRoomsForReservation: jest.fn().mockResolvedValue(null),
  updateReservationRoom: jest.fn().mockResolvedValue(null),
  updateStaysForReservation: jest.fn().mockResolvedValue(null),
  findStayByReservationRoom: jest.fn().mockResolvedValue(null),
  createStay: jest.fn().mockResolvedValue({}),
  updateRoomStatus: jest.fn().mockResolvedValue({}),
  createHousekeepingTask: jest.fn().mockResolvedValue({}),
  findFolioById: jest.fn().mockResolvedValue({ folio_id: 10, status: 'open' }),
  listFolios: jest.fn().mockResolvedValue([]),
  addFolioLine: jest.fn().mockImplementation(async (folioId, payload) => ({ ...payload, folio_id: folioId })),
  findRoomById: jest.fn().mockResolvedValue({ room_id: 101, room_type_id: 1, status: 'vacant_clean', housekeeping_status: 'inspected' }),
  createMaintenanceRequest: jest.fn().mockImplementation(async (payload) => ({ maintenance_request_id: 1, ...payload })),
  updateMaintenanceRequest: jest.fn().mockImplementation(async (id, payload) => ({ maintenance_request_id: id, ...payload })),
  listMaintenanceRequests: jest.fn().mockResolvedValue([]),
  createReservation: jest.fn().mockImplementation(async (payload, roomRows) => ({
    ...payload,
    reservation_id: 99,
    rooms: roomRows
  })),
  findReservationByPublicReference: jest.fn().mockResolvedValue({
    reservation_id: 99,
    public_reference: 'HSP-ABC123',
    status: 'confirmed',
    source: 'storefront',
    check_in_date: '2026-06-01',
    check_out_date: '2026-06-03',
    rooms: [{
      room_type_id: 1,
      roomType: { name: 'Deluxe King' },
      room: { room_number: '101', status: 'vacant_dirty', housekeeping_status: 'pending' },
      nightly_rate: 4200,
      status: 'reserved'
    }],
    total_amount: 8400,
    deposit_amount: 0,
    payment_status: 'unpaid',
    customer_email: 'private@example.com'
  }),
  listReservationsByStoreCustomerId: jest.fn().mockResolvedValue([
    {
      reservation_id: 99,
      public_reference: 'HSP-ABC123',
      status: 'confirmed',
      source: 'storefront',
      check_in_date: '2026-06-01',
      check_out_date: '2026-06-03',
      rooms: [{
        room_type_id: 1,
        roomType: { name: 'Deluxe King' },
        room: { room_number: '101', status: 'vacant_dirty' },
        nightly_rate: 4200,
        status: 'reserved'
      }],
      total_amount: 8400,
      deposit_amount: 0,
      payment_status: 'unpaid',
      customer_email: 'private@example.com'
    }
  ]),
  claimReservationForStoreCustomer: jest.fn().mockImplementation(async ({ storeCustomerId }) => ({
    reservation_id: 99,
    public_reference: 'HSP-ABC123',
    status: 'confirmed',
    source: 'storefront',
    store_customer_id: storeCustomerId,
    check_in_date: '2026-06-01',
    check_out_date: '2026-06-03',
    rooms: [{
      room_type_id: 1,
      roomType: { name: 'Deluxe King' },
      room: { room_number: '101', status: 'vacant_dirty' },
      nightly_rate: 4200,
      status: 'reserved'
    }],
    total_amount: 8400,
    deposit_amount: 0,
    payment_status: 'unpaid',
    customer_email: 'private@example.com'
  })),
  ...overrides
});

describe('Hospitality use cases', () => {
  it('returns customer-safe availability without exposing internal costs', async () => {
    const repository = buildRepository();
    const useCases = buildHospitalityUseCases({ hospitalityRepository: repository });

    const result = await useCases.availability({
      query: {
        check_in_date: '2026-06-01',
        check_out_date: '2026-06-03'
      }
    });

    expect(result.success).toBe(true);
    expect(result.data.room_types).toEqual([
      expect.objectContaining({
        room_type_id: 1,
        available_rooms: 2,
        starting_rate: 4200,
        amenities: ['wifi', 'breakfast']
      })
    ]);
    expect(result.data.room_types[0]).not.toHaveProperty('cost');
    expect(result.data.room_types[0]).not.toHaveProperty('internal_cost');
  });

  it('rejects invalid stay windows before reservation creation', async () => {
    const repository = buildRepository();
    const useCases = buildHospitalityUseCases({ hospitalityRepository: repository });

    const result = await useCases.createReservation({
      payload: {
        customer_name: 'Guest',
        room_type_id: 1,
        check_in_date: '2026-06-03',
        check_out_date: '2026-06-01'
      }
    });

    expect(result).toMatchObject({
      success: false,
      error: { code: 'HOSPITALITY_INVALID_STAY_WINDOW' }
    });
    expect(repository.createReservation).not.toHaveBeenCalled();
  });

  it('blocks assigned-room reservation conflicts', async () => {
    const repository = buildRepository({
      countReservationRoomConflicts: jest.fn().mockResolvedValue(1)
    });
    const useCases = buildHospitalityUseCases({ hospitalityRepository: repository });

    const result = await useCases.createReservation({
      payload: {
        customer_name: 'Guest',
        room_type_id: 1,
        room_id: 101,
        check_in_date: '2026-06-01',
        check_out_date: '2026-06-03',
        nightly_rate: 4200
      }
    });

    expect(result).toMatchObject({
      success: false,
      error: { code: 'HOSPITALITY_ROOM_CONFLICT' }
    });
    expect(repository.createReservation).not.toHaveBeenCalled();
  });

  it('quotes room nights and add-ons without needing stock-bearing inventory', async () => {
    const repository = buildRepository();
    const useCases = buildHospitalityUseCases({ hospitalityRepository: repository });

    const result = await useCases.quote({
      payload: {
        room_type_id: 1,
        check_in_date: '2026-06-01',
        check_out_date: '2026-06-03',
        add_ons: [{ name: 'Breakfast', price: 350, quantity: 2 }]
      }
    });

    expect(result).toMatchObject({
      success: true,
      data: {
        nights: 2,
        pricing: {
          room_subtotal: 8400,
          add_on_subtotal: 700,
          total: 9100,
          payment_collection: 'property_collects',
          payment_due_at: 'property'
        }
      }
    });
  });

  it('auto-assigns deterministic rooms when reservation creation requests it', async () => {
    const repository = buildRepository();
    const useCases = buildHospitalityUseCases({ hospitalityRepository: repository });

    const result = await useCases.createReservation({
      payload: {
        customer_name: 'Guest',
        room_type_id: 1,
        room_count: 2,
        auto_assign_rooms: true,
        check_in_date: '2026-06-01',
        check_out_date: '2026-06-03',
        nightly_rate: 4200
      }
    });

    expect(result.success).toBe(true);
    expect(repository.listAvailableRoomsForAssignment).toHaveBeenCalledWith(expect.objectContaining({
      roomTypeId: 1,
      checkInDate: '2026-06-01',
      checkOutDate: '2026-06-03'
    }), expect.any(Object));
    expect(repository.createReservation).toHaveBeenCalledWith(expect.any(Object), [
      expect.objectContaining({ room_id: 101, status: 'assigned' }),
      expect.objectContaining({ room_id: 102, status: 'assigned' })
    ], expect.any(Object));
  });

  it('fails check-in when unassigned reservations cannot be assigned a physical room', async () => {
    const repository = buildRepository({
      findReservationById: jest.fn().mockResolvedValue({
        reservation_id: 99,
        status: 'confirmed',
        check_in_date: '2026-06-01',
        check_out_date: '2026-06-03',
        rooms: [{
          reservation_room_id: 10,
          room_type_id: 1,
          room_id: null,
          check_in_date: '2026-06-01',
          check_out_date: '2026-06-03'
        }]
      }),
      listAvailableRoomsForAssignment: jest.fn().mockResolvedValue([])
    });
    const useCases = buildHospitalityUseCases({ hospitalityRepository: repository });

    const result = await useCases.updateReservationStatus({
      reservationId: 99,
      payload: { status: 'checked_in' }
    });

    expect(result).toMatchObject({
      success: false,
      error: { code: 'HOSPITALITY_CHECK_IN_ROOM_ASSIGNMENT_REQUIRED' }
    });
    expect(repository.updateReservationStatus).not.toHaveBeenCalled();
  });

  it('blocks checkout when an open folio still has a balance', async () => {
    const repository = buildRepository({
      findReservationById: jest.fn().mockResolvedValue({
        reservation_id: 99,
        status: 'in_house',
        rooms: [{
          reservation_room_id: 10,
          room_type_id: 1,
          room_id: 101,
          check_in_date: '2026-06-01',
          check_out_date: '2026-06-03'
        }]
      }),
      listFolios: jest.fn().mockResolvedValue([{ folio_id: 50, status: 'open', balance: 1200, total_charges: 4200, total_payments: 3000 }])
    });
    const useCases = buildHospitalityUseCases({ hospitalityRepository: repository });

    const result = await useCases.updateReservationStatus({
      reservationId: 99,
      payload: { status: 'checked_out' }
    });

    expect(result).toMatchObject({
      success: false,
      error: {
        code: 'HOSPITALITY_FOLIO_BALANCE_DUE',
        details: { folios: [expect.objectContaining({ folio_id: 50, balance: 1200 })] }
      }
    });
    expect(repository.updateReservationStatus).not.toHaveBeenCalled();
  });

  it('allows checkout balance override while keeping the override out of reservation persistence', async () => {
    const repository = buildRepository({
      findReservationById: jest.fn()
        .mockResolvedValueOnce({
          reservation_id: 99,
          status: 'in_house',
          rooms: [{
            reservation_room_id: 10,
            room_type_id: 1,
            room_id: 101,
            check_in_date: '2026-06-01',
            check_out_date: '2026-06-03'
          }]
        })
        .mockResolvedValueOnce({
          reservation_id: 99,
          status: 'checked_out',
          rooms: []
        }),
      listFolios: jest.fn().mockResolvedValue([{ folio_id: 50, status: 'open', balance: 1200 }])
    });
    const useCases = buildHospitalityUseCases({ hospitalityRepository: repository });

    const result = await useCases.updateReservationStatus({
      reservationId: 99,
      payload: { status: 'checked_out', override_open_balance: true }
    });

    expect(result.success).toBe(true);
    expect(repository.updateReservationStatus).toHaveBeenCalledWith(99, { status: 'checked_out' }, expect.any(Object));
  });

  it('blocks stay date changes when the assigned room conflicts', async () => {
    const repository = buildRepository({
      findReservationById: jest.fn().mockResolvedValue({
        reservation_id: 99,
        status: 'confirmed',
        check_in_date: '2026-06-01',
        check_out_date: '2026-06-03',
        rooms: [{
          reservation_room_id: 10,
          room_type_id: 1,
          room_id: 101,
          check_in_date: '2026-06-01',
          check_out_date: '2026-06-03'
        }]
      }),
      countReservationRoomConflicts: jest.fn().mockResolvedValue(1)
    });
    const useCases = buildHospitalityUseCases({ hospitalityRepository: repository });

    const result = await useCases.updateReservationStatus({
      reservationId: 99,
      payload: { status: 'confirmed', check_out_date: '2026-06-05' }
    });

    expect(result).toMatchObject({
      success: false,
      error: { code: 'HOSPITALITY_STAY_EXTENSION_CONFLICT' }
    });
    expect(repository.updateReservationDates).not.toHaveBeenCalled();
  });

  it('moves a reservation room with room-type and conflict validation plus audit', async () => {
    const repository = buildRepository({
      findReservationById: jest.fn()
        .mockResolvedValueOnce({
          reservation_id: 99,
          status: 'confirmed',
          rooms: [{ reservation_room_id: 10, room_type_id: 1, room_id: null }]
        })
        .mockResolvedValueOnce({
          reservation_id: 99,
          status: 'confirmed',
          rooms: [{ reservation_room_id: 10, room_type_id: 1, room_id: 101 }]
        }),
      updateReservationRoom: jest.fn().mockResolvedValue({ reservation_room_id: 10, room_id: 101, status: 'assigned' })
    });
    const useCases = buildHospitalityUseCases({ hospitalityRepository: repository });

    const result = await useCases.updateReservationRoomAssignment({
      reservationId: 99,
      reservationRoomId: 10,
      payload: { room_id: 101 },
      auditContext: { actor_user_id: 12 }
    });

    expect(result.success).toBe(true);
    expect(repository.countReservationRoomConflicts).toHaveBeenCalledWith(expect.objectContaining({
      roomId: 101,
      excludeReservationId: 99
    }), expect.any(Object));
    expect(repository.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      entity_type: 'reservation_room',
      action: 'room_move',
      actor_user_id: 12,
      before_snapshot: expect.objectContaining({ room_id: null }),
      after_snapshot: expect.objectContaining({ room_id: 101 })
    }), expect.any(Object));
  });

  it('stores channel metadata for OTA and future channel-manager reconciliation', async () => {
    const repository = buildRepository();
    const useCases = buildHospitalityUseCases({ hospitalityRepository: repository });

    const result = await useCases.createReservation({
      source: 'ota',
      payload: {
        customer_name: 'Guest',
        room_type_id: 1,
        check_in_date: '2026-06-01',
        check_out_date: '2026-06-03',
        external_source: 'booking.com',
        external_reference: 'OTA-123',
        channel_metadata: { channel_id: 'bcom', rate_code: 'BAR' }
      }
    });

    expect(result.success).toBe(true);
    expect(repository.createReservation).toHaveBeenCalledWith(expect.objectContaining({
      source: 'ota',
      external_source: 'booking.com',
      external_reference: 'OTA-123',
      channel_metadata: { channel_id: 'bcom', rate_code: 'BAR' }
    }), expect.any(Array), expect.any(Object));
  });

  it('rejects quote requests that exceed room-type capacity after holds are counted', async () => {
    const repository = buildRepository({
      getRoomTypeAvailability: jest.fn().mockResolvedValue({
        room_count: 2,
        booked_count: 1,
        held_count: 1,
        available_rooms: 0
      })
    });
    const useCases = buildHospitalityUseCases({ hospitalityRepository: repository });

    const result = await useCases.quote({
      payload: {
        room_type_id: 1,
        room_count: 2,
        check_in_date: '2026-06-01',
        check_out_date: '2026-06-03'
      }
    });

    expect(result).toMatchObject({
      success: false,
      error: { code: 'HOSPITALITY_ROOM_TYPE_UNAVAILABLE' }
    });
  });

  it('persists booking holds so confirmation can consume a real token', async () => {
    const repository = buildRepository();
    const useCases = buildHospitalityUseCases({ hospitalityRepository: repository });

    const result = await useCases.bookingHold({
      payload: {
        room_type_id: 1,
        check_in_date: '2026-06-01',
        check_out_date: '2026-06-03'
      }
    });

    expect(result.success).toBe(true);
    expect(repository.createBookingHold).toHaveBeenCalledWith(expect.objectContaining({
      room_type_id: 1,
      status: 'active',
      quote_snapshot: expect.any(Object)
    }), expect.any(Object));
  });

  it('replays matching idempotent reservation requests instead of duplicating bookings', async () => {
    const existingReservation = {
      reservation_id: 44,
      request_hash: expect.any(String),
      public_reference: 'HSP-EXISTING',
      rooms: []
    };
    const repository = buildRepository();
    const useCases = buildHospitalityUseCases({ hospitalityRepository: repository });
    const payload = {
      idempotency_key: 'idem-1',
      hold_token: 'HOLD-123',
      customer_name: 'Guest',
      room_type_id: 1,
      check_in_date: '2026-06-01',
      check_out_date: '2026-06-03'
    };
    const firstResult = await useCases.createReservation({ payload, source: 'storefront' });
    repository.findReservationByIdempotencyKey.mockResolvedValue({
      ...existingReservation,
      request_hash: firstResult.data.request_hash
    });

    const replayResult = await useCases.createReservation({ payload, source: 'storefront' });

    expect(replayResult.success).toBe(true);
    expect(replayResult.data.reservation_id).toBe(44);
    expect(repository.createReservation).toHaveBeenCalledTimes(1);
  });

  it('passes actor and request metadata into reservation audit events', async () => {
    const repository = buildRepository();
    const useCases = buildHospitalityUseCases({ hospitalityRepository: repository });

    const result = await useCases.createReservation({
      source: 'admin',
      auditContext: {
        actor_user_id: 12,
        request_id: 'req-12',
        ip_address: '127.0.0.1',
        user_agent: 'jest'
      },
      payload: {
        customer_name: 'Guest',
        room_type_id: 1,
        check_in_date: '2026-06-01',
        check_out_date: '2026-06-03'
      }
    });

    expect(result.success).toBe(true);
    expect(repository.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      entity_type: 'reservation',
      action: 'create',
      actor_user_id: 12,
      metadata: expect.objectContaining({
        source: 'admin',
        request_id: 'req-12',
        ip_address: '127.0.0.1'
      })
    }), expect.any(Object));
  });

  it('requires direct bookings to confirm against an active hold', async () => {
    const repository = buildRepository({ findActiveBookingHold: jest.fn().mockResolvedValue(null) });
    const useCases = buildHospitalityUseCases({ hospitalityRepository: repository });

    const result = await useCases.createReservation({
      source: 'storefront',
      payload: {
        hold_token: 'MISSING',
        customer_name: 'Guest',
        room_type_id: 1,
        check_in_date: '2026-06-01',
        check_out_date: '2026-06-03'
      }
    });

    expect(result).toMatchObject({
      success: false,
      error: { code: 'HOSPITALITY_HOLD_INVALID' }
    });
  });

  it('normalizes folio unit_price into unit_amount before posting', async () => {
    const repository = buildRepository();
    const useCases = buildHospitalityUseCases({ hospitalityRepository: repository });

    const result = await useCases.addFolioLine({
      folioId: 10,
      payload: {
        line_type: 'amenity',
        description: 'Breakfast',
        quantity: 2,
        unit_price: 350
      }
    });

    expect(result.success).toBe(true);
    expect(repository.addFolioLine).toHaveBeenCalledWith(10, expect.objectContaining({
      unit_amount: 350,
      total_amount: 700
    }), expect.any(Object));
  });

  it('redacts private guest fields from public booking lookup', async () => {
    const repository = buildRepository();
    const useCases = buildHospitalityUseCases({ hospitalityRepository: repository });

    const result = await useCases.publicReservationLookup({ publicReference: 'HSP-ABC123' });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      public_reference: 'HSP-ABC123',
      status: 'confirmed',
      payment_status: 'unpaid'
    });
    expect(result.data).not.toHaveProperty('customer_email');
    expect(result.data).not.toHaveProperty('customer_phone');
    expect(result.data.rooms[0]).not.toHaveProperty('room');
    expect(result.data.rooms[0]).not.toHaveProperty('housekeeping_status');
  });

  it('lists authenticated customer stay history with customer-safe fields only', async () => {
    const repository = buildRepository();
    const useCases = buildHospitalityUseCases({ hospitalityRepository: repository });

    const result = await useCases.listPublicReservationsForCustomer({
      storeCustomer: { customer_id: 7, email: 'private@example.com' }
    });

    expect(result.success).toBe(true);
    expect(repository.listReservationsByStoreCustomerId).toHaveBeenCalledWith(7);
    expect(result.data.reservations[0]).toMatchObject({
      public_reference: 'HSP-ABC123',
      payment_collection: 'property_collects'
    });
    expect(result.data.reservations[0]).not.toHaveProperty('customer_email');
  });

  it('claims a matching public booking into authenticated customer stay history', async () => {
    const repository = buildRepository();
    const useCases = buildHospitalityUseCases({ hospitalityRepository: repository });

    const result = await useCases.claimPublicReservation({
      publicReference: 'HSP-ABC123',
      storeCustomer: { customer_id: 7, email: 'private@example.com' }
    });

    expect(result.success).toBe(true);
    expect(repository.claimReservationForStoreCustomer).toHaveBeenCalledWith({
      publicReference: 'HSP-ABC123',
      storeCustomerId: 7,
      email: 'private@example.com'
    }, expect.any(Object));
    expect(repository.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: 'claim_store_customer',
      metadata: expect.objectContaining({ actor_type: 'store_customer', store_customer_id: 7 })
    }), expect.any(Object));
    expect(result.data).not.toHaveProperty('customer_email');
  });
});
