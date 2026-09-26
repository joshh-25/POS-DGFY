import { jest } from '@jest/globals';
import { buildListStoreCustomerOrdersUseCase } from '../src/modules/store/usecases/storeUseCases.js';

describe('store customer order history use-case', () => {
    it('passes the validated branch scope to the tenant repository', async () => {
        const listOrdersByCustomer = jest.fn().mockResolvedValue({
            rows: [],
            pagination: { page: 1, limit: 25, total: 0, totalPages: 0 }
        });
        const useCase = buildListStoreCustomerOrdersUseCase({ storeRepository: { listOrdersByCustomer } });

        const result = await useCase({
            customerId: 44,
            query: { location_id: 12, page: 1, limit: 25 }
        });

        expect(result.success).toBe(true);
        expect(listOrdersByCustomer).toHaveBeenCalledWith(44, { location_id: 12, page: 1, limit: 25 });
    });
});
