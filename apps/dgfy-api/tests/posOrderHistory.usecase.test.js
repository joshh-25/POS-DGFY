import { describe, expect, it, jest } from '@jest/globals';
import { buildListOnlineOrderHistoryUseCase } from '../src/modules/pos/usecases/posUseCases.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';

describe('POS online order history use-case', () => {
    it('requires an authenticated POS user', async () => {
        const useCase = buildListOnlineOrderHistoryUseCase({
            posRepository: { listOnlineOrderHistory: jest.fn() },
            resolveLocationScope: jest.fn()
        });

        const result = await useCase({ query: {} });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.AUTHENTICATION_FAILED);
    });

    it('resolves the location scope and forwards history filters', async () => {
        const resolveLocationScope = jest.fn().mockResolvedValue({ location_id: 7 });
        const listOnlineOrderHistory = jest.fn().mockResolvedValue({
            orders: [{ pos_transaction_id: 44, fulfillment_status: 'rejected' }],
            pagination: { page: 2, limit: 25, total: 1, totalPages: 1 }
        });
        const useCase = buildListOnlineOrderHistoryUseCase({
            posRepository: { listOnlineOrderHistory },
            resolveLocationScope
        });

        const result = await useCase({
            user: { user_id: 15 },
            query: {
                location_id: 7,
                search: 'INV-000044',
                fulfillment_status: 'rejected',
                payment_status: 'unpaid',
                page: 2,
                limit: 25
            }
        });

        expect(result.success).toBe(true);
        expect(resolveLocationScope).toHaveBeenCalledWith({
            requestedLocationId: 7,
            userId: 15,
            operationLabel: 'POS online order history read'
        });
        expect(listOnlineOrderHistory).toHaveBeenCalledWith({
            locationId: 7,
            search: 'INV-000044',
            fulfillmentStatus: 'rejected',
            paymentStatus: 'unpaid',
            page: 2,
            limit: 25
        });
        expect(result.data.pagination.total).toBe(1);
    });

    it('maps repository failures to the POS error contract', async () => {
        const useCase = buildListOnlineOrderHistoryUseCase({
            posRepository: {
                listOnlineOrderHistory: jest.fn().mockRejectedValue(new Error('history unavailable'))
            },
            resolveLocationScope: jest.fn().mockResolvedValue({ location_id: 7 })
        });

        const result = await useCase({ user: { user_id: 15 }, query: {} });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.INTERNAL_ERROR);
        expect(result.error.message).toBe('history unavailable');
    });
});
