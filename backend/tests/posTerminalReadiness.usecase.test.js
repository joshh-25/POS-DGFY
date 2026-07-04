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

    it('lets an admin inspect the cashier shift on the requested terminal', async () => {
        const findOpenTerminalShift = jest.fn().mockResolvedValue({
            pos_terminal_shift_id: 41,
            cashier_id: 12,
            opened_at: '2026-07-04T05:30:00.000Z',
            cashier: {
                user_id: 12,
                username: 'Cashier One',
                email: 'cashier@example.test'
            }
        });
        const useCase = buildGetCurrentTerminalShiftUseCase({
            posRepository: {
                getShiftLocationBindingReadinessSummary: jest.fn().mockResolvedValue(null),
                findOpenTerminalShift,
                getShiftCashSalesTotal: jest.fn().mockResolvedValue(0)
            }
        });

        const result = await useCase({
            query: { terminal_id: 'COUNTER-01' },
            user: { user_id: 7, role: 'admin' }
        });

        expect(result.success).toBe(true);
        expect(findOpenTerminalShift).toHaveBeenCalledWith(expect.objectContaining({
            terminalId: 'COUNTER-01',
            cashierId: null
        }));
        expect(result.data.shift.cashier.username).toBe('Cashier One');
    });

    it('keeps cashier shift reads scoped to the authenticated cashier', async () => {
        const findOpenTerminalShift = jest.fn().mockResolvedValue(null);
        const useCase = buildGetCurrentTerminalShiftUseCase({
            posRepository: {
                getShiftLocationBindingReadinessSummary: jest.fn().mockResolvedValue(null),
                findOpenTerminalShift
            }
        });

        await useCase({
            query: { terminal_id: 'COUNTER-01' },
            user: { user_id: 12, role: 'cashier' }
        });

        expect(findOpenTerminalShift).toHaveBeenCalledWith(expect.objectContaining({
            cashierId: 12
        }));
    });
});
