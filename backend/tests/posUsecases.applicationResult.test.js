import { jest } from '@jest/globals';
import {
    buildListPosTransactionsUseCase,
    buildGetPosTransactionByIdUseCase,
    buildGetDailyZReadingUseCase,
    buildListPosCatalogUseCase
} from '../src/modules/pos/usecases/posUseCases.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';

describe('pos use-cases application result contract', () => {
    it('listPosTransactions validates query shape', async () => {
        const useCase = buildListPosTransactionsUseCase({
            posRepository: { listTransactions: jest.fn() }
        });

        const result = await useCase({ query: 'bad-query' });
        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
        expect(result.error.statusCode).toBe(400);
    });

    it('getPosTransactionById validates positive integer id', async () => {
        const useCase = buildGetPosTransactionByIdUseCase({
            posRepository: { getTransactionById: jest.fn() }
        });

        const result = await useCase({ posTransactionId: 'abc' });
        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
    });

    it('getDailyZReading validates YYYY-MM-DD date format', async () => {
        const useCase = buildGetDailyZReadingUseCase({
            posRepository: { getZReadingSummary: jest.fn() }
        });

        const result = await useCase({ businessDateInput: 'invalid-date' });
        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
    });

    it('listPosCatalog wraps successful repository response', async () => {
        const listCatalog = jest.fn().mockResolvedValue([
            { item_id: 1, name: 'Sample', toJSON: () => ({ item_id: 1, name: 'Sample' }) }
        ]);
        const useCase = buildListPosCatalogUseCase({
            posRepository: { listCatalog }
        });

        const result = await useCase({ query: { search: 'sam' } });
        expect(listCatalog).toHaveBeenCalledWith({ search: 'sam', limit: 100 });
        expect(result).toEqual({
            success: true,
            data: [{ item_id: 1, name: 'Sample' }],
            error: null,
            message: null
        });
    });
});

