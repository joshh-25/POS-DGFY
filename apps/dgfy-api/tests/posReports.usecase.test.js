import { jest } from '@jest/globals';
import {
    buildGetPosReportsOverviewUseCase,
    buildExportPosReportsUseCase
} from '../src/modules/pos/usecases/posUseCases.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';

describe('POS reports usecases', () => {
    it('buildGetPosReportsOverviewUseCase rejects a non-object query', async () => {
        const useCase = buildGetPosReportsOverviewUseCase({
            posRepository: { getReportsOverview: jest.fn() }
        });

        const result = await useCase({ query: 'bad-query', user: { user_id: 4 } });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
        expect(result.error.statusCode).toBe(400);
    });

    it('buildGetPosReportsOverviewUseCase requires an authenticated user', async () => {
        const useCase = buildGetPosReportsOverviewUseCase({
            posRepository: { getReportsOverview: jest.fn() }
        });

        const result = await useCase({
            query: { date_from: '2026-07-01', date_to: '2026-07-06' },
            user: null
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.AUTHENTICATION_FAILED);
        expect(result.error.statusCode).toBe(401);
    });

    it('scopes cashier report queries to the authenticated cashier', async () => {
        const getReportsOverview = jest.fn();
        const useCase = buildGetPosReportsOverviewUseCase({
            posRepository: { getReportsOverview }
        });

        const result = await useCase({
            query: {
                date_from: '2026-07-01',
                date_to: '2026-07-06',
                cashier_id: 99
            },
            user: { user_id: 42, role: 'cashier' }
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.AUTHORIZATION_FAILED);
        expect(result.error.statusCode).toBe(403);
        expect(getReportsOverview).not.toHaveBeenCalled();
    });

    it('buildExportPosReportsUseCase rejects a non-object query', async () => {
        const useCase = buildExportPosReportsUseCase({
            posRepository: { exportReports: jest.fn() }
        });

        const result = await useCase({ query: 'bad-query', user: { user_id: 4 } });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
        expect(result.error.statusCode).toBe(400);
    });

    it('buildExportPosReportsUseCase requires an authenticated user', async () => {
        const useCase = buildExportPosReportsUseCase({
            posRepository: { exportReports: jest.fn() }
        });

        const result = await useCase({
            query: { date_from: '2026-07-01', date_to: '2026-07-06' },
            user: undefined
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.AUTHENTICATION_FAILED);
        expect(result.error.statusCode).toBe(401);
    });
});
