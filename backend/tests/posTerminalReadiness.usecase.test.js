import { describe, expect, it, jest } from '@jest/globals';
import {
    buildGetAdminLocationMonitorUseCase,
    buildGetCurrentTerminalShiftUseCase
} from '../src/modules/pos/usecases/posUseCases.js';

describe('POS terminal readiness context', () => {
    it('includes location binding readiness in current shift response', async () => {
        const useCase = buildGetCurrentTerminalShiftUseCase({
            posRepository: {
                getShiftLocationBindingReadinessSummary: jest.fn().mockResolvedValue({
                    ready_for_strict_mode: false,
                    unresolved_count: 1,
                    low_confidence_count: 2
                }),
                findOpenTerminalShift: jest.fn().mockResolvedValue(null)
            }
        });

        const result = await useCase({
            query: {},
            user: { user_id: 7 }
        });

        expect(result.success).toBe(true);
        expect(result.data.location_binding_readiness).toEqual(expect.objectContaining({
            ready_for_strict_mode: false,
            unresolved_count: 1
        }));
  });

  it('keeps a master admin scoped to their own active shift', async () => {
    const findOpenTerminalShift = jest.fn().mockResolvedValue(null);
    const useCase = buildGetCurrentTerminalShiftUseCase({
      posRepository: {
        getShiftLocationBindingReadinessSummary: jest.fn().mockResolvedValue(null),
        findOpenTerminalShift
      }
    });

    const result = await useCase({
      query: { terminal_id: 'JOHN-01', location_id: 9 },
      user: { user_id: 7, is_master_admin: true }
    });

    expect(result.success).toBe(true);
    expect(result.data.shift).toBeNull();
    expect(findOpenTerminalShift).toHaveBeenCalledWith({
      terminalId: 'JOHN-01',
      cashierId: 7,
      locationId: 9
    });
  });

  it('keeps a cashier scoped to their own active shift', async () => {
    const findOpenTerminalShift = jest.fn().mockResolvedValue(null);
    const useCase = buildGetCurrentTerminalShiftUseCase({
      posRepository: {
        getShiftLocationBindingReadinessSummary: jest.fn().mockResolvedValue(null),
        findOpenTerminalShift
      }
    });

    await useCase({
      query: { terminal_id: 'JOHN-01', location_id: 9 },
      user: { user_id: 7, is_master_admin: false }
    });

    expect(findOpenTerminalShift).toHaveBeenCalledWith({
      terminalId: 'JOHN-01',
      cashierId: 7,
      locationId: 9
    });
  });

  it('allows a master admin to read branch orders and occupied terminals without taking shift ownership', async () => {
    const listIncomingOnlineOrders = jest.fn().mockResolvedValue([
      { pos_transaction_id: 91, location_id: 9, fulfillment_status: 'placed' }
    ]);
    const listOpenTerminalShiftsForLocation = jest.fn().mockResolvedValue([
      { pos_terminal_shift_id: 41, terminal_id: 'JOHN-01', cashier_id: 12, status: 'open' }
    ]);
    const resolveLocationScope = jest.fn().mockResolvedValue({ location_id: 9 });
    const useCase = buildGetAdminLocationMonitorUseCase({
      posRepository: {
        listIncomingOnlineOrders,
        listOpenTerminalShiftsForLocation
      },
      resolveLocationScope
    });

    const result = await useCase({
      query: { location_id: 9, limit: 50 },
      user: { user_id: 7, is_master_admin: true }
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(expect.objectContaining({
      location_id: 9,
      orders: [expect.objectContaining({ pos_transaction_id: 91 })],
      terminal_shifts: [expect.objectContaining({ terminal_id: 'JOHN-01', cashier_id: 12 })]
    }));
    expect(resolveLocationScope).toHaveBeenCalledWith(expect.objectContaining({
      requestedLocationId: 9,
      userId: 7
    }));
    expect(listIncomingOnlineOrders).toHaveBeenCalledWith({ locationId: 9, limit: 50 });
    expect(listOpenTerminalShiftsForLocation).toHaveBeenCalledWith({ locationId: 9 });
  });

  it('serializes Sequelize shift rows without leaking circular include metadata', async () => {
    const parent = {};
    const include = [{ parent }];
    parent.include = include;
    const sequelizeShift = {
      parent,
      toJSON: () => ({
        pos_terminal_shift_id: 41,
        terminal_id: 'JOHN-01',
        cashier_id: 12,
        status: 'open',
        opened_at: '2026-07-25T01:00:00.000Z'
      })
    };
    const useCase = buildGetAdminLocationMonitorUseCase({
      posRepository: {
        listIncomingOnlineOrders: jest.fn().mockResolvedValue([]),
        listOpenTerminalShiftsForLocation: jest.fn().mockResolvedValue([sequelizeShift])
      },
      resolveLocationScope: jest.fn().mockResolvedValue({ location_id: 9 }),
      now: () => new Date('2026-07-25T02:00:00.000Z')
    });

    const result = await useCase({
      query: { location_id: 9 },
      user: { user_id: 7, is_master_admin: true }
    });

    expect(result.success).toBe(true);
    expect(result.data.terminal_shifts[0]).toEqual(expect.objectContaining({
      terminal_id: 'JOHN-01',
      cashier_id: 12
    }));
    expect(result.data.terminal_shifts[0]).not.toHaveProperty('parent');
    expect(() => JSON.stringify(result.data)).not.toThrow();
  });

  it('rejects branch monitoring for a cashier account', async () => {
    const listIncomingOnlineOrders = jest.fn();
    const listOpenTerminalShiftsForLocation = jest.fn();
    const useCase = buildGetAdminLocationMonitorUseCase({
      posRepository: {
        listIncomingOnlineOrders,
        listOpenTerminalShiftsForLocation
      }
    });

    const result = await useCase({
      query: { location_id: 9 },
      user: { user_id: 12, is_master_admin: false, role: 'cashier' }
    });

    expect(result.success).toBe(false);
    expect(result.error.statusCode).toBe(403);
    expect(listIncomingOnlineOrders).not.toHaveBeenCalled();
    expect(listOpenTerminalShiftsForLocation).not.toHaveBeenCalled();
  });

  it('rejects a role admin when explicit permissions omit location switching', async () => {
    const listIncomingOnlineOrders = jest.fn();
    const listOpenTerminalShiftsForLocation = jest.fn();
    const useCase = buildGetAdminLocationMonitorUseCase({
      posRepository: {
        listIncomingOnlineOrders,
        listOpenTerminalShiftsForLocation
      }
    });

    const result = await useCase({
      query: { location_id: 9 },
      user: {
        user_id: 7,
        is_master_admin: false,
        role: 'admin',
        permissions: ['pos:view']
      }
    });

    expect(result.success).toBe(false);
    expect(result.error.statusCode).toBe(403);
    expect(listIncomingOnlineOrders).not.toHaveBeenCalled();
    expect(listOpenTerminalShiftsForLocation).not.toHaveBeenCalled();
  });

  it('allows a cashier explicitly granted location switching permission', async () => {
    const listIncomingOnlineOrders = jest.fn().mockResolvedValue([]);
    const listOpenTerminalShiftsForLocation = jest.fn().mockResolvedValue([]);
    const resolveLocationScope = jest.fn().mockResolvedValue({ location_id: 9 });
    const useCase = buildGetAdminLocationMonitorUseCase({
      posRepository: {
        listIncomingOnlineOrders,
        listOpenTerminalShiftsForLocation
      },
      resolveLocationScope
    });

    const result = await useCase({
      query: { location_id: 9 },
      user: {
        user_id: 12,
        is_master_admin: false,
        role: 'cashier',
        permissions: ['pos:view', 'pos:switch_location']
      }
    });

    expect(result.success).toBe(true);
    expect(resolveLocationScope).toHaveBeenCalledWith(expect.objectContaining({
      requestedLocationId: 9,
      userId: 12
    }));
    expect(listIncomingOnlineOrders).toHaveBeenCalledWith({ locationId: 9, limit: 200 });
    expect(listOpenTerminalShiftsForLocation).toHaveBeenCalledWith({ locationId: 9 });
  });
});
