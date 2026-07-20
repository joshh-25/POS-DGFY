import { jest } from '@jest/globals';
import {
  buildGetSupplierPerformanceUseCase,
  buildGetAnomaliesUseCase,
  buildGetItemBurnRateUseCase
} from '../src/modules/analytics/usecases/analyticsUseCases.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';

describe('analytics use-cases application result contract', () => {
  it('validates supplierId for supplier performance use-case', async () => {
    const useCase = buildGetSupplierPerformanceUseCase({
      analyticsService: {
        analyzeSupplierPerformance: jest.fn()
      }
    });

    const result = await useCase({ supplierId: 'invalid' });
    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
    expect(result.error.statusCode).toBe(400);
  });

  it('maps not-found supplier errors to RESOURCE_NOT_FOUND', async () => {
    const useCase = buildGetSupplierPerformanceUseCase({
      analyticsService: {
        analyzeSupplierPerformance: jest.fn().mockRejectedValue(new Error('Supplier not found'))
      }
    });

    const result = await useCase({ supplierId: 22 });
    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.RESOURCE_NOT_FOUND);
    expect(result.error.statusCode).toBe(404);
  });

  it('wraps anomalies service result in success envelope', async () => {
    const detectAnomalies = jest.fn().mockResolvedValue([{ type: 'HIGH_LOSS_EVENT' }]);
    const useCase = buildGetAnomaliesUseCase({
      analyticsService: {
        detectAnomalies
      }
    });

    const result = await useCase({ options: { days: 14, itemId: 10 } });
    expect(detectAnomalies).toHaveBeenCalledWith({ days: 14, itemId: 10 });
    expect(result).toEqual({
      success: true,
      data: [{ type: 'HIGH_LOSS_EVENT' }],
      error: null,
      message: null
    });
  });

  it('returns burn rate data with recommendation in success envelope', async () => {
    const useCase = buildGetItemBurnRateUseCase({
      analyticsService: {
        calculateBurnRate: jest.fn().mockResolvedValue({
          burnRate: 2.5,
          totalConsumed: 75,
          daysAnalyzed: 30
        }),
        calculateReorderPoint: jest.fn().mockResolvedValue({
          recommendation: {
            reorder_point: 12,
            status: 'REORDER_NOW'
          }
        })
      }
    });

    const result = await useCase({ itemId: '9', days: 30 });
    expect(result).toEqual({
      success: true,
      data: {
        burnRate: 2.5,
        totalConsumed: 75,
        daysAnalyzed: 30,
        recommendation: {
          reorder_point: 12,
          status: 'REORDER_NOW'
        }
      },
      error: null,
      message: null
    });
  });
});
