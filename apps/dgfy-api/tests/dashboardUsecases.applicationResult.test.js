import { jest } from '@jest/globals';
import {
  buildGetStatsUseCase,
  buildGetLowStockUseCase,
  buildGetRecentMovementsUseCase
} from '../src/modules/dashboard/usecases/dashboardUseCases.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';

describe('dashboard use-cases application result contract', () => {
  it('getStats wraps service data in success envelope', async () => {
    const useCase = buildGetStatsUseCase({
      dashboardService: {
        getDashboardStats: jest.fn().mockResolvedValue({ totalItems: 42 })
      }
    });

    const result = await useCase();
    expect(result).toEqual({
      success: true,
      data: { totalItems: 42 },
      error: null,
      message: null
    });
  });

  it('getLowStock maps service failure using domain error contract', async () => {
    const error = new Error('Dashboard unavailable');
    error.statusCode = 503;

    const useCase = buildGetLowStockUseCase({
      dashboardService: {
        getLowStockItems: jest.fn().mockRejectedValue(error)
      }
    });

    const result = await useCase();
    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.INTERNAL_ERROR);
    expect(result.error.statusCode).toBe(503);
  });

  it('getRecentMovements validates limit', async () => {
    const useCase = buildGetRecentMovementsUseCase({
      dashboardService: {
        getRecentMovements: jest.fn()
      }
    });

    const result = await useCase({ limit: 'invalid' });
    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
    expect(result.error.statusCode).toBe(400);
  });
});
