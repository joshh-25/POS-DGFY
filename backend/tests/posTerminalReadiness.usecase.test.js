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
});
