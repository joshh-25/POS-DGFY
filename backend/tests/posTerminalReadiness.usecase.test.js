import { describe, expect, it, jest } from '@jest/globals';
import {
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

  it('shows a master admin the terminal shift opened by another cashier', async () => {
    const findOpenTerminalShift = jest.fn().mockResolvedValue({
      pos_terminal_shift_id: 41,
      terminal_id: 'JOHN-01',
      cashier_id: 12,
      status: 'open'
    });
    const useCase = buildGetCurrentTerminalShiftUseCase({
      posRepository: {
        getShiftLocationBindingReadinessSummary: jest.fn().mockResolvedValue(null),
        findOpenTerminalShift,
        getShiftCashSalesTotal: jest.fn().mockResolvedValue(0)
      }
    });

    const result = await useCase({
      query: { terminal_id: 'JOHN-01', location_id: 9 },
      user: { user_id: 7, is_master_admin: true }
    });

    expect(result.success).toBe(true);
    expect(result.data.shift).toEqual(expect.objectContaining({
      pos_terminal_shift_id: 41,
      cashier_id: 12
    }));
    expect(findOpenTerminalShift).toHaveBeenCalledWith({
      terminalId: 'JOHN-01',
      cashierId: null,
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
});
