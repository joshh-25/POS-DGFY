import { jest } from '@jest/globals';
import { buildGetStockForecastUseCase } from '../src/modules/forecasts/usecases/getStockForecastUseCase.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';

describe('forecast use-cases application result contract', () => {
  it('validates daysAhead input', async () => {
    const useCase = buildGetStockForecastUseCase({
      forecastService: {
        forecastStockLevels: jest.fn()
      }
    });

    const result = await useCase({ daysAhead: 'invalid' });
    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
    expect(result.error.statusCode).toBe(400);
  });

  it('wraps forecast service result in success envelope', async () => {
    const useCase = buildGetStockForecastUseCase({
      forecastService: {
        forecastStockLevels: jest.fn().mockResolvedValue([{ item_id: 1, projected_stock: 20 }])
      }
    });

    const result = await useCase({ daysAhead: 30 });
    expect(result).toEqual({
      success: true,
      data: [{ item_id: 1, projected_stock: 20 }],
      error: null,
      message: null
    });
  });
});
